CREATE TABLE "publication" (
	"id" text PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"is_primary" boolean DEFAULT false NOT NULL,
	"archived_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "publication_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "subscriber_publication" (
	"subscriber_id" text NOT NULL,
	"publication_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "subscriber_publication_subscriber_id_publication_id_pk" PRIMARY KEY("subscriber_id","publication_id")
);
--> statement-breakpoint
ALTER TABLE "newsletters" ADD COLUMN "publication_id" text;--> statement-breakpoint
ALTER TABLE "subscriber_publication" ADD CONSTRAINT "subscriber_publication_subscriber_id_subscribers_id_fk" FOREIGN KEY ("subscriber_id") REFERENCES "public"."subscribers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriber_publication" ADD CONSTRAINT "subscriber_publication_publication_id_publication_id_fk" FOREIGN KEY ("publication_id") REFERENCES "public"."publication"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "subscriber_publication_publication_idx" ON "subscriber_publication" USING btree ("publication_id");