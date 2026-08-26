ALTER TABLE "newsletter_recipients" ADD COLUMN "resend_id" text;--> statement-breakpoint
ALTER TABLE "newsletter_recipients" ADD COLUMN "delivered_at" timestamp;--> statement-breakpoint
ALTER TABLE "newsletter_recipients" ADD COLUMN "opened_at" timestamp;--> statement-breakpoint
ALTER TABLE "newsletter_recipients" ADD COLUMN "clicked_at" timestamp;--> statement-breakpoint
ALTER TABLE "newsletter_recipients" ADD COLUMN "bounced_at" timestamp;--> statement-breakpoint
ALTER TABLE "newsletter_recipients" ADD COLUMN "complained_at" timestamp;