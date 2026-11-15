ALTER TABLE "topic_progress" ADD COLUMN "quiz_completed_at" timestamp with time zone;--> statement-breakpoint
-- Learners who already finished a quiz with any correct answers count as having taken it.
UPDATE "topic_progress" SET "quiz_completed_at" = now() WHERE "quiz_correct" > 0;
