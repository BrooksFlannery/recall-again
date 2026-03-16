-- Force Row Level Security on fact so that the policy applies to all roles,
-- including the table owner and superusers. Required for SET LOCAL-based RLS
-- to work correctly in tests and application code.

ALTER TABLE "fact" FORCE ROW LEVEL SECURITY;
