import { pgTable, text, timestamp, index } from "drizzle-orm/pg-core";
import { newsletters } from "@/db/schemas/newsletters";

// Free-form reader feedback captured from the public /feedback form (and the
// "just reply to this email" prompt in the send footer, which points readers to
// the same form). This closes the loop that raw email replies currently drop —
// a reply to a broadcast email doesn't land anywhere useful, so we give readers
// an explicit, no-auth way to send a note that admins can actually read.
//
// One row per submission, append-only. `newsletterId` is a NULLABLE FK (SET
// NULL on delete) so feedback survives an issue being removed and so general /
// unattributed feedback (no ?issue= param) is still accepted. `issueSlug` keeps
// the raw slug the reader arrived from for context even if the FK can't resolve
// (e.g. a draft/unknown slug). We deliberately store NO IP / user-agent; the
// only optional identifying field is an email the reader CHOOSES to leave so we
// can reply.
export const feedback = pgTable(
    "feedback",
    {
        id: text("id").primaryKey(),
        // Nullable FK — general feedback (no issue) is allowed, and feedback
        // outlives the issue it referenced.
        newsletterId: text("newsletter_id").references(() => newsletters.id, {
            onDelete: "set null",
        }),
        // Raw slug the reader came from (for context / when the FK doesn't
        // resolve to a published issue). Nullable.
        issueSlug: text("issue_slug"),
        // The reader's message. Required, length-capped at the API layer.
        message: text("message").notNull(),
        // Optional reply-to email the reader chose to leave. Nullable.
        email: text("email"),
        createdAt: timestamp("created_at").defaultNow().notNull(),
    },
    (t) => [
        // Per-issue aggregation + newest-first admin listing.
        index("feedback_newsletter_id_idx").on(t.newsletterId),
        index("feedback_created_at_idx").on(t.createdAt),
    ],
);
