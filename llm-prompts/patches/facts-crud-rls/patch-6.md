# [facts-crud-rls] Patch 6: Fact repository, schemas, router stubs, test stubs

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
- Patch 3 added RLS on `fact` (migration: enable RLS + policy on `user_id = current_setting('app.user_id', true)::text`).
- Patch 4 added auth hook for app_user creation and tRPC context with session + getAppUserByAuthId.
- Patch 5 added protectedProcedure, request-scoped DB layer with SET LOCAL, and `me` procedure with auth tests.

## Your Task

**Files to modify/create:**

- `src/server/effect/fact-repository.ts` (or `repositories/fact.ts`)
- `src/server/schemas/fact.ts`
- `src/server/trpc/routers/fact.ts`
- `src/server/trpc/root.ts`
- New test file(s) for fact CRUD

**Changes:**

1. Define FactRepository as Effect Context/Layer; implement create/list/getById/update/delete that use `Db` and RLS (no explicit userId in WHERE for list/getById; create receives appUserId from procedure so INSERT includes user_id and satisfies RLS WITH CHECK). Implementation can be stub (e.g. list returns [], getById returns null) so Patch 7 implements the real logic.
2. Add **drizzle-zod** schema for fact row (`createSelectSchema` from `drizzle-zod`); add input schemas for create/update (content with refinements, e.g. min/max length).
3. Add fact router with create, list, getById, update, delete using protectedProcedure; each runs Effect with request-scoped Db layer. Procedures can be stubbed (e.g. list returns [], getById returns null) so Patch 7 wires to repository.
4. Register fact router on appRouter.
5. Add test stubs with `.skip` and `// PENDING: Patch 7` for the tests listed in "Test Stubs to Add" below. Document setup and expectations in comments.

## Test Stubs to Add

Add the following `.skip` tests to `src/server/trpc/routers/fact.test.ts` (or equivalent). Each with `// PENDING: Patch 7` and comments describing setup and expectations:

- **fact.create > returns new fact with id and content** — setup: authenticated context, call create with content; expectation: returns fact with id and content.
- **fact.list > returns only current user's facts** — setup: authenticated context, optionally pre-seed facts; expectation: returns only facts for current app user.
- **fact.getById > returns fact when owned, null otherwise** — setup: authenticated context; expectation: owned fact returns row, other user's fact id returns null.
- **fact.update > updates content when owned** — setup: create fact, call update with new content; expectation: returns updated fact.
- **fact.delete > deletes when owned** — setup: create fact, call delete; expectation: fact is removed, getById returns null.

Optional (same file or rls.test.ts):

- **fact (RLS) > user B cannot see user A's facts** — setup: two app users, insert fact as A; expectation: list as B returns no rows including A's fact.

## Tests to Unskip and Implement

None - this patch does not implement tests. Patch 7 will unskip and implement the tests above.

## Git Instructions

- Branch from: `main`
- Branch name: `facts-crud-rls/patch-6-fact-repository-schemas-router-stubs`
- PR base: `main`

**IMPORTANT: Open a draft PR immediately after your first commit.** Do not wait until implementation is complete. This ensures the PR title format is correct from the start.

After your first commit, run:
```bash
gh pr create --draft --title "[facts-crud-rls] Patch 6: Fact repository, schemas, router stubs, test stubs" --body "Work in progress" --base main
```

Then continue implementing. When finished:
1. Run `bun test` to verify tests pass (stubbed tests remain skipped)
2. Update the PR description with a proper summary
3. Mark the PR as ready for review when complete

## PR Title (CRITICAL)

**You MUST use this EXACT title format:**

`[facts-crud-rls] Patch 6: Fact repository, schemas, router stubs, test stubs`

Do NOT use conventional commit format (e.g., `feat:`, `fix:`). The bracketed project name and patch number are required for tracking.
