import { pgTable, text, timestamp, index } from "drizzle-orm/pg-core";
import { newsletters } from "@/db/schemas/newsletters";

// One-tap anonymous reader feedback on a public issue: "was this useful?".
// Readers pick a reaction (up / mid / down) at the bottom of an /issues/[slug]
// page. This is an append-only, one-row-per-vote table that admins aggregate to
// see which topics land.
//
// Privacy: NO PII — mirrors page_view / share_click. We never store IPs,
// user-agent strings, or any per-visitor identifier. Coarse dedupe is done
// CLIENT-side (localStorage) so a returning reader doesn't spam a single issue;
// the server intentionally keeps no visitor identity, so the count is a
// best-effort signal rather than a unique-voter tally (acceptable for feedback).
export const issueReactions = pgTable(
    "issue_reaction",
    {
        id: text("id").primaryKey(),
        newsletterId: text("newsletter_id")
            .notNull()
            .references(() => newsletters.id, { onDelete: "cascade" }),
        // The reaction chosen: "up" | "mid" | "down". Nullable/defaulted so a
        // write never fails; unknown values are normalized to "mid" server-side.
        reaction: text("reaction").default("mid"),
        createdAt: timestamp("created_at").defaultNow().notNull(),
    },
    (t) => [
        // Per-issue aggregation + newest-first / time-window queries.
        index("issue_reaction_newsletter_id_idx").on(t.newsletterId),
        index("issue_reaction_created_at_idx").on(t.createdAt),
    ],
);
