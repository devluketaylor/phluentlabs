import {integer, pgTable, text, timestamp, unique} from "drizzle-orm/pg-core";
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
    // Engagement counters + last-seen click URL, incremented by repeat
    // email.opened / email.clicked webhook events (openedAt/clickedAt store the
    // FIRST occurrence; these accumulate). Defaulted to 0 so existing rows and
    // never-engaged recipients read as 0 rather than NULL.
    openCount: integer("open_count").notNull().default(0),
    clickCount: integer("click_count").notNull().default(0),
    lastClickedUrl: text("last_clicked_url"),
    // Idempotency guard: the id of the most recently processed Resend webhook
    // event for this recipient. If a delivery is replayed with the same event
    // id we skip it so counts/timestamps don't double-count.
    lastEventId: text("last_event_id"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
},
    (t) => ({
        uniqNewsletterSubscriber: unique("uniq_newsletter_subscriber").on(
            t.newsletterId,
            t.subscriberId
        )
    }))