CREATE TABLE "link_click" (
	"id" text PRIMARY KEY NOT NULL,
	"newsletter_id" text NOT NULL,
	"url" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "link_click" ADD CONSTRAINT "link_click_newsletter_id_newsletters_id_fk" FOREIGN KEY ("newsletter_id") REFERENCES "public"."newsletters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "link_click_newsletter_id_idx" ON "link_click" USING btree ("newsletter_id");--> statement-breakpoint
CREATE INDEX "link_click_created_at_idx" ON "link_click" USING btree ("created_at");