-- Enable Row Level Security on quiz and quiz_item tables.
-- RLS policies use current_setting('app.user_id', true) to identify the
-- requesting user, consistent with the fact table policy.

ALTER TABLE "quiz" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "quiz_rls_policy"
  ON "quiz"
  FOR ALL
  USING (user_id = current_setting('app.user_id', true)::text)
  WITH CHECK (user_id = current_setting('app.user_id', true)::text);

ALTER TABLE "quiz_item" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "quiz_item_rls_policy"
  ON "quiz_item"
  FOR ALL
  USING (user_id = current_setting('app.user_id', true)::text)
  WITH CHECK (user_id = current_setting('app.user_id', true)::text);
