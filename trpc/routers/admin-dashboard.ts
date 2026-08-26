import { adminProcedure, router } from "@/trpc/server";
import { and, count, desc, eq, gte, lt } from "drizzle-orm";
import { subscribers } from "@/db/schemas/subscribers";
import { newsletters } from "@/db/schemas/newsletters";
import { newsletterRecipients } from "@/db/schemas/newsletter-recipients";

export const adminDashboardRouter = router({
    // One query powering the admin dashboard: headline counts, status
    // breakdown, week-over-week growth, last-send stats, and the scheduled
    // queue. Read-only aggregates; no mutations.
    stats: adminProcedure.query(async ({ ctx }) => {
        const now = new Date();
        const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

        const [
            totalSubscribersRow,
            statusRows,
            newThisWeekRow,
            newPrevWeekRow,
            totalNewslettersRow,
            lastSent,
            scheduledQueue,
        ] = await Promise.all([
            // Total subscribers (all statuses)
            ctx.db.select({ total: count() }).from(subscribers),
            // Status breakdown
            ctx.db
                .select({ status: subscribers.status, total: count() })
                .from(subscribers)
                .groupBy(subscribers.status),
            // Signups in the last 7 days
            ctx.db
                .select({ total: count() })
                .from(subscribers)
                .where(gte(subscribers.createdAt, weekAgo)),
            // Signups in the prior 7 days (the window before this week), for a
            // week-over-week delta: [twoWeeksAgo, weekAgo).
            ctx.db
                .select({ total: count() })
                .from(subscribers)
                .where(
                    and(
                        gte(subscribers.createdAt, twoWeeksAgo),
                        lt(subscribers.createdAt, weekAgo)
                    )
                ),
            // Total newsletters (all statuses)
            ctx.db.select({ total: count() }).from(newsletters),
            // Most recently sent newsletter
            ctx.db
                .select({
                    id: newsletters.id,
                    slug: newsletters.slug,
                    subject: newsletters.subject,
                    sentAt: newsletters.sentAt,
                })
                .from(newsletters)
                .where(eq(newsletters.status, "sent"))
                .orderBy(desc(newsletters.sentAt))
                .limit(1),
            // Upcoming scheduled queue (soonest first)
            ctx.db
                .select({
                    id: newsletters.id,
                    slug: newsletters.slug,
                    subject: newsletters.subject,
                    scheduledAt: newsletters.scheduledAt,
                })
                .from(newsletters)
                .where(eq(newsletters.status, "scheduled"))
                .orderBy(newsletters.scheduledAt)
                .limit(10),
        ]);

        // Normalize status breakdown into a stable shape.
        const statusBreakdown = { pending: 0, subscribed: 0, unsubscribed: 0 } as Record<
            "pending" | "subscribed" | "unsubscribed",
            number
        >;
        for (const r of statusRows) {
            if (r.status === "pending" || r.status === "subscribed" || r.status === "unsubscribed") {
                statusBreakdown[r.status] = r.total;
            }
        }

        // Growth: signups in last 7 days vs the 7 days before that.
        const newThisWeek = newThisWeekRow[0]?.total ?? 0;
        const newPrevWeek = newPrevWeekRow[0]?.total ?? 0;
        const growthDelta = newThisWeek - newPrevWeek;

        // Last-send stats: recipient counts for the most recent sent issue.
        let lastSend:
            | {
                  id: string;
                  slug: string | null;
                  subject: string;
                  sentAt: Date | null;
                  totalRecipients: number;
                  sentCount: number;
                  failedCount: number;
              }
            | null = null;

        const last = lastSent[0];
        if (last) {
            const [recipTotalRow, recipSentRow, recipFailedRow] = await Promise.all([
                ctx.db
                    .select({ total: count() })
                    .from(newsletterRecipients)
                    .where(eq(newsletterRecipients.newsletterId, last.id)),
                ctx.db
                    .select({ total: count() })
                    .from(newsletterRecipients)
                    .where(
                        and(
                            eq(newsletterRecipients.newsletterId, last.id),
                            eq(newsletterRecipients.status, "sent")
                        )
                    ),
                ctx.db
                    .select({ total: count() })
                    .from(newsletterRecipients)
                    .where(
                        and(
                            eq(newsletterRecipients.newsletterId, last.id),
                            eq(newsletterRecipients.status, "failed")
                        )
                    ),
            ]);
            lastSend = {
                id: last.id,
                slug: last.slug,
                subject: last.subject,
                sentAt: last.sentAt,
                totalRecipients: recipTotalRow[0]?.total ?? 0,
                sentCount: recipSentRow[0]?.total ?? 0,
                failedCount: recipFailedRow[0]?.total ?? 0,
            };
        }

        return {
            totalSubscribers: totalSubscribersRow[0]?.total ?? 0,
            totalNewsletters: totalNewslettersRow[0]?.total ?? 0,
            statusBreakdown,
            growth: {
                newThisWeek,
                newPrevWeek,
                delta: growthDelta,
            },
            lastSend,
            scheduledQueue,
        };
    }),
});
