import {adminProcedure, router} from "@/trpc/server";
import {string, z} from "zod";
import {and, desc, eq, ilike, or} from "drizzle-orm";
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
            const rows = await ctx.db
                .select()
                .from(subscribers)
                .where(where)
                .orderBy(desc(subscribers.createdAt))
                .limit(input.limit)
                .offset(input.offset);

            return rows;
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