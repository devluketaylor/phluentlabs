import { z } from "zod";
import { adminProcedure, router } from "@/trpc/server";
import { and, count, desc, eq, gte, isNotNull, isNull, lte, lt, inArray, asc, or, sql } from "drizzle-orm";
import { subscribers } from "@/db/schemas/subscribers";
import { REMINDER_AFTER_DAYS, REMINDER_MAX_AGE_DAYS } from "@/lib/pending-reminders";
import { newsletters } from "@/db/schemas/newsletters";
import { newsletterRecipients } from "@/db/schemas/newsletter-recipients";
import { pageViews } from "@/db/schemas/page-views";
import { linkClicks } from "@/db/schemas/link-clicks";

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

    // ── "Needs attention" digest ──────────────────────────────────────────
    // A single actionable rollup for the top of the dashboard: the handful of
    // things an operator should act on right now. Read-only aggregation over
    // existing tables (no schema). Surfaces:
    //   - scheduled sends DUE SOON (within the next 24h) or already overdue
    //   - stale pending subscribers (reminded already + past the max-age window)
    //   - subscribers currently suppressed (auto-removed after bounce/complaint)
    //   - failed send recipients across recent issues that could be retried
    // Each item carries a count, a short label, a severity, and a href so the
    // card can render a compact, clickable to-do list. When everything is clear
    // the card can show an "all clear" state.
    needsAttention: adminProcedure.query(async ({ ctx }) => {
        const now = new Date();
        const soon = new Date(now.getTime() + 24 * 60 * 60 * 1000);
        const staleCutoff = new Date(
            now.getTime() - REMINDER_MAX_AGE_DAYS * 24 * 60 * 60 * 1000,
        );

        const [
            dueSoonRow,
            overdueRow,
            stalePendingRow,
            suppressedRow,
            failedRecipientsRow,
        ] = await Promise.all([
            // Scheduled issues due within the next 24h (not yet overdue).
            ctx.db
                .select({ c: count() })
                .from(newsletters)
                .where(
                    and(
                        eq(newsletters.status, "scheduled"),
                        gte(newsletters.scheduledAt, now),
                        lte(newsletters.scheduledAt, soon),
                    ),
                ),
            // Scheduled issues whose send time has already passed but haven't sent.
            ctx.db
                .select({ c: count() })
                .from(newsletters)
                .where(
                    and(
                        eq(newsletters.status, "scheduled"),
                        lt(newsletters.scheduledAt, now),
                    ),
                ),
            // Stale pending subscribers: reminded already + past the max-age window.
            ctx.db
                .select({ c: count() })
                .from(subscribers)
                .where(
                    and(
                        eq(subscribers.status, "pending"),
                        isNotNull(subscribers.confirmReminderSentAt),
                        lte(subscribers.createdAt, staleCutoff),
                    ),
                ),
            // Currently suppressed subscribers (auto-removed after bounce/complaint).
            ctx.db
                .select({ c: count() })
                .from(subscribers)
                .where(eq(subscribers.status, "suppressed")),
            // Failed send recipients that could be retried (across all issues).
            ctx.db
                .select({ c: count() })
                .from(newsletterRecipients)
                .where(eq(newsletterRecipients.status, "failed")),
        ]);

        const dueSoon = dueSoonRow[0]?.c ?? 0;
        const overdue = overdueRow[0]?.c ?? 0;
        const stalePending = stalePendingRow[0]?.c ?? 0;
        const suppressed = suppressedRow[0]?.c ?? 0;
        const failedRecipients = failedRecipientsRow[0]?.c ?? 0;

        type Severity = "warning" | "info";
        const items: Array<{
            key: string;
            count: number;
            label: string;
            severity: Severity;
            href: string;
        }> = [];

        if (overdue > 0) {
            items.push({
                key: "overdue",
                count: overdue,
                label:
                    overdue === 1
                        ? "scheduled send is overdue"
                        : "scheduled sends are overdue",
                severity: "warning",
                href: "/admin/calendar",
            });
        }
        if (dueSoon > 0) {
            items.push({
                key: "dueSoon",
                count: dueSoon,
                label:
                    dueSoon === 1
                        ? "scheduled send due within 24h"
                        : "scheduled sends due within 24h",
                severity: "info",
                href: "/admin/calendar",
            });
        }
        if (failedRecipients > 0) {
            items.push({
                key: "failedRecipients",
                count: failedRecipients,
                label:
                    failedRecipients === 1
                        ? "failed send recipient to retry"
                        : "failed send recipients to retry",
                severity: "warning",
                href: "/admin/newsletters",
            });
        }
        if (suppressed > 0) {
            items.push({
                key: "suppressed",
                count: suppressed,
                label:
                    suppressed === 1
                        ? "subscriber suppressed (bounce/complaint)"
                        : "subscribers suppressed (bounce/complaint)",
                severity: "info",
                href: "/admin/list-health",
            });
        }
        if (stalePending > 0) {
            items.push({
                key: "stalePending",
                count: stalePending,
                label:
                    stalePending === 1
                        ? "stale pending subscriber to clean up"
                        : "stale pending subscribers to clean up",
                severity: "info",
                href: "/admin/list-health",
            });
        }

        return {
            items,
            allClear: items.length === 0,
            counts: {
                dueSoon,
                overdue,
                stalePending,
                suppressed,
                failedRecipients,
            },
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

    // Per-issue send-analytics CSV export. Read-only aggregation over ALL sent
    // issues (not just the recent 10 that sendAnalytics surfaces) so an operator
    // can pull the full send history into a spreadsheet — closes a gap vs
    // Substack/beehiiv/Kit which all offer analytics export. No schema, no PII
    // beyond the issue subject/slug the admin already sees.
    exportAnalyticsCsv: adminProcedure.query(async ({ ctx }) => {
        const sent = await ctx.db
            .select({
                id: newsletters.id,
                slug: newsletters.slug,
                subject: newsletters.subject,
                sentAt: newsletters.sentAt,
            })
            .from(newsletters)
            .where(eq(newsletters.status, "sent"))
            .orderBy(desc(newsletters.sentAt));

        const escape = (val: unknown) => {
            const s = val == null ? "" : String(val);
            return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
        };
        const header = [
            "subject", "slug", "sent_at", "recipients", "delivered",
            "opened", "clicked", "bounced", "complained", "web_views",
            "open_rate_pct", "click_rate_pct", "bounce_rate_pct",
        ];
        const lines = [header.join(",")];

        if (sent.length === 0) {
            return { csv: lines.join("\n"), count: 0 };
        }

        const ids = sent.map((n) => n.id);
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
        const byId = new Map(grouped.map((g) => [g.newsletterId, g]));

        const viewsGrouped = await ctx.db
            .select({
                newsletterId: pageViews.newsletterId,
                views: count(),
            })
            .from(pageViews)
            .where(inArray(pageViews.newsletterId, ids))
            .groupBy(pageViews.newsletterId);
        const viewsById = new Map(viewsGrouped.map((v) => [v.newsletterId, Number(v.views)]));

        const rate = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 1000) / 10 : 0);

        for (const n of sent) {
            const g = byId.get(n.id);
            const recipients = Number(g?.recipients ?? 0);
            const delivered = Number(g?.delivered ?? 0);
            const opened = Number(g?.opened ?? 0);
            const clicked = Number(g?.clicked ?? 0);
            const bounced = Number(g?.bounced ?? 0);
            const complained = Number(g?.complained ?? 0);
            const webViews = viewsById.get(n.id) ?? 0;
            const denom = delivered > 0 ? delivered : recipients;
            lines.push([
                escape(n.subject),
                escape(n.slug),
                escape(n.sentAt instanceof Date ? n.sentAt.toISOString() : n.sentAt),
                recipients, delivered, opened, clicked, bounced, complained, webViews,
                rate(opened, denom),
                rate(clicked, denom),
                rate(bounced, recipients),
            ].join(","));
        }

        return { csv: lines.join("\n"), count: sent.length };
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
                    // Overdue = still `scheduled` but its send time has passed
                    // (a stuck send the cron hasn't picked up). Sent issues are
                    // never overdue.
                    overdue:
                        r.status === "scheduled" && r.dateMs < now.getTime(),
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
                // Include ALL scheduled issues with a send time (future AND
                // past-but-still-scheduled), so stuck/overdue sends surface in
                // the queue instead of silently vanishing from view.
                .where(
                    and(
                        eq(newsletters.status, "scheduled"),
                        isNotNull(newsletters.scheduledAt)
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
                    // Overdue = a scheduled send whose time has already passed.
                    overdue: r.scheduledAt!.getTime() < now.getTime(),
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

    // ── Pending-signup funnel (compact dashboard widget) ──────────────────
    // Lean read-only rollup of the confirm funnel for a small dashboard card:
    // how many pending signups exist, how many confirmed in the last 7 days,
    // the confirm rate, and how many pending rows are past the reminder
    // window (stale = already reminded + older than the max-age cutoff). No
    // sample rows here (the full list-health page owns the drill-down); this
    // is just the at-a-glance numbers. Never mutates.
    pendingFunnel: adminProcedure.query(async ({ ctx }) => {
        const now = Date.now();
        const daysAgo = (d: number) =>
            new Date(now - d * 24 * 60 * 60 * 1000);
        const weekAgo = daysAgo(7);
        const staleCutoff = daysAgo(REMINDER_MAX_AGE_DAYS);

        const [pendingRow, confirmedWeekRow, subscribedRow, stalePendingRow] =
            await Promise.all([
                // Currently pending (never confirmed yet).
                ctx.db
                    .select({ c: count() })
                    .from(subscribers)
                    .where(eq(subscribers.status, "pending")),
                // Confirmed this week — subscribers who reached "subscribed"
                // status and whose confirmedAt landed in the last 7 days.
                ctx.db
                    .select({ c: count() })
                    .from(subscribers)
                    .where(
                        and(
                            eq(subscribers.status, "subscribed"),
                            isNotNull(subscribers.confirmedAt),
                            gte(subscribers.confirmedAt, weekAgo),
                        ),
                    ),
                // Total subscribed (for an all-time confirm-rate denominator).
                ctx.db
                    .select({ c: count() })
                    .from(subscribers)
                    .where(eq(subscribers.status, "subscribed")),
                // Stale pending: already reminded + past the max-age window.
                ctx.db
                    .select({ c: count() })
                    .from(subscribers)
                    .where(
                        and(
                            eq(subscribers.status, "pending"),
                            isNotNull(subscribers.confirmReminderSentAt),
                            lte(subscribers.createdAt, staleCutoff),
                        ),
                    ),
            ]);

        const pending = pendingRow[0]?.c ?? 0;
        const confirmedThisWeek = confirmedWeekRow[0]?.c ?? 0;
        const subscribed = subscribedRow[0]?.c ?? 0;
        const stalePending = stalePendingRow[0]?.c ?? 0;

        // Confirm rate = confirmed / (confirmed + still-pending). Signals how
        // much of the funnel converts once someone signs up.
        const funnelTotal = subscribed + pending;
        const confirmRate =
            funnelTotal > 0
                ? Math.round((subscribed / funnelTotal) * 100)
                : null;

        return {
            pending,
            confirmedThisWeek,
            subscribed,
            stalePending,
            confirmRate,
            reminderMaxAgeDays: REMINDER_MAX_AGE_DAYS,
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

    // ── Deliverability health (bounce / complaint / suppression) ───────────
    // Read-only rollup of delivery problems recorded by the Resend webhook.
    // Surfaces (1) how many subscribers are currently SUPPRESSED (auto-removed
    // from sends after a hard bounce or spam complaint), and (2) a per-
    // subscriber list of anyone who has ever hard-bounced or complained on any
    // issue — so an admin can see the deliverability signal at the person
    // level, not just per-issue. Never mutates — suppression itself happens in
    // the webhook handler; this is the reporting surface.
    deliverabilityHealth: adminProcedure
        .input(
            z
                .object({
                    sampleLimit: z.number().int().min(1).max(200).default(50),
                })
                .default({ sampleLimit: 50 }),
        )
        .query(async ({ ctx, input }) => {
            // Per-subscriber rollup of bounce/complaint events across all issues.
            // A subscriber counts as "bounced" if ANY recipient row bounced, and
            // "complained" if ANY complained.
            const problemRows = await ctx.db
                .select({
                    id: subscribers.id,
                    email: subscribers.email,
                    firstName: subscribers.firstName,
                    lastName: subscribers.lastName,
                    status: subscribers.status,
                    bounced: sql<number>`COUNT(*) FILTER (WHERE ${newsletterRecipients.bouncedAt} IS NOT NULL)::int`,
                    complained: sql<number>`COUNT(*) FILTER (WHERE ${newsletterRecipients.complainedAt} IS NOT NULL)::int`,
                    lastProblemAt: sql<Date | null>`MAX(GREATEST(${newsletterRecipients.bouncedAt}, ${newsletterRecipients.complainedAt}))`,
                })
                .from(subscribers)
                .innerJoin(
                    newsletterRecipients,
                    eq(newsletterRecipients.subscriberId, subscribers.id),
                )
                .where(
                    or(
                        isNotNull(newsletterRecipients.bouncedAt),
                        isNotNull(newsletterRecipients.complainedAt),
                    ),
                )
                .groupBy(
                    subscribers.id,
                    subscribers.email,
                    subscribers.firstName,
                    subscribers.lastName,
                    subscribers.status,
                )
                .orderBy(
                    desc(sql`MAX(GREATEST(${newsletterRecipients.bouncedAt}, ${newsletterRecipients.complainedAt}))`),
                )
                .limit(input.sampleLimit);

            // Headline counts.
            const [suppressedRow, bouncedSubRow, complainedSubRow] = await Promise.all([
                ctx.db
                    .select({ c: count() })
                    .from(subscribers)
                    .where(eq(subscribers.status, "suppressed")),
                // Distinct subscribers with at least one bounced recipient row.
                ctx.db
                    .select({
                        c: sql<number>`COUNT(DISTINCT ${newsletterRecipients.subscriberId})::int`,
                    })
                    .from(newsletterRecipients)
                    .where(isNotNull(newsletterRecipients.bouncedAt)),
                ctx.db
                    .select({
                        c: sql<number>`COUNT(DISTINCT ${newsletterRecipients.subscriberId})::int`,
                    })
                    .from(newsletterRecipients)
                    .where(isNotNull(newsletterRecipients.complainedAt)),
            ]);

            return {
                suppressed: suppressedRow[0]?.c ?? 0,
                bouncedSubscribers: bouncedSubRow[0]?.c ?? 0,
                complainedSubscribers: complainedSubRow[0]?.c ?? 0,
                sample: problemRows.map((r) => ({
                    id: r.id,
                    email: r.email,
                    firstName: r.firstName,
                    lastName: r.lastName,
                    status: r.status,
                    bounced: Number(r.bounced ?? 0),
                    complained: Number(r.complained ?? 0),
                    lastProblemAtMs: r.lastProblemAt
                        ? new Date(r.lastProblemAt).getTime()
                        : null,
                })),
            };
        }),

    // Per-issue DELIVERABILITY SCORE rollup (Tier 18). Read-only aggregation,
    // no schema. Combines post-send signals into a single 0-100 score per sent
    // issue so a pattern of deliverability-hurting issues is visible over time.
    //
    // Scoring model (higher = healthier delivery), starting from 100:
    //   - complaint rate: the biggest reputation killer — heavily penalized.
    //     Mailbox providers act on complaints fast; even 0.1% is a warning.
    //   - bounce rate: hard signal of list hygiene / spam-trap risk.
    //   - open rate: a soft engagement proxy — very low opens can indicate
    //     spam-foldering, but is only lightly weighted (and skipped when there
    //     aren't enough recipients to be meaningful).
    // The score is clamped to 0-100 and bucketed into a grade for the UI.
    deliverabilityScores: adminProcedure.query(async ({ ctx }) => {
        const sent = await ctx.db
            .select({
                id: newsletters.id,
                subject: newsletters.subject,
                sentAt: newsletters.sentAt,
            })
            .from(newsletters)
            .where(eq(newsletters.status, "sent"))
            .orderBy(desc(newsletters.sentAt));

        if (sent.length === 0) {
            return {
                hasData: false,
                avgScore: null as number | null,
                poorCount: 0,
                issues: [] as {
                    id: string;
                    subject: string;
                    sentAtMs: number | null;
                    recipients: number;
                    openRate: number;
                    clickRate: number;
                    bounceRate: number;
                    complaintRate: number;
                    score: number;
                    grade: "excellent" | "good" | "fair" | "poor";
                    reasons: string[];
                }[],
            };
        }

        const ids = sent.map((n) => n.id);
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
        const byId = new Map(grouped.map((g) => [g.newsletterId, g]));

        const pct = (n: number, d: number) => (d > 0 ? (n / d) * 100 : 0);
        const round1 = (n: number) => Math.round(n * 10) / 10;

        const issues = sent.map((n) => {
            const g = byId.get(n.id);
            const recipients = Number(g?.recipients ?? 0);
            const delivered = Number(g?.delivered ?? 0);
            const opened = Number(g?.opened ?? 0);
            const clicked = Number(g?.clicked ?? 0);
            const bounced = Number(g?.bounced ?? 0);
            const complained = Number(g?.complained ?? 0);

            // Rates: bounce/complaint over everyone we attempted; open over the
            // deliverable base (fall back to recipients if delivered isn't tracked).
            const openDenom = delivered > 0 ? delivered : recipients;
            const bounceRate = pct(bounced, recipients);
            const complaintRate = pct(complained, recipients);
            const openRate = pct(opened, openDenom);
            const clickRate = pct(clicked, openDenom);

            // --- Scoring ---
            let score = 100;
            const reasons: string[] = [];

            // Complaints: brutal. ~25 pts per 0.1%, so 0.4% ≈ -100.
            if (complaintRate > 0) {
                const penalty = Math.min(60, complaintRate * 250);
                score -= penalty;
                reasons.push(
                    `${round1(complaintRate)}% complaints`,
                );
            }
            // Bounces: strong. ~5 pts per 1%, capped.
            if (bounceRate > 0) {
                const penalty = Math.min(40, bounceRate * 5);
                score -= penalty;
                if (bounceRate >= 2) reasons.push(`${round1(bounceRate)}% bounces`);
            }
            // Low engagement: soft, only when there's a meaningful sample and no
            // opens are being reported would be very low. Under 10% opens on a
            // 20+ recipient send loses up to 15 pts.
            if (openDenom >= 20 && openRate < 15) {
                const penalty = Math.min(15, (15 - openRate) * 1);
                score -= penalty;
                if (openRate < 10) reasons.push(`${round1(openRate)}% open rate`);
            }

            score = Math.max(0, Math.min(100, Math.round(score)));

            // Grade buckets for the UI.
            const grade: "excellent" | "good" | "fair" | "poor" =
                score >= 90
                    ? "excellent"
                    : score >= 75
                      ? "good"
                      : score >= 55
                        ? "fair"
                        : "poor";

            return {
                id: n.id,
                subject: n.subject,
                sentAtMs: n.sentAt ? new Date(n.sentAt).getTime() : null,
                recipients,
                openRate: round1(openRate),
                clickRate: round1(clickRate),
                bounceRate: round1(bounceRate),
                complaintRate: round1(complaintRate),
                score,
                grade,
                reasons,
            };
        });

        // Portfolio average across issues that actually had recipients.
        const scored = issues.filter((i) => i.recipients > 0);
        const avgScore =
            scored.length > 0
                ? Math.round(
                      scored.reduce((s, i) => s + i.score, 0) / scored.length,
                  )
                : null;
        const poorCount = scored.filter((i) => i.grade === "poor").length;

        return {
            hasData: scored.length > 0,
            avgScore,
            poorCount,
            issues,
        };
    }),

    // "Most-clicked links across ALL issues." The per-issue click map
    // (newsletter.analytics.links) answers "which links did readers click in
    // THIS issue"; this rolls the same append-only link_click data up a level
    // so the operator sees which destinations consistently earn clicks across
    // the whole back-catalogue (product/CTA links vs external reads) — a
    // content-strategy signal. Read-only aggregation over link_click; NO PII
    // (that table stores only issue id + destination url). No schema change.
    topLinks: adminProcedure.query(async ({ ctx }) => {
        // Total click events tracked across every issue.
        const [{ total }] = await ctx.db
            .select({ total: count() })
            .from(linkClicks);

        // Rank destinations by click volume across all issues, and count how
        // many distinct issues each destination was clicked in (a url clicked
        // across many issues is a durable, evergreen link; a one-issue spike is
        // more of a moment). Top 20.
        const rows = await ctx.db
            .select({
                url: linkClicks.url,
                clicks: count(),
                issues: sql<number>`count(distinct ${linkClicks.newsletterId})`,
            })
            .from(linkClicks)
            .groupBy(linkClicks.url)
            .orderBy(desc(count()))
            .limit(20);

        const top = rows.map((r) => ({
            url: r.url,
            clicks: Number(r.clicks),
            issues: Number(r.issues),
        }));

        return {
            hasData: top.length > 0,
            total: Number(total),
            top,
        };
    }),
});
