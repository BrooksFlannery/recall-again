# [facts-crud-rls] Patch 3: RLS on fact

## Problem Statement

The app has no app-level user or fact storage. All domain data would otherwise couple directly to the auth provider's `user` table, making it hard to change or extend auth. There is no row-level isolation for future facts or quizzes, and tRPC context does not expose a resolved app user or support protected procedures. We need an app user table, a fact table with RLS, and Effect-based fact CRUD behind a protected tRPC API so that the codebase is ready for M2/M3 without half-secured state.

## Solution Summary

Add `app_user` (id, authUserId, timestamps) and `fact` (id, userId, content, timestamps) with DB-side prefixed ID defaults. Enable RLS on `fact` so that policies restrict access by `current_setting('app.user_id')`. Create `app_user` exactly once via a **better-auth `databaseHooks.user.create.after` hook** in `auth.ts`; tRPC context only reads (SELECT) the existing row. Set `app.user_id` in a **protectedProcedure** via `SET LOCAL` before running any query so RLS applies. Implement fact CRUD as an Effect service (repository) and tRPC procedures that run in Effect with a request-scoped DB layer that has already executed `SET LOCAL`. Use **drizzle-zod** (`createSelectSchema`) for fact row/output and ad-hoc Zod for create/update input. One migration per patch; tests use Bun and real DB with Effect DI.

## Design Decisions (Non-negotiable)

1. **SET LOCAL only**: We set `app.user_id` in protectedProcedure before any query; RLS on `fact` uses `current_setting('app.user_id')`. No dedicated Postgres role for M1.
2. **app_user created in auth hook, read in tRPC context**: `app_user` is created exactly once via `databaseHooks.user.create.after` in `auth.ts`. tRPC context only SELECTs — no create-if-missing on the hot path.
3. **No title/source on fact in M1**: Fact has id, userId, content, createdAt, updatedAt only.
4. **Prefixed IDs**: DB-side per-table DEFAULT: `'user_' || gen_random_uuid()::text` for app_user.id, `'fact_' || gen_random_uuid()::text` for fact.id. No app-side id helper for these tables.
5. **Effect required**: Fact CRUD and tRPC integration use Effect (Context/Layer, Effect.runPromise). Tests use Effect DI and real DB.
6. **drizzle-zod**: Use `createSelectSchema` from `drizzle-zod` for fact row/output; extend with ad-hoc Zod for create/update input (e.g. content length).
7. **One migration per patch**: Each patch that touches the DB has one migration; each migration is one logical step (app_user, then fact, then RLS).
8. **RLS on fact only**: No RLS on app_user for M1.

## Dependencies Completed

- Patch 1 added `app_user` table and migration in `src/server/db/schema-app.ts` and drizzle.
- Patch 2 added `fact` table and migration in `src/server/db/schema-app.ts` and drizzle.

## Your Task

**Files to modify:**

- New migration only (raw SQL or Drizzle migration that enables RLS and adds policy)

**Changes:**

1. Migration: `ALTER TABLE fact ENABLE ROW LEVEL SECURITY`.
2. Add policy: FOR ALL TO current role USING / WITH CHECK `(user_id = current_setting('app.user_id', true)::text)`. Use the actual DB column name (`user_id` if fact table uses `text("user_id")` in Drizzle).
3. Document in migration comment or README that RLS requires `app.user_id` to be set (e.g. in protectedProcedure).

**Note:** Drizzle Kit typically does not emit RLS; use a raw SQL migration file for `ALTER TABLE fact ENABLE ROW LEVEL SECURITY` and the CREATE POLICY statement.

## Test Stubs to Add

None - this patch does not introduce test stubs.

## Tests to Unskip and Implement

None - this patch does not implement tests.

## Git Instructions

- Branch from: `main`
- Branch name: `facts-crud-rls/patch-3-rls-on-fact`
- PR base: `main`

**IMPORTANT: Open a draft PR immediately after your first commit.** Do not wait until implementation is complete. This ensures the PR title format is correct from the start.

After your first commit, run:
```bash
gh pr create --draft --title "[facts-crud-rls] Patch 3: RLS on fact" --body "Work in progress" --base main
```

Then continue implementing. When finished:
1. Run `bun test` to verify tests pass
2. Update the PR description with a proper summary
3. Mark the PR as ready for review when complete

## PR Title (CRITICAL)

**You MUST use this EXACT title format:**

`[facts-crud-rls] Patch 3: RLS on fact`

Do NOT use conventional commit format (e.g., `feat:`, `fix:`). The bracketed project name and patch number are required for tracking.
