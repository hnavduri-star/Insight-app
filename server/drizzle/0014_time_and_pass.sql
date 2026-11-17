CREATE TABLE "daily_time" (
	"user_id" uuid NOT NULL,
	"local_day" date NOT NULL,
	"seconds" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "daily_time_user_id_local_day_pk" PRIMARY KEY("user_id","local_day")
);
--> statement-breakpoint
CREATE TABLE "module_assessments" (
	"user_id" uuid NOT NULL,
	"lesson_id" uuid NOT NULL,
	"correct" integer NOT NULL,
	"total" integer NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "module_assessments_user_id_lesson_id_pk" PRIMARY KEY("user_id","lesson_id")
);
--> statement-breakpoint
ALTER TABLE "daily_time" ADD CONSTRAINT "daily_time_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "module_assessments" ADD CONSTRAINT "module_assessments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "module_assessments" ADD CONSTRAINT "module_assessments_lesson_id_cached_lessons_id_fk" FOREIGN KEY ("lesson_id") REFERENCES "public"."cached_lessons"("id") ON DELETE cascade ON UPDATE no action;