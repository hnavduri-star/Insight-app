ALTER TYPE "public"."rating_band" ADD VALUE 'mastery';--> statement-breakpoint
CREATE TABLE "practice_reps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"topic_id" uuid NOT NULL,
	"lesson_id" uuid,
	"person_id" uuid,
	"rep_json" jsonb NOT NULL,
	"response_text" text,
	"grade_json" jsonb,
	"score" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"answered_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "situations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"input_text" text NOT NULL,
	"plan_json" jsonb NOT NULL,
	"best_score" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "topic_progress" ADD COLUMN "mastery_completed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "practice_reps" ADD CONSTRAINT "practice_reps_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "practice_reps" ADD CONSTRAINT "practice_reps_topic_id_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "practice_reps" ADD CONSTRAINT "practice_reps_lesson_id_cached_lessons_id_fk" FOREIGN KEY ("lesson_id") REFERENCES "public"."cached_lessons"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "practice_reps" ADD CONSTRAINT "practice_reps_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "situations" ADD CONSTRAINT "situations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "practice_reps_user_topic_idx" ON "practice_reps" USING btree ("user_id","topic_id");--> statement-breakpoint
CREATE INDEX "situations_user_idx" ON "situations" USING btree ("user_id");