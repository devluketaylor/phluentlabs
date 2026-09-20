import { pgTable, text, timestamp, bigint, doublePrecision, integer, index } from "drizzle-orm/pg-core";

// OpenClaw token/cost usage snapshots — private, OWNER-ONLY (gated to Luke).
// A local pusher on the OpenClaw host reads OpenClaw's own SQLite usage data
// (cron_run_logs: total_tokens/model/duration per run) and upserts per-job
// cumulative rollups here so the phluentlabs admin panel can render a token/cost
// dashboard WITHOUT the Vercel app needing to reach the host's local files.
//
// One row per (job) — the pusher UPSERTS the latest cumulative totals each run,
// so the table stays small and always reflects current all-time usage. A
// separate time-bucketed history is kept in `usageDaily` for over-time charts.
export const usageSnapshots = pgTable(
    "usage_snapshots",
    {
        // Cron job id (stable key). Upserted.
        jobId: text("job_id").primaryKey(),
        // Friendly job name (e.g. "phluentlabs-dev-loop").
        jobName: text("job_name").notNull(),
        // Model most recently seen for this job.
        model: text("model"),
        // Cumulative totals across all runs of this job.
        runs: integer("runs").notNull().default(0),
        totalTokens: bigint("total_tokens", { mode: "number" }).notNull().default(0),
        // Estimated USD cost (computed by the pusher from a rate table).
        costUsd: doublePrecision("cost_usd").notNull().default(0),
        // Tokens in the most recent run + avg tokens/run (burn intensity).
        lastRunTokens: bigint("last_run_tokens", { mode: "number" }),
        avgTokensPerRun: doublePrecision("avg_tokens_per_run"),
        updatedAt: timestamp("updated_at").defaultNow().notNull(),
    },
);

// Daily per-job rollups for over-time charts. One row per (job, day).
export const usageDaily = pgTable(
    "usage_daily",
    {
        id: text("id").primaryKey(), // `${jobId}:${day}`
        jobId: text("job_id").notNull(),
        jobName: text("job_name").notNull(),
        // Day bucket, midnight UTC.
        day: timestamp("day").notNull(),
        runs: integer("runs").notNull().default(0),
        tokens: bigint("tokens", { mode: "number" }).notNull().default(0),
        costUsd: doublePrecision("cost_usd").notNull().default(0),
        updatedAt: timestamp("updated_at").defaultNow().notNull(),
    },
    (t) => [
        index("usage_daily_day_idx").on(t.day),
        index("usage_daily_job_idx").on(t.jobId),
    ],
);
