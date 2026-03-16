-- Enable Row Level Security on the fact table.
-- RLS policies use current_setting('app.user_id', true) to identify the
-- requesting user. This setting must be applied via SET LOCAL in
-- protectedProcedure before any fact query is executed.

ALTER TABLE "fact" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "fact_rls_policy"
  ON "fact"
  FOR ALL
  USING (user_id = current_setting('app.user_id', true)::text)
  WITH CHECK (user_id = current_setting('app.user_id', true)::text);
