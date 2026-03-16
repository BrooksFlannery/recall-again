# [facts-crud-rls] Patch 1: app_user table and migration

## Problem Statement

The app has no app-level user or fact storage. All domain data would otherwise couple directly to the auth provider's `user` table, making it hard to change or extend auth. There is no row-level isolation for future facts or quizzes, and tRPC context does not expose a resolved app user or support protected procedures. We need an app user table, session → app user resolution (with create-if-missing), a fact table with RLS, and Effect-based fact CRUD behind a protected tRPC API so that the codebase is ready for M2/M3 without half-secured state.

## Solution Summary

Add `app_user` (id, authUserId, timestamps) and `fact` (id, userId, content, timestamps) with DB-side prefixed ID defaults. Enable RLS on `fact` so that policies restrict access by `current_setting('app.user_id')`. Resolve and create app user in **one place only: tRPC context**; set `app.user_id` in a **protectedProcedure** via `SET LOCAL` before running any query so RLS applies. Implement fact CRUD as an Effect service (repository) and tRPC procedures that run in Effect with a request-scoped DB layer that has already executed `SET LOCAL`. Use **drizzle-zod** (`createSelectSchema`) for fact row/output and ad-hoc Zod for create/update input. One migration per patch; tests use Bun and real DB with Effect DI.

## Design Decisions (Non-negotiable)

1. **SET LOCAL only**: We set `app.user_id` in protectedProcedure before any query; RLS on `fact` uses `current_setting('app.user_id')`. No dedicated Postgres role for M1.
2. **One place for resolve/create**: App user is resolved or created only in tRPC context creation, not in middleware.
3. **No title/source on fact in M1**: Fact has id, userId, content, createdAt, updatedAt only.
4. **Prefixed IDs**: DB-side per-table DEFAULT: `'user_' || gen_random_uuid()::text` for app_user.id, `'fact_' || gen_random_uuid()::text` for fact.id. No app-side id helper for these tables.
5. **Effect required**: Fact CRUD and tRPC integration use Effect (Context/Layer, Effect.runPromise). Tests use Effect DI and real DB.
6. **drizzle-zod**: Use `createSelectSchema` from `drizzle-zod` for fact row/output; extend with ad-hoc Zod for create/update input (e.g. content length).
7. **One migration per patch**: Each patch that touches the DB has one migration; each migration is one logical step (app_user, then fact, then RLS).
8. **RLS on fact only**: No RLS on app_user for M1.

## Dependencies Completed

None - this patch has no dependencies.

## Your Task

**Files to modify:**

- `src/server/db/schema-app.ts`
- New migration: `drizzle/NNNN_app_user.sql` (or Drizzle Kit naming)

**Changes:**

1. Add `app_user` table to schema-app: `id` text PK with default `sql\`'user_' || gen_random_uuid()::text\``, `authUserId` text NOT NULL UNIQUE referencing `user.id` (import `user` from auth schema `./schema`), `createdAt`/`updatedAt` timestamptz.
2. Export any relations if needed.
3. Run `bun run db:generate` (or equivalent) to generate migration; ensure the migration creates only the `app_user` table.

**Schema details (from gameplan Required Changes §1):**

- **Table**: `app_user` with:
  - `id` text PK, default `'user_' || gen_random_uuid()::text` (use Drizzle `sql` for default).
  - `authUserId` text NOT NULL UNIQUE, FK to `user.id` (auth schema).
  - `createdAt`, `updatedAt` timestamptz, default now / on update.
- **Migration**: One file that creates `app_user` only. No RLS on `app_user` for M1.

## Test Stubs to Add

None - this patch does not introduce test stubs.

## Tests to Unskip and Implement

None - this patch does not implement tests.

## Git Instructions

- Branch from: `main`
- Branch name: `facts-crud-rls/patch-1-app-user-table`
- PR base: `main`

**IMPORTANT: Open a draft PR immediately after your first commit.** Do not wait until implementation is complete. This ensures the PR title format is correct from the start.

After your first commit, run:
```bash
gh pr create --draft --title "[facts-crud-rls] Patch 1: app_user table and migration" --body "Work in progress" --base main
```

Then continue implementing. When finished:
1. Run `bun test` to verify tests pass
2. Update the PR description with a proper summary
3. Mark the PR as ready for review when complete

## PR Title (CRITICAL)

**You MUST use this EXACT title format:**

`[facts-crud-rls] Patch 1: app_user table and migration`

Do NOT use conventional commit format (e.g., `feat:`, `fix:`). The bracketed project name and patch number are required for tracking.
