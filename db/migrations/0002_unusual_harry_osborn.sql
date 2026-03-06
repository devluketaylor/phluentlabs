ALTER TABLE "newsletters" ADD COLUMN "slug" text;--> statement-breakpoint
ALTER TABLE "newsletters" ADD CONSTRAINT "newsletters_slug_unique" UNIQUE("slug");