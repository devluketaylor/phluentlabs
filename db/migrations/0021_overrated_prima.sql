ALTER TABLE "content_block" ADD COLUMN "use_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "content_block" ADD COLUMN "last_used_at" timestamp;--> statement-breakpoint
CREATE INDEX "content_block_use_count_idx" ON "content_block" USING btree ("use_count");