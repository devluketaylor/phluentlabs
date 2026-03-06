import {pgTable, text, timestamp} from "drizzle-orm/pg-core";

export const newsletters = pgTable("newsletters", {
    id: text("id").primaryKey(),
    slug: text("slug").unique(),
    subject: text("subject").notNull(),
    preheader: text("preheader"),
    html: text("html").notNull(),
    status: text("status").notNull().default("draft"),
    scheduledAt: timestamp("scheduled_at"),
    sentAt: timestamp("sent_at"),
    createdBy: text("created_by").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull()
})