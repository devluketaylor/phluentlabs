import { db } from "@/db/client";
import { newsletters } from "@/db/schemas/newsletters";
import { newsletterRecipients } from "@/db/schemas/newsletter-recipients";
import { subscribers } from "@/db/schemas/subscribers";
import { and, arrayContains, eq } from "drizzle-orm";
import { Resend } from "resend";
import { signSubscriberToken } from "@/lib/subscriber-token";

const resend = new Resend(process.env.RESEND_API_KEY);

/**
 * Sends a newsletter to all confirmed subscribers and marks it "sent".
 * Shared by the admin `send` mutation and the scheduled-send cron endpoint
 * so the delivery logic lives in exactly one place.
 *
 * Returns the number of recipients, or throws on invalid state.
 */
export async function sendNewsletterToSubscribers(
    newsletterId: string,
    opts?: { tag?: string | null },
): Promise<{ sent: number }> {
    // Optional segmented send: when a tag is provided, only confirmed
    // subscribers carrying that tag are targeted (Kit-style segments). When
    // omitted/null, the audience is ALL confirmed subscribers as before.
    const tag = opts?.tag?.trim() || null;
    const [newsletter] = await db
        .select()
        .from(newsletters)
        .where(eq(newsletters.id, newsletterId));

    if (!newsletter) throw new Error("Newsletter not found");
    if (newsletter.status === "sent") throw new Error("Newsletter already sent");

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
        return { sent: 0 };
    }

    const fromEmail = process.env.RESEND_FROM_EMAIL ?? "onboarding@resend.dev";
    const appUrl = process.env.NEXT_PUBLIC_APP_URL!;

    // Send in batches of 100 (Resend limit).
    const BATCH_SIZE = 100;
    for (let i = 0; i < allSubscribers.length; i += BATCH_SIZE) {
        const batch = allSubscribers.slice(i, i + BATCH_SIZE);

        const emails = await Promise.all(
            batch.map(async (sub) => {
                const unsubToken = await signSubscriberToken({ subId: sub.id, email: sub.email, scope: "unsub" });
                const unsubUrl = new URL("/unsubscribe", appUrl);
                unsubUrl.searchParams.set("token", unsubToken);

                const html = `${newsletter.html}<p style="margin-top:32px;font-size:12px;color:#888;">
                    <a href="${unsubUrl.toString()}">Unsubscribe</a>
                </p>`;

                return {
                    from: fromEmail,
                    to: sub.email,
                    subject: newsletter.subject,
                    html,
                };
            })
        );

        const sendResult = await resend.batch.send(emails);

        // Resend returns the created email ids in the same order as the batch we
        // submitted, so data[i].id corresponds to batch[i]. Capture it as
        // resendId so the Resend webhook handler can map delivery/open/click/
        // bounce events back to the right recipient row.
        const sentIds = sendResult.data?.data ?? [];

        await db.insert(newsletterRecipients).values(
            batch.map((sub, idx) => ({
                id: crypto.randomUUID(),
                newsletterId: newsletter.id,
                subscriberId: sub.id,
                status: "sent",
                sentAt: new Date(),
                resendId: sentIds[idx]?.id ?? null,
            }))
        ).onConflictDoNothing();
    }

    await db
        .update(newsletters)
        .set({ status: "sent", sentAt: new Date(), updatedAt: new Date() })
        .where(eq(newsletters.id, newsletterId));

    return { sent: allSubscribers.length };
}
