import { z } from "zod";
import { adminProcedure, router } from "@/trpc/server";
import { and, count, desc, eq, gte, isNotNull, isNull, lte, lt, inArray, asc, or } from "drizzle-orm";
import { subscribers } from "@/db/schemas/subscribers";
import { REMINDER_AFTER_DAYS, REMINDER_MAX_AGE_DAYS } from "@/lib/pending-reminders";
import { newsletters } from "@/db/schemas/newsletters";
import { newsletterRecipients } from "@/db/schemas/newsletter-recipients";
import { pageViews } from "@/db/schemas/page-views";

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

    // Aggregate send analytics across the most recent sent issues: overall
    // open / click / bounce rates plus per-issue rows. Powers the dashboard
    // "Send analytics" card. Read-only, admin-protected.
    sendAnalytics: adminProcedure.query(async ({ ctx }) => {
        // The most recent sent newsletters (newest first).
        const recent = await ctx.db
            .select({
                id: newsletters.id,
                slug: newsletters.slug,
                subject: newsletters.subject,
                sentAt: newsletters.sentAt,
            })
            .from(newsletters)
            .where(eq(newsletters.status, "sent"))
            .orderBy(desc(newsletters.sentAt))
            .limit(10);

        if (recent.length === 0) {
            return {
                totals: { recipients: 0, delivered: 0, opened: 0, clicked: 0, bounced: 0, complained: 0, webViews: 0 },
                rates: { deliveryRate: 0, openRate: 0, clickRate: 0, bounceRate: 0, complaintRate: 0 },
                issues: [] as Array<{
                    id: string; slug: string | null; subject: string; sentAt: Date | null;
                    recipients: number; delivered: number; opened: number; clicked: number;
                    bounced: number; complained: number; webViews: number; openRate: number; clickRate: number; bounceRate: number;
                }>,
            };
        }

        const ids = recent.map((n) => n.id);
        // One grouped pass over recipients for all recent issues.
        const grouped = await ctx.db
            .select({
                newsletterId: newsletterRecipients.newsletterId,
                recipients: count(),
                delivered: count(newsletterRecipients.deliveredAt),
                opened: count(newsletterRecipients.openedAt),
                clicked: count(newsletterRecipients.clickedAt),
                bounced: count(newsletterRecipients.bouncedAt),
                complained: count(newsletterRecipients.complainedAt),
            })
            .from(newsletterRecipients)
            .where(inArray(newsletterRecipients.newsletterId, ids))
            .groupBy(newsletterRecipients.newsletterId);

        // Public web page-views for the same recent issues, grouped per issue.
        const viewsGrouped = await ctx.db
            .select({
                newsletterId: pageViews.newsletterId,
                views: count(),
            })
            .from(pageViews)
            .where(inArray(pageViews.newsletterId, ids))
            .groupBy(pageViews.newsletterId);
        const viewsById = new Map(viewsGrouped.map((v) => [v.newsletterId, Number(v.views)]));

        const byId = new Map(grouped.map((g) => [g.newsletterId, g]));
        const rate = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 1000) / 10 : 0);

        const totals = { recipients: 0, delivered: 0, opened: 0, clicked: 0, bounced: 0, complained: 0, webViews: 0 };
        const issues = recent.map((n) => {
            const g = byId.get(n.id);
            const recipients = Number(g?.recipients ?? 0);
            const delivered = Number(g?.delivered ?? 0);
            const opened = Number(g?.opened ?? 0);
            const clicked = Number(g?.clicked ?? 0);
            const bounced = Number(g?.bounced ?? 0);
            const complained = Number(g?.complained ?? 0);
            const webViews = viewsById.get(n.id) ?? 0;
            totals.webViews += webViews;
            totals.recipients += recipients;
            totals.delivered += delivered;
            totals.opened += opened;
            totals.clicked += clicked;
            totals.bounced += bounced;
            totals.complained += complained;
            const denom = delivered > 0 ? delivered : recipients;
            return {
                id: n.id, slug: n.slug, subject: n.subject, sentAt: n.sentAt,
                recipients, delivered, opened, clicked, bounced, complained, webViews,
                openRate: rate(opened, denom),
                clickRate: rate(clicked, denom),
                bounceRate: rate(bounced, recipients),
            };
        });

        const denom = totals.delivered > 0 ? totals.delivered : totals.recipients;
        return {
            totals,
            rates: {
                deliveryRate: rate(totals.delivered, totals.recipients),
                openRate: rate(totals.opened, denom),
                clickRate: rate(totals.clicked, denom),
                bounceRate: rate(totals.bounced, totals.recipients),
                complaintRate: rate(totals.complained, totals.recipients),
            },
            issues,
        };
    }),

    // Analytics v2 — TIME-SERIES growth + performance history. Read-only
    // aggregation, no schema. Powers the dashboard "growth over time" charts:
    //   - weekly subscriber growth (net-new confirmed signups per ISO week)
    //   - per-issue open/click rate over time (chronological, sent issues)
    //   - best-performing issues (by open rate, min recipient floor)
    //   - A/B subject-line winner history (issues that ran a subject test)
    timeseries: adminProcedure.query(async ({ ctx }) => {
        const now = new Date();
        // Look back 12 weeks for the growth chart.
        const weeks = 12;
        const msWeek = 7 * 24 * 60 * 60 * 1000;
        // Anchor to the start of the current week (Sunday 00:00 local-ish; we
        // bucket by UTC-day math which is fine for a coarse weekly rollup).
        const windowStart = new Date(now.getTime() - weeks * msWeek);

        // Pull the createdAt of every subscriber inside the window in one shot
        // and bucket in JS (cheap at newsletter-list scale, avoids DB-specific
        // date_trunc SQL and keeps this portable).
        const [signupRows, sentIssues] = await Promise.all([
            ctx.db
                .select({ createdAt: subscribers.createdAt })
                .from(subscribers)
                .where(gte(subscribers.createdAt, windowStart)),
            // All sent issues, oldest-first, for the performance timeline.
            ctx.db
                .select({
                    id: newsletters.id,
                    slug: newsletters.slug,
                    subject: newsletters.subject,
                    subjectB: newsletters.subjectB,
                    sentAt: newsletters.sentAt,
                })
                .from(newsletters)
                .where(eq(newsletters.status, "sent"))
                .orderBy(asc(newsletters.sentAt)),
        ]);

        // Build the 12 weekly buckets (oldest → newest).
        const buckets: Array<{ label: string; count: number }> = [];
        for (let i = weeks - 1; i >= 0; i--) {
            const start = new Date(now.getTime() - i * msWeek);
            start.setHours(0, 0, 0, 0);
            buckets.push({
                label: start.toLocaleDateString(undefined, { month: "short", day: "numeric" }),
                count: 0,
            });
        }
        // Bucket each signup by its age in whole weeks.
        for (const r of signupRows) {
            if (!r.createdAt) continue;
            const ageWeeks = Math.floor((now.getTime() - new Date(r.createdAt).getTime()) / msWeek);
            const idx = weeks - 1 - ageWeeks;
            if (idx >= 0 && idx < buckets.length) buckets[idx].count += 1;
        }
        let cumulative = 0;
        const growth = buckets.map((b) => {
            cumulative += b.count;
            return { label: b.label, netNew: b.count, cumulative };
        });

        // Per-issue engagement over time + best performers + A/B history.
        let performance: Array<{
            id: string; slug: string | null; subject: string; sentAt: Date | null;
            recipients: number; delivered: number; opened: number; clicked: number;
            openRate: number; clickRate: number;
        }> = [];
        let abHistory: Array<{
            id: string; subject: string; subjectB: string; sentAt: Date | null;
            aRecipients: number; aOpened: number; aOpenRate: number;
            bRecipients: number; bOpened: number; bOpenRate: number;
            winner: "A" | "B" | "tie" | null;
        }> = [];

        if (sentIssues.length > 0) {
            const ids = sentIssues.map((n) => n.id);
            const grouped = await ctx.db
                .select({
                    newsletterId: newsletterRecipients.newsletterId,
                    recipients: count(),
                    delivered: count(newsletterRecipients.deliveredAt),
                    opened: count(newsletterRecipients.openedAt),
                    clicked: count(newsletterRecipients.clickedAt),
                })
                .from(newsletterRecipients)
                .where(inArray(newsletterRecipients.newsletterId, ids))
                .groupBy(newsletterRecipients.newsletterId);
            const byId = new Map(grouped.map((g) => [g.newsletterId, g]));
            const rate = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 1000) / 10 : 0);

            performance = sentIssues.map((n) => {
                const g = byId.get(n.id);
                const recipients = Number(g?.recipients ?? 0);
                const delivered = Number(g?.delivered ?? 0);
                const opened = Number(g?.opened ?? 0);
                const clicked = Number(g?.clicked ?? 0);
                const denom = delivered > 0 ? delivered : recipients;
                return {
                    id: n.id, slug: n.slug, subject: n.subject, sentAt: n.sentAt,
                    recipients, delivered, opened, clicked,
                    openRate: rate(opened, denom),
                    clickRate: rate(clicked, denom),
                };
            });

            // A/B subject-line winner history: for issues that defined subjectB,
            // split engagement by the per-recipient subjectVariant.
            const abIssues = sentIssues.filter((n) => n.subjectB);
            if (abIssues.length > 0) {
                const abIds = abIssues.map((n) => n.id);
                const variantGrouped = await ctx.db
                    .select({
                        newsletterId: newsletterRecipients.newsletterId,
                        variant: newsletterRecipients.subjectVariant,
                        recipients: count(),
                        opened: count(newsletterRecipients.openedAt),
                    })
                    .from(newsletterRecipients)
                    .where(inArray(newsletterRecipients.newsletterId, abIds))
                    .groupBy(newsletterRecipients.newsletterId, newsletterRecipients.subjectVariant);
                type VStat = { recipients: number; opened: number };
                const abMap = new Map<string, { A: VStat; B: VStat }>();
                for (const row of variantGrouped) {
                    const entry = abMap.get(row.newsletterId) ?? {
                        A: { recipients: 0, opened: 0 },
                        B: { recipients: 0, opened: 0 },
                    };
                    if (row.variant === "A" || row.variant === "B") {
                        entry[row.variant].recipients += Number(row.recipients);
                        entry[row.variant].opened += Number(row.opened);
                    }
                    abMap.set(row.newsletterId, entry);
                }
                abHistory = abIssues.map((n) => {
                    const e = abMap.get(n.id) ?? {
                        A: { recipients: 0, opened: 0 },
                        B: { recipients: 0, opened: 0 },
                    };
                    const aOpenRate = rate(e.A.opened, e.A.recipients);
                    const bOpenRate = rate(e.B.opened, e.B.recipients);
                    let winner: "A" | "B" | "tie" | null = null;
                    if (e.A.recipients > 0 && e.B.recipients > 0) {
                        winner = aOpenRate > bOpenRate ? "A" : bOpenRate > aOpenRate ? "B" : "tie";
                    }
                    return {
                        id: n.id, subject: n.subject, subjectB: n.subjectB ?? "", sentAt: n.sentAt,
                        aRecipients: e.A.recipients, aOpened: e.A.opened, aOpenRate,
                        bRecipients: e.B.recipients, bOpened: e.B.opened, bOpenRate,
                        winner,
                    };
                }).reverse(); // newest-first for display
            }
        }

        // Best-performing issues: by open rate, require a minimum recipient
        // floor so a tiny send doesn't top the chart on a fluke.
        const MIN_RECIPIENTS = 5;
        const bestIssues = [...performance]
            .filter((p) => p.recipients >= MIN_RECIPIENTS)
            .sort((a, b) => b.openRate - a.openRate)
            .slice(0, 5);

        return {
            growth,
            performance,
            bestIssues,
            abHistory,
            hasSends: performance.length > 0,
        };
    }),

    // Send-time optimization insights: aggregate the day-of-week + hour-of-day
    // that recipients OPEN (and click) from the per-recipient openedAt/clickedAt
    // timestamps the Resend webhook already records. Read-only, no schema. We
    // bucket in JS (local server timezone, which is the tz the admin schedules
    // in via the datetime-local picker) and return a full 7x24 matrix plus
    // rolled-up per-day and per-hour distributions and a recommended send
    // window (the hour whose opens cluster the hardest). This lets the editorial
    // calendar / schedule form recommend WHEN to send.
    sendTimeInsights: adminProcedure.query(async ({ ctx }) => {
        // Pull every recipient open timestamp (first-open) + click timestamp.
        // openedAt/clickedAt are the FIRST occurrence, which is the right signal
        // for "when do people engage after a send".
        const [openRows, clickRows] = await Promise.all([
            ctx.db
                .select({ ts: newsletterRecipients.openedAt })
                .from(newsletterRecipients)
                .where(isNotNull(newsletterRecipients.openedAt)),
            ctx.db
                .select({ ts: newsletterRecipients.clickedAt })
                .from(newsletterRecipients)
                .where(isNotNull(newsletterRecipients.clickedAt)),
        ]);

        const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

        // 7x24 matrix of open counts (matrix[day][hour]).
        const matrix: number[][] = Array.from({ length: 7 }, () =>
            new Array(24).fill(0)
        );
        const byDay = new Array(7).fill(0);
        const byHour = new Array(24).fill(0);
        const clicksByHour = new Array(24).fill(0);

        for (const r of openRows) {
            if (!r.ts) continue;
            const d = new Date(r.ts);
            const day = d.getDay();
            const hour = d.getHours();
            matrix[day][hour] += 1;
            byDay[day] += 1;
            byHour[hour] += 1;
        }
        for (const r of clickRows) {
            if (!r.ts) continue;
            clicksByHour[new Date(r.ts).getHours()] += 1;
        }

        const totalOpens = openRows.length;
        const totalClicks = clickRows.length;

        // Recommendation: pick the 3-hour window with the most opens (a send
        // landing near a high-open window gives the best shot at the top of the
        // inbox). Sliding 3-hour sum over the hour histogram; break ties toward
        // the earlier window. Also surface the single best day + hour.
        let bestWindowStart = 0;
        let bestWindowSum = -1;
        for (let h = 0; h < 24; h++) {
            const sum = byHour[h] + byHour[(h + 1) % 24] + byHour[(h + 2) % 24];
            if (sum > bestWindowSum) {
                bestWindowSum = sum;
                bestWindowStart = h;
            }
        }
        let bestHour = 0;
        let bestHourCount = -1;
        for (let h = 0; h < 24; h++) {
            if (byHour[h] > bestHourCount) {
                bestHourCount = byHour[h];
                bestHour = h;
            }
        }
        let bestDay = 0;
        let bestDayCount = -1;
        for (let d = 0; d < 7; d++) {
            if (byDay[d] > bestDayCount) {
                bestDayCount = byDay[d];
                bestDay = d;
            }
        }

        const fmtHour = (h: number) => {
            const ampm = h < 12 ? "am" : "pm";
            const hr = h % 12 === 0 ? 12 : h % 12;
            return `${hr}${ampm}`;
        };

        // Only make a confident recommendation once there's a reasonable signal.
        const MIN_OPENS_FOR_RECOMMENDATION = 20;
        const hasSignal = totalOpens >= MIN_OPENS_FOR_RECOMMENDATION;

        return {
            dayNames,
            matrix,
            byDay: dayNames.map((label, i) => ({ label, count: byDay[i] })),
            byHour: Array.from({ length: 24 }, (_, h) => ({
                label: fmtHour(h),
                hour: h,
                opens: byHour[h],
                clicks: clicksByHour[h],
            })),
            totalOpens,
            totalClicks,
            hasSignal,
            recommendation: {
                day: dayNames[bestDay],
                dayIndex: bestDay,
                hour: bestHour,
                hourLabel: fmtHour(bestHour),
                windowStart: bestWindowStart,
                windowEnd: (bestWindowStart + 3) % 24,
                windowLabel: `${fmtHour(bestWindowStart)}\u2013${fmtHour(
                    (bestWindowStart + 3) % 24
                )}`,
            },
        };
    }),

    // Editorial calendar / queue: scheduled + sent issues (plus drafts that
    // carry a scheduledAt) placed on a month grid. Read-only; no schema.
    // `month` is a 1-indexed month and `year` a full year; when omitted we
    // default to the current month (server timezone). We return issues whose
    // relevant date (scheduledAt for scheduled/draft, sentAt for sent, else
    // createdAt) falls within the requested month, plus a small count of
    // upcoming scheduled issues regardless of month for an at-a-glance queue.
    calendar: adminProcedure
        .input(
            z
                .object({
                    year: z.number().int().min(2000).max(2100).optional(),
                    month: z.number().int().min(1).max(12).optional(),
                })
                .optional()
        )
        .query(async ({ ctx, input }) => {
            const now = new Date();
            const year = input?.year ?? now.getFullYear();
            const month = input?.month ?? now.getMonth() + 1; // 1-indexed

            // Month window [start, end) in local server time.
            const start = new Date(year, month - 1, 1, 0, 0, 0, 0);
            const end = new Date(year, month, 1, 0, 0, 0, 0);

            // Pull issues that could land in this month: anything scheduled or
            // sent within the window. We over-fetch a little (scheduled OR sent
            // in range) then bucket in JS by the issue's effective date.
            const rows = await ctx.db
                .select({
                    id: newsletters.id,
                    slug: newsletters.slug,
                    subject: newsletters.subject,
                    status: newsletters.status,
                    scheduledAt: newsletters.scheduledAt,
                    sentAt: newsletters.sentAt,
                    createdAt: newsletters.createdAt,
                })
                .from(newsletters)
                .where(
                    and(
                        inArray(newsletters.status, ["scheduled", "sent"]),
                        or(
                            and(
                                gte(newsletters.scheduledAt, start),
                                lt(newsletters.scheduledAt, end)
                            ),
                            and(
                                gte(newsletters.sentAt, start),
                                lt(newsletters.sentAt, end)
                            )
                        )
                    )
                )
                .orderBy(asc(newsletters.scheduledAt));

            // Effective calendar date: sent issues sit on sentAt; scheduled on
            // scheduledAt. Skip any without a usable in-window date.
            const items = rows
                .map((r) => {
                    const dt =
                        r.status === "sent"
                            ? r.sentAt ?? r.scheduledAt
                            : r.scheduledAt ?? r.sentAt;
                    return dt ? { ...r, dateMs: dt.getTime() } : null;
                })
                .filter(
                    (r): r is NonNullable<typeof r> =>
                        r !== null && r.dateMs >= start.getTime() && r.dateMs < end.getTime()
                )
                .map((r) => ({
                    id: r.id,
                    slug: r.slug,
                    subject: r.subject,
                    status: r.status,
                    dateMs: r.dateMs,
                    // Local day-of-month (1..31) for grid placement.
                    day: new Date(r.dateMs).getDate(),
                }));

            // Upcoming scheduled queue (next 5), independent of the viewed
            // month, so the pipeline is visible even when browsing history.
            const upcomingRows = await ctx.db
                .select({
                    id: newsletters.id,
                    slug: newsletters.slug,
                    subject: newsletters.subject,
                    scheduledAt: newsletters.scheduledAt,
                })
                .from(newsletters)
                .where(
                    and(
                        eq(newsletters.status, "scheduled"),
                        gte(newsletters.scheduledAt, now)
                    )
                )
                .orderBy(asc(newsletters.scheduledAt))
                .limit(5);

            const upcoming = upcomingRows
                .filter((r) => r.scheduledAt)
                .map((r) => ({
                    id: r.id,
                    slug: r.slug,
                    subject: r.subject,
                    dateMs: r.scheduledAt!.getTime(),
                }));

            return {
                year,
                month, // 1-indexed
                daysInMonth: new Date(year, month, 0).getDate(),
                // Weekday (0=Sun..6=Sat) the 1st of the month falls on, for grid offset.
                firstWeekday: start.getDay(),
                items,
                upcoming,
            };
        }),

    // ── Double opt-in health (pending-cleanup surface) ────────────────────
    // Read-only view of the pending-subscriber funnel for list hygiene: how
    // many pending subscribers exist, how many are eligible for the one-time
    // reminder, how many have already been reminded, and a STALE cohort
    // (reminded already + past the reminder max-age window = cold leads).
    // Also returns a sample list of stale rows so an admin can eyeball them.
    // This NEVER deletes anyone — deletion stays a manual admin action via the
    // existing bulk-delete tooling.
    pendingHealth: adminProcedure
        .input(
            z
                .object({
                    // Rows older than this (and already reminded) count as stale.
                    staleAfterDays: z.number().int().min(1).max(365).optional(),
                    sampleLimit: z.number().int().min(1).max(100).default(25),
                })
                .default({ sampleLimit: 25 }),
        )
        .query(async ({ ctx, input }) => {
            const now = Date.now();
            const staleAfterDays = input.staleAfterDays ?? REMINDER_MAX_AGE_DAYS;
            const daysAgo = (d: number) => new Date(now - d * 24 * 60 * 60 * 1000);

            const pendingWhere = eq(subscribers.status, "pending");
            // Eligible for a reminder right now: pending, never reminded, old
            // enough to remind, not too cold to remind.
            const eligibleWhere = and(
                pendingWhere,
                isNull(subscribers.confirmReminderSentAt),
                lte(subscribers.createdAt, daysAgo(REMINDER_AFTER_DAYS)),
                gte(subscribers.createdAt, daysAgo(REMINDER_MAX_AGE_DAYS)),
            );
            // Stale: pending + already reminded + older than the stale window.
            const staleWhere = and(
                pendingWhere,
                isNotNull(subscribers.confirmReminderSentAt),
                lte(subscribers.createdAt, daysAgo(staleAfterDays)),
            );

            const [pendingRow, remindedRow, eligibleRow, staleRow, sample] =
                await Promise.all([
                    ctx.db.select({ c: count() }).from(subscribers).where(pendingWhere),
                    ctx.db
                        .select({ c: count() })
                        .from(subscribers)
                        .where(and(pendingWhere, isNotNull(subscribers.confirmReminderSentAt))),
                    ctx.db.select({ c: count() }).from(subscribers).where(eligibleWhere),
                    ctx.db.select({ c: count() }).from(subscribers).where(staleWhere),
                    ctx.db
                        .select({
                            id: subscribers.id,
                            email: subscribers.email,
                            firstName: subscribers.firstName,
                            lastName: subscribers.lastName,
                            createdAt: subscribers.createdAt,
                            confirmReminderSentAt: subscribers.confirmReminderSentAt,
                        })
                        .from(subscribers)
                        .where(staleWhere)
                        .orderBy(asc(subscribers.createdAt))
                        .limit(input.sampleLimit),
                ]);

            return {
                pending: pendingRow[0]?.c ?? 0,
                reminded: remindedRow[0]?.c ?? 0,
                eligibleForReminder: eligibleRow[0]?.c ?? 0,
                stale: staleRow[0]?.c ?? 0,
                staleAfterDays,
                reminderAfterDays: REMINDER_AFTER_DAYS,
                reminderMaxAgeDays: REMINDER_MAX_AGE_DAYS,
                staleSample: sample.map((r) => ({
                    id: r.id,
                    email: r.email,
                    firstName: r.firstName,
                    lastName: r.lastName,
                    createdAtMs: r.createdAt.getTime(),
                    reminderSentAtMs: r.confirmReminderSentAt
                        ? r.confirmReminderSentAt.getTime()
                        : null,
                })),
            };
        }),
});
