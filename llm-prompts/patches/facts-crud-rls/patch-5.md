# [facts-crud-rls] Patch 5: protectedProcedure and SET LOCAL layer

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
- Patch 4 added tRPC context with session and app user (createContext async, getAppUserByAuthId, Context type with appUser).

## Your Task

**Files to modify:**

- `src/server/trpc/trpc.ts`
- `src/server/effect/db.ts` or new `src/server/effect/request-db.ts`
- Root router: add `me`/`whoami` procedure for testing

**Changes:**

1. Add `protectedProcedure` that runs middleware: if `!ctx.appUser` throw TRPCError UNAUTHORIZED. Otherwise build request-scoped DB layer (get connection from pool or transaction, run `SET LOCAL app.user_id = ctx.appUser.id`, provide Drizzle client for that connection to Effect) and run handler with that layer.
2. Add minimal `me` procedure using protectedProcedure returning `ctx.appUser`.
3. Add tests: unauthenticated call to protected procedure returns 401; authenticated call gets app user.

**Implementation note:** Use `db.transaction()` so the callback gets a single connection; run SET LOCAL (or `set_config('app.user_id', ctx.appUser.id, true)`) in that transaction and provide the transaction client as the Effect Db layer. No need to export `pool`.

## Test Stubs to Add

None - this patch adds and implements tests in the same patch (no prior stub).

## Tests to Unskip and Implement

Add and implement the following tests (Stub Patch = 5, Impl Patch = 5; implement in this patch):

- **Test**: `protectedProcedure > returns 401 when no session`
- **File**: `src/server/trpc/trpc.test.ts` (or auth.test.ts)
- **Action**: Add test that calls a protected procedure without auth; expect TRPCError with code UNAUTHORIZED.

- **Test**: `createContext > returns app user when authenticated` (or equivalent: context includes appUser when session exists)
- **File**: `src/server/trpc/context.test.ts` (or same as above)
- **Action**: Add test that creates context with valid session; expect ctx.appUser to be defined with id.

- **Test**: `me > returns app user when authenticated`
- **File**: `src/server/trpc/routers/me.test.ts` (or same)
- **Action**: Add test that calls `me` with authenticated context; expect app user id to be returned.

Tests should use real DB and the same request-scoped DB layer / SET LOCAL pattern as production so RLS and auth are exercised.

## Git Instructions

- Branch from: `main`
- Branch name: `facts-crud-rls/patch-5-protected-procedure-set-local`
- PR base: `main`

**IMPORTANT: Open a draft PR immediately after your first commit.** Do not wait until implementation is complete. This ensures the PR title format is correct from the start.

After your first commit, run:
```bash
gh pr create --draft --title "[facts-crud-rls] Patch 5: protectedProcedure and SET LOCAL layer" --body "Work in progress" --base main
```

Then continue implementing. When finished:
1. Run `bun test` to verify tests pass
2. Update the PR description with a proper summary
3. Mark the PR as ready for review when complete

## PR Title (CRITICAL)

**You MUST use this EXACT title format:**

`[facts-crud-rls] Patch 5: protectedProcedure and SET LOCAL layer`

Do NOT use conventional commit format (e.g., `feat:`, `fix:`). The bracketed project name and patch number are required for tracking.
