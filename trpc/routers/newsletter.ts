import { adminProcedure, publicProcedure, router } from "@/trpc/server";
import { z } from "zod";
import { newsletters } from "@/db/schemas/newsletters";
import { count, desc, eq } from "drizzle-orm";

const newsletterStatus = z.enum(["draft", "scheduled", "sent"]);

export const adminNewsletterRouter = router({
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

    create: adminProcedure
        .input(
            z.object({
                subject: z.string().min(1),
                html: z.string().min(1),
                preheader: z.string().optional(),
            })
        )
        .mutation(async ({ input, ctx }) => {
            const id = crypto.randomUUID();
            await ctx.db.insert(newsletters).values({
                id,
                subject: input.subject.trim(),
                html: input.html,
                preheader: input.preheader ?? null,
                status: "draft",
                createdBy: ctx.adminUserId,
            });
            return { ok: true, id };
        }),

    update: adminProcedure
        .input(
            z.object({
                id: z.string().min(1),
                subject: z.string().min(1),
                html: z.string().min(1),
                preheader: z.string().optional(),
                status: newsletterStatus,
            })
        )
        .mutation(async ({ input, ctx }) => {
            await ctx.db
                .update(newsletters)
                .set({
                    subject: input.subject.trim(),
                    html: input.html,
                    preheader: input.preheader ?? null,
                    status: input.status,
                    updatedAt: new Date(),
                })
                .where(eq(newsletters.id, input.id));
            return { ok: true };
        }),

    delete: adminProcedure
        .input(z.object({ id: z.string().min(1) }))
        .mutation(async ({ input, ctx }) => {
            await ctx.db.delete(newsletters).where(eq(newsletters.id, input.id));
            return { ok: true };
        }),
});

const PAGE_SIZE = 6;

export const newsletterRouter = router({
    list: publicProcedure
        .input(z.object({ page: z.number().int().min(1).default(1) }))
        .query(async ({ input, ctx }) => {
            const offset = (input.page - 1) * PAGE_SIZE;

            const [items, [{ total }]] = await Promise.all([
                ctx.db
                    .select({
                        id: newsletters.id,
                        subject: newsletters.subject,
                        preheader: newsletters.preheader,
                        createdAt: newsletters.createdAt,
                    })
                    .from(newsletters)
                    .orderBy(desc(newsletters.createdAt))
                    .limit(PAGE_SIZE)
                    .offset(offset),
                ctx.db.select({ total: count() }).from(newsletters),
            ]);

            return { items, total, pageSize: PAGE_SIZE };
        }),
});
