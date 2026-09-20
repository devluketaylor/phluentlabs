import { ownerProcedure, router } from "@/trpc/server";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { desc, gte, sql } from "drizzle-orm";
import { usageSnapshots, usageDaily } from "@/db/schemas/usage-snapshots";
import { isIdeaLabOwner } from "@/lib/idea-lab";

// Usage dashboard is owner-role AND email-gated to Luke (reuses the Idea Lab
// owner check — same private-to-Luke rule).
const usageProcedure = ownerProcedure.use(async ({ ctx, next }) => {
    if (!isIdeaLabOwner((ctx as any).adminEmail)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Private." });
    }
    return next({ ctx });
});

export const usageRouter = router({
    // Current all-time per-job rollups + totals.
    summary: usageProcedure.query(async ({ ctx }) => {
        const rows = await ctx.db
            .select()
            .from(usageSnapshots)
            .orderBy(desc(usageSnapshots.totalTokens));

        const totalTokens = rows.reduce((a, r) => a + Number(r.totalTokens), 0);
        const totalCost = rows.reduce((a, r) => a + Number(r.costUsd), 0);
        const totalRuns = rows.reduce((a, r) => a + Number(r.runs), 0);
        const lastUpdated = rows.reduce<Date | null>(
            (a, r) => (!a || r.updatedAt > a ? r.updatedAt : a),
            null,
        );

        return { jobs: rows, totalTokens, totalCost, totalRuns, lastUpdated };
    }),

    // Daily per-job series for over-time charts (default last 30 days).
    daily: usageProcedure
        .input(z.object({ days: z.number().int().min(1).max(180).default(30) }).default({ days: 30 }))
        .query(async ({ input, ctx }) => {
            const since = new Date(Date.now() - input.days * 24 * 60 * 60 * 1000);
            const rows = await ctx.db
                .select()
                .from(usageDaily)
                .where(gte(usageDaily.day, since))
                .orderBy(usageDaily.day);
            return rows;
        }),
});
