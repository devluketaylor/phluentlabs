CREATE TABLE "ideas" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"pitch" text NOT NULL,
	"why_now" text,
	"score" integer,
	"source" text,
	"raw" jsonb,
	"verdict" text,
	"verdict_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "ideas_created_at_idx" ON "ideas" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "ideas_verdict_idx" ON "ideas" USING btree ("verdict");