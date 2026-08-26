import {pgTable, text, timestamp, unique} from "drizzle-orm/pg-core";
import {subscribers} from "@/db/schemas/subscribers";
import {newsletters} from "@/db/schemas/newsletters";

export const newsletterRecipients = pgTable("newsletter_recipients", {
    id: text("id").primaryKey(),
    newsletterId: text("newsletter_id").notNull().references(() => newsletters.id, { onDelete: "cascade"}),
    subscriberId: text("subscriber_id").notNull().references(() => subscribers.id, { onDelete: "cascade" }),
    status: text("status").notNull().default("queued"),
    error: text("error"),
    sentAt: timestamp("sent_at"),
    // Resend's per-email id (from batch.send data[].id), used to correlate
    // incoming Resend webhook events back to this recipient row.
    resendId: text("resend_id"),
    // Delivery/engagement analytics timestamps, populated by the Resend webhook
    // handler (email.delivered/opened/clicked/bounced/complained).
    deliveredAt: timestamp("delivered_at"),
    openedAt: timestamp("opened_at"),
    clickedAt: timestamp("clicked_at"),
    bouncedAt: timestamp("bounced_at"),
    complainedAt: timestamp("complained_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
},
    (t) => ({
        uniqNewsletterSubscriber: unique("uniq_newsletter_subscriber").on(
            t.newsletterId,
            t.subscriberId
        )
    }))