ALTER TABLE "subscribers" ADD COLUMN "referral_code" text;--> statement-breakpoint
ALTER TABLE "subscribers" ADD COLUMN "referred_by" text;--> statement-breakpoint
ALTER TABLE "subscribers" ADD CONSTRAINT "subscribers_referral_code_unique" UNIQUE("referral_code");