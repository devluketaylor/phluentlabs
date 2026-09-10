CREATE TABLE "page_view" (
	"id" text PRIMARY KEY NOT NULL,
	"newsletter_id" text NOT NULL,
	"referrer_bucket" text DEFAULT 'other',
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "page_view" ADD CONSTRAINT "page_view_newsletter_id_newsletters_id_fk" FOREIGN KEY ("newsletter_id") REFERENCES "public"."newsletters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "page_view_newsletter_id_idx" ON "page_view" USING btree ("newsletter_id");--> statement-breakpoint
CREATE INDEX "page_view_created_at_idx" ON "page_view" USING btree ("created_at");