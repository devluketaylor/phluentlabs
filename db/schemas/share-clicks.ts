import { pgTable, text, timestamp, index } from "drizzle-orm/pg-core";
import { newsletters } from "@/db/schemas/newsletters";

// Public share-click analytics for the archive: one append-only row per time a
// reader taps a share affordance (X / LinkedIn / copy-link) on a public
// /issues/[slug] page. Lets admins see which issues get shared the most, and
// through which channel. Feeds the dashboard / analytics v2.
//
// Privacy: NO PII. Mirrors page_view — we never store raw IPs, user-agent
// strings, or any per-visitor identifier. The only dimension is the coarse
// share PLATFORM the reader chose (a value we generate, not user input).
export const shareClicks = pgTable(
    "share_click",
    {
        id: text("id").primaryKey(),
        newsletterId: text("newsletter_id")
            .notNull()
            .references(() => newsletters.id, { onDelete: "cascade" }),
        // Which share channel was used: "x" | "linkedin" | "copy" | "other".
        // Nullable/defaulted so it never blocks a write.
        platform: text("platform").default("other"),
        createdAt: timestamp("created_at").defaultNow().notNull(),
    },
    (t) => [
        // Per-issue counting + newest-first / time-window queries.
        index("share_click_newsletter_id_idx").on(t.newsletterId),
        index("share_click_created_at_idx").on(t.createdAt),
    ],
);
