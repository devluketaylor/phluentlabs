CREATE TABLE "job_status" (
	"job_id" text PRIMARY KEY NOT NULL,
	"job_name" text NOT NULL,
	"agent" text,
	"last_status" text,
	"last_run_at" timestamp,
	"last_tokens" bigint,
	"last_duration_ms" bigint,
	"runs_24h" integer DEFAULT 0 NOT NULL,
	"errors_24h" integer DEFAULT 0 NOT NULL,
	"next_run_at" timestamp,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "usage_activity" (
	"id" text PRIMARY KEY NOT NULL,
	"job_id" text NOT NULL,
	"job_name" text NOT NULL,
	"agent" text,
	"ts" timestamp NOT NULL,
	"status" text,
	"tokens" bigint,
	"duration_ms" bigint,
	"model" text
);
--> statement-breakpoint
ALTER TABLE "usage_daily" ADD COLUMN "agent" text;--> statement-breakpoint
ALTER TABLE "usage_snapshots" ADD COLUMN "agent" text;--> statement-breakpoint
CREATE INDEX "usage_activity_ts_idx" ON "usage_activity" USING btree ("ts");