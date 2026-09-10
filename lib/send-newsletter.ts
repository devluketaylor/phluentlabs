import { db } from "@/db/client";
import { newsletters } from "@/db/schemas/newsletters";
import { newsletterRecipients } from "@/db/schemas/newsletter-recipients";
import { subscribers } from "@/db/schemas/subscribers";
import { and, arrayContains, eq, inArray, ne } from "drizzle-orm";
import { Resend } from "resend";
import { signSubscriberToken } from "@/lib/subscriber-token";
import { assignVariant } from "@/lib/ab-split";

const resend = new Resend(process.env.RESEND_API_KEY);

// Reliability tuning. Resend's batch endpoint accepts up to 100 emails.
const BATCH_SIZE = 100;
// Bounded retry with exponential backoff for TRANSIENT failures only
// (network errors, 429 rate-limit, 5xx). Non-transient errors (e.g. a 422
// validation error) are not retried — retrying would just fail identically.
const MAX_ATTEMPTS = 3;
const BASE_BACKOFF_MS = 500;

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Classifies a thrown Resend/network error as transient (worth retrying) vs
 * permanent. We retry on 429 (rate limit), any 5xx, and generic network/fetch
 * errors that carry no status code. A 4xx other than 429 is treated as
 * permanent (retrying an invalid payload won't help).
 */
function isTransient(err: unknown): boolean {
    if (!err || typeof err !== "object") return true; // unknown shape → give it a chance
    const anyErr = err as { statusCode?: number; status?: number; name?: string };
    const code = anyErr.statusCode ?? anyErr.status;
    if (typeof code === "number") {
        if (code === 429) return true;
        if (code >= 500) return true;
        return false; // other 4xx = permanent
    }
    // No status code (network/timeout/abort) → transient.
    return true;
}

/**
 * Sends one Resend batch with bounded exponential-backoff retry on transient
 * failures. Returns the created email ids (aligned to the input order) so the
 * caller can map them back to recipient rows.
 *
 * Also treats a batch response that carries an `error` (Resend returns
 * { data: null, error } on failure) as a thrown error so it flows through the
 * same retry path.
 */
async function sendBatchWithRetry(
    emails: Array<{ from: string; to: string; subject: string; html: string }>,
): Promise<Array<{ id: string } | undefined>> {
    let lastErr: unknown;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        try {
            const res = await resend.batch.send(emails);
            if (res.error) {
                // Normalize the SDK's { data, error } shape into a throw so the
                // transient/permanent classifier and backoff apply uniformly.
                throw res.error;
            }
            return res.data?.data ?? [];
        } catch (err) {
            lastErr = err;
            if (attempt >= MAX_ATTEMPTS || !isTransient(err)) break;
            // Exponential backoff: 500ms, 1000ms, ...
            await sleep(BASE_BACKOFF_MS * 2 ** (attempt - 1));
        }
    }
    throw lastErr instanceof Error ? lastErr : new Error("Resend batch send failed");
}

/**
 * Sends a newsletter to all confirmed subscribers (optionally a tag segment)
 * and marks it "sent". Shared by the admin `send` mutation and the scheduled-
 * send cron endpoint so the delivery logic lives in exactly one place.
 *
 * RELIABILITY MODEL (idempotent, retry-safe):
 *  1. Resolve the audience and PRE-CREATE a recipient row per subscriber with
 *     status "queued" (onConflictDoNothing on the unique (newsletterId,
 *     subscriberId) index). This is the durable work-list.
 *  2. Only recipients still in a non-"sent" state (queued/failed) are actually
 *     emailed. A re-run — after a crash, a partial send, or a transient batch
 *     failure — therefore NEVER re-emails someone already marked "sent", and
 *     automatically RETRIES anyone left "queued"/"failed".
 *  3. Each Resend batch is sent with bounded exponential-backoff retry on
 *     transient (429/5xx/network) errors. Recipients in a batch that still
 *     fails after retries are marked "failed" with the error message (so the
 *     next run picks just them up) instead of aborting the whole issue.
 *  4. The issue is only marked "sent" once every recipient row is "sent".
 *     If any recipient is still failed/queued, the issue stays "scheduled"/
 *     "sending" so the scheduled-send cron re-picks it up.
 *
 * Returns the number of recipients successfully sent THIS invocation, or throws
 * on invalid state (issue missing / already sent / empty segment).
 */
export async function sendNewsletterToSubscribers(
    newsletterId: string,
    opts?: { tag?: string | null },
): Promise<{ sent: number; failed: number; alreadySent: number }> {
    const tag = opts?.tag?.trim() || null;
    const [newsletter] = await db
        .select()
        .from(newsletters)
        .where(eq(newsletters.id, newsletterId));

    if (!newsletter) throw new Error("Newsletter not found");
    if (newsletter.status === "sent") throw new Error("Newsletter already sent");

    // Remember the status we started from so a PARTIAL send can be restored to
    // it (rather than forced to "scheduled", which for a manual draft-send with
    // no scheduledAt would never be re-picked-up by the cron). A scheduled
    // issue that partially fails is left "scheduled" so the cron retries it.
    const originalStatus = newsletter.status;

    const audienceWhere = tag
        ? and(eq(subscribers.status, "subscribed"), arrayContains(subscribers.tags, [tag]))
        : eq(subscribers.status, "subscribed");

    const allSubscribers = await db
        .select({ id: subscribers.id, email: subscribers.email })
        .from(subscribers)
        .where(audienceWhere);

    if (allSubscribers.length === 0) {
        if (tag) {
            // Segmented send with an empty segment: don't silently mark the
            // whole issue "sent" — the writer likely picked the wrong tag.
            throw new Error(`No confirmed subscribers have the tag "${tag}"`);
        }
        // Full send with zero confirmed subscribers: still mark as sent so it
        // doesn't get re-attempted forever.
        await db
            .update(newsletters)
            .set({ status: "sent", sentAt: new Date(), updatedAt: new Date() })
            .where(eq(newsletters.id, newsletterId));
        return { sent: 0, failed: 0, alreadySent: 0 };
    }

    const fromEmail = process.env.RESEND_FROM_EMAIL ?? "onboarding@resend.dev";
    const appUrl = process.env.NEXT_PUBLIC_APP_URL!;

    // STEP 1 — durable work-list. Insert a "queued" row per audience member.
    // onConflictDoNothing means a re-run keeps the existing row (and its
    // status), so we never reset a "sent" recipient back to "queued".
    await db
        .insert(newsletterRecipients)
        .values(
            allSubscribers.map((sub) => ({
                id: crypto.randomUUID(),
                newsletterId: newsletter.id,
                subscriberId: sub.id,
                status: "queued",
            })),
        )
        .onConflictDoNothing();

    // Mark the issue "sending" while we work (only meaningful for scheduled
    // issues; the admin send mutation guards status separately). This is a
    // best-effort progress marker.
    if (newsletter.status !== "sending") {
        await db
            .update(newsletters)
            .set({ status: "sending", updatedAt: new Date() })
            .where(and(eq(newsletters.id, newsletterId), ne(newsletters.status, "sent")));
    }

    // STEP 2 — only email recipients NOT already sent. This is the idempotency
    // core: sent recipients are skipped, queued/failed ones are (re)attempted.
    const pending = await db
        .select({ id: newsletterRecipients.id, subscriberId: newsletterRecipients.subscriberId })
        .from(newsletterRecipients)
        .where(
            and(
                eq(newsletterRecipients.newsletterId, newsletter.id),
                ne(newsletterRecipients.status, "sent"),
            ),
        );

    const subById = new Map(allSubscribers.map((s) => [s.id, s]));
    // Only send to pending recipients who are still in the current audience
    // (a subscriber could have unsubscribed / lost the tag between runs).
    const work = pending
        .map((r) => ({ recipientId: r.id, sub: subById.get(r.subscriberId) }))
        .filter((w): w is { recipientId: string; sub: { id: string; email: string } } => !!w.sub);

    const alreadySent = allSubscribers.length - pending.length;

    const isAbTest = !!newsletter.subjectB?.trim();
    let sentCount = 0;
    let failedCount = 0;

    for (let i = 0; i < work.length; i += BATCH_SIZE) {
        const batch = work.slice(i, i + BATCH_SIZE);

        const perRecipient = batch.map(({ recipientId, sub }) => {
            const variant = isAbTest ? assignVariant(newsletter.id, sub.id) : "A";
            const subject = variant === "B" ? newsletter.subjectB!.trim() : newsletter.subject;
            return { recipientId, sub, variant, subject };
        });

        const emails = await Promise.all(
            perRecipient.map(async ({ sub, subject }) => {
                const unsubToken = await signSubscriberToken({ subId: sub.id, email: sub.email, scope: "unsub" });
                const unsubUrl = new URL("/unsubscribe", appUrl);
                unsubUrl.searchParams.set("token", unsubToken);

                const html = `${newsletter.html}<p style="margin-top:32px;font-size:12px;color:#888;">
                    <a href="${unsubUrl.toString()}">Unsubscribe</a>
                </p>`;

                return {
                    from: fromEmail,
                    to: sub.email,
                    subject,
                    html,
                };
            }),
        );

        let sentIds: Array<{ id: string } | undefined> = [];
        try {
            sentIds = await sendBatchWithRetry(emails);
        } catch (err) {
            // Batch failed even after retries: mark every recipient in it
            // "failed" with the error so the NEXT run retries exactly these
            // (they stay non-"sent", so they're re-picked-up), and keep going
            // with the remaining batches instead of aborting the whole issue.
            const message = err instanceof Error ? err.message : "Resend batch send failed";
            failedCount += perRecipient.length;
            await db
                .update(newsletterRecipients)
                .set({ status: "failed", error: message.slice(0, 500) })
                .where(
                    inArray(
                        newsletterRecipients.id,
                        perRecipient.map((p) => p.recipientId),
                    ),
                );
            continue;
        }

        // Success: update each pre-created recipient row to "sent" with its
        // Resend id + A/B variant. Resend returns ids in submission order, so
        // sentIds[idx] aligns with perRecipient[idx].
        await Promise.all(
            perRecipient.map(({ recipientId, variant }, idx) =>
                db
                    .update(newsletterRecipients)
                    .set({
                        status: "sent",
                        sentAt: new Date(),
                        error: null,
                        resendId: sentIds[idx]?.id ?? null,
                        subjectVariant: isAbTest ? variant : null,
                    })
                    .where(eq(newsletterRecipients.id, recipientId)),
            ),
        );
        sentCount += perRecipient.length;
    }

    // STEP 4 — only finalize the issue as "sent" if NOTHING is left failed or
    // queued. If some recipients failed this run, leave the issue "scheduled"
    // so the scheduled-send cron re-runs and retries just the failed rows.
    const notSentRows = await db
        .select({ id: newsletterRecipients.id })
        .from(newsletterRecipients)
        .where(
            and(
                eq(newsletterRecipients.newsletterId, newsletter.id),
                ne(newsletterRecipients.status, "sent"),
            ),
        )
        .limit(1);
    const remaining = notSentRows.length > 0;

    if (!remaining) {
        await db
            .update(newsletters)
            .set({ status: "sent", sentAt: new Date(), updatedAt: new Date() })
            .where(eq(newsletters.id, newsletterId));
    } else {
        // Not fully sent — restore the issue to the status it started in so it's
        // re-picked-up correctly: a "scheduled" issue stays "scheduled" (the
        // cron retries due scheduled issues); anything else (a manual draft/
        // scheduled admin send) returns to its original status. This avoids
        // stranding a partially-sent issue in "sending" or forcing a
        // scheduledAt-less draft into a "scheduled" state the cron ignores.
        const restoreTo = originalStatus === "sent" ? "scheduled" : originalStatus;
        await db
            .update(newsletters)
            .set({ status: restoreTo, updatedAt: new Date() })
            .where(and(eq(newsletters.id, newsletterId), ne(newsletters.status, "sent")));
    }

    return { sent: sentCount, failed: failedCount, alreadySent };
}
