CREATE TABLE "portfolio_post" (
	"id" text PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"body" text DEFAULT '' NOT NULL,
	"cover_image" text,
	"tags" text DEFAULT '' NOT NULL,
	"published" boolean DEFAULT false NOT NULL,
	"published_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "portfolio_project" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"repo_url" text,
	"live_url" text,
	"image" text,
	"tech" text DEFAULT '' NOT NULL,
	"featured" boolean DEFAULT false NOT NULL,
	"published" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "portfolio_settings" (
	"id" text PRIMARY KEY NOT NULL,
	"hero_title" text DEFAULT '' NOT NULL,
	"hero_subtitle" text DEFAULT '' NOT NULL,
	"about_html" text DEFAULT '' NOT NULL,
	"github_url" text,
	"twitter_url" text,
	"linkedin_url" text,
	"email" text,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "portfolio_post_slug_idx" ON "portfolio_post" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "portfolio_post_published_at_idx" ON "portfolio_post" USING btree ("published_at");--> statement-breakpoint
CREATE INDEX "portfolio_post_created_at_idx" ON "portfolio_post" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "portfolio_project_sort_idx" ON "portfolio_project" USING btree ("sort_order");--> statement-breakpoint
CREATE INDEX "portfolio_project_created_at_idx" ON "portfolio_project" USING btree ("created_at");