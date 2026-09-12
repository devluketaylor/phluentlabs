import {pgTable, text, timestamp} from "drizzle-orm/pg-core";

export const newsletters = pgTable("newsletters", {
    id: text("id").primaryKey(),
    slug: text("slug").unique(),
    subject: text("subject").notNull(),
    // Optional A/B subject-line test: when set, the issue defines a SECOND
    // subject variant. On send, the audience is split ~50/50 and each recipient
    // is delivered either `subject` (variant A) or `subjectB` (variant B); the
    // variant sent is recorded per recipient. Null = no A/B test (single subject).
    subjectB: text("subject_b"),
    preheader: text("preheader"),
    // Optional publication/section this issue belongs to (additive). NULL means
    // the primary/default stream (existing single-stream behaviour) — every
    // confirmed subscriber is eligible. A non-null publicationId gates the send
    // audience to subscribers who opted in to that publication.
    publicationId: text("publication_id"),
    html: text("html").notNull(),
    // SEO fields (optional): let the search title/description differ from the
    // email subject/preheader. Fall back to subject/preheader when null.
    seoTitle: text("seo_title"),
    metaDescription: text("meta_description"),
    status: text("status").notNull().default("draft"),
    scheduledAt: timestamp("scheduled_at"),
    sentAt: timestamp("sent_at"),
    createdBy: text("created_by").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull()
})