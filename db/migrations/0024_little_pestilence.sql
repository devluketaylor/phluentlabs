CREATE TABLE "saved_segment" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"filter" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "saved_segment_created_at_idx" ON "saved_segment" USING btree ("created_at");