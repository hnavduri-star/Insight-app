CREATE TYPE "public"."book_kind" AS ENUM('nonfiction', 'fiction');--> statement-breakpoint
CREATE TYPE "public"."entitlement_kind" AS ENUM('all_access', 'topic');--> statement-breakpoint
CREATE TYPE "public"."entitlement_source" AS ENUM('free_trial', 'subscription', 'purchase', 'grant');--> statement-breakpoint
CREATE TYPE "public"."relationship" AS ENUM('boss', 'colleague', 'direct_report', 'client', 'professor', 'partner', 'family', 'friend', 'other');--> statement-breakpoint
CREATE TABLE "entitlements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" "entitlement_kind" NOT NULL,
	"topic_id" uuid,
	"source" "entitlement_source" NOT NULL,
	"provider_ref" text,
	"starts_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "people" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"relationship" "relationship" NOT NULL,
	"traits_json" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"notes" text,
	"practice_goal" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "books" ADD COLUMN "kind" "book_kind" DEFAULT 'nonfiction' NOT NULL;--> statement-breakpoint
ALTER TABLE "roleplay_sessions" ADD COLUMN "person_id" uuid;--> statement-breakpoint
ALTER TABLE "entitlements" ADD CONSTRAINT "entitlements_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entitlements" ADD CONSTRAINT "entitlements_topic_id_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "people" ADD CONSTRAINT "people_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "entitlements_user_idx" ON "entitlements" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "entitlements_one_free_trial" ON "entitlements" USING btree ("user_id") WHERE "entitlements"."source" = 'free_trial';--> statement-breakpoint
CREATE INDEX "people_user_idx" ON "people" USING btree ("user_id");--> statement-breakpoint
ALTER TABLE "roleplay_sessions" ADD CONSTRAINT "roleplay_sessions_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE set null ON UPDATE no action;