CREATE TABLE "cpd_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"topic_id" uuid,
	"lesson_id" uuid,
	"code" text NOT NULL,
	"learner_name" text NOT NULL,
	"topic_name" text NOT NULL,
	"level" text NOT NULL,
	"title" text NOT NULL,
	"outcomes_json" jsonb NOT NULL,
	"tools_json" jsonb NOT NULL,
	"planned_minutes" integer DEFAULT 60 NOT NULL,
	"active_minutes" integer NOT NULL,
	"questions_correct" integer NOT NULL,
	"questions_total" integer NOT NULL,
	"practice_avg" integer,
	"scenario_score" integer,
	"reflection" text NOT NULL,
	"apply_plan" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lesson_time" (
	"user_id" uuid NOT NULL,
	"lesson_id" uuid NOT NULL,
	"seconds" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lesson_time_user_id_lesson_id_pk" PRIMARY KEY("user_id","lesson_id")
);
--> statement-breakpoint
CREATE TABLE "tool_progress" (
	"user_id" uuid NOT NULL,
	"lesson_id" uuid NOT NULL,
	"tool_index" integer NOT NULL,
	"checks_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"response" text,
	"feedback_json" jsonb,
	"score" integer,
	"completed_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tool_progress_user_id_lesson_id_tool_index_pk" PRIMARY KEY("user_id","lesson_id","tool_index")
);
--> statement-breakpoint
ALTER TABLE "cpd_records" ADD CONSTRAINT "cpd_records_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cpd_records" ADD CONSTRAINT "cpd_records_topic_id_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topics"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cpd_records" ADD CONSTRAINT "cpd_records_lesson_id_cached_lessons_id_fk" FOREIGN KEY ("lesson_id") REFERENCES "public"."cached_lessons"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_time" ADD CONSTRAINT "lesson_time_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_time" ADD CONSTRAINT "lesson_time_lesson_id_cached_lessons_id_fk" FOREIGN KEY ("lesson_id") REFERENCES "public"."cached_lessons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tool_progress" ADD CONSTRAINT "tool_progress_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tool_progress" ADD CONSTRAINT "tool_progress_lesson_id_cached_lessons_id_fk" FOREIGN KEY ("lesson_id") REFERENCES "public"."cached_lessons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "cpd_records_code_unique" ON "cpd_records" USING btree ("code");--> statement-breakpoint
CREATE UNIQUE INDEX "cpd_records_user_lesson_unique" ON "cpd_records" USING btree ("user_id","lesson_id");--> statement-breakpoint
CREATE INDEX "cpd_records_user_idx" ON "cpd_records" USING btree ("user_id");