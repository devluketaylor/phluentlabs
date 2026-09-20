import { ownerProcedure, router } from "@/trpc/server";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { ideas } from "@/db/schemas/ideas";
import { recordAudit } from "@/lib/audit";
import { isIdeaLabOwner } from "@/lib/idea-lab";

// Idea Lab is owner-role AND email-gated to Luke. `ownerProcedure` already
// requires the owner role; this middleware additionally requires the exact
// allow-listed email, so no other admin/owner can reach it.
const ideaLabProcedure = ownerProcedure.use(async ({ ctx, next }) => {
    if (!isIdeaLabOwner((ctx as any).adminEmail)) {
        throw new TRPCError({
            code: "FORBIDDEN",
            message: "The Idea Lab is private.",
        });
    }
    return next({ ctx });
});

export const ideaLabRouter = router({
    // Newest-first list, optionally filtered by verdict tab (new/good/bad).
    list: ideaLabProcedure
        .input(
            z
                .object({
                    verdict: z.enum(["new", "good", "bad"]).optional(),
                    limit: z.number().int().min(1).max(100).default(50),
                    offset: z.number().int().min(0).default(0),
                })
                .default({ limit: 50, offset: 0 }),
        )
        .query(async ({ input, ctx }) => {
            const where =
                input.verdict === "new"
                    ? isNull(ideas.verdict)
                    : input.verdict
                      ? eq(ideas.verdict, input.verdict)
                      : undefined;

            const [rows, counts] = await Promise.all([
                ctx.db
                    .select()
                    .from(ideas)
                    .where(where)
                    .orderBy(desc(ideas.createdAt))
                    .limit(input.limit)
                    .offset(input.offset),
                ctx.db
                    .select({
                        total: sql<number>`count(*)::int`,
                        newCount: sql<number>`count(*) filter (where ${ideas.verdict} is null)::int`,
                        good: sql<number>`count(*) filter (where ${ideas.verdict} = 'good')::int`,
                        bad: sql<number>`count(*) filter (where ${ideas.verdict} = 'bad')::int`,
                    })
                    .from(ideas),
            ]);

            return { rows, counts: counts[0] };
        }),

    // Rate an idea Good / Bad (or clear back to unrated). This is the signal the
    // taste profile learns from.
    rate: ideaLabProcedure
        .input(
            z.object({
                id: z.string().min(1),
                verdict: z.enum(["good", "bad"]).nullable(),
            }),
        )
        .mutation(async ({ input, ctx }) => {
            const [updated] = await ctx.db
                .update(ideas)
                .set({
                    verdict: input.verdict,
                    verdictAt: input.verdict ? new Date() : null,
                })
                .where(eq(ideas.id, input.id))
                .returning();

            if (!updated) {
                throw new TRPCError({ code: "NOT_FOUND", message: "Idea not found." });
            }

            await recordAudit(ctx, {
                action: "idea.rate",
                targetType: "idea",
                targetId: input.id,
                metadata: { verdict: input.verdict, title: updated.title },
            });

            return updated;
        }),

    // Delete an idea from the lab (owner cleanup).
    remove: ideaLabProcedure
        .input(z.object({ id: z.string().min(1) }))
        .mutation(async ({ input, ctx }) => {
            const [removed] = await ctx.db
                .delete(ideas)
                .where(eq(ideas.id, input.id))
                .returning();
            if (!removed) {
                throw new TRPCError({ code: "NOT_FOUND", message: "Idea not found." });
            }
            await recordAudit(ctx, {
                action: "idea.delete",
                targetType: "idea",
                targetId: input.id,
                metadata: { title: removed.title },
            });
            return { ok: true };
        }),

    // The learned "taste profile" — Luke's rated ideas, compact, so a future
    // idea-engine run can be seeded with what he liked/rejected. Owner-only.
    tasteProfile: ideaLabProcedure.query(async ({ ctx }) => {
        const rated = await ctx.db
            .select({
                title: ideas.title,
                verdict: ideas.verdict,
                score: ideas.score,
                source: ideas.source,
            })
            .from(ideas)
            .where(sql`${ideas.verdict} is not null`)
            .orderBy(desc(ideas.verdictAt));

        const liked = rated.filter((r) => r.verdict === "good");
        const disliked = rated.filter((r) => r.verdict === "bad");
        return { liked, disliked, ratedCount: rated.length };
    }),
});
