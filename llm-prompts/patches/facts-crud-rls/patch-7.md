# [facts-crud-rls] Patch 7: Implement fact CRUD and unskip tests

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

- Patch 1 added `app_user` table and migration.
- Patch 2 added `fact` table and migration.
- Patch 3 added RLS on `fact`.
- Patch 4 added auth hook and tRPC context with getAppUserByAuthId.
- Patch 5 added protectedProcedure, request-scoped DB layer, and `me` procedure with auth tests.
- Patch 6 added FactRepository (Effect Context/Layer), fact schemas (drizzle-zod + input), fact router with stubbed procedures, and test stubs with `.skip` and `// PENDING: Patch 7` in `src/server/trpc/routers/fact.test.ts`.

## Your Task

**Files to modify:**

- `src/server/effect/fact-repository.ts`
- `src/server/trpc/routers/fact.ts`
- Fact CRUD test file(s) (e.g. `src/server/trpc/routers/fact.test.ts`)

**Changes:**

1. Implement all FactRepository methods: insert with returning (create), select from fact (list, getById), update, delete. Ensure all run in context where `app.user_id` is set so RLS applies. Procedure passes `ctx.appUser.id` into `create(input, appUserId)`.
2. Wire fact router procedures to the repository; remove stubs. Each procedure uses protectedProcedure and runs the Effect with the request-scoped Db layer.
3. Unskip and implement the tests from Patch 6 (remove `.skip` and `// PENDING: Patch 7`); implement test bodies per the stub comments. Ensure tests use real DB and request-scoped layer so RLS is exercised.
4. Optional: add test that sets `app.user_id` to user A, inserts fact, then sets to user B and lists — should get no rows (RLS test).

## Test Stubs to Add

None - this patch does not introduce new stubs.

## Tests to Unskip and Implement

The following tests were added as stubs in Patch 6. Remove `.skip` and `// PENDING: Patch 7`, then implement the test body per the stub comments.

- **Test**: `fact.create > returns new fact with id and content`
- **File**: `src/server/trpc/routers/fact.test.ts`
- **Stub Patch**: 6 (stub already in codebase)
- **Action**: Remove `.skip`, implement: authenticated context, call create with content; assert returned fact has id and content.

- **Test**: `fact.list > returns only current user's facts`
- **File**: `src/server/trpc/routers/fact.test.ts`
- **Stub Patch**: 6
- **Action**: Remove `.skip`, implement: authenticated context, optionally pre-seed facts; assert list returns only current user's facts.

- **Test**: `fact.getById > returns fact when owned, null otherwise`
- **File**: `src/server/trpc/routers/fact.test.ts`
- **Stub Patch**: 6
- **Action**: Remove `.skip`, implement: owned fact returns row; other user's fact id returns null.

- **Test**: `fact.update > updates content when owned`
- **File**: `src/server/trpc/routers/fact.test.ts`
- **Stub Patch**: 6
- **Action**: Remove `.skip`, implement: create fact, call update with new content; assert updated fact returned.

- **Test**: `fact.delete > deletes when owned`
- **File**: `src/server/trpc/routers/fact.test.ts`
- **Stub Patch**: 6
- **Action**: Remove `.skip`, implement: create fact, call delete; assert fact is removed, getById returns null.

Optional:

- **Test**: `fact (RLS) > user B cannot see user A's facts`
- **File**: `fact.test.ts` or `rls.test.ts`
- **Stub Patch**: 6
- **Action**: Remove `.skip`, implement: two app users, insert fact as A; list as B; assert no rows include A's fact.

## Git Instructions

- Branch from: `main`
- Branch name: `facts-crud-rls/patch-7-implement-fact-crud-unskip-tests`
- PR base: `main`

**IMPORTANT: Open a draft PR immediately after your first commit.** Do not wait until implementation is complete. This ensures the PR title format is correct from the start.

After your first commit, run:
```bash
gh pr create --draft --title "[facts-crud-rls] Patch 7: Implement fact CRUD and unskip tests" --body "Work in progress" --base main
```

Then continue implementing. When finished:
1. Run `bun test` to verify all tests pass
2. Update the PR description with a proper summary
3. Mark the PR as ready for review when complete

## PR Title (CRITICAL)

**You MUST use this EXACT title format:**

`[facts-crud-rls] Patch 7: Implement fact CRUD and unskip tests`

Do NOT use conventional commit format (e.g., `feat:`, `fix:`). The bracketed project name and patch number are required for tracking.
