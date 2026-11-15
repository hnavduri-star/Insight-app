ALTER TABLE "cached_lessons" ALTER COLUMN "persona" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "profiles" ALTER COLUMN "persona" SET DATA TYPE text;--> statement-breakpoint
-- Map old personas to career levels
UPDATE "profiles" SET "persona" = CASE "persona" WHEN 'leader' THEN 'senior_executive' WHEN 'manager' THEN 'manager' ELSE 'early_career' END WHERE "persona" IS NOT NULL;--> statement-breakpoint
DELETE FROM "cached_lessons" WHERE "persona" NOT IN ('early_career', 'manager', 'senior_executive');--> statement-breakpoint
DROP TYPE "public"."persona";--> statement-breakpoint
CREATE TYPE "public"."persona" AS ENUM('early_career', 'manager', 'senior_executive');--> statement-breakpoint
ALTER TABLE "cached_lessons" ALTER COLUMN "persona" SET DATA TYPE "public"."persona" USING "persona"::"public"."persona";--> statement-breakpoint
ALTER TABLE "profiles" ALTER COLUMN "persona" SET DATA TYPE "public"."persona" USING "persona"::"public"."persona";--> statement-breakpoint
ALTER TABLE "people" ALTER COLUMN "relationship" SET DATA TYPE text;--> statement-breakpoint
UPDATE "people" SET "relationship" = 'other' WHERE "relationship" = 'professor';--> statement-breakpoint
DROP TYPE "public"."relationship";--> statement-breakpoint
CREATE TYPE "public"."relationship" AS ENUM('boss', 'senior_leader', 'colleague', 'direct_report', 'client', 'investor_board', 'partner', 'family', 'friend', 'other');--> statement-breakpoint
ALTER TABLE "people" ALTER COLUMN "relationship" SET DATA TYPE "public"."relationship" USING "relationship"::"public"."relationship";--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "goals" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "topics" ADD COLUMN "description" text;--> statement-breakpoint
-- Single goal -> list of goals, mapped to the new goal names
UPDATE "profiles" SET "goals" = jsonb_build_array(CASE "goal"
  WHEN 'Land a new job' THEN 'Change jobs or careers'
  WHEN 'Lead my team better' THEN 'Lead and develop my team'
  WHEN 'Personal growth' THEN 'Grow personally'
  ELSE "goal" END) WHERE "goal" IS NOT NULL;
