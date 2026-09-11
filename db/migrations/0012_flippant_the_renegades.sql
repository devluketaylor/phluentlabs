CREATE TABLE "issue_reaction" (
	"id" text PRIMARY KEY NOT NULL,
	"newsletter_id" text NOT NULL,
	"reaction" text DEFAULT 'mid',
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "issue_reaction" ADD CONSTRAINT "issue_reaction_newsletter_id_newsletters_id_fk" FOREIGN KEY ("newsletter_id") REFERENCES "public"."newsletters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "issue_reaction_newsletter_id_idx" ON "issue_reaction" USING btree ("newsletter_id");--> statement-breakpoint
CREATE INDEX "issue_reaction_created_at_idx" ON "issue_reaction" USING btree ("created_at");