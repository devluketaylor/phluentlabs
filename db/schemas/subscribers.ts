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
    // Referral program (beehiiv-style growth): each subscriber gets a unique
    // short referral code; new signups arriving via ?ref=<code> record the
    // referrer's id in referredBy. Both additive + nullable so existing rows
    // stay valid (codes are backfilled lazily / on next write, and a one-off
    // backfill runs in the migration).
    referralCode: text("referral_code").unique(),
    referredBy: text("referred_by"),
    // Double opt-in reminder automation: stamped when we send the single
    // gentle "you never confirmed" reminder to a pending subscriber, so the
    // reminder cron only ever emails a given pending row ONCE. Nullable so
    // existing rows stay valid (NULL = no reminder sent yet).
    confirmReminderSentAt: timestamp("confirm_reminder_sent_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    confirmedAt: timestamp("confirmed_at"),
    unsubscribedAt: timestamp("unsubscribed_at"),
    updatedAt: timestamp("updated_at")
})