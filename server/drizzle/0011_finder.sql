CREATE TABLE "finder_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"answers_json" jsonb NOT NULL,
	"heading_scores_json" jsonb NOT NULL,
	"topics_json" jsonb NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "finder_results" ADD CONSTRAINT "finder_results_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "finder_results_user_idx" ON "finder_results" USING btree ("user_id","created_at");