import {adminProcedure, editorProcedure, router} from "@/trpc/server";
import {string, z} from "zod";
import {and, arrayContains, asc, count, desc, eq, ilike, inArray, or, sql} from "drizzle-orm";
import {subscribers} from "@/db/schemas/subscribers";
import {newsletterRecipients} from "@/db/schemas/newsletter-recipients";
import {newsletters} from "@/db/schemas/newsletters";
import {recordAudit} from "@/lib/audit";

// Normalize a raw tag list: trim, drop empties, dedupe case-insensitively
// (keeping first-seen casing), preserve order.
function normalizeTags(tags: string[]): string[] {
    const out: string[] = [];
    const seen = new Set<string>();
    for (const raw of tags) {
        const t = raw.trim();
        if (!t) continue;
        const key = t.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(t);
    }
    return out;
}

export const adminSubscribersRouter = router({
    list: adminProcedure
        .input(
            z.object({
                q: z.string().optional(),
                status: z.enum(["pending", "subscribed", "unsubscribed"]).optional(),
                tag: z.string().min(1).optional(),
                limit: z.number().int().min(1).max(200).default(50),
                offset: z.number().int().min(0).default(0),
                sortBy: z
                    .enum(["email", "firstName", "lastName", "status", "createdAt"])
                    .default("createdAt"),
                sortDir: z.enum(["asc", "desc"]).default("desc"),
            })
        )
        .query(async ({ input, ctx }) => {
            const q = input.q?.trim();
            const parts = [];

            const sortColumns = {
                email: subscribers.email,
                firstName: subscribers.firstName,
                lastName: subscribers.lastName,
                status: subscribers.status,
                createdAt: subscribers.createdAt,
            } as const;
            const sortColumn = sortColumns[input.sortBy];
            const orderBy = input.sortDir === "asc" ? asc(sortColumn) : desc(sortColumn);

            if (input.status) parts.push(eq(subscribers.status, input.status));
            // Filter to subscribers carrying a given tag (Postgres array contains).
            if (input.tag) parts.push(arrayContains(subscribers.tags, [input.tag]));
            if (q) {
                parts.push(
                    or(
                        ilike(subscribers.email, `%${q}%`),
                        ilike(subscribers.firstName, `%${q}%`),
                        ilike(subscribers.lastName, `%${q}%`),
                    )
                )
            }

            const where = parts.length ? and (...parts) : undefined;
            const [rows, totalRow] = await Promise.all([
                ctx.db
                    .select()
                    .from(subscribers)
                    .where(where)
                    .orderBy(orderBy)
                    .limit(input.limit)
                    .offset(input.offset),
                ctx.db
                    .select({ total: count() })
                    .from(subscribers)
                    .where(where),
            ]);

            return { rows, total: totalRow[0]?.total ?? 0 };
        }),
    // Detail view for a single subscriber: profile + lifecycle timestamps
    // (signup / confirm / unsubscribe) and the list of newsletter issues they
    // were a recipient of, with per-recipient delivery status. Read-only.
    getDetail: adminProcedure
        .input(z.object({ id: z.string().min(1) }))
        .query(async ({ input, ctx }) => {
            const [subscriber] = await ctx.db
                .select()
                .from(subscribers)
                .where(eq(subscribers.id, input.id));

            if (!subscriber) {
                throw new Error("Subscriber not found.");
            }

            // Issues this subscriber was sent (joined to the newsletter for its
            // subject/slug), newest recipient row first.
            const issues = await ctx.db
                .select({
                    recipientId: newsletterRecipients.id,
                    newsletterId: newsletters.id,
                    subject: newsletters.subject,
                    slug: newsletters.slug,
                    newsletterStatus: newsletters.status,
                    deliveryStatus: newsletterRecipients.status,
                    error: newsletterRecipients.error,
                    sentAt: newsletterRecipients.sentAt,
                    createdAt: newsletterRecipients.createdAt,
                })
                .from(newsletterRecipients)
                .innerJoin(
                    newsletters,
                    eq(newsletterRecipients.newsletterId, newsletters.id)
                )
                .where(eq(newsletterRecipients.subscriberId, input.id))
                .orderBy(desc(newsletterRecipients.createdAt));

            // Engagement summary for this subscriber, aggregated across all
            // newsletter_recipients rows: how many issues they were actually
            // SENT (delivery status 'sent'), how many they opened / clicked, and
            // when they last engaged (max of opened/clicked timestamps). Read-only.
            const [eng] = await ctx.db
                .select({
                    sent: sql<number>`COUNT(*) FILTER (WHERE ${newsletterRecipients.status} = 'sent')::int`,
                    opened: sql<number>`COUNT(*) FILTER (WHERE ${newsletterRecipients.openedAt} IS NOT NULL)::int`,
                    clicked: sql<number>`COUNT(*) FILTER (WHERE ${newsletterRecipients.clickedAt} IS NOT NULL)::int`,
                    lastOpenedAt: sql<Date | null>`MAX(${newsletterRecipients.openedAt})`,
                    lastClickedAt: sql<Date | null>`MAX(${newsletterRecipients.clickedAt})`,
                })
                .from(newsletterRecipients)
                .where(eq(newsletterRecipients.subscriberId, input.id));

            const engSent = Number(eng?.sent ?? 0);
            const engOpened = Number(eng?.opened ?? 0);
            const engClicked = Number(eng?.clicked ?? 0);
            const lastOpened = eng?.lastOpenedAt ? new Date(eng.lastOpenedAt) : null;
            const lastClicked = eng?.lastClickedAt ? new Date(eng.lastClickedAt) : null;
            const lastEngagedAt =
                lastOpened && lastClicked
                    ? new Date(Math.max(lastOpened.getTime(), lastClicked.getTime()))
                    : lastOpened ?? lastClicked ?? null;
            const engagement = {
                sent: engSent,
                opened: engOpened,
                clicked: engClicked,
                openRate: engSent > 0 ? engOpened / engSent : 0,
                clickRate: engSent > 0 ? engClicked / engSent : 0,
                lastEngagedAt,
            };

            // Referral program: how many subscribers this person has referred,
            // and (if they were referred) the email of who referred them.
            const [{ referralCount }] = await ctx.db
                .select({ referralCount: count() })
                .from(subscribers)
                .where(eq(subscribers.referredBy, input.id));

            let referredByEmail: string | null = null;
            if (subscriber.referredBy) {
                const [ref] = await ctx.db
                    .select({ email: subscribers.email })
                    .from(subscribers)
                    .where(eq(subscribers.id, subscriber.referredBy));
                referredByEmail = ref?.email ?? null;
            }

            return {
                subscriber,
                issues,
                issuesCount: issues.length,
                engagement,
                referralCount: Number(referralCount ?? 0),
                referredByEmail,
            };
        }),
    // List/leaderboard of subscriber engagement, aggregated from
    // newsletter_recipients. Read-only. Supports three cohorts:
    //   - "engaged": most-engaged first (by opens, then clicks)
    //   - "dormant": confirmed subscribers who were sent >= minSent issues but
    //     have NEVER opened one (prime unsubscribe/win-back candidates)
    //   - "at-risk": confirmed subscribers who used to open but haven't opened
    //     anything in the last `inactiveDays` days (declining engagement)
    // Also returns headline cohort counts for the page summary.
    engagementList: adminProcedure
        .input(
            z.object({
                cohort: z.enum(["engaged", "dormant", "atRisk"]).default("engaged"),
                minSent: z.number().int().min(1).max(100).default(2),
                inactiveDays: z.number().int().min(7).max(365).default(60),
                limit: z.number().int().min(1).max(200).default(50),
                offset: z.number().int().min(0).default(0),
            })
        )
        .query(async ({ input, ctx }) => {
            // Per-subscriber engagement rollup for CONFIRMED subscribers only
            // (pending/unsubscribed aren't part of the active audience). We join
            // recipients onto subscribers so subscribers with zero sends still
            // appear (LEFT JOIN), then aggregate.
            const base = ctx.db
                .select({
                    id: subscribers.id,
                    email: subscribers.email,
                    firstName: subscribers.firstName,
                    lastName: subscribers.lastName,
                    createdAt: subscribers.createdAt,
                    sent: sql<number>`COUNT(*) FILTER (WHERE ${newsletterRecipients.status} = 'sent')::int`,
                    opened: sql<number>`COUNT(*) FILTER (WHERE ${newsletterRecipients.openedAt} IS NOT NULL)::int`,
                    clicked: sql<number>`COUNT(*) FILTER (WHERE ${newsletterRecipients.clickedAt} IS NOT NULL)::int`,
                    lastEngagedAt: sql<Date | null>`GREATEST(MAX(${newsletterRecipients.openedAt}), MAX(${newsletterRecipients.clickedAt}))`,
                })
                .from(subscribers)
                .leftJoin(
                    newsletterRecipients,
                    eq(newsletterRecipients.subscriberId, subscribers.id)
                )
                .where(eq(subscribers.status, "subscribed"))
                .groupBy(
                    subscribers.id,
                    subscribers.email,
                    subscribers.firstName,
                    subscribers.lastName,
                    subscribers.createdAt
                )
                .as("eng");

            const sentCol = sql<number>`${base.sent}`;
            const openedCol = sql<number>`${base.opened}`;
            const clickedCol = sql<number>`${base.clicked}`;
            const lastCol = sql<Date | null>`${base.lastEngagedAt}`;

            const cutoff = new Date(Date.now() - input.inactiveDays * 24 * 60 * 60 * 1000);

            let where;
            let orderBy;
            if (input.cohort === "dormant") {
                // Sent >= minSent, never opened anything.
                where = and(sql`${sentCol} >= ${input.minSent}`, sql`${openedCol} = 0`);
                orderBy = [desc(sentCol)];
            } else if (input.cohort === "atRisk") {
                // Opened at least once, but last engagement is older than cutoff.
                where = and(
                    sql`${sentCol} >= ${input.minSent}`,
                    sql`${openedCol} > 0`,
                    sql`${lastCol} IS NOT NULL`,
                    sql`${lastCol} < ${cutoff}`
                );
                orderBy = [asc(lastCol)];
            } else {
                // Engaged leaderboard: most opens first, then clicks.
                where = sql`${openedCol} > 0`;
                orderBy = [desc(openedCol), desc(clickedCol)];
            }

            const rows = await ctx.db
                .select({
                    id: base.id,
                    email: base.email,
                    firstName: base.firstName,
                    lastName: base.lastName,
                    sent: base.sent,
                    opened: base.opened,
                    clicked: base.clicked,
                    lastEngagedAt: base.lastEngagedAt,
                })
                .from(base)
                .where(where)
                .orderBy(...orderBy)
                .limit(input.limit)
                .offset(input.offset);

            const [{ total }] = await ctx.db
                .select({ total: count() })
                .from(base)
                .where(where);

            return {
                rows: rows.map((r) => ({
                    ...r,
                    openRate: r.sent > 0 ? r.opened / r.sent : 0,
                    clickRate: r.sent > 0 ? r.clicked / r.sent : 0,
                })),
                total: Number(total ?? 0),
            };
        }),

    // Headline cohort counts for the engagement page summary cards. Cheap
    // single-pass aggregation over confirmed subscribers. Read-only.
    engagementSummary: adminProcedure
        .input(
            z.object({
                minSent: z.number().int().min(1).max(100).default(2),
                inactiveDays: z.number().int().min(7).max(365).default(60),
            })
        )
        .query(async ({ input, ctx }) => {
            const cutoff = new Date(Date.now() - input.inactiveDays * 24 * 60 * 60 * 1000);
            const res = await ctx.db.execute<{
                confirmed: number;
                engaged: number;
                dormant: number;
                at_risk: number;
            }>(sql`
                WITH eng AS (
                    SELECT s.id,
                        COUNT(*) FILTER (WHERE r.status = 'sent') AS sent,
                        COUNT(*) FILTER (WHERE r.opened_at IS NOT NULL) AS opened,
                        GREATEST(MAX(r.opened_at), MAX(r.clicked_at)) AS last_engaged
                    FROM ${subscribers} s
                    LEFT JOIN ${newsletterRecipients} r ON r.subscriber_id = s.id
                    WHERE s.status = 'subscribed'
                    GROUP BY s.id
                )
                SELECT
                    COUNT(*)::int AS confirmed,
                    COUNT(*) FILTER (WHERE opened > 0)::int AS engaged,
                    COUNT(*) FILTER (WHERE sent >= ${input.minSent} AND opened = 0)::int AS dormant,
                    COUNT(*) FILTER (WHERE sent >= ${input.minSent} AND opened > 0 AND last_engaged IS NOT NULL AND last_engaged < ${cutoff})::int AS at_risk
                FROM eng
            `);
            const row = (Array.isArray(res) ? res[0] : (res as any).rows?.[0]) ?? {
                confirmed: 0,
                engaged: 0,
                dormant: 0,
                at_risk: 0,
            };
            return {
                confirmed: Number(row.confirmed ?? 0),
                engaged: Number(row.engaged ?? 0),
                dormant: Number(row.dormant ?? 0),
                atRisk: Number(row.at_risk ?? 0),
            };
        }),
    exportCsv: adminProcedure
        .input(
            z.object({
                q: z.string().optional(),
                status: z.enum(["pending", "subscribed", "unsubscribed"]).optional(),
                ids: z.array(z.string().min(1)).min(1).max(5000).optional(),
            })
        )
        .query(async ({ input, ctx }) => {
            const q = input.q?.trim();
            const parts = [];

            // When explicit ids are provided (e.g. "export selected"), scope to
            // just those rows and ignore the search/status filters.
            if (input.ids && input.ids.length) {
                parts.push(inArray(subscribers.id, input.ids));
            } else {
                if (input.status) parts.push(eq(subscribers.status, input.status));
                if (q) {
                    parts.push(
                        or(
                            ilike(subscribers.email, `%${q}%`),
                            ilike(subscribers.firstName, `%${q}%`),
                            ilike(subscribers.lastName, `%${q}%`),
                        )
                    )
                }
            }

            const where = parts.length ? and(...parts) : undefined;
            const rows = await ctx.db
                .select()
                .from(subscribers)
                .where(where)
                .orderBy(desc(subscribers.createdAt));

            const escape = (val: unknown) => {
                const s = val == null ? "" : String(val);
                return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
            };

            const header = ["email", "first_name", "last_name", "status", "created_at"];
            const lines = [header.join(",")];
            for (const r of rows) {
                lines.push([
                    escape(r.email),
                    escape(r.firstName),
                    escape(r.lastName),
                    escape(r.status),
                    escape(r.createdAt instanceof Date ? r.createdAt.toISOString() : r.createdAt),
                ].join(","));
            }

            return { csv: lines.join("\n"), count: rows.length };
        }),
    // Dry-run preview: classify incoming rows against the DB WITHOUT writing.
    // Returns add / conflict (already exists) / in-file-duplicate / invalid
    // counts plus a small sample of conflicting emails, so the import UI can
    // show a confirmation step before committing.
    previewImport: adminProcedure
        .input(
            z.object({
                emails: z.array(z.string()).min(1).max(5000),
            })
        )
        .query(async ({ input, ctx }) => {
            const emailRe = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
            const seen = new Set<string>();
            const valid: string[] = [];
            let invalid = 0;
            let duplicateInFile = 0;

            for (const raw of input.emails) {
                const email = raw.trim().toLowerCase();
                if (!email || !emailRe.test(email)) {
                    invalid++;
                    continue;
                }
                if (seen.has(email)) {
                    duplicateInFile++;
                    continue;
                }
                seen.add(email);
                valid.push(email);
            }

            let conflict = 0;
            const conflictSample: string[] = [];
            if (valid.length) {
                const existingRows = await ctx.db
                    .select({ email: subscribers.email })
                    .from(subscribers)
                    .where(inArray(subscribers.email, valid));
                const existing = new Set(existingRows.map((r) => r.email));
                for (const e of valid) {
                    if (existing.has(e)) {
                        conflict++;
                        if (conflictSample.length < 10) conflictSample.push(e);
                    }
                }
            }

            return {
                total: input.emails.length,
                add: valid.length - conflict,
                conflict,
                duplicateInFile,
                invalid,
                conflictSample,
            };
        }),
    bulkImport: editorProcedure
        .input(
            z.object({
                rows: z
                    .array(
                        z.object({
                            email: z.string(),
                            firstName: z.string().nullable().optional(),
                            lastName: z.string().nullable().optional(),
                            status: z.enum(["pending", "subscribed", "unsubscribed"]).optional(),
                            tags: z.array(z.string()).optional(),
                        })
                    )
                    .min(1)
                    .max(5000),
            })
        )
        .mutation(async ({ input, ctx }) => {
            const emailRe = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
            let inserted = 0;
            let skippedDuplicate = 0;
            let skippedInvalid = 0;
            const errors: string[] = [];

            // Dedupe within the incoming batch (last one wins), tracking invalids.
            const seen = new Map<string, {
                email: string;
                firstName: string | null;
                lastName: string | null;
                status: "pending" | "subscribed" | "unsubscribed";
                tags: string[];
            }>();

            for (const raw of input.rows) {
                const email = raw.email.trim().toLowerCase();
                if (!email || !emailRe.test(email)) {
                    skippedInvalid++;
                    if (errors.length < 20) errors.push(`Invalid email: "${raw.email}"`);
                    continue;
                }
                seen.set(email, {
                    email,
                    firstName: raw.firstName?.trim() || null,
                    lastName: raw.lastName?.trim() || null,
                    status: raw.status ?? "subscribed",
                    tags: raw.tags ? normalizeTags(raw.tags) : [],
                });
            }

            const candidates = [...seen.values()];
            if (candidates.length === 0) {
                return { ok: true, inserted, skippedDuplicate, skippedInvalid, errors };
            }

            // Fetch existing emails so we can skip duplicates.
            const existingRows = await ctx.db
                .select({ email: subscribers.email })
                .from(subscribers)
                .where(inArray(subscribers.email, candidates.map((c) => c.email)));
            const existing = new Set(existingRows.map((r) => r.email));

            const now = new Date();
            const toInsert = [];
            for (const c of candidates) {
                if (existing.has(c.email)) {
                    skippedDuplicate++;
                    continue;
                }
                toInsert.push({
                    id: crypto.randomUUID(),
                    email: c.email,
                    firstName: c.firstName,
                    lastName: c.lastName,
                    status: c.status,
                    tags: c.tags,
                    confirmedAt: c.status === "subscribed" ? now : null,
                    unsubscribedAt: c.status === "unsubscribed" ? now : null,
                });
            }

            if (toInsert.length) {
                await ctx.db.insert(subscribers).values(toInsert);
                inserted = toInsert.length;
                await recordAudit(ctx, {
                    action: "subscriber.bulkImport",
                    targetType: "subscriber",
                    metadata: { inserted, skippedDuplicate, skippedInvalid },
                });
            }

            return { ok: true, inserted, skippedDuplicate, skippedInvalid, errors };
        }),
    create: editorProcedure
        .input(
            z.object({
                email: z.string().email(),
                firstName: z.string().nullable().optional(),
                lastName: z.string().nullable().optional(),
                status: z.enum(["pending", "subscribed", "unsubscribed"]).default("subscribed"),
            })
        )
        .mutation(async ({ input, ctx }) => {
            const email = input.email.trim().toLowerCase();

            const [existing] = await ctx.db
                .select()
                .from(subscribers)
                .where(eq(subscribers.email, email));

            if (existing) {
                throw new Error("A subscriber with that email already exists.");
            }

            const id = crypto.randomUUID();
            const now = new Date();

            await ctx.db.insert(subscribers).values({
                id,
                email,
                firstName: input.firstName?.trim() || null,
                lastName: input.lastName?.trim() || null,
                status: input.status,
                confirmedAt: input.status === "subscribed" ? now : null,
                unsubscribedAt: input.status === "unsubscribed" ? now : null,
            });

            await recordAudit(ctx, {
                action: "subscriber.create",
                targetType: "subscriber",
                targetId: id,
                metadata: { email, status: input.status },
            });

            return { ok: true, id };
        }),
    update: editorProcedure
        .input(
            z.object({
                id: z.string().min(1),
                email: z.string().email(),
                firstName: z.string().nullable().optional(),
                lastName: z.string().nullable().optional(),
                status: z.enum(["pending", "subscribed", "unsubscribed"]),
                tags: z.array(z.string()).optional(),
            })
        )
        .mutation(async ({ input, ctx }) => {
            await ctx.db
                .update(subscribers)
                .set({
                    email: input.email.trim().toLowerCase(),
                    firstName: input.firstName ?? null,
                    lastName: input.lastName ?? null,
                    status: input.status,
                    // Only touch tags when the caller explicitly sends them, so
                    // the plain edit form can't accidentally wipe existing tags.
                    ...(input.tags !== undefined ? { tags: normalizeTags(input.tags) } : {}),
                    updatedAt: new Date(),
                })
                .where(eq(subscribers.id, input.id))

            await recordAudit(ctx, {
                action: "subscriber.update",
                targetType: "subscriber",
                targetId: input.id,
                metadata: {
                    email: input.email.trim().toLowerCase(),
                    status: input.status,
                    ...(input.tags !== undefined ? { tags: normalizeTags(input.tags) } : {}),
                },
            });

            return { ok: true };
        }),

    // Replace the full tag list on a single subscriber (used by the tag chips
    // input in the edit dialog). Normalizes: trims, drops empties, dedupes.
    setTags: editorProcedure
        .input(
            z.object({
                id: z.string().min(1),
                tags: z.array(z.string()),
            })
        )
        .mutation(async ({ input, ctx }) => {
            const tags = normalizeTags(input.tags);
            await ctx.db
                .update(subscribers)
                .set({ tags, updatedAt: new Date() })
                .where(eq(subscribers.id, input.id));
            await recordAudit(ctx, {
                action: "subscriber.setTags",
                targetType: "subscriber",
                targetId: input.id,
                metadata: { tags },
            });
            return { ok: true };
        }),

    // Distinct tags currently in use across all subscribers, with a usage count,
    // for the table's tag filter dropdown. Uses unnest() to flatten the arrays.
    listTags: adminProcedure.query(async ({ ctx }) => {
        const rows = await ctx.db.execute<{ tag: string; count: number }>(sql`
            SELECT tag, COUNT(*)::int AS count
            FROM ${subscribers}, unnest(${subscribers.tags}) AS tag
            GROUP BY tag
            ORDER BY tag ASC
        `);
        // drizzle execute returns rows on the result object across drivers.
        const list = (Array.isArray(rows) ? rows : (rows as any).rows ?? []) as {
            tag: string;
            count: number;
        }[];
        return { tags: list };
    }),

    delete: editorProcedure
        .input(z.object({ id: string().min(1) }))
        .mutation(async ({ input, ctx }) => {
            await ctx.db.delete(subscribers).where(eq(subscribers.id, input.id))
            await recordAudit(ctx, {
                action: "subscriber.delete",
                targetType: "subscriber",
                targetId: input.id,
            });
            return { ok: true }
        }),

    bulkUpdateStatus: editorProcedure
        .input(
            z.object({
                ids: z.array(z.string().min(1)).min(1).max(5000),
                status: z.enum(["pending", "subscribed", "unsubscribed"]),
            })
        )
        .mutation(async ({ input, ctx }) => {
            const now = new Date();
            await ctx.db
                .update(subscribers)
                .set({
                    status: input.status,
                    confirmedAt: input.status === "subscribed" ? now : null,
                    unsubscribedAt: input.status === "unsubscribed" ? now : null,
                    updatedAt: now,
                })
                .where(inArray(subscribers.id, input.ids));

            await recordAudit(ctx, {
                action: "subscriber.bulkUpdateStatus",
                targetType: "subscriber",
                metadata: { status: input.status, count: input.ids.length, ids: input.ids },
            });

            return { ok: true, updated: input.ids.length };
        }),

    bulkDelete: editorProcedure
        .input(z.object({ ids: z.array(z.string().min(1)).min(1).max(5000) }))
        .mutation(async ({ input, ctx }) => {
            await ctx.db.delete(subscribers).where(inArray(subscribers.id, input.ids));
            await recordAudit(ctx, {
                action: "subscriber.bulkDelete",
                targetType: "subscriber",
                metadata: { count: input.ids.length, ids: input.ids },
            });
            return { ok: true, deleted: input.ids.length };
        }),
})