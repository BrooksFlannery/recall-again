-- Force Row Level Security on quiz and quiz_item so that policies apply to
-- all roles, including the table owner and superusers. Required for
-- SET LOCAL-based RLS to work correctly in tests and application code.

ALTER TABLE "quiz" FORCE ROW LEVEL SECURITY;

ALTER TABLE "quiz_item" FORCE ROW LEVEL SECURITY;
