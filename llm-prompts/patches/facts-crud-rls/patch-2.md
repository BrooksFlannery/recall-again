# [facts-crud-rls] Patch 2: fact table and migration

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

- Patch 1 added `app_user` table and migration in `src/server/db/schema-app.ts` and drizzle.

## Your Task

**Files to modify:**

- `src/server/db/schema-app.ts`
- New migration

**Changes:**

1. Add `fact` table: `id` text PK default `sql\`'fact_' || gen_random_uuid()::text\``, `userId` text NOT NULL FK to `app_user.id`, `content` text NOT NULL, `createdAt`/`updatedAt` timestamptz. Use explicit `text("user_id")` for the userId column so the DB column is `user_id` (for RLS policy in Patch 3).
2. Generate and add migration that creates `fact` only. No RLS in this migration (next patch).

**Schema details (from gameplan Required Changes §2):**

- **Table**: `fact` with:
  - `id` text PK, default `'fact_' || gen_random_uuid()::text`.
  - `userId` text NOT NULL, FK to `app_user.id` (define as `text("user_id")` so DB column is `user_id`).
  - `content` text NOT NULL.
  - `createdAt`, `updatedAt` timestamptz.
- **Migration**: One file that creates `fact` only. No RLS in this migration (Patch 3).

## Test Stubs to Add

None - this patch does not introduce test stubs.

## Tests to Unskip and Implement

None - this patch does not implement tests.

## Git Instructions

- Branch from: `main`
- Branch name: `facts-crud-rls/patch-2-fact-table`
- PR base: `main`

**IMPORTANT: Open a draft PR immediately after your first commit.** Do not wait until implementation is complete. This ensures the PR title format is correct from the start.

After your first commit, run:
```bash
gh pr create --draft --title "[facts-crud-rls] Patch 2: fact table and migration" --body "Work in progress" --base main
```

Then continue implementing. When finished:
1. Run `bun test` to verify tests pass
2. Update the PR description with a proper summary
3. Mark the PR as ready for review when complete

## PR Title (CRITICAL)

**You MUST use this EXACT title format:**

`[facts-crud-rls] Patch 2: fact table and migration`

Do NOT use conventional commit format (e.g., `feat:`, `fix:`). The bracketed project name and patch number are required for tracking.
