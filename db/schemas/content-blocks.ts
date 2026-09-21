import { pgTable, text, timestamp, integer, index } from "drizzle-orm/pg-core";

// Reusable content blocks / snippet library. Editors save named chunks of HTML
// (header, sign-off, sponsor slot, CTA, …) once and insert them into any issue
// from the rich editor's "Snippets" menu — the same insert plumbing the static
// `newsletterTemplates` scaffolds already use, but user-authored + persisted.
//
// Strictly additive: a standalone table with no FK into newsletters. The stored
// `html` is body markup the tiptap editor understands (h1-3/p/strong/em/ul/ol/
// li/a/blockquote/hr/img) and round-trips through getHTML()/setContent(). We
// deliberately keep NO per-issue linkage — a snippet is a template, inserted as
// a copy, so editing/deleting a snippet never mutates already-authored issues.
export const contentBlocks = pgTable(
    "content_block",
    {
        id: text("id").primaryKey(),
        // Short human label shown in the Snippets menu + admin table.
        name: text("name").notNull(),
        // Optional one-line hint shown under the name.
        description: text("description"),
        // The HTML inserted at the cursor. Length-capped at the API layer.
        html: text("html").notNull(),
        // Lightweight usage signal so the most-reached-for snippets can be
        // surfaced as one-click toolbar buttons (Tier 8 quick-insert). Additive
        // + defaulted — existing rows read 0 / null until first inserted.
        useCount: integer("use_count").default(0).notNull(),
        lastUsedAt: timestamp("last_used_at"),
        createdAt: timestamp("created_at").defaultNow().notNull(),
        updatedAt: timestamp("updated_at").defaultNow().notNull(),
    },
    (t) => [
        // Newest-first admin listing + menu ordering.
        index("content_block_created_at_idx").on(t.createdAt),
        // Most-used-first ordering for the toolbar quick-insert row.
        index("content_block_use_count_idx").on(t.useCount),
    ],
);
