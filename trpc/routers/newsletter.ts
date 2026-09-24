import { adminProcedure, editorProcedure, publicProcedure, router } from "@/trpc/server";
import { z } from "zod";

function toSlug(text: string): string {
    return text
        .toLowerCase()
        .trim()
        .replace(/[^\w\s-]/g, "")
        .replace(/[\s_-]+/g, "-")
        .replace(/^-+|-+$/g, "");
}
import { newsletters } from "@/db/schemas/newsletters";
import { newsletterRecipients } from "@/db/schemas/newsletter-recipients";
import { subscribers } from "@/db/schemas/subscribers";
import { pageViews } from "@/db/schemas/page-views";
import { shareClicks } from "@/db/schemas/share-clicks";
import { issueReactions } from "@/db/schemas/issue-reactions";
import { feedback } from "@/db/schemas/feedback";
import { publications } from "@/db/schemas/publications";
import { and, arrayContains, count, desc, eq, ilike, inArray, isNotNull, isNull, lte, or } from "drizzle-orm";
import { Resend } from "resend";
import { signSubscriberToken } from "@/lib/subscriber-token";
import { signPreviewToken } from "@/lib/preview-token";
import { TRPCError } from "@trpc/server";
import { sendNewsletterToSubscribers } from "@/lib/send-newsletter";
import { resolveCohortSubscribers } from "@/lib/engagement-cohort";
import { activeSubscriberWhere, autoResumeElapsedSnoozes } from "@/lib/snooze";
import { recordAudit } from "@/lib/audit";
import { user } from "@/db/schemas/auth";
import { normalizeRole } from "@/lib/roles";

// Shared test-email HTML: mirrors the real send's footer so the test matches
// production output, but with a dummy unsubscribe link (no real token needed
// for a test) + a clear "this is a test" banner subscribers never see.
function buildTestEmailHtml(issueHtml: string): string {
    return `<div style="background:#fffbeb;border:1px solid #fbbf24;border-radius:6px;padding:10px 14px;margin-bottom:20px;font-size:13px;color:#92400e;">This is a <strong>test</strong> of your newsletter. Subscribers will not see this banner.</div>${issueHtml}<p style="margin-top:32px;font-size:12px;color:#888;"><a href="#">Unsubscribe</a></p>`;
}

const resend = new Resend(process.env.RESEND_API_KEY);

const newsletterStatus = z.enum(["draft", "scheduled", "sent"]);

export const adminNewsletterRouter = router({
    // Lightweight identity echo so the editor UI can prefill "send a test to
    // myself" with the logged-in admin's own email (Tier 11 #3). Returns only
    // the actor's email — nothing sensitive.
    whoami: adminProcedure.query(({ ctx }) => {
        return { email: ctx.adminEmail ?? null };
    }),

    list: adminProcedure
        .input(
            z.object({
                limit: z.number().int().min(1).max(100).default(50),
                offset: z.number().int().min(0).default(0),
            })
        )
        .query(async ({ input, ctx }) => {
            const [items, [{ total }]] = await Promise.all([
                ctx.db
                    .select()
                    .from(newsletters)
                    .orderBy(desc(newsletters.createdAt))
                    .limit(input.limit)
                    .offset(input.offset),
                ctx.db.select({ total: count() }).from(newsletters),
            ]);
            return { items, total };
        }),

    // Lightweight single-issue re-fetch used by the editor's "restore last
    // autosaved draft" recovery affordance. On reopen the dialog fetches the
    // current server state; if its `updatedAt` is newer than the version the
    // editor initialized with (e.g. a tab closed mid-edit, or a concurrent
    // autosave elsewhere), the client offers a one-click "load latest". Returns
    // only the fields the editor hydrates from.
    getFresh: adminProcedure
        .input(z.object({ id: z.string().min(1) }))
        .query(async ({ input, ctx }) => {
            const [row] = await ctx.db
                .select({
                    id: newsletters.id,
                    subject: newsletters.subject,
                    subjectB: newsletters.subjectB,
                    preheader: newsletters.preheader,
                    html: newsletters.html,
                    slug: newsletters.slug,
                    status: newsletters.status,
                    updatedAt: newsletters.updatedAt,
                })
                .from(newsletters)
                .where(eq(newsletters.id, input.id))
                .limit(1);
            if (!row) {
                throw new TRPCError({ code: "NOT_FOUND", message: "Issue not found" });
            }
            return {
                ...row,
                updatedAt: row.updatedAt ? new Date(row.updatedAt).toISOString() : null,
            };
        }),

    create: editorProcedure
        .input(
            z.object({
                subject: z.string().min(1),
                // Optional second subject line for an A/B test. When present the
                // send splits the audience ~50/50 across the two subjects.
                subjectB: z.string().trim().min(1).nullish(),
                html: z.string().min(1),
                preheader: z.string().optional(),
                slug: z.string().optional(),
                // Optional publication/section this issue belongs to. Null =
                // primary/default stream (unchanged single-stream behaviour).
                publicationId: z.string().nullish(),
            })
        )
        .mutation(async ({ input, ctx }) => {
            const id = crypto.randomUUID();
            const baseSlug = input.slug?.trim()
                ? toSlug(input.slug.trim())
                : toSlug(input.subject.trim());
            const slug = baseSlug
                ? `${baseSlug}-${id.slice(0, 8)}`
                : id.slice(0, 8);
            await ctx.db.insert(newsletters).values({
                id,
                slug,
                subject: input.subject.trim(),
                subjectB: input.subjectB?.trim() || null,
                html: input.html,
                preheader: input.preheader ?? null,
                publicationId: input.publicationId || null,
                status: "draft",
                createdBy: ctx.adminUserId,
            });
            await recordAudit(ctx, {
                action: "newsletter.create",
                targetType: "newsletter",
                targetId: id,
                metadata: { subject: input.subject.trim(), slug },
            });
            return { ok: true, id, slug };
        }),

    update: editorProcedure
        .input(
            z.object({
                id: z.string().min(1),
                subject: z.string().min(1),
                // Second subject variant (A/B test). null/empty clears the test.
                subjectB: z.string().nullish(),
                html: z.string().min(1),
                preheader: z.string().optional(),
                status: newsletterStatus,
                slug: z.string().optional(),
                // Optional publication/section reassignment. undefined = leave
                // as-is; null = move back to the primary/default stream.
                publicationId: z.string().nullish(),
            })
        )
        .mutation(async ({ input, ctx }) => {
            // Load the current row so a status change from the edit form stays
            // consistent with the scheduledAt / sentAt timestamps. Setting a
            // status via this free-form Select must NOT create impossible states
            // (e.g. status="scheduled" with no scheduledAt would sit in limbo and
            // never fire from the cron due-query; status="sent" with no sentAt
            // would surface a never-actually-sent issue publicly).
            const [existing] = await ctx.db
                .select()
                .from(newsletters)
                .where(eq(newsletters.id, input.id));
            if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Newsletter not found" });

            // Only guard when the status is actually changing.
            let scheduledAt: Date | null | undefined = undefined;
            if (input.status !== existing.status) {
                if (input.status === "scheduled") {
                    if (!existing.scheduledAt) {
                        throw new TRPCError({
                            code: "BAD_REQUEST",
                            message: "Use the Schedule action to schedule a send \u2014 it sets the send time. You can't set status to Scheduled without one.",
                        });
                    }
                } else if (input.status === "sent") {
                    if (!existing.sentAt) {
                        throw new TRPCError({
                            code: "BAD_REQUEST",
                            message: "Use the Send action to send this newsletter. Status can't be set to Sent manually.",
                        });
                    }
                } else if (input.status === "draft") {
                    // Moving back to draft clears any pending schedule.
                    scheduledAt = null;
                }
            }

            await ctx.db
                .update(newsletters)
                .set({
                    subject: input.subject.trim(),
                    // Only write subjectB when the field was sent; an empty/blank
                    // string clears the A/B test back to a single-subject issue.
                    ...(input.subjectB !== undefined
                        ? { subjectB: input.subjectB?.trim() || null }
                        : {}),
                    html: input.html,
                    preheader: input.preheader ?? null,
                    status: input.status,
                    ...(scheduledAt !== undefined ? { scheduledAt } : {}),
                    ...(input.publicationId !== undefined
                        ? { publicationId: input.publicationId || null }
                        : {}),
                    slug: input.slug?.trim() ? toSlug(input.slug.trim()) : undefined,
                    updatedAt: new Date(),
                })
                .where(eq(newsletters.id, input.id));
            await recordAudit(ctx, {
                action: "newsletter.update",
                targetType: "newsletter",
                targetId: input.id,
                metadata: { subject: input.subject.trim(), status: input.status },
            });
            return { ok: true };
        }),

    // Lightweight autosave for the rich editor. Persists in-progress edits on a
    // DRAFT issue without the full-form guards/toasts/audit noise of `update`.
    // Hard-refuses to touch a non-draft issue (scheduled/sent), so an autosave
    // timer can never clobber a scheduled/sent issue's content or send state.
    // Optimistic-concurrency: pass the `updatedAt` the client last knew; if the
    // row moved on (another tab/editor saved), we reject with CONFLICT rather
    // than silently overwrite. All content fields are optional so a partial
    // draft (e.g. body only) still saves. Returns the new `updatedAt` so the
    // client can show a "Saved HH:MM" indicator and track concurrency.
    saveDraft: editorProcedure
        .input(
            z.object({
                id: z.string().min(1),
                subject: z.string().optional(),
                subjectB: z.string().nullish(),
                html: z.string().optional(),
                preheader: z.string().optional(),
                // The updatedAt the client last observed (ISO or epoch ms). When
                // provided and stale, the save is rejected to avoid clobbering a
                // concurrent edit.
                expectedUpdatedAt: z.union([z.string(), z.number()]).optional(),
            })
        )
        .mutation(async ({ input, ctx }) => {
            const [existing] = await ctx.db
                .select()
                .from(newsletters)
                .where(eq(newsletters.id, input.id));
            if (!existing) {
                throw new TRPCError({ code: "NOT_FOUND", message: "Newsletter not found" });
            }
            // Only drafts autosave. A scheduled/sent issue is intentionally
            // immutable from the autosave path.
            if (existing.status !== "draft") {
                throw new TRPCError({
                    code: "BAD_REQUEST",
                    message: "Autosave only applies to drafts.",
                });
            }
            // Optimistic concurrency: reject a stale write instead of clobbering.
            if (input.expectedUpdatedAt !== undefined && existing.updatedAt) {
                const expected = new Date(input.expectedUpdatedAt).getTime();
                const actual = new Date(existing.updatedAt).getTime();
                if (Number.isFinite(expected) && expected < actual) {
                    throw new TRPCError({
                        code: "CONFLICT",
                        message: "This draft changed elsewhere. Reopen it to get the latest version before editing.",
                    });
                }
            }

            const now = new Date();
            await ctx.db
                .update(newsletters)
                .set({
                    ...(input.subject !== undefined && input.subject.trim()
                        ? { subject: input.subject.trim() }
                        : {}),
                    ...(input.subjectB !== undefined
                        ? { subjectB: input.subjectB?.trim() || null }
                        : {}),
                    ...(input.html !== undefined ? { html: input.html } : {}),
                    ...(input.preheader !== undefined
                        ? { preheader: input.preheader.trim() || null }
                        : {}),
                    updatedAt: now,
                })
                .where(eq(newsletters.id, input.id));
            // No audit row for autosave — it fires frequently and would flood the
            // audit log; the explicit Save/update path still records an audit.
            return { ok: true, updatedAt: now.toISOString() };
        }),

    delete: editorProcedure
        .input(z.object({ id: z.string().min(1) }))
        .mutation(async ({ input, ctx }) => {
            await ctx.db.delete(newsletters).where(eq(newsletters.id, input.id));
            await recordAudit(ctx, {
                action: "newsletter.delete",
                targetType: "newsletter",
                targetId: input.id,
            });
            return { ok: true };
        }),

    // Duplicate an existing issue into a fresh DRAFT — a common newsletter
    // workflow (reuse a past issue as a starting template for a recurring
    // format). The copy is ALWAYS a new draft with its own id/slug and NO
    // send state (never inherits scheduledAt/sentAt/analytics), so cloning a
    // sent issue can never accidentally re-publish or re-send anything. Content
    // (html, preheader, A/B subjectB) carries over; the subject is prefixed
    // "Copy of " so it's obvious in the list.
    //
    // publicationId (optional): re-home the clone into a chosen publication —
    // handy for spinning a past issue into a different stream. When omitted
    // (undefined) the clone inherits the source's publication; pass null to
    // explicitly place it on the primary/default stream. An unknown id is
    // rejected so we never orphan the copy against a non-existent publication.
    duplicate: editorProcedure
        .input(
            z.object({
                id: z.string().min(1),
                publicationId: z.string().nullish(),
            }),
        )
        .mutation(async ({ input, ctx }) => {
            const [source] = await ctx.db
                .select()
                .from(newsletters)
                .where(eq(newsletters.id, input.id));
            if (!source) {
                throw new TRPCError({ code: "NOT_FOUND", message: "Newsletter not found" });
            }

            // Resolve the target publication. undefined => inherit source;
            // null/"" => primary/default stream (NULL column); a non-empty id
            // must exist.
            let targetPublicationId: string | null;
            if (input.publicationId === undefined) {
                targetPublicationId = source.publicationId ?? null;
            } else if (input.publicationId) {
                const [pub] = await ctx.db
                    .select({ id: publications.id })
                    .from(publications)
                    .where(eq(publications.id, input.publicationId));
                if (!pub) {
                    throw new TRPCError({ code: "NOT_FOUND", message: "Publication not found" });
                }
                targetPublicationId = pub.id;
            } else {
                targetPublicationId = null;
            }

            const id = crypto.randomUUID();
            const newSubject = `Copy of ${source.subject}`.slice(0, 500);
            const baseSlug = toSlug(source.subject);
            const slug = baseSlug
                ? `${baseSlug}-${id.slice(0, 8)}`
                : id.slice(0, 8);

            await ctx.db.insert(newsletters).values({
                id,
                slug,
                subject: newSubject,
                subjectB: source.subjectB ?? null,
                html: source.html,
                preheader: source.preheader ?? null,
                publicationId: targetPublicationId,
                status: "draft",
                createdBy: ctx.adminUserId,
            });
            await recordAudit(ctx, {
                action: "newsletter.duplicate",
                targetType: "newsletter",
                targetId: id,
                metadata: {
                    sourceId: source.id,
                    subject: newSubject,
                    slug,
                    publicationId: targetPublicationId,
                },
            });
            return { ok: true, id, slug };
        }),

    // Mint a signed, expiring PREVIEW link that renders an UNSENT draft exactly
    // as it will look, so a reviewer can proof it on any device before send.
    // Read-only action (creates no data), so any admin-role member may proof —
    // matches the Preview/Analytics buttons (adminProcedure). Sent issues are
    // already public at /issues/<slug>, so we only mint for non-sent issues.
    previewLink: adminProcedure
        .input(z.object({ id: z.string().min(1) }))
        .mutation(async ({ input, ctx }) => {
            const [newsletter] = await ctx.db
                .select({ id: newsletters.id, status: newsletters.status })
                .from(newsletters)
                .where(eq(newsletters.id, input.id));

            if (!newsletter) {
                throw new TRPCError({ code: "NOT_FOUND", message: "Newsletter not found" });
            }
            if (newsletter.status === "sent") {
                throw new TRPCError({
                    code: "BAD_REQUEST",
                    message: "This issue is already published — share its public /issues link instead.",
                });
            }

            const token = await signPreviewToken({ newsletterId: newsletter.id });
            const base = process.env.NEXT_PUBLIC_APP_URL ?? "https://phluentlabs.com";
            return { url: `${base}/preview/${token}` };
        }),

    send: editorProcedure
        .input(
            z.object({
                id: z.string().min(1),
                // Optional segment: when provided, only confirmed subscribers
                // carrying this tag are targeted. Omit/null = all confirmed.
                tag: z.string().trim().min(1).nullish(),
                // Optional engagement cohort (Tier 7 #2 win-back): target only
                // the at-risk or dormant segment. Combines with tag if both set.
                cohort: z.enum(["atRisk", "dormant"]).nullish(),
            })
        )
        .mutation(async ({ input, ctx }) => {
            try {
                const { sent } = await sendNewsletterToSubscribers(input.id, {
                    tag: input.tag,
                    cohort: input.cohort,
                });
                await recordAudit(ctx, {
                    action: "newsletter.send",
                    targetType: "newsletter",
                    targetId: input.id,
                    metadata: { sent, tag: input.tag ?? null, cohort: input.cohort ?? null },
                });
                return { ok: true, sent };
            } catch (e) {
                const msg = e instanceof Error ? e.message : "Send failed";
                throw new TRPCError({ code: "BAD_REQUEST", message: msg });
            }
        }),

    // Per-issue send analytics: delivery + engagement counts for one newsletter
    // (populated by the Resend webhook handler). Read-only, admin-protected.
    // Rates are computed against the number of recipients we actually sent.
    analytics: adminProcedure
        .input(z.object({ id: z.string().min(1) }))
        .query(async ({ input, ctx }) => {
            const [newsletter] = await ctx.db
                .select({
                    id: newsletters.id,
                    slug: newsletters.slug,
                    subject: newsletters.subject,
                    subjectB: newsletters.subjectB,
                    status: newsletters.status,
                    sentAt: newsletters.sentAt,
                    createdAt: newsletters.createdAt,
                })
                .from(newsletters)
                .where(eq(newsletters.id, input.id));
            if (!newsletter) throw new TRPCError({ code: "NOT_FOUND", message: "Newsletter not found" });

            const nid = input.id;
            const [
                [{ total }],
                [{ delivered }],
                [{ opened }],
                [{ clicked }],
                [{ bounced }],
                [{ complained }],
            ] = await Promise.all([
                ctx.db.select({ total: count() }).from(newsletterRecipients).where(eq(newsletterRecipients.newsletterId, nid)),
                ctx.db.select({ delivered: count() }).from(newsletterRecipients).where(and(eq(newsletterRecipients.newsletterId, nid), isNotNull(newsletterRecipients.deliveredAt))),
                ctx.db.select({ opened: count() }).from(newsletterRecipients).where(and(eq(newsletterRecipients.newsletterId, nid), isNotNull(newsletterRecipients.openedAt))),
                ctx.db.select({ clicked: count() }).from(newsletterRecipients).where(and(eq(newsletterRecipients.newsletterId, nid), isNotNull(newsletterRecipients.clickedAt))),
                ctx.db.select({ bounced: count() }).from(newsletterRecipients).where(and(eq(newsletterRecipients.newsletterId, nid), isNotNull(newsletterRecipients.bouncedAt))),
                ctx.db.select({ complained: count() }).from(newsletterRecipients).where(and(eq(newsletterRecipients.newsletterId, nid), isNotNull(newsletterRecipients.complainedAt))),
            ]);

            // Public web page-views for this issue's archive page (distinct from
            // email opens above). Total + a coarse traffic-source breakdown.
            const [[{ webViews }], viewsByBucket] = await Promise.all([
                ctx.db.select({ webViews: count() }).from(pageViews).where(eq(pageViews.newsletterId, nid)),
                ctx.db
                    .select({ bucket: pageViews.referrerBucket, c: count() })
                    .from(pageViews)
                    .where(eq(pageViews.newsletterId, nid))
                    .groupBy(pageViews.referrerBucket)
                    .orderBy(desc(count())),
            ]);
            const referrers = viewsByBucket.map((v) => ({
                bucket: v.bucket ?? "other",
                views: Number(v.c),
            }));

            // Public share-clicks for this issue (X / LinkedIn / copy-link taps
            // on the archive page). Total + a per-channel breakdown.
            const [[{ shareTotal }], sharesByPlatform] = await Promise.all([
                ctx.db.select({ shareTotal: count() }).from(shareClicks).where(eq(shareClicks.newsletterId, nid)),
                ctx.db
                    .select({ platform: shareClicks.platform, c: count() })
                    .from(shareClicks)
                    .where(eq(shareClicks.newsletterId, nid))
                    .groupBy(shareClicks.platform)
                    .orderBy(desc(count())),
            ]);
            const shareChannels = sharesByPlatform.map((s) => ({
                platform: s.platform ?? "other",
                shares: Number(s.c),
            }));

            // Anonymous reader reactions ("was this useful?") on this issue's
            // public archive page. Coarse up / so-so / down tally.
            const reactionRows = await ctx.db
                .select({ reaction: issueReactions.reaction, c: count() })
                .from(issueReactions)
                .where(eq(issueReactions.newsletterId, nid))
                .groupBy(issueReactions.reaction);
            const reactionTally = { up: 0, mid: 0, down: 0 };
            for (const r of reactionRows) {
                const key = (r.reaction ?? "mid") as "up" | "mid" | "down";
                if (key in reactionTally) reactionTally[key] += Number(r.c);
            }
            const reactionTotal =
                reactionTally.up + reactionTally.mid + reactionTally.down;
            const usefulRate = reactionTotal > 0
                ? Math.round((reactionTally.up / reactionTotal) * 1000) / 10
                : 0;

            // Free-form reader feedback left on this issue via the /feedback form.
            const [{ feedbackTotal }] = await ctx.db
                .select({ feedbackTotal: count() })
                .from(feedback)
                .where(eq(feedback.newsletterId, nid));

            const rate = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 1000) / 10 : 0);
            // Open/click rates are conventionally measured against delivered mail
            // (fall back to total recipients if no delivery events yet).
            const denom = delivered > 0 ? delivered : total;

            // A/B subject-line test breakdown: when the issue was sent with two
            // subject variants, report per-variant recipients/delivered/opened/
            // clicked so we can surface which subject won. Winner-reporting is fed
            // by the same open/click tracking the Resend webhook records; before
            // any engagement arrives the counts are simply zero and winner is null.
            let abTest:
                | null
                | {
                      variants: Array<{
                          variant: "A" | "B";
                          subject: string;
                          recipients: number;
                          delivered: number;
                          opened: number;
                          clicked: number;
                          openRate: number;
                          clickRate: number;
                      }>;
                      winner: "A" | "B" | "tie" | null;
                  } = null;

            if (newsletter.subjectB?.trim()) {
                const variantKeys: Array<{ variant: "A" | "B"; subject: string }> = [
                    { variant: "A", subject: newsletter.subject },
                    { variant: "B", subject: newsletter.subjectB.trim() },
                ];
                const variants = await Promise.all(
                    variantKeys.map(async ({ variant, subject }) => {
                        const vWhere = and(
                            eq(newsletterRecipients.newsletterId, nid),
                            eq(newsletterRecipients.subjectVariant, variant),
                        );
                        const [
                            [{ vr }],
                            [{ vd }],
                            [{ vo }],
                            [{ vc }],
                        ] = await Promise.all([
                            ctx.db.select({ vr: count() }).from(newsletterRecipients).where(vWhere),
                            ctx.db.select({ vd: count() }).from(newsletterRecipients).where(and(vWhere, isNotNull(newsletterRecipients.deliveredAt))),
                            ctx.db.select({ vo: count() }).from(newsletterRecipients).where(and(vWhere, isNotNull(newsletterRecipients.openedAt))),
                            ctx.db.select({ vc: count() }).from(newsletterRecipients).where(and(vWhere, isNotNull(newsletterRecipients.clickedAt))),
                        ]);
                        const vDenom = vd > 0 ? vd : vr;
                        return {
                            variant,
                            subject,
                            recipients: vr,
                            delivered: vd,
                            opened: vo,
                            clicked: vc,
                            openRate: rate(vo, vDenom),
                            clickRate: rate(vc, vDenom),
                        };
                    }),
                );

                // Winner = higher open rate (subject lines drive opens). Only
                // declare a winner once at least one variant has recorded opens;
                // otherwise there isn't enough signal yet.
                const [a, b] = variants;
                let winner: "A" | "B" | "tie" | null = null;
                if (a.opened > 0 || b.opened > 0) {
                    winner = a.openRate > b.openRate ? "A" : b.openRate > a.openRate ? "B" : "tie";
                }
                abTest = { variants, winner };
            }

            return {
                newsletter,
                counts: { recipients: total, delivered, opened, clicked, bounced, complained },
                web: { views: Number(webViews), referrers },
                shares: { total: Number(shareTotal), channels: shareChannels },
                reactions: {
                    up: reactionTally.up,
                    mid: reactionTally.mid,
                    down: reactionTally.down,
                    total: reactionTotal,
                    usefulRate,
                },
                feedback: { total: Number(feedbackTotal) },
                rates: {
                    deliveryRate: rate(delivered, total),
                    openRate: rate(opened, denom),
                    clickRate: rate(clicked, denom),
                    bounceRate: rate(bounced, total),
                    complaintRate: rate(complained, total),
                },
                abTest,
            };
        }),

    // Resolve the send audience WITHOUT sending: returns the recipient count
    // and a small preview list for the chosen segment (All / by tag). Powers
    // the audience selector in the Send dialog so the writer can confirm who
    // will receive the issue before firing the (irreversible) real send.
    audiencePreview: adminProcedure
        .input(
            z.object({
                tag: z.string().trim().min(1).nullish(),
                cohort: z.enum(["atRisk", "dormant"]).nullish(),
            })
        )
        .query(async ({ input, ctx }) => {
            const tag = input.tag?.trim() || null;
            const cohort = input.cohort ?? null;
            // Auto-resume elapsed snoozes so the preview count reflects who will
            // actually receive the send (matches the send path exactly).
            await autoResumeElapsedSnoozes();
            // Actively-receiving audience: subscribed AND not currently snoozed.
            const where = tag
                ? and(activeSubscriberWhere(), arrayContains(subscribers.tags, [tag]))
                : activeSubscriberWhere();

            // When a cohort is selected, resolve it to a subscriber-id set and
            // intersect with the (confirmed + optional-tag) base audience — the
            // exact same resolution the send path uses, so the preview count
            // matches what will actually be sent.
            if (cohort) {
                const [members, baseRows] = await Promise.all([
                    resolveCohortSubscribers(cohort),
                    ctx.db
                        .select({
                            id: subscribers.id,
                            email: subscribers.email,
                            firstName: subscribers.firstName,
                            lastName: subscribers.lastName,
                        })
                        .from(subscribers)
                        .where(where)
                        .orderBy(subscribers.email),
                ]);
                const cohortIds = new Set(members.map((m) => m.id));
                const matched = baseRows.filter((r) => cohortIds.has(r.id));
                return {
                    tag,
                    cohort,
                    count: matched.length,
                    sample: matched.slice(0, 5).map(({ email, firstName, lastName }) => ({
                        email,
                        firstName,
                        lastName,
                    })),
                };
            }

            const [[{ total }], sample] = await Promise.all([
                ctx.db.select({ total: count() }).from(subscribers).where(where),
                ctx.db
                    .select({
                        email: subscribers.email,
                        firstName: subscribers.firstName,
                        lastName: subscribers.lastName,
                    })
                    .from(subscribers)
                    .where(where)
                    .orderBy(subscribers.email)
                    .limit(5),
            ]);

            return { tag, cohort, count: total, sample };
        }),

    // Schedule (or reschedule) a newsletter to send at a future time. A cron
    // job hits sendScheduledDue() to fire due sends. Pass null to unschedule.
    schedule: editorProcedure
        .input(
            z.object({
                id: z.string().min(1),
                scheduledAt: z.string().datetime().nullable(),
            })
        )
        .mutation(async ({ input, ctx }) => {
            const [newsletter] = await ctx.db
                .select()
                .from(newsletters)
                .where(eq(newsletters.id, input.id));

            if (!newsletter) throw new TRPCError({ code: "NOT_FOUND", message: "Newsletter not found" });
            if (newsletter.status === "sent") throw new TRPCError({ code: "BAD_REQUEST", message: "Newsletter already sent" });

            if (input.scheduledAt === null) {
                // Unschedule -> back to draft.
                await ctx.db
                    .update(newsletters)
                    .set({ status: "draft", scheduledAt: null, updatedAt: new Date() })
                    .where(eq(newsletters.id, input.id));
                await recordAudit(ctx, {
                    action: "newsletter.unschedule",
                    targetType: "newsletter",
                    targetId: input.id,
                });
                return { ok: true, scheduled: false };
            }

            const when = new Date(input.scheduledAt);
            if (when.getTime() <= Date.now()) {
                throw new TRPCError({ code: "BAD_REQUEST", message: "Scheduled time must be in the future" });
            }

            await ctx.db
                .update(newsletters)
                .set({ status: "scheduled", scheduledAt: when, updatedAt: new Date() })
                .where(eq(newsletters.id, input.id));
            await recordAudit(ctx, {
                action: "newsletter.schedule",
                targetType: "newsletter",
                targetId: input.id,
                metadata: { scheduledAt: when.toISOString() },
            });
            return { ok: true, scheduled: true, scheduledAt: when.toISOString() };
        }),

    // API-key-protected: send all scheduled newsletters whose time has passed.
    // Call this from a cron job (e.g. Vercel Cron) every few minutes.
    sendScheduledDue: publicProcedure
        .input(z.object({ apiKey: z.string().min(1) }))
        .mutation(async ({ input, ctx }) => {
            if (!process.env.NEWSLETTER_API_KEY || input.apiKey !== process.env.NEWSLETTER_API_KEY) {
                throw new TRPCError({ code: "UNAUTHORIZED" });
            }

            const due = await ctx.db
                .select({ id: newsletters.id })
                .from(newsletters)
                .where(and(eq(newsletters.status, "scheduled"), lte(newsletters.scheduledAt, new Date())));

            const results: Array<{ id: string; sent: number; error?: string }> = [];
            for (const n of due) {
                try {
                    const { sent } = await sendNewsletterToSubscribers(n.id);
                    results.push({ id: n.id, sent });
                } catch (e) {
                    results.push({ id: n.id, sent: 0, error: e instanceof Error ? e.message : "failed" });
                }
            }

            return { ok: true, processed: results.length, results };
        }),

    // Send a single test copy to a chosen address (e.g. yourself) so you can
    // proof formatting/dark-mode before the real blast. Does NOT mark as sent,
    // does NOT touch subscribers, and includes a clear [TEST] subject prefix.
    sendTest: editorProcedure
        .input(
            z.object({
                id: z.string().min(1),
                to: z.string().email(),
            })
        )
        .mutation(async ({ input, ctx }) => {
            const [newsletter] = await ctx.db
                .select()
                .from(newsletters)
                .where(eq(newsletters.id, input.id));

            if (!newsletter) throw new TRPCError({ code: "NOT_FOUND", message: "Newsletter not found" });

            const fromEmail = process.env.RESEND_FROM_EMAIL ?? "onboarding@resend.dev";

            const html = buildTestEmailHtml(newsletter.html);

            await resend.emails.send({
                from: fromEmail,
                to: input.to,
                subject: `[TEST] ${newsletter.subject}`,
                html,
            });

            return { ok: true, to: input.to };
        }),

    // Editor: send a test copy of an issue to the WHOLE TEAM (all owner/admin/
    // editor members) in one click, so an issue can be proofed by everyone with
    // authoring access before a real send (Tier 15). Viewers are excluded — they
    // can't author, so they don't need proof copies. Resolves member emails
    // server-side (the client never sees the roster) and sends each a test.
    // Best-effort per recipient: one failed address never blocks the others.
    sendTestToTeam: editorProcedure
        .input(z.object({ id: z.string().min(1) }))
        .mutation(async ({ input, ctx }) => {
            const [newsletter] = await ctx.db
                .select()
                .from(newsletters)
                .where(eq(newsletters.id, input.id));

            if (!newsletter) throw new TRPCError({ code: "NOT_FOUND", message: "Newsletter not found" });

            // Resolve every team member with an authoring role (owner/admin/editor).
            // Pull all rows with a role, then filter by normalized rank so legacy
            // "admin"-ish roles are included and viewers are excluded.
            const rows = await ctx.db
                .select({ email: user.email, role: user.role })
                .from(user)
                .where(isNotNull(user.role));

            const seen = new Set<string>();
            const recipients: string[] = [];
            for (const r of rows) {
                const role = normalizeRole(r.role);
                if (!role || role === "viewer") continue;
                const email = (r.email ?? "").trim().toLowerCase();
                if (!email || seen.has(email)) continue;
                seen.add(email);
                recipients.push(email);
            }

            if (recipients.length === 0) {
                throw new TRPCError({
                    code: "NOT_FOUND",
                    message: "No team members with an authoring role were found to send a test to.",
                });
            }

            const fromEmail = process.env.RESEND_FROM_EMAIL ?? "onboarding@resend.dev";
            const html = buildTestEmailHtml(newsletter.html);
            const subject = `[TEST] ${newsletter.subject}`;

            // Best-effort per recipient — one bad address must not abort the rest.
            let sent = 0;
            const failed: string[] = [];
            for (const to of recipients) {
                try {
                    await resend.emails.send({ from: fromEmail, to, subject, html });
                    sent += 1;
                } catch (err) {
                    console.error("[sendTestToTeam] failed for", to, err);
                    failed.push(to);
                }
            }

            await recordAudit(ctx, {
                action: "newsletter.sendTestToTeam",
                targetType: "newsletter",
                targetId: newsletter.id,
                metadata: { recipientCount: recipients.length, sent, failed: failed.length },
            });

            return { ok: true, sent, failed: failed.length, total: recipients.length };
        }),

    // Admin: list reader feedback captured from the public /feedback form (and
    // the "just reply" prompt in the send footer). Newest-first, paginated,
    // optionally filtered to a single issue. Joins the issue subject when the
    // (nullable) FK still resolves.
    feedbackList: adminProcedure
        .input(
            z.object({
                limit: z.number().int().min(1).max(100).default(50),
                offset: z.number().int().min(0).default(0),
                newsletterId: z.string().trim().min(1).nullish(),
            })
        )
        .query(async ({ input, ctx }) => {
            const where = input.newsletterId
                ? eq(feedback.newsletterId, input.newsletterId)
                : undefined;

            const [items, [{ total }]] = await Promise.all([
                ctx.db
                    .select({
                        id: feedback.id,
                        newsletterId: feedback.newsletterId,
                        issueSlug: feedback.issueSlug,
                        message: feedback.message,
                        email: feedback.email,
                        createdAt: feedback.createdAt,
                        issueSubject: newsletters.subject,
                    })
                    .from(feedback)
                    .leftJoin(newsletters, eq(feedback.newsletterId, newsletters.id))
                    .where(where)
                    .orderBy(desc(feedback.createdAt))
                    .limit(input.limit)
                    .offset(input.offset),
                ctx.db.select({ total: count() }).from(feedback).where(where),
            ]);

            return { items, total };
        }),
});

const PAGE_SIZE = 6;

export const newsletterRouter = router({
    // Public, no-auth reader feedback capture. Powers the /feedback form and the
    // "just reply / share a note" prompt in the send footer. Closes the loop that
    // raw email replies to a broadcast currently drop. Stores NO IP/user-agent;
    // the only optional identifier is a reply-to email the reader chooses to add.
    // If ?issue=<slug> is present and resolves to a PUBLISHED issue we attribute
    // it; otherwise we still accept it as general feedback (issueSlug kept raw).
    submitFeedback: publicProcedure
        .input(
            z.object({
                message: z.string().trim().min(1).max(5000),
                email: z.string().trim().email().max(320).optional().or(z.literal("")),
                slug: z.string().trim().max(200).optional(),
            })
        )
        .mutation(async ({ input, ctx }) => {
            const rawSlug = input.slug?.trim() || null;

            // Best-effort attribution: resolve the slug to a PUBLISHED issue id.
            // Unknown/unpublished slugs still accept the feedback (unattributed),
            // keeping the raw slug for context.
            let newsletterId: string | null = null;
            if (rawSlug) {
                const [issue] = await ctx.db
                    .select({ id: newsletters.id })
                    .from(newsletters)
                    .where(
                        and(
                            or(eq(newsletters.slug, rawSlug), eq(newsletters.id, rawSlug)),
                            eq(newsletters.status, "sent")
                        )
                    );
                newsletterId = issue?.id ?? null;
            }

            const email = input.email?.trim() ? input.email.trim() : null;

            await ctx.db.insert(feedback).values({
                id: crypto.randomUUID(),
                newsletterId,
                issueSlug: rawSlug,
                message: input.message.trim(),
                email,
            });

            return { ok: true };
        }),

      createDraftViaApiKey: publicProcedure
    .input(
      z.object({
        subject: z.string().min(1),
        html: z.string().min(1),
        preheader: z.string().optional(),
        slug: z.string().optional(),
        seoTitle: z.string().optional(),
        metaDescription: z.string().optional(),
        apiKey: z.string().min(1),
      })
    )
    .mutation(async ({ input, ctx }) => {
      // --- auth: shared secret, not admin session ---
      if (
        !process.env.NEWSLETTER_API_KEY ||
        input.apiKey !== process.env.NEWSLETTER_API_KEY
              ) {
        throw new TRPCError({ code: "UNAUTHORIZED" });
      }

      // --- slug: same behavior as your admin `create` ---
      const id = crypto.randomUUID();
      const baseSlug = input.slug?.trim()
        ? toSlug(input.slug.trim())
        : toSlug(input.subject.trim());
      const slug = baseSlug ? `${baseSlug}-${id.slice(0, 8)}` : id.slice(0, 8);

      // --- insert as DRAFT (never auto-publish) ---
      await ctx.db.insert(newsletters).values({
        id,
        slug,
                subject: input.subject.trim(),
        html: input.html,
        preheader: input.preheader ?? null,
        seoTitle: input.seoTitle ?? null,
        metaDescription: input.metaDescription ?? null,
        status: "draft",
        // If `createdBy` is NULLABLE: delete the next line.
        // If it's a required FK: set NEWSLETTER_BOT_USER_ID to a real user row id.
        createdBy: process.env.NEWSLETTER_BOT_USER_ID ?? "newsletter-bot",
      });

      return { ok: true, id, slug, url: `/issues/${slug}` };
    }),
    // API-key-protected: send ONE issue to all confirmed subscribers NOW.
    // Powers the automated Sunday newsletter (Luke authorized full auto-send
    // 2026-09-10 — no manual send). Reuses the shared send path so delivery
    // logic stays in one place. sendNewsletterToSubscribers throws if the issue
    // is already "sent", so a duplicate call cannot double-send.
    sendViaApiKey: publicProcedure
      .input(
        z.object({
          id: z.string().min(1),
          apiKey: z.string().min(1),
          tag: z.string().optional(),
        })
      )
      .mutation(async ({ input }) => {
        if (
          !process.env.NEWSLETTER_API_KEY ||
          input.apiKey !== process.env.NEWSLETTER_API_KEY
        ) {
          throw new TRPCError({ code: "UNAUTHORIZED" });
        }
        const { sent } = await sendNewsletterToSubscribers(input.id, {
          tag: input.tag ?? null,
        });
        return { ok: true, sent };
      }),
    list: publicProcedure
        .input(z.object({ page: z.number().int().min(1).default(1) }))
        .query(async ({ input, ctx }) => {
            const offset = (input.page - 1) * PAGE_SIZE;

            // Public endpoint: only ever return PUBLISHED issues. Filtering here
            // (server-side) means draft content never reaches the browser at all,
            // instead of being sent down and hidden in the UI.
            const [items, [{ total }]] = await Promise.all([
                ctx.db
                    .select({
                        id: newsletters.id,
                        slug: newsletters.slug,
                        subject: newsletters.subject,
                        preheader: newsletters.preheader,
                        createdAt: newsletters.createdAt,
                        sentAt: newsletters.sentAt,
                        status: newsletters.status,
                    })
                    .from(newsletters)
                    .where(eq(newsletters.status, "sent"))
                    .orderBy(desc(newsletters.sentAt), desc(newsletters.createdAt))
                    .limit(PAGE_SIZE)
                    .offset(offset),
                ctx.db
                    .select({ total: count() })
                    .from(newsletters)
                    .where(eq(newsletters.status, "sent")),
            ]);

            return { items, total, pageSize: PAGE_SIZE };
        }),

    // Real server-side archive search. Scans PUBLISHED issues only, matching the
    // query against subject, preheader AND the body HTML (case-insensitive
    // substring). Paginated server-side so it scales past the client cap and
    // gives us a genuine GET-addressable search URL (wired into the WebSite
    // SearchAction JSON-LD). Returns lightweight rows only — never the full HTML.
    search: publicProcedure
        .input(
            z.object({
                q: z.string().trim().max(200).default(""),
                page: z.number().int().min(1).default(1),
                pageSize: z.number().int().min(1).max(50).default(20),
                // Optional publication slug filter. When set, restrict the
                // archive to issues assigned to that publication. The special
                // slug "primary" (or a slug that resolves to the primary
                // publication) matches issues on the primary stream — which
                // includes legacy issues with a NULL publicationId, since a
                // NULL publicationId is conceptually the primary/default stream.
                publication: z.string().trim().max(80).optional(),
            })
        )
        .query(async ({ input, ctx }) => {
            const offset = (input.page - 1) * input.pageSize;
            const q = input.q;

            // Resolve an optional publication-slug filter into a WHERE clause.
            let publicationWhere = undefined as ReturnType<typeof eq> | undefined;
            if (input.publication) {
                const [pub] = await ctx.db
                    .select({ id: publications.id, isPrimary: publications.isPrimary })
                    .from(publications)
                    .where(eq(publications.slug, input.publication));
                if (pub) {
                    // Primary stream also owns legacy NULL-publication issues.
                    publicationWhere = pub.isPrimary
                        ? (or(
                              eq(newsletters.publicationId, pub.id),
                              isNull(newsletters.publicationId),
                          ) as unknown as ReturnType<typeof eq>)
                        : eq(newsletters.publicationId, pub.id);
                } else {
                    // Unknown slug → match nothing (return empty set rather than
                    // silently ignoring the filter).
                    publicationWhere = eq(newsletters.publicationId, "__no_such_publication__");
                }
            }

            // Always constrained to published issues; drafts never leak.
            const publishedOnly = eq(newsletters.status, "sent");
            const matchClause = q
                ? or(
                      ilike(newsletters.subject, `%${q}%`),
                      ilike(newsletters.preheader, `%${q}%`),
                      ilike(newsletters.html, `%${q}%`)
                  )
                : undefined;
            // Combine published + (optional) text match + (optional) publication.
            const where = and(
                publishedOnly,
                ...(matchClause ? [matchClause] : []),
                ...(publicationWhere ? [publicationWhere] : []),
            );

            const [rows, [{ total }]] = await Promise.all([
                ctx.db
                    .select({
                        id: newsletters.id,
                        slug: newsletters.slug,
                        subject: newsletters.subject,
                        preheader: newsletters.preheader,
                        // Pulled only to derive reading time server-side; the full
                        // HTML is NOT returned to the client.
                        html: newsletters.html,
                        sentAt: newsletters.sentAt,
                        createdAt: newsletters.createdAt,
                    })
                    .from(newsletters)
                    .where(where)
                    .orderBy(desc(newsletters.sentAt), desc(newsletters.createdAt))
                    .limit(input.pageSize)
                    .offset(offset),
                ctx.db
                    .select({ total: count() })
                    .from(newsletters)
                    .where(where),
            ]);

            const items = rows.map((r) => {
                const words = r.html
                    .replace(/<[^>]*>/g, " ")
                    .split(/\s+/)
                    .filter(Boolean).length;
                const readingMinutes = Math.max(1, Math.round(words / 220));
                const dateMs = (r.sentAt ?? r.createdAt)?.getTime() ?? Date.now();
                return {
                    id: r.id,
                    slug: r.slug ?? r.id,
                    subject: r.subject,
                    preheader: r.preheader,
                    dateMs,
                    readingMinutes,
                };
            });

            return { items, total: total ?? items.length, page: input.page, pageSize: input.pageSize, q, publication: input.publication ?? null };
        }),

    // Public: list the publications shown as archive filters + public opt-in
    // surfaces. Returns non-archived publications (primary first) with a count
    // of PUBLISHED issues so the archive can offer a per-stream filter. The
    // primary stream's count includes legacy NULL-publication issues.
    publications: publicProcedure.query(async ({ ctx }) => {
        const rows = await ctx.db
            .select({
                id: publications.id,
                slug: publications.slug,
                name: publications.name,
                description: publications.description,
                isPrimary: publications.isPrimary,
            })
            .from(publications)
            .where(isNull(publications.archivedAt))
            .orderBy(desc(publications.isPrimary), publications.name);

        const withCounts = await Promise.all(
            rows.map(async (p) => {
                const issueWhere = p.isPrimary
                    ? and(
                          eq(newsletters.status, "sent"),
                          or(
                              eq(newsletters.publicationId, p.id),
                              isNull(newsletters.publicationId),
                          ),
                      )
                    : and(
                          eq(newsletters.status, "sent"),
                          eq(newsletters.publicationId, p.id),
                      );
                const [{ n }] = await ctx.db
                    .select({ n: count() })
                    .from(newsletters)
                    .where(issueWhere);
                return { ...p, issueCount: n };
            }),
        );

        return { publications: withCounts };
    }),
});
