import { pgTable, text, timestamp, boolean, primaryKey, index } from "drizzle-orm/pg-core";
import { subscribers } from "@/db/schemas/subscribers";

// Publications (a.k.a. "sections" / streams). Foundation for supporting more
// than one newsletter stream (e.g. "phluent weekly" + a future "phluent deep
// dives") with per-publication opt-in.
//
// STRICTLY ADDITIVE: this whole feature is opt-in. Until a publication is
// actually created and issues/subscribers are attached to it, nothing about
// the existing single-stream behaviour changes — issues with a NULL
// publicationId are treated as the primary/default stream and every confirmed
// subscriber remains eligible for them (see lib/send-newsletter.ts).
export const publications = pgTable("publication", {
    id: text("id").primaryKey(),
    // URL-safe unique slug for public routing / opt-in links.
    slug: text("slug").notNull().unique(),
    name: text("name").notNull(),
    description: text("description"),
    // Exactly one publication may be marked the primary/default. Issues with a
    // NULL publicationId belong to the primary stream conceptually; the primary
    // flag is used for defaulting new issues + the public opt-in surface.
    isPrimary: boolean("is_primary").notNull().default(false),
    // Soft-archive: an archived publication stops accepting new opt-ins and is
    // hidden from public opt-in surfaces, but its rows are preserved.
    archivedAt: timestamp("archived_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Subscriber <-> publication opt-in join. A row here means the subscriber has
// opted in to that publication. Additive + nullable-friendly:
//   - No row for a (subscriber, publication) pair == not opted in to that
//     specific publication.
//   - Because existing issues have a NULL publicationId (primary stream), the
//     send audience for the primary/default stream is still "all confirmed
//     subscribers" and does NOT require a join row — so existing subscribers
//     keep receiving the main newsletter with zero backfill.
// Only issues explicitly assigned to a NON-primary publication are gated by an
// opt-in row.
export const subscriberPublications = pgTable(
    "subscriber_publication",
    {
        subscriberId: text("subscriber_id")
            .notNull()
            .references(() => subscribers.id, { onDelete: "cascade" }),
        publicationId: text("publication_id")
            .notNull()
            .references(() => publications.id, { onDelete: "cascade" }),
        createdAt: timestamp("created_at").defaultNow().notNull(),
    },
    (t) => [
        primaryKey({ columns: [t.subscriberId, t.publicationId] }),
        index("subscriber_publication_publication_idx").on(t.publicationId),
    ],
);
