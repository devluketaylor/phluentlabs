import { pgTable, text, timestamp, index } from "drizzle-orm/pg-core";
import { newsletters } from "@/db/schemas/newsletters";

// Public web-analytics for the archive: one append-only row per counted view of
// a public /issues/[slug] page. This is DISTINCT from email open/click analytics
// (which live on newsletter_recipients and come from Resend webhooks) — this
// tracks people reading the issue on the website.
//
// Privacy: NO PII. We never store raw IPs, user-agent strings, or any
// per-visitor identifier. The only optional dimension is a COARSE referrer
// bucket ("search" / "social" / "direct" / "internal" / "other") so admins can
// see roughly where readers come from without tracking individuals.
export const pageViews = pgTable(
    "page_view",
    {
        id: text("id").primaryKey(),
        newsletterId: text("newsletter_id")
            .notNull()
            .references(() => newsletters.id, { onDelete: "cascade" }),
        // Coarse traffic-source bucket (no full URL, no query strings): one of
        // "search" | "social" | "direct" | "internal" | "other". Nullable/defaulted
        // so it never blocks a write.
        referrerBucket: text("referrer_bucket").default("other"),
        createdAt: timestamp("created_at").defaultNow().notNull(),
    },
    (t) => [
        // Per-issue counting + newest-first / time-window queries.
        index("page_view_newsletter_id_idx").on(t.newsletterId),
        index("page_view_created_at_idx").on(t.createdAt),
    ],
);
