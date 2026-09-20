CREATE TABLE "skill_usage" (
	"skill_key" text PRIMARY KEY NOT NULL,
	"skill_name" text NOT NULL,
	"source" text,
	"use_count" integer DEFAULT 0 NOT NULL,
	"last_agent" text,
	"first_used_at" timestamp,
	"last_used_at" timestamp,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subagent_runs" (
	"run_id" text PRIMARY KEY NOT NULL,
	"agent" text,
	"label" text,
	"model" text,
	"status" text,
	"created_at" timestamp NOT NULL,
	"ended_at" timestamp,
	"elapsed_ms" bigint
);
--> statement-breakpoint
CREATE INDEX "skill_usage_count_idx" ON "skill_usage" USING btree ("use_count");--> statement-breakpoint
CREATE INDEX "subagent_runs_created_idx" ON "subagent_runs" USING btree ("created_at");