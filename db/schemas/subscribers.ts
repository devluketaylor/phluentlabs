import {pgTable, text, timestamp} from "drizzle-orm/pg-core";

export const subscribers = pgTable("subscribers", {
    id: text("id").primaryKey(),
    email: text("email").notNull().unique(),
    firstName: text("first_name"),
    lastName: text("last_name"),
    status: text("status").notNull().default("pending"),
    // Free-form tags/segments for grouping subscribers (Kit-style). Additive:
    // Postgres text[] with a default empty array so existing rows stay valid.
    tags: text("tags").array().notNull().default([]),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    confirmedAt: timestamp("confirmed_at"),
    unsubscribedAt: timestamp("unsubscribed_at"),
    updatedAt: timestamp("updated_at")
})