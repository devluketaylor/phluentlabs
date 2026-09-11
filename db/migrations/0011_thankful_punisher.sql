CREATE TABLE "share_click" (
	"id" text PRIMARY KEY NOT NULL,
	"newsletter_id" text NOT NULL,
	"platform" text DEFAULT 'other',
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "share_click" ADD CONSTRAINT "share_click_newsletter_id_newsletters_id_fk" FOREIGN KEY ("newsletter_id") REFERENCES "public"."newsletters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "share_click_newsletter_id_idx" ON "share_click" USING btree ("newsletter_id");--> statement-breakpoint
CREATE INDEX "share_click_created_at_idx" ON "share_click" USING btree ("created_at");