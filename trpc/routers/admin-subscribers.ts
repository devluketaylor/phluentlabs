import {adminProcedure, router} from "@/trpc/server";
import {string, z} from "zod";
import {and, count, desc, eq, ilike, inArray, or} from "drizzle-orm";
import {subscribers} from "@/db/schemas/subscribers";

export const adminSubscribersRouter = router({
    list: adminProcedure
        .input(
            z.object({
                q: z.string().optional(),
                status: z.enum(["pending", "subscribed", "unsubscribed"]).optional(),
                limit: z.number().int().min(1).max(200).default(50),
                offset: z.number().int().min(0).default(0)
            })
        )
        .query(async ({ input, ctx }) => {
            const q = input.q?.trim();
            const parts = [];

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

            const where = parts.length ? and (...parts) : undefined;
            const [rows, totalRow] = await Promise.all([
                ctx.db
                    .select()
                    .from(subscribers)
                    .where(where)
                    .orderBy(desc(subscribers.createdAt))
                    .limit(input.limit)
                    .offset(input.offset),
                ctx.db
                    .select({ total: count() })
                    .from(subscribers)
                    .where(where),
            ]);

            return { rows, total: totalRow[0]?.total ?? 0 };
        }),
    exportCsv: adminProcedure
        .input(
            z.object({
                q: z.string().optional(),
                status: z.enum(["pending", "subscribed", "unsubscribed"]).optional(),
            })
        )
        .query(async ({ input, ctx }) => {
            const q = input.q?.trim();
            const parts = [];

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
    bulkImport: adminProcedure
        .input(
            z.object({
                rows: z
                    .array(
                        z.object({
                            email: z.string(),
                            firstName: z.string().nullable().optional(),
                            lastName: z.string().nullable().optional(),
                            status: z.enum(["pending", "subscribed", "unsubscribed"]).optional(),
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
                    confirmedAt: c.status === "subscribed" ? now : null,
                    unsubscribedAt: c.status === "unsubscribed" ? now : null,
                });
            }

            if (toInsert.length) {
                await ctx.db.insert(subscribers).values(toInsert);
                inserted = toInsert.length;
            }

            return { ok: true, inserted, skippedDuplicate, skippedInvalid, errors };
        }),
    create: adminProcedure
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

            return { ok: true, id };
        }),
    update: adminProcedure
        .input(
            z.object({
                id: z.string().min(1),
                email: z.string().email(),
                firstName: z.string().nullable().optional(),
                lastName: z.string().nullable().optional(),
                status: z.enum(["pending", "subscribed", "unsubscribed"])
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
                    updatedAt: new Date(),
                })
                .where(eq(subscribers.id, input.id))

            return { ok: true };
        }),

    delete: adminProcedure
        .input(z.object({ id: string().min(1) }))
        .mutation(async ({ input, ctx }) => {
            await ctx.db.delete(subscribers).where(eq(subscribers.id, input.id))
            return { ok: true }
        })
})