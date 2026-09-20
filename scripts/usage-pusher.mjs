// OpenClaw usage pusher — reads OpenClaw's own SQLite (cron_run_logs) and
// UPSERTS per-job token/cost rollups into the phluentlabs PROD DB so the
// private /admin/usage dashboard can render them. Vercel can't read this host's
// files, so this bridges the two. Read-only on OpenClaw's DB.
//
// Run from the project dir: node scripts/usage-pusher.mjs
// (scheduled ~every 30 min via the openclaw-usage-pusher cron job)
import postgres from "postgres";
import { readFileSync } from "fs";
import { execFileSync } from "child_process";

// Read OpenClaw's SQLite via the sqlite3 CLI (read-only) so we don't need a
// native node sqlite dependency. Returns parsed rows from a JSON query.
function ocQuery(query) {
    const out = execFileSync(
        "sqlite3",
        [`file:${OC_DB}?mode=ro`, "-json", query],
        { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
    ).trim();
    return out ? JSON.parse(out) : [];
}

const OC_DB = "/home/phluent/.openclaw/state/openclaw.sqlite";
const PROD_ENV = "/home/phluent/.openclaw/workspace-tessie/projects/phluentlabs/.env.prod";

const JOB_NAMES = {
    "4f768c77": "phluentlabs-dev-loop",
    "95d88995": "security-cam-alert-forwarder",
    "4c650e71": "newsletter-research",
    "3fb6c6b3": "x-breaking-news-watch",
    "2c0eede4": "x-daily-post",
    "0207979e": "newsletter-sunday-delivery",
    "e41d17cf": "school-morning-ping",
    "d1a46e2d": "security-cam-cleanup",
    "e56070ea": "security-cam-alert-forwarder",
    "89067fd6": "calc2-exam-nov19",
    "c2acb857": "calc2-exam-oct15",
    "d1093ff1": "calc2-exam-sep17",
};
const RATES = { "claude-opus-4-8": 30.0, "claude-sonnet": 6.0, "claude-haiku": 1.0 };
const DEFAULT_RATE = 20.0;

function jobName(id) {
    if (!id) return "unknown";
    for (const [p, n] of Object.entries(JOB_NAMES)) if (id.startsWith(p)) return n;
    return id.slice(0, 8);
}

// Parse the owning agent out of a session_key like "agent:tessie:cron:<id>".
// main => Tiger, tessie => Tessie.
function agentFrom(sessionKey) {
    if (!sessionKey) return "unknown";
    const m = /^agent:([^:]+):/.exec(sessionKey);
    if (!m) return "unknown";
    const id = m[1];
    if (id === "tessie") return "Tessie";
    if (id === "main") return "Tiger";
    return id;
}
function rateFor(model) {
    if (!model) return DEFAULT_RATE;
    for (const [k, r] of Object.entries(RATES)) if (model.includes(k)) return r;
    return DEFAULT_RATE;
}
function prodUrl() {
    const m = readFileSync(PROD_ENV, "utf8").match(/^DATABASE_URL=(.+)$/m);
    if (!m) throw new Error("No DATABASE_URL in .env.prod");
    return m[1].trim().replace(/^["']|["']$/g, "");
}

// ---- Read OpenClaw usage (read-only, via sqlite3 CLI) ---------------------
// Per job: include a representative session_key so we can attribute the agent.
const perJob = ocQuery(
    `SELECT job_id,
            COALESCE(model,'') AS model,
            COUNT(*) AS runs,
            COALESCE(SUM(total_tokens),0) AS tokens,
            (SELECT session_key FROM cron_run_logs s WHERE s.job_id = c.job_id AND session_key IS NOT NULL LIMIT 1) AS session_key
     FROM cron_run_logs c
     WHERE total_tokens IS NOT NULL
     GROUP BY job_id`,
);

// Per-job status rollup (health tiles): last run + rolling 24h counts + next run.
const nowMs = Date.now();
const dayAgo = nowMs - 24 * 60 * 60 * 1000;
const statusRows = ocQuery(
    `SELECT job_id,
            (SELECT status FROM cron_run_logs s WHERE s.job_id=c.job_id ORDER BY ts DESC LIMIT 1) AS last_status,
            (SELECT ts FROM cron_run_logs s WHERE s.job_id=c.job_id ORDER BY ts DESC LIMIT 1) AS last_ts,
            (SELECT total_tokens FROM cron_run_logs s WHERE s.job_id=c.job_id AND total_tokens IS NOT NULL ORDER BY ts DESC LIMIT 1) AS last_tokens,
            (SELECT duration_ms FROM cron_run_logs s WHERE s.job_id=c.job_id ORDER BY ts DESC LIMIT 1) AS last_duration,
            (SELECT next_run_at_ms FROM cron_run_logs s WHERE s.job_id=c.job_id AND next_run_at_ms IS NOT NULL ORDER BY ts DESC LIMIT 1) AS next_run,
            (SELECT session_key FROM cron_run_logs s WHERE s.job_id=c.job_id AND session_key IS NOT NULL LIMIT 1) AS session_key,
            SUM(CASE WHEN ts >= ${dayAgo} THEN 1 ELSE 0 END) AS runs_24h,
            SUM(CASE WHEN ts >= ${dayAgo} AND status != 'ok' THEN 1 ELSE 0 END) AS errors_24h
     FROM cron_run_logs c
     GROUP BY job_id`,
);

// Recent activity feed — last 200 runs.
const activityRows = ocQuery(
    `SELECT job_id, ts, status, total_tokens AS tokens, duration_ms, COALESCE(model,'') AS model, session_key
     FROM cron_run_logs
     ORDER BY ts DESC LIMIT 200`,
);

const lastRun = new Map(
    ocQuery(
        `SELECT job_id, total_tokens FROM cron_run_logs c
         WHERE total_tokens IS NOT NULL
           AND ts = (SELECT MAX(ts) FROM cron_run_logs c2
                     WHERE c2.job_id=c.job_id AND c2.total_tokens IS NOT NULL)
         GROUP BY job_id`,
    ).map((r) => [r.job_id, r.total_tokens]),
);

// Per job per day (UTC) for the over-time chart.
const perDay = ocQuery(
    `SELECT job_id,
            COALESCE(model,'') AS model,
            strftime('%Y-%m-%d', ts/1000, 'unixepoch') AS day,
            COUNT(*) AS runs,
            COALESCE(SUM(total_tokens),0) AS tokens,
            (SELECT session_key FROM cron_run_logs s WHERE s.job_id = c.job_id AND session_key IS NOT NULL LIMIT 1) AS session_key
     FROM cron_run_logs c
     WHERE total_tokens IS NOT NULL
     GROUP BY job_id, day`,
);

// ---- Upsert into prod -----------------------------------------------------
const sql = postgres(prodUrl(), { ssl: "require" });
try {
    for (const r of perJob) {
        const name = jobName(r.job_id);
        const agent = agentFrom(r.session_key);
        const cost = (r.tokens / 1_000_000) * rateFor(r.model);
        const avg = r.runs ? r.tokens / r.runs : 0;
        const lrt = lastRun.get(r.job_id) ?? null;
        await sql`
            INSERT INTO usage_snapshots
                (job_id, job_name, agent, model, runs, total_tokens, cost_usd, last_run_tokens, avg_tokens_per_run, updated_at)
            VALUES (${r.job_id}, ${name}, ${agent}, ${r.model || null}, ${r.runs}, ${r.tokens}, ${cost}, ${lrt}, ${avg}, now())
            ON CONFLICT (job_id) DO UPDATE SET
                job_name = EXCLUDED.job_name,
                agent = EXCLUDED.agent,
                model = EXCLUDED.model,
                runs = EXCLUDED.runs,
                total_tokens = EXCLUDED.total_tokens,
                cost_usd = EXCLUDED.cost_usd,
                last_run_tokens = EXCLUDED.last_run_tokens,
                avg_tokens_per_run = EXCLUDED.avg_tokens_per_run,
                updated_at = now()
        `;
    }
    for (const r of perDay) {
        const name = jobName(r.job_id);
        const agent = agentFrom(r.session_key);
        const cost = (r.tokens / 1_000_000) * rateFor(r.model);
        const id = `${r.job_id}:${r.day}`;
        await sql`
            INSERT INTO usage_daily (id, job_id, job_name, agent, day, runs, tokens, cost_usd, updated_at)
            VALUES (${id}, ${r.job_id}, ${name}, ${agent}, ${r.day + "T00:00:00Z"}, ${r.runs}, ${r.tokens}, ${cost}, now())
            ON CONFLICT (id) DO UPDATE SET
                agent = EXCLUDED.agent,
                runs = EXCLUDED.runs,
                tokens = EXCLUDED.tokens,
                cost_usd = EXCLUDED.cost_usd,
                updated_at = now()
        `;
    }
    // Job status rollups (health tiles).
    for (const r of statusRows) {
        const name = jobName(r.job_id);
        const agent = agentFrom(r.session_key);
        const lastRunAt = r.last_ts ? new Date(r.last_ts).toISOString() : null;
        const nextRunAt = r.next_run ? new Date(r.next_run).toISOString() : null;
        await sql`
            INSERT INTO job_status
                (job_id, job_name, agent, last_status, last_run_at, last_tokens, last_duration_ms, runs_24h, errors_24h, next_run_at, updated_at)
            VALUES (${r.job_id}, ${name}, ${agent}, ${r.last_status || null}, ${lastRunAt},
                    ${r.last_tokens ?? null}, ${r.last_duration ?? null}, ${r.runs_24h ?? 0}, ${r.errors_24h ?? 0}, ${nextRunAt}, now())
            ON CONFLICT (job_id) DO UPDATE SET
                job_name=EXCLUDED.job_name, agent=EXCLUDED.agent, last_status=EXCLUDED.last_status,
                last_run_at=EXCLUDED.last_run_at, last_tokens=EXCLUDED.last_tokens, last_duration_ms=EXCLUDED.last_duration_ms,
                runs_24h=EXCLUDED.runs_24h, errors_24h=EXCLUDED.errors_24h, next_run_at=EXCLUDED.next_run_at, updated_at=now()
        `;
    }
    // Activity feed — upsert last 200, then prune to newest 200.
    for (const r of activityRows) {
        const name = jobName(r.job_id);
        const agent = agentFrom(r.session_key);
        const id = `${r.job_id}:${r.ts}`;
        const tsIso = new Date(r.ts).toISOString();
        await sql`
            INSERT INTO usage_activity (id, job_id, job_name, agent, ts, status, tokens, duration_ms, model)
            VALUES (${id}, ${r.job_id}, ${name}, ${agent}, ${tsIso}, ${r.status || null}, ${r.tokens ?? null}, ${r.duration_ms ?? null}, ${r.model || null})
            ON CONFLICT (id) DO NOTHING
        `;
    }
    await sql`DELETE FROM usage_activity WHERE id NOT IN (SELECT id FROM usage_activity ORDER BY ts DESC LIMIT 200)`;
    console.log(JSON.stringify({ jobs: perJob.length, days: perDay.length, status: statusRows.length, activity: activityRows.length }));
} finally {
    await sql.end();
}
