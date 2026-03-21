-- The app connection must be able to SET LOCAL ROLE recall_app (see protectedProcedure
-- in src/server/trpc/trpc.ts). Superusers can switch roles without this; managed Postgres
-- users (Neon, Supabase, Vercel Postgres, etc.) need explicit membership.
--
-- If migrations run as a different DB user than the runtime DATABASE_URL user, run once
-- as a superuser: GRANT recall_app TO <your_app_database_user>;

GRANT recall_app TO CURRENT_USER;
