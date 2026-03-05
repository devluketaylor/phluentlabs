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
    createdAt: timestamp("created_at").defaultNow().notNull(),
},
    (t) => ({
        uniqNewsletterSubscriber: unique("uniq_newsletter_subscriber").on(
            t.newsletterId,
            t.subscriberId
        )
    }))