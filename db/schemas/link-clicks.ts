import { pgTable, text, timestamp, index } from "drizzle-orm/pg-core";
import { newsletters } from "@/db/schemas/newsletters";

// Per-URL click analytics for sent issues: one append-only row per email.clicked
// webhook event Resend sends, recording WHICH url a subscriber clicked. This is
// the durable "click map" the per-recipient newsletter_recipients.lastClickedUrl
// column can't provide (that only remembers the SINGLE most-recent url per
// recipient; it can't tell you the top links across an issue).
//
// Privacy: NO PII. We store only the newsletterId + the destination url that was
// clicked (a url WE authored into the issue). We never store the subscriber id,
// the recipient email, raw IPs, or user-agent strings here — this table exists
// purely to rank the links inside an issue by click volume, not to identify who
// clicked. (Per-recipient click state stays on newsletter_recipients.)
//
// Populated only from signature-verified Resend email.clicked events in the
// webhook handler; deduped there against the same Svix message id used for the
// rest of the recipient-row updates, so a webhook redelivery never double-counts.
export const linkClicks = pgTable(
    "link_click",
    {
        id: text("id").primaryKey(),
        newsletterId: text("newsletter_id")
            .notNull()
            .references(() => newsletters.id, { onDelete: "cascade" }),
        // The destination url that was clicked (as reported by Resend). Kept as
        // free text; we truncate on write to a sane max so a pathological url
        // can't bloat the row.
        url: text("url").notNull(),
        createdAt: timestamp("created_at").defaultNow().notNull(),
    },
    (t) => [
        // Per-issue aggregation (GROUP BY url WHERE newsletterId = …).
        index("link_click_newsletter_id_idx").on(t.newsletterId),
        index("link_click_created_at_idx").on(t.createdAt),
    ],
);
