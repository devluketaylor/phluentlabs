import { db } from "@/db/client";
import { newsletters } from "@/db/schemas/newsletters";
import { newsletterRecipients } from "@/db/schemas/newsletter-recipients";
import { and, eq, isNull } from "drizzle-orm";

/**
 * Resolves the "non-openers" of a previously-SENT issue: subscribers who were
 * actually delivered that issue (a `sent` recipient row) but never opened it
 * (`openedAt IS NULL`). This is the classic "resend to non-openers" audience —
 * you re-send an issue (usually the same content, often with a fresher subject)
 * only to the people who missed it the first time.
 *
 * Read-only aggregation over the existing newsletter_recipients open tracking —
 * no schema, no writes. Returns subscriber ids so it can feed the send path /
 * audience preview via id-set intersection (the same decoupled pattern the
 * engagement-cohort audience uses).
 *
 * IMPORTANT: this only looks at who was SENT the source issue and their open
 * state. The caller still intersects the result with the live "actively
 * receiving" audience (confirmed + not snoozed + optional tag/publication), so
 * anyone who has since unsubscribed / been suppressed / snoozed is dropped —
 * a resend never re-reaches someone who left after the original send.
 */
export async function resolveNonOpenerSubscribers(
    sourceNewsletterId: string,
): Promise<Array<{ id: string }>> {
    const rows = await db
        .select({ id: newsletterRecipients.subscriberId })
        .from(newsletterRecipients)
        .where(
            and(
                eq(newsletterRecipients.newsletterId, sourceNewsletterId),
                eq(newsletterRecipients.status, "sent"),
                isNull(newsletterRecipients.openedAt),
            ),
        );
    return rows.map((r) => ({ id: r.id }));
}

/**
 * Validates that a candidate source issue can be used as a "resend to
 * non-openers" origin: it must exist and already be SENT (a draft/scheduled
 * issue has no delivery/open data yet). Returns the issue's subject for UI
 * labelling, or throws a friendly error the tRPC layer can surface.
 */
export async function assertSentSource(
    sourceNewsletterId: string,
): Promise<{ id: string; subject: string }> {
    const [issue] = await db
        .select({
            id: newsletters.id,
            subject: newsletters.subject,
            status: newsletters.status,
        })
        .from(newsletters)
        .where(eq(newsletters.id, sourceNewsletterId));
    if (!issue) throw new Error("Source issue not found");
    if (issue.status !== "sent") {
        throw new Error("Can only resend to non-openers of an already-sent issue");
    }
    return { id: issue.id, subject: issue.subject };
}
