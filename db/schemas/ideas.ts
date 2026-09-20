import { pgTable, text, timestamp, integer, jsonb, index } from "drizzle-orm/pg-core";

// Personal Idea Lab — private, OWNER-ONLY (hard-gated to Luke's email at the
// router + page + push-endpoint layers). The startup-idea research bot POSTs
// scored ideas here via the push endpoint; Luke thumbs each Good/Bad in the
// admin panel, and those verdicts become a "taste profile" fed back into future
// idea-engine runs so it learns what he likes.
//
// Append-only content; only `verdict` + `verdictAt` mutate (when Luke rates an
// idea). Strictly additive schema — a single new table, nothing destructive.
export const ideas = pgTable(
    "ideas",
    {
        id: text("id").primaryKey(),
        // Short vivid name / one-liner headline.
        title: text("title").notNull(),
        // The pitch / problem / solution body (markdown or plain text).
        pitch: text("pitch").notNull(),
        // "Why now" — the capability/timing that unlocks it. Nullable.
        whyNow: text("why_now"),
        // Overall rubric score out of 35 (nullable — a pushed idea may omit it).
        score: integer("score"),
        // Where it came from, e.g. "idea-engine: creative sweep B". Nullable.
        source: text("source"),
        // Full structured payload the bot pushed (sub-scores, buyer, incumbent,
        // validation step, etc.) so nothing is lost even if columns don't map.
        raw: jsonb("raw"),
        // Luke's verdict: null = unrated (new), "good" or "bad" once rated.
        verdict: text("verdict"),
        // When Luke rated it. Nullable until rated.
        verdictAt: timestamp("verdict_at"),
        createdAt: timestamp("created_at").defaultNow().notNull(),
    },
    (t) => [
        // Newest-first listing + filter-by-verdict (new/good/bad tabs).
        index("ideas_created_at_idx").on(t.createdAt),
        index("ideas_verdict_idx").on(t.verdict),
    ],
);
