import {publicProcedure, router} from "@/trpc/server";
import {z} from "zod";
import {subscribers} from "@/db/schemas/subscribers";
import {publications, subscriberPublications} from "@/db/schemas/publications";
import {newsletterRecipients} from "@/db/schemas/newsletter-recipients";
import {and, count, eq, isNull, sql} from "drizzle-orm";
import {signSubscriberToken, verifySubscriberToken} from "@/lib/subscriber-token";
import {generateReferralCode} from "@/lib/referral";
import {computeReferralProgress} from "@/lib/referral-tiers";
import type {db as Db} from "@/db/client";
import {Resend} from "resend";
import {renderConfirmEmail} from "@/lib/emails/confirm-email";
import {renderWelcomeEmail} from "@/lib/emails/welcome-email";
import {subscribeCore} from "@/lib/subscribe-core";

const resend = new Resend(process.env.RESEND_API_KEY);

// Generate a referral code that's unique against existing rows. Retries a few
// times on the (statistically rare) collision before giving up gracefully.
const makeUniqueReferralCode = async (database: typeof Db): Promise<string> => {
    for (let attempt = 0; attempt < 6; attempt++) {
        const code = generateReferralCode();
        const [clash] = await database
            .select({id: subscribers.id})
            .from(subscribers)
            .where(eq(subscribers.referralCode, code));
        if (!clash) return code;
    }
    // Extremely unlikely; fall back to a longer code to virtually guarantee it.
    return generateReferralCode(12);
}

export const sendConfirmEmail = async (
    to: string,
    confirmUrl: string,
    unsubscribeUrl?: string,
) => {
    const {subject, html, text} = renderConfirmEmail({confirmUrl, unsubscribeUrl});
    await resend.emails.send({
        from: process.env.RESEND_FROM_EMAIL ?? "onboarding@resend.dev",
        to,
        subject,
        html,
        text,
    });
}

/**
 * Sends the branded welcome email once, right after a subscriber confirms.
 * Fire-and-forget from the caller's perspective (errors are swallowed so a
 * transient Resend hiccup never fails the confirm flow — the subscriber is
 * already confirmed at that point).
 */
export const sendWelcomeEmail = async (
    to: string,
    opts: {firstName?: string | null; shareUrl?: string; unsubscribeUrl?: string; preferencesUrl?: string},
) => {
    const {subject, html, text} = renderWelcomeEmail(opts);
    await resend.emails.send({
        from: process.env.RESEND_FROM_EMAIL ?? "onboarding@resend.dev",
        to,
        subject,
        html,
        text,
    });
}

// In-memory per-email cooldown for the public resend-confirmation endpoint.
// Prevents someone from spamming a subscriber's inbox by hammering the resend
// button. Best-effort (per server instance) — combined with the pending-only
// gate + double opt-in this is plenty for the abuse surface it guards. A
// serverless cold start simply resets the window, which is acceptable here.
const RESEND_COOLDOWN_MS = 60_000;
const lastResendAt = new Map<string, number>();

export const subscribeRouter = router({
        // Public: live count of confirmed subscribers for social proof on the
        // homepage. Only counts status = "subscribed" (not pending/unsubscribed).
        count: publicProcedure.query(async ({ ctx }) => {
            try {
                const [{ total }] = await ctx.db
                    .select({ total: count() })
                    .from(subscribers)
                    .where(eq(subscribers.status, "subscribed"));
                return { count: total };
            } catch {
                return { count: 0 };
            }
        }),
        request: publicProcedure
            .input(
                z.object({
                    email: z.string().email(),
                    firstName: z.string().min(1).optional(),
                    lastName: z.string().min(1).optional(),
                    // Referral code from a ?ref=<code> link on the subscribe
                    // page. Optional; ignored if it doesn't match a subscriber.
                    ref: z.string().min(1).max(32).optional(),
                }),
            )
            .mutation(async ({ input, ctx }) => {
                // Delegates to the shared subscribe core so this mutation and
                // the public HTTP API (POST /api/v1/subscribe) behave identically.
                return subscribeCore(ctx.db, {
                    email: input.email,
                    firstName: input.firstName,
                    lastName: input.lastName,
                    ref: input.ref,
                });
            }),

        // Public: re-send the double opt-in confirmation email to a PENDING
        // subscriber who never confirmed (or lost the original). Deliberately
        // narrow + safe:
        //   - Only re-sends for a row that is currently `pending`. An already
        //     `subscribed`/`unsubscribed`/unknown email returns a generic ok
        //     with `sent: false` and NO email — so this can't be used to probe
        //     which addresses are on the list, and never re-mails a confirmed
        //     or opted-out person.
        //   - Per-email cooldown (in-memory) so the button can't be used to
        //     flood an inbox.
        //   - Mints a FRESH confirm token + unsub token (same as the initial
        //     signup path) and reuses the branded confirm email template.
        // Powers the homepage "didn't get it? resend" affordance.
        resendConfirmation: publicProcedure
            .input(z.object({ email: z.string().email() }))
            .mutation(async ({ input, ctx }) => {
                const email = input.email.trim().toLowerCase();

                // Cooldown gate (best-effort, per instance).
                const now = Date.now();
                const prev = lastResendAt.get(email);
                if (prev && now - prev < RESEND_COOLDOWN_MS) {
                    // Silently succeed without re-sending; tell the client to
                    // wait so it can show a friendly message.
                    return { ok: true as const, sent: false, cooldown: true };
                }

                const [me] = await ctx.db
                    .select({
                        id: subscribers.id,
                        email: subscribers.email,
                        status: subscribers.status,
                    })
                    .from(subscribers)
                    .where(eq(subscribers.email, email));

                // Only pending rows get a re-send. Everything else (missing,
                // subscribed, paused, unsubscribed, suppressed) returns a
                // generic non-committal ok so we never leak membership status.
                if (!me || me.status !== "pending") {
                    return { ok: true as const, sent: false, cooldown: false };
                }

                const appUrl = process.env.NEXT_PUBLIC_APP_URL;
                if (!appUrl) {
                    return { ok: true as const, sent: false, cooldown: false };
                }

                const confirmToken = await signSubscriberToken({
                    subId: me.id,
                    email: me.email,
                    scope: "confirm",
                });
                const confirmUrl = new URL("/confirm", appUrl);
                confirmUrl.searchParams.set("token", confirmToken);

                const unsubToken = await signSubscriberToken({
                    subId: me.id,
                    email: me.email,
                    scope: "unsub",
                });
                const unsubscribeUrl = new URL("/unsubscribe", appUrl);
                unsubscribeUrl.searchParams.set("token", unsubToken);

                try {
                    await sendConfirmEmail(
                        me.email,
                        confirmUrl.toString(),
                        unsubscribeUrl.toString(),
                    );
                    lastResendAt.set(email, now);
                    return { ok: true as const, sent: true, cooldown: false };
                } catch (err) {
                    console.error("resend confirm email failed", err);
                    // Don't leak the failure detail; the UI will just prompt a
                    // retry / spam-folder check.
                    return { ok: true as const, sent: false, cooldown: false };
                }
            }),

        confirm: publicProcedure
            .input(z.object({ token: z.string().min(1) }))
            .mutation(async ({ input, ctx }) => {
                const payload = await verifySubscriberToken(input.token);
                if (payload.scope !== "confirm") throw new Error("Invalid token")

                // Load the row first so we can tell a first-time confirm from a
                // repeat click on the confirm link (which shouldn't re-send the
                // welcome email).
                const [existing] = await ctx.db
                    .select({
                        id: subscribers.id,
                        email: subscribers.email,
                        firstName: subscribers.firstName,
                        status: subscribers.status,
                        referralCode: subscribers.referralCode,
                    })
                    .from(subscribers)
                    .where(eq(subscribers.id, payload.subId));

                await ctx.db
                    .update(subscribers)
                    .set({ status: "subscribed", confirmedAt: new Date() })
                    .where(eq(subscribers.id, payload.subId))

                // Welcome email automation (Kit-style): send the branded welcome
                // email ONCE, only on the pending -> subscribed transition. Skip
                // if they were already subscribed (repeat confirm click) so we
                // never double-send. Fire-and-forget: a Resend hiccup must not
                // fail the confirm — they're already confirmed in the DB.
                if (existing && existing.status !== "subscribed") {
                    try {
                        const appUrl = process.env.NEXT_PUBLIC_APP_URL;
                        const shareUrl = existing.referralCode && appUrl
                            ? (() => {
                                const u = new URL("/", appUrl);
                                u.searchParams.set("ref", existing.referralCode!);
                                return u.toString();
                            })()
                            : undefined;

                        let unsubscribeUrl: string | undefined;
                        let preferencesUrl: string | undefined;
                        if (appUrl) {
                            const unsubToken = await signSubscriberToken({
                                subId: existing.id,
                                email: existing.email,
                                scope: "unsub",
                            });
                            const u = new URL("/unsubscribe", appUrl);
                            u.searchParams.set("token", unsubToken);
                            unsubscribeUrl = u.toString();

                            // Prefs token (scope "prefs") for the manage-
                            // preferences link in the welcome email footer.
                            const prefsToken = await signSubscriberToken({
                                subId: existing.id,
                                email: existing.email,
                                scope: "prefs",
                            });
                            const p = new URL("/preferences", appUrl);
                            p.searchParams.set("token", prefsToken);
                            preferencesUrl = p.toString();
                        }

                        await sendWelcomeEmail(existing.email, {
                            firstName: existing.firstName,
                            shareUrl,
                            unsubscribeUrl,
                            preferencesUrl,
                        });
                    } catch (err) {
                        console.error("welcome email send failed", err);
                    }
                }

                return { ok: true };
            }),

        // Public but token-gated: return the CALLER'S OWN referral code + how
        // many people they've referred. The signed confirm token proves the
        // caller owns this subscriber row, so we never expose anyone else's
        // data — only the subscriber identified by the token. Powers the
        // "your referral link" surface shown after a successful confirm.
        myReferral: publicProcedure
            .input(z.object({ token: z.string().min(1) }))
            .query(async ({ input, ctx }) => {
                const payload = await verifySubscriberToken(input.token);
                if (payload.scope !== "confirm") throw new Error("Invalid token")

                const [me] = await ctx.db
                    .select({
                        id: subscribers.id,
                        referralCode: subscribers.referralCode,
                    })
                    .from(subscribers)
                    .where(eq(subscribers.id, payload.subId));
                if (!me) throw new Error("Subscriber not found");

                // Backfill a code for legacy rows that predate the referral
                // program (they were created before referralCode existed).
                let referralCode = me.referralCode;
                if (!referralCode) {
                    referralCode = await makeUniqueReferralCode(ctx.db);
                    await ctx.db
                        .update(subscribers)
                        .set({ referralCode })
                        .where(eq(subscribers.id, me.id));
                }

                // Count only CONFIRMED referrals (subscribed) toward reward
                // tiers — a pending signup shouldn't unlock a milestone.
                const [{ referred }] = await ctx.db
                    .select({ referred: count() })
                    .from(subscribers)
                    .where(and(
                        eq(subscribers.referredBy, me.id),
                        eq(subscribers.status, "subscribed"),
                    ));

                return {
                    referralCode,
                    referralCount: referred,
                    progress: computeReferralProgress(referred),
                };
            }),

        // Preferences-token variant of the referral progress surface. The
        // preferences center is handed a "prefs"-scoped token (not "confirm"),
        // so it can't call myReferral; this returns the same code + confirmed
        // referral count + tier progress for the caller's OWN row.
        myReferralByPrefs: publicProcedure
            .input(z.object({ token: z.string().min(1) }))
            .query(async ({ input, ctx }) => {
                const payload = await verifySubscriberToken(input.token);
                if (payload.scope !== "prefs") throw new Error("Invalid token")

                const [me] = await ctx.db
                    .select({
                        id: subscribers.id,
                        referralCode: subscribers.referralCode,
                    })
                    .from(subscribers)
                    .where(eq(subscribers.id, payload.subId));
                if (!me) throw new Error("Subscriber not found");

                let referralCode = me.referralCode;
                if (!referralCode) {
                    referralCode = await makeUniqueReferralCode(ctx.db);
                    await ctx.db
                        .update(subscribers)
                        .set({ referralCode })
                        .where(eq(subscribers.id, me.id));
                }

                const [{ referred }] = await ctx.db
                    .select({ referred: count() })
                    .from(subscribers)
                    .where(and(
                        eq(subscribers.referredBy, me.id),
                        eq(subscribers.status, "subscribed"),
                    ));

                return {
                    referralCode,
                    referralCount: referred,
                    progress: computeReferralProgress(referred),
                };
            }),

        unsubscribe: publicProcedure
            .input(z.object({ token: z.string().min(1) }))
            .mutation(async ({ input, ctx }) => {
                const payload = await verifySubscriberToken(input.token);
                // Accept both a dedicated "unsub" token AND a "prefs" token, so
                // the preferences center (which is handed a prefs token) can
                // also let a subscriber fully unsubscribe without minting a
                // second link. Both prove ownership of this row.
                if (payload.scope !== "unsub" && payload.scope !== "prefs") throw new Error("Invalid token")

                await ctx.db
                .update(subscribers)
                    .set({ status: "unsubscribed", unsubscribedAt: new Date() })
                    .where(eq(subscribers.id, payload.subId))

                return { ok: true };
            }),

        // ── Subscriber preferences center (Kit-style) ──────────────────────
        // A signed-token public surface where a subscriber can update their
        // name, PAUSE (temporarily stop) / RESUME emails, or fully
        // unsubscribe — instead of the unsubscribe-only page. Reuses the same
        // signed-token pattern as unsubscribe; the token is scope "prefs"
        // (30d) and proves ownership of exactly this one subscriber row, so no
        // one else's data is ever exposed.

        // Read the caller's OWN current preferences (name + status). Token-gated.
        getPreferences: publicProcedure
            .input(z.object({ token: z.string().min(1) }))
            .query(async ({ input, ctx }) => {
                const payload = await verifySubscriberToken(input.token);
                if (payload.scope !== "prefs") throw new Error("Invalid token")

                const [me] = await ctx.db
                    .select({
                        email: subscribers.email,
                        firstName: subscribers.firstName,
                        lastName: subscribers.lastName,
                        status: subscribers.status,
                    })
                    .from(subscribers)
                    .where(eq(subscribers.id, payload.subId));
                if (!me) throw new Error("Subscriber not found");

                return {
                    email: me.email,
                    firstName: me.firstName ?? "",
                    lastName: me.lastName ?? "",
                    status: me.status,
                };
            }),

        // Export the caller's OWN data (GDPR/CCPA "my data"). Token-gated
        // (scope "prefs"), own-row only — the prefs token proves ownership of
        // exactly this one subscriber row, so no other subscriber's data is
        // ever exposed (anti-enumeration by design: only payload.subId is
        // queried; there is no way to request another id). Returns a small
        // JSON of the subscriber's own record plus the publication opt-ins and
        // an aggregate engagement summary they're entitled to. Deliberately
        // does NOT include internal referral graph details of OTHER people
        // (only the caller's own referral code + their referred-signup count).
        exportMyData: publicProcedure
            .input(z.object({ token: z.string().min(1) }))
            .query(async ({ input, ctx }) => {
                const payload = await verifySubscriberToken(input.token);
                if (payload.scope !== "prefs") throw new Error("Invalid token")

                const [me] = await ctx.db
                    .select({
                        id: subscribers.id,
                        email: subscribers.email,
                        firstName: subscribers.firstName,
                        lastName: subscribers.lastName,
                        status: subscribers.status,
                        tags: subscribers.tags,
                        referralCode: subscribers.referralCode,
                        createdAt: subscribers.createdAt,
                        confirmedAt: subscribers.confirmedAt,
                        unsubscribedAt: subscribers.unsubscribedAt,
                        updatedAt: subscribers.updatedAt,
                    })
                    .from(subscribers)
                    .where(eq(subscribers.id, payload.subId));
                if (!me) throw new Error("Subscriber not found");

                // How many confirmed signups this subscriber referred (their
                // own count only — never the referred people's identities).
                const [refRow] = await ctx.db
                    .select({ n: count() })
                    .from(subscribers)
                    .where(eq(subscribers.referredBy, me.id));

                // Publication opt-ins the caller currently holds (by name).
                const optRows = await ctx.db
                    .select({
                        name: publications.name,
                        slug: publications.slug,
                        optedInAt: subscriberPublications.createdAt,
                    })
                    .from(subscriberPublications)
                    .innerJoin(
                        publications,
                        eq(publications.id, subscriberPublications.publicationId),
                    )
                    .where(eq(subscriberPublications.subscriberId, me.id));

                // Aggregate engagement summary over issues sent to this
                // subscriber (counts only — no per-issue content/URLs).
                const [eng] = await ctx.db
                    .select({
                        issuesSent: count(),
                        opened: sql<number>`count(*) filter (where ${newsletterRecipients.openedAt} is not null)`,
                        clicked: sql<number>`count(*) filter (where ${newsletterRecipients.clickedAt} is not null)`,
                    })
                    .from(newsletterRecipients)
                    .where(and(
                        eq(newsletterRecipients.subscriberId, me.id),
                        eq(newsletterRecipients.status, "sent"),
                    ));

                const issuesSent = Number(eng?.issuesSent ?? 0);
                const opened = Number(eng?.opened ?? 0);
                const clicked = Number(eng?.clicked ?? 0);

                return {
                    exportedAt: new Date().toISOString(),
                    subscriber: {
                        email: me.email,
                        firstName: me.firstName ?? null,
                        lastName: me.lastName ?? null,
                        status: me.status,
                        tags: me.tags ?? [],
                        referralCode: me.referralCode ?? null,
                        referredSignups: Number(refRow?.n ?? 0),
                        subscribedAt: me.createdAt?.toISOString() ?? null,
                        confirmedAt: me.confirmedAt?.toISOString() ?? null,
                        unsubscribedAt: me.unsubscribedAt?.toISOString() ?? null,
                        lastUpdatedAt: me.updatedAt?.toISOString() ?? null,
                    },
                    publicationOptIns: optRows.map((r) => ({
                        name: r.name,
                        slug: r.slug,
                        optedInAt: r.optedInAt?.toISOString() ?? null,
                    })),
                    engagement: {
                        issuesReceived: issuesSent,
                        issuesOpened: opened,
                        linksClicked: clicked,
                    },
                };
            }),

        // Update the caller's OWN preferences. Token-gated (scope "prefs").
        // Supports editing name and changing the delivery state to one of:
        //   subscribed  → actively receiving (resume from paused)
        //   paused      → temporarily stop (still confirmed, easy to resume)
        //   unsubscribed→ fully opt out
        // "paused" is a new free-form status value — no schema change needed
        // (status is a free-form text column). The send audience only targets
        // status = "subscribed", so paused subscribers are automatically
        // skipped by the existing send path.
        updatePreferences: publicProcedure
            .input(z.object({
                token: z.string().min(1),
                firstName: z.string().max(200).optional(),
                lastName: z.string().max(200).optional(),
                status: z.enum(["subscribed", "paused", "unsubscribed"]).optional(),
            }))
            .mutation(async ({ input, ctx }) => {
                const payload = await verifySubscriberToken(input.token);
                if (payload.scope !== "prefs") throw new Error("Invalid token")

                const [me] = await ctx.db
                    .select({ id: subscribers.id })
                    .from(subscribers)
                    .where(eq(subscribers.id, payload.subId));
                if (!me) throw new Error("Subscriber not found");

                const patch: Partial<typeof subscribers.$inferInsert> = {
                    updatedAt: new Date(),
                };

                // Only write name fields when explicitly provided; normalize
                // blanks to null so we don't store empty strings.
                if (input.firstName !== undefined) {
                    const v = input.firstName.trim();
                    patch.firstName = v.length ? v : null;
                }
                if (input.lastName !== undefined) {
                    const v = input.lastName.trim();
                    patch.lastName = v.length ? v : null;
                }

                if (input.status !== undefined) {
                    patch.status = input.status;
                    if (input.status === "unsubscribed") {
                        patch.unsubscribedAt = new Date();
                    } else if (input.status === "subscribed") {
                        // Resuming from paused/unsubscribed: clear the opt-out
                        // timestamp so the record reflects an active subscriber.
                        patch.unsubscribedAt = null;
                    }
                }

                await ctx.db
                    .update(subscribers)
                    .set(patch)
                    .where(eq(subscribers.id, payload.subId));

                return { ok: true };
            }),

        // Change the caller's OWN delivery email address. Token-gated (scope
        // "prefs"), own-row only. SAFER DEFAULT (product call): changing the
        // address RE-TRIGGERS double opt-in — the row flips back to `pending`
        // and a fresh confirm email is sent to the NEW address. This proves the
        // new mailbox is real + reachable and prevents redirecting someone
        // else's confirmed subscription to an address they don't control.
        //
        // Anti-enumeration: if the new address already belongs to a DIFFERENT
        // subscriber row we return a generic { ok:true, sent:false, taken:true }
        // WITHOUT changing anything and without confirming which row exists —
        // so this can't be used to probe list membership. (email is unique.)
        updateEmail: publicProcedure
            .input(z.object({
                token: z.string().min(1),
                email: z.string().email(),
            }))
            .mutation(async ({ input, ctx }) => {
                const payload = await verifySubscriberToken(input.token);
                if (payload.scope !== "prefs") throw new Error("Invalid token")

                const newEmail = input.email.trim().toLowerCase();

                const [me] = await ctx.db
                    .select({
                        id: subscribers.id,
                        email: subscribers.email,
                        firstName: subscribers.firstName,
                    })
                    .from(subscribers)
                    .where(eq(subscribers.id, payload.subId));
                if (!me) throw new Error("Subscriber not found");

                // No-op if the address is unchanged (case-insensitive).
                if (me.email.trim().toLowerCase() === newEmail) {
                    return { ok: true as const, sent: false, taken: false, unchanged: true };
                }

                // Collision check: is the new address already on the list under
                // a different row? If so, bail generically (no mutation, no leak).
                const [clash] = await ctx.db
                    .select({ id: subscribers.id })
                    .from(subscribers)
                    .where(eq(subscribers.email, newEmail));
                if (clash && clash.id !== me.id) {
                    return { ok: true as const, sent: false, taken: true, unchanged: false };
                }

                // Apply the change + re-trigger double opt-in on the NEW address.
                await ctx.db
                    .update(subscribers)
                    .set({
                        email: newEmail,
                        status: "pending",
                        confirmedAt: null,
                        updatedAt: new Date(),
                    })
                    .where(eq(subscribers.id, me.id));

                // Send a fresh confirm email to the new mailbox (best-effort —
                // a Resend hiccup shouldn't fail the address change, which has
                // already persisted; the subscriber can trigger a resend).
                const appUrl = process.env.NEXT_PUBLIC_APP_URL;
                let sent = false;
                if (appUrl) {
                    try {
                        const confirmToken = await signSubscriberToken({
                            subId: me.id,
                            email: newEmail,
                            scope: "confirm",
                        });
                        const confirmUrl = new URL("/confirm", appUrl);
                        confirmUrl.searchParams.set("token", confirmToken);

                        const unsubToken = await signSubscriberToken({
                            subId: me.id,
                            email: newEmail,
                            scope: "unsub",
                        });
                        const unsubscribeUrl = new URL("/unsubscribe", appUrl);
                        unsubscribeUrl.searchParams.set("token", unsubToken);

                        await sendConfirmEmail(
                            newEmail,
                            confirmUrl.toString(),
                            unsubscribeUrl.toString(),
                        );
                        sent = true;
                    } catch (err) {
                        console.error("updateEmail confirm send failed", err);
                    }
                }

                return { ok: true as const, sent, taken: false, unchanged: false, email: newEmail };
            }),

        // ── Per-publication opt-in (public, prefs-token-gated) ─────────────
        // The publications foundation (migration 0014) is additive + opt-in.
        // These two endpoints are the PUBLIC opt-in surface: a confirmed
        // subscriber (identified by their prefs token) can list all
        // non-archived publications and toggle their own opt-in for each
        // NON-PRIMARY publication. The primary/default stream reaches every
        // confirmed subscriber with NO join row, so it's shown as always-on and
        // is never toggleable here (you manage the primary stream by
        // pausing/unsubscribing above).

        // List all non-archived publications + whether the caller is opted in.
        getPublicationOptIns: publicProcedure
            .input(z.object({ token: z.string().min(1) }))
            .query(async ({ input, ctx }) => {
                const payload = await verifySubscriberToken(input.token);
                if (payload.scope !== "prefs") throw new Error("Invalid token")

                const [me] = await ctx.db
                    .select({ id: subscribers.id })
                    .from(subscribers)
                    .where(eq(subscribers.id, payload.subId));
                if (!me) throw new Error("Subscriber not found");

                const pubs = await ctx.db
                    .select({
                        id: publications.id,
                        slug: publications.slug,
                        name: publications.name,
                        description: publications.description,
                        isPrimary: publications.isPrimary,
                    })
                    .from(publications)
                    .where(isNull(publications.archivedAt))
                    .orderBy(publications.isPrimary, publications.name);

                const optRows = await ctx.db
                    .select({ publicationId: subscriberPublications.publicationId })
                    .from(subscriberPublications)
                    .where(eq(subscriberPublications.subscriberId, me.id));
                const optedIn = new Set(optRows.map((r) => r.publicationId));

                return {
                    publications: pubs.map((p) => ({
                        id: p.id,
                        slug: p.slug,
                        name: p.name,
                        description: p.description,
                        isPrimary: p.isPrimary,
                        // Primary is always-on (all confirmed subscribers get it
                        // with no join row); non-primary reflects the join.
                        optedIn: p.isPrimary ? true : optedIn.has(p.id),
                    })),
                };
            }),

        // Toggle the caller's opt-in for a SINGLE non-primary publication.
        // Token-gated (scope "prefs"), own-row only. Idempotent: opting in twice
        // is a no-op (onConflictDoNothing); opting out with no row is a no-op.
        updatePublicationOptIn: publicProcedure
            .input(z.object({
                token: z.string().min(1),
                publicationId: z.string().min(1),
                optIn: z.boolean(),
            }))
            .mutation(async ({ input, ctx }) => {
                const payload = await verifySubscriberToken(input.token);
                if (payload.scope !== "prefs") throw new Error("Invalid token")

                const [me] = await ctx.db
                    .select({ id: subscribers.id })
                    .from(subscribers)
                    .where(eq(subscribers.id, payload.subId));
                if (!me) throw new Error("Subscriber not found");

                // Only non-archived publications are toggleable; the PRIMARY
                // stream can't be opted out of here (it's the default list —
                // use pause/unsubscribe for that).
                const [pub] = await ctx.db
                    .select({ id: publications.id, isPrimary: publications.isPrimary, archivedAt: publications.archivedAt })
                    .from(publications)
                    .where(eq(publications.id, input.publicationId));
                if (!pub) throw new Error("Publication not found");
                if (pub.isPrimary) throw new Error("The primary stream can't be toggled here");
                if (pub.archivedAt) throw new Error("This publication is no longer accepting opt-ins");

                if (input.optIn) {
                    await ctx.db
                        .insert(subscriberPublications)
                        .values({ subscriberId: me.id, publicationId: pub.id })
                        .onConflictDoNothing();
                } else {
                    await ctx.db
                        .delete(subscriberPublications)
                        .where(and(
                            eq(subscriberPublications.subscriberId, me.id),
                            eq(subscriberPublications.publicationId, pub.id),
                        ));
                }

                return { ok: true, optedIn: input.optIn };
            }),
})