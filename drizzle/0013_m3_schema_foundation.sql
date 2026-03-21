-- M3-pre: fact_review_state, quiz.scheduled_for, quiz_item result/answered_at,
-- RLS/grants, backfill, partial unique index, trigger for new facts.

CREATE TABLE "fact_review_state" (
  "user_id" text NOT NULL REFERENCES "app_user"("id") ON DELETE CASCADE,
  "fact_id" text NOT NULL REFERENCES "fact"("id") ON DELETE CASCADE,
  "next_review_at" timestamp with time zone NOT NULL,
  "fibonacci_step_index" integer DEFAULT 0 NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY ("user_id", "fact_id")
);
--> statement-breakpoint
CREATE INDEX "fact_review_state_user_next_review_idx" ON "fact_review_state" ("user_id", "next_review_at");
--> statement-breakpoint
ALTER TABLE "quiz" ADD COLUMN "scheduled_for" date;
--> statement-breakpoint
CREATE UNIQUE INDEX "quiz_scheduled_user_day_unique" ON "quiz" ("user_id", "scheduled_for") WHERE "mode" = 'scheduled';
--> statement-breakpoint
ALTER TABLE "quiz_item" ADD COLUMN "result" text;
--> statement-breakpoint
ALTER TABLE "quiz_item" ADD COLUMN "answered_at" timestamp with time zone;
--> statement-breakpoint
INSERT INTO "fact_review_state" ("user_id", "fact_id", "next_review_at", "fibonacci_step_index", "updated_at")
SELECT
  "user_id",
  "id",
  (date_trunc('day', timezone('utc', now())) + interval '1 day')::timestamptz,
  0,
  now()
FROM "fact";
--> statement-breakpoint
ALTER TABLE "fact_review_state" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "fact_review_state" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "fact_review_state_rls_policy"
  ON "fact_review_state"
  FOR ALL
  USING (user_id = current_setting('app.user_id', true)::text)
  WITH CHECK (user_id = current_setting('app.user_id', true)::text);
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON "fact_review_state" TO recall_app;
--> statement-breakpoint
GRANT UPDATE ON "quiz_item" TO recall_app;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION fact_review_state_on_fact_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO fact_review_state (user_id, fact_id, next_review_at, fibonacci_step_index, updated_at)
  VALUES (
    NEW.user_id,
    NEW.id,
    (date_trunc('day', timezone('utc', now())) + interval '1 day')::timestamptz,
    0,
    now()
  );
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER fact_review_state_after_fact_insert
  AFTER INSERT ON "fact"
  FOR EACH ROW
  EXECUTE FUNCTION fact_review_state_on_fact_insert();
