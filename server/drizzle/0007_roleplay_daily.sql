CREATE TABLE "activity_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"topic_id" uuid,
	"score" integer,
	"local_day" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "review_items" ADD COLUMN "source_key" text;--> statement-breakpoint
ALTER TABLE "review_items" ADD COLUMN "last_reviewed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "roleplay_sessions" ADD COLUMN "setup_json" jsonb;--> statement-breakpoint
ALTER TABLE "roleplay_sessions" ADD COLUMN "max_turns" integer DEFAULT 6 NOT NULL;--> statement-breakpoint
ALTER TABLE "roleplay_sessions" ADD COLUMN "status" text DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE "roleplay_sessions" ADD COLUMN "debrief_json" jsonb;--> statement-breakpoint
ALTER TABLE "roleplay_sessions" ADD COLUMN "ended_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "activity_events" ADD CONSTRAINT "activity_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_events" ADD CONSTRAINT "activity_events_topic_id_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topics"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "activity_events_user_day_idx" ON "activity_events" USING btree ("user_id","local_day");--> statement-breakpoint
CREATE UNIQUE INDEX "review_items_user_source_unique" ON "review_items" USING btree ("user_id","source_key");--> statement-breakpoint
CREATE INDEX "roleplay_sessions_user_topic_idx" ON "roleplay_sessions" USING btree ("user_id","topic_id");