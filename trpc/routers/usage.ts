import { ownerProcedure, router } from "@/trpc/server";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { desc, gte } from "drizzle-orm";
import { usageSnapshots, usageDaily, jobStatus, usageActivity, skillUsage, subagentRuns } from "@/db/schemas/usage-snapshots";
import { isIdeaLabOwner } from "@/lib/idea-lab";

// Mission Control is owner-role AND email-gated to Luke.
const usageProcedure = ownerProcedure.use(async ({ ctx, next }) => {
    if (!isIdeaLabOwner((ctx as any).adminEmail)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Private." });
    }
    return next({ ctx });
});

export const usageRouter = router({
    // All-time per-job rollups + totals + per-agent split.
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

        // Per-agent rollup (Tessie vs Tiger).
        const byAgentMap = new Map<string, { agent: string; tokens: number; cost: number; runs: number; jobs: number }>();
        for (const r of rows) {
            const key = r.agent ?? "unknown";
            const e = byAgentMap.get(key) ?? { agent: key, tokens: 0, cost: 0, runs: 0, jobs: 0 };
            e.tokens += Number(r.totalTokens);
            e.cost += Number(r.costUsd);
            e.runs += Number(r.runs);
            e.jobs += 1;
            byAgentMap.set(key, e);
        }
        const byAgent = [...byAgentMap.values()].sort((a, b) => b.tokens - a.tokens);

        return { jobs: rows, totalTokens, totalCost, totalRuns, lastUpdated, byAgent };
    }),

    // Per-job health tiles + fleet-level counts.
    health: usageProcedure.query(async ({ ctx }) => {
        const rows = await ctx.db.select().from(jobStatus).orderBy(desc(jobStatus.lastRunAt));
        const runs24h = rows.reduce((a, r) => a + Number(r.runs24h), 0);
        const errors24h = rows.reduce((a, r) => a + Number(r.errors24h), 0);
        const okJobs = rows.filter((r) => r.lastStatus === "ok").length;
        const errorJobs = rows.filter((r) => r.lastStatus && r.lastStatus !== "ok").length;
        // Next upcoming run across all jobs.
        const upcoming = rows
            .filter((r) => r.nextRunAt)
            .sort((a, b) => (a.nextRunAt!.getTime() - b.nextRunAt!.getTime()))[0] ?? null;
        return {
            jobs: rows,
            totalJobs: rows.length,
            okJobs,
            errorJobs,
            runs24h,
            errors24h,
            errorRate24h: runs24h ? errors24h / runs24h : 0,
            nextRun: upcoming ? { jobName: upcoming.jobName, at: upcoming.nextRunAt } : null,
        };
    }),

    // Recent activity feed.
    activity: usageProcedure
        .input(z.object({ limit: z.number().int().min(1).max(200).default(60) }).default({ limit: 60 }))
        .query(async ({ input, ctx }) => {
            return ctx.db
                .select()
                .from(usageActivity)
                .orderBy(desc(usageActivity.ts))
                .limit(input.limit);
        }),

    // Daily series + spend projection.
    daily: usageProcedure
        .input(z.object({ days: z.number().int().min(1).max(180).default(30) }).default({ days: 30 }))
        .query(async ({ input, ctx }) => {
            const since = new Date(Date.now() - input.days * 24 * 60 * 60 * 1000);
            const rows = await ctx.db
                .select()
                .from(usageDaily)
                .where(gte(usageDaily.day, since))
                .orderBy(usageDaily.day);

            // Month-to-date + run-rate projection.
            const now = new Date();
            const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
            let mtdCost = 0;
            for (const r of rows) {
                if (new Date(r.day) >= monthStart) mtdCost += Number(r.costUsd);
            }
            const dayOfMonth = now.getUTCDate();
            const daysInMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)).getUTCDate();
            const projectedMonthCost = dayOfMonth > 0 ? (mtdCost / dayOfMonth) * daysInMonth : 0;

            return { rows, mtdCost, projectedMonthCost };
        }),

    // Skill/tool usage leaderboard (most-used skills across the fleet).
    skills: usageProcedure.query(async ({ ctx }) => {
        const rows = await ctx.db
            .select()
            .from(skillUsage)
            .orderBy(desc(skillUsage.useCount));
        const totalUses = rows.reduce((a, r) => a + Number(r.useCount), 0);
        return { rows, totalUses, distinctSkills: rows.length };
    }),

    // Sub-agent runs feed + rollup (spawned sub-agents, outcomes, runtime).
    subagents: usageProcedure
        .input(z.object({ limit: z.number().int().min(1).max(200).default(50) }).default({ limit: 50 }))
        .query(async ({ input, ctx }) => {
            const rows = await ctx.db
                .select()
                .from(subagentRuns)
                .orderBy(desc(subagentRuns.createdAt))
                .limit(input.limit);
            const total = rows.length;
            const ok = rows.filter((r) => r.status === "ok").length;
            const errored = rows.filter((r) => r.status && r.status !== "ok" && r.status !== "running").length;
            const running = rows.filter((r) => r.status === "running").length;
            const finished = rows.filter((r) => r.elapsedMs != null);
            const avgElapsedMs = finished.length
                ? finished.reduce((a, r) => a + Number(r.elapsedMs), 0) / finished.length
                : 0;
            // Per-agent rollup.
            const byAgentMap = new Map<string, { agent: string; runs: number; ok: number; errored: number }>();
            for (const r of rows) {
                const key = r.agent ?? "unknown";
                const e = byAgentMap.get(key) ?? { agent: key, runs: 0, ok: 0, errored: 0 };
                e.runs += 1;
                if (r.status === "ok") e.ok += 1;
                else if (r.status && r.status !== "running") e.errored += 1;
                byAgentMap.set(key, e);
            }
            const byAgent = [...byAgentMap.values()].sort((a, b) => b.runs - a.runs);
            return { rows, total, ok, errored, running, avgElapsedMs, byAgent };
        }),
});
