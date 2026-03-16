-- Create the application role used for RLS enforcement.
-- protectedProcedure runs SET LOCAL ROLE recall_app so that row-level
-- security policies apply to all fact queries, even when the DB connection
-- uses a superuser (e.g. postgres in local dev/test).

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'recall_app') THEN
    CREATE ROLE recall_app;
  END IF;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON fact TO recall_app;
