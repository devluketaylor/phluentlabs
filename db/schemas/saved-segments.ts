import { pgTable, text, timestamp, index } from "drizzle-orm/pg-core";

// Saved segment filters for the admin subscribers table. Admins spend time
// re-applying the same tag/status filter combos on every visit (the table
// filters reset each load). This lets them persist a named filter combination
// once and one-click re-apply it — the foundation for faster segmented sends +
// list triage.
//
// Strictly additive: a standalone table, no FK into subscribers/users. The
// `filter` JSON is a small opaque spec the subscribers table understands
// ({ q?, status?, tag? }); we store it as text (JSON string) so the shape can
// evolve without a migration. Length-capped at the API layer.
export const savedSegments = pgTable(
    "saved_segment",
    {
        id: text("id").primaryKey(),
        // Human label shown in the "Saved views" menu.
        name: text("name").notNull(),
        // JSON-encoded filter spec: { q?, status?, tag? }. Opaque to the DB.
        filter: text("filter").notNull(),
        createdAt: timestamp("created_at").defaultNow().notNull(),
    },
    (t) => [
        // Newest-first listing in the saved-views menu.
        index("saved_segment_created_at_idx").on(t.createdAt),
    ],
);
