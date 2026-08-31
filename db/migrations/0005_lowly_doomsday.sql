ALTER TABLE "newsletter_recipients" ADD COLUMN "open_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "newsletter_recipients" ADD COLUMN "click_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "newsletter_recipients" ADD COLUMN "last_clicked_url" text;--> statement-breakpoint
ALTER TABLE "newsletter_recipients" ADD COLUMN "last_event_id" text;