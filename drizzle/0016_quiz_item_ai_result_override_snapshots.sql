ALTER TABLE "quiz_item" ADD COLUMN "ai_result" text;--> statement-breakpoint
ALTER TABLE "quiz_item" ADD COLUMN "review_fibonacci_step_before" integer;--> statement-breakpoint
ALTER TABLE "quiz_item" ADD COLUMN "review_next_review_at_before" timestamp with time zone;--> statement-breakpoint
UPDATE "quiz_item" SET "ai_result" = "result" WHERE "result" IS NOT NULL AND "ai_result" IS NULL;