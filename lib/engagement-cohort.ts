import { db } from "@/db/client";
import { subscribers } from "@/db/schemas/subscribers";
import { newsletterRecipients } from "@/db/schemas/newsletter-recipients";
import { and, eq, sql } from "drizzle-orm";

// Engagement cohorts usable as a send audience. These mirror the read-only
// cohort definitions surfaced on the /admin/engagement page (Tier 7 #1) so a
// "win them back" send targets exactly the segment the admin sees there.
//   - "atRisk":  confirmed subscribers who used to open but haven't opened
//                anything in the last `inactiveDays` days (declining engagement).
//   - "dormant": confirmed subscribers sent >= `minSent` issues who have NEVER
//                opened one (prime win-back / list-hygiene candidates).
export type EngagementCohort = "atRisk" | "dormant";

// Defaults kept in lockstep with the engagement page (admin-subscribers router).
export const COHORT_MIN_SENT = 2;
export const COHORT_INACTIVE_DAYS = 60;

/**
 * Resolves an engagement cohort to the CONFIRMED subscribers it contains.
 * Read-only aggregation over the existing newsletter_recipients open/click
 * tracking — no schema, no writes. Returns id + email so it can feed the send
 * path directly.
 *
 * The aggregation is identical in spirit to engagementList in the
 * admin-subscribers router; it's re-expressed here as a self-contained query so
 * the send path and audience preview can share ONE cohort definition.
 */
export async function resolveCohortSubscribers(
    cohort: EngagementCohort,
    opts?: { minSent?: number; inactiveDays?: number },
): Promise<Array<{ id: string; email: string }>> {
    const minSent = opts?.minSent ?? COHORT_MIN_SENT;
    const inactiveDays = opts?.inactiveDays ?? COHORT_INACTIVE_DAYS;
    const cutoff = new Date(Date.now() - inactiveDays * 24 * 60 * 60 * 1000);

    // Per-subscriber engagement rollup for CONFIRMED subscribers only.
    const eng = db
        .select({
            id: subscribers.id,
            email: subscribers.email,
            sent: sql<number>`COUNT(*) FILTER (WHERE ${newsletterRecipients.status} = 'sent')::int`,
            opened: sql<number>`COUNT(*) FILTER (WHERE ${newsletterRecipients.openedAt} IS NOT NULL)::int`,
            lastEngagedAt: sql<Date | null>`GREATEST(MAX(${newsletterRecipients.openedAt}), MAX(${newsletterRecipients.clickedAt}))`,
        })
        .from(subscribers)
        .leftJoin(newsletterRecipients, eq(newsletterRecipients.subscriberId, subscribers.id))
        .where(eq(subscribers.status, "subscribed"))
        .groupBy(subscribers.id, subscribers.email)
        .as("eng");

    const sentCol = sql<number>`${eng.sent}`;
    const openedCol = sql<number>`${eng.opened}`;
    const lastCol = sql<Date | null>`${eng.lastEngagedAt}`;

    const where =
        cohort === "dormant"
            ? and(sql`${sentCol} >= ${minSent}`, sql`${openedCol} = 0`)
            : and(
                  sql`${sentCol} >= ${minSent}`,
                  sql`${openedCol} > 0`,
                  sql`${lastCol} IS NOT NULL`,
                  sql`${lastCol} < ${cutoff}`,
              );

    const rows = await db
        .select({ id: eng.id, email: eng.email })
        .from(eng)
        .where(where);

    return rows;
}
