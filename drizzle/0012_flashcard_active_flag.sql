ALTER TABLE "flashcard"
ADD COLUMN IF NOT EXISTS "active" boolean DEFAULT true NOT NULL;
--> statement-breakpoint
UPDATE "flashcard"
SET "active" = true
WHERE "active" IS NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "flashcard_fact_id_active_idx"
ON "flashcard" ("fact_id")
WHERE "active" = true;
--> statement-breakpoint
GRANT UPDATE ON "flashcard" TO recall_app;
