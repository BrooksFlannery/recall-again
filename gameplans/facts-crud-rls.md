# Gameplan: facts-crud-rls

## Workstream

- **Workstream**: Recall — Facts & Quizzes
- **Milestone**: 1 (facts-crud-rls)
- **Prior milestones**: None
- **Unlocks**: M2 (ai-question-generation), M3a (quiz-data-model-and-scheduling)

## Problem Statement

The app has no app-level user or fact storage. All domain data would otherwise couple directly to the auth provider’s `user` table, making it hard to change or extend auth. There is no row-level isolation for future facts or quizzes, and tRPC context does not expose a resolved app user or support protected procedures. We need an app user table, a fact table with RLS, and Effect-based fact CRUD behind a protected tRPC API so that the codebase is ready for M2/M3 without half-secured state.

## Solution Summary

Add `app_user` (id, authUserId, timestamps) and `fact` (id, userId, content, timestamps) with DB-side prefixed ID defaults. Enable RLS on `fact` so that policies restrict access by `current_setting(‘app.user_id’)`. Create `app_user` exactly once via a **better-auth `databaseHooks.user.create.after` hook** in `auth.ts`; tRPC context only reads (SELECT) the existing row. Set `app.user_id` in a **protectedProcedure** via `SET LOCAL` before running any query so RLS applies. Implement fact CRUD as an Effect service (repository) and tRPC procedures that run in Effect with a request-scoped DB layer that has already executed `SET LOCAL`. Use **drizzle-zod** (`createSelectSchema`) for fact row/output and ad-hoc Zod for create/update input. One migration per patch; tests use Bun and real DB with Effect DI.

## Mergability Strategy

### Feature Flagging Strategy

**No feature flag.** This milestone is foundational (tables, auth in context, RLS, CRUD). New procedures are additive; existing `ping` remains public. No need to gate behind a flag.

### Patch Ordering Strategy

- **Early ([INFRA])**: Migrations and Drizzle schema for `app_user`, then `fact`, then RLS. No observable behavior change.
- **Middle ([INFRA])**: tRPC context that resolves/creates app user; then protectedProcedure + request-scoped DB layer that runs `SET LOCAL`; then FactRepository, fact schemas, and fact router with stubbed procedures + test stubs with `.skip`.
- **Late ([BEHAVIOR])**: Auth behavior (protectedProcedure + whoami for tests); then implement fact CRUD and unskip tests.

## Current State Analysis

| Area | Current state |
|------|----------------|
| **tRPC context** | `createContext: () => ({})` in `app/api/trpc/[trpc]/route.ts`. No request passed; no session or user. |
| **tRPC procedures** | Only `publicProcedure`. No `protectedProcedure`. |
| **Schema (app)** | `src/server/db/schema-app.ts`: only `ping` table. No `app_user`, no `fact`. |
| **Schema (auth)** | `src/server/db/schema.ts`: Better Auth `user`, `session`, `account`, `verification`. Do not change. |
| **DB client** | `src/server/db/index.ts`: single `db` (Drizzle + pool), full schema. No request-scoped connection or `SET LOCAL`. |
| **Effect** | `src/server/effect/db.ts`: `Db` tag, `DbLive` with global `db`. Used by `ping` router. No app-user-scoped layer. |
| **Migrations** | `drizzle.config.ts` → `./drizzle`; schema from `schema.ts` + `schema-app.ts`. No migrations for app_user/fact/RLS yet. |
| **Auth** | `src/server/auth.ts`: Better Auth with Drizzle adapter. Session available via `auth.api.getSession({ headers })` when given request headers. |

## Required Changes

### 1. App user table (Drizzle + migration)

- **File**: `src/server/db/schema-app.ts` (add), new migration under `drizzle/`.
- **Table**: `app_user` with:
  - `id` text PK, default `'user_' || gen_random_uuid()::text` (use Drizzle `sql` for default).
  - `authUserId` text NOT NULL UNIQUE, FK to `user.id` (auth schema).
  - `createdAt`, `updatedAt` timestamptz, default now / on update.
- **Migration**: One file that creates `app_user`. No RLS on `app_user` for M1.

### 2. Fact table (Drizzle + migration)

- **File**: `src/server/db/schema-app.ts` (add), new migration under `drizzle/`.
- **Table**: `fact` with:
  - `id` text PK, default `'fact_' || gen_random_uuid()::text`.
  - `userId` text NOT NULL, FK to `app_user.id`.
  - `content` text NOT NULL.
  - `createdAt`, `updatedAt` timestamptz.
- **Migration**: One file that creates `fact`. No RLS in this migration (next patch).

### 3. RLS on fact (migration only)

- **File**: New migration under `drizzle/`.
- **Migration**: Enable RLS on `fact`; add policy so SELECT/INSERT/UPDATE/DELETE only where `fact.user_id = current_setting('app.user_id', true)::text`. Use `USING` and `WITH CHECK` as needed. Document that RLS depends on `app.user_id` being set (e.g. in protectedProcedure).

### 4. tRPC context: session → app user (read only)

- **File**: `src/server/auth.ts`: add `databaseHooks.user.create.after` that inserts a new `app_user` row (`authUserId = user.id`). This is the only place `app_user` is created.
- **File**: `app/api/trpc/[trpc]/route.ts`: pass `createContext: async (opts) => { ... }` using `opts.req` (FetchCreateContextFnOptions). Call `auth.api.getSession({ headers: opts.req.headers })`. If no session, return `{ appUser: null }`. If session, SELECT `app_user` by `authUserId = session.user.id` and return `{ appUser }`.
- **File**: `src/server/trpc/trpc.ts`: extend `Context` type to `{ appUser: { id: string } | null }`. Export `Context` type. Keep `publicProcedure`; do not add protectedProcedure yet.

```ts
// Context type (trpc.ts)
export type Context = {
  appUser: { id: string } | null;
};
```

- **File**: New helper `src/server/trpc/app-user.ts`: read app user by auth user id. Signature:

```ts
const getAppUserByAuthId = (db: DrizzleClient, authUserId: string): Promise<{ id: string } | null>
```

### 5. protectedProcedure and SET LOCAL layer

- **File**: `src/server/trpc/trpc.ts`: add `protectedProcedure` that uses `t.procedure` and a middleware. Middleware: if `!ctx.appUser`, throw `TRPCError` with code `UNAUTHORIZED`. Otherwise, run the handler in an environment where the DB client has executed `SET LOCAL app.user_id = ctx.appUser.id` for the current connection/transaction.
- **Implementation note**: Use a request-scoped DB layer for protected procedures: obtain a connection from the pool (or start a transaction), run `SET LOCAL app.user_id = ctx.appUser.id` (or `set_config('app.user_id', ctx.appUser.id, true)`), then provide a Drizzle client bound to that connection to Effect. Procedure handler receives this layer and runs `Effect.runPromise(effect.pipe(Effect.provide(requestScopedDbLayer)))`.
- **File**: Add a minimal procedure (e.g. `me` or `whoami`) on a new or existing router that uses `protectedProcedure` and returns `ctx.appUser`, so auth and context can be tested.

### 6. Fact repository, schemas, router stubs, test stubs

- **Files**: New `src/server/effect/fact-repository.ts` (or under `repositories/`), new `src/server/schemas/fact.ts`, new `src/server/trpc/routers/fact.ts`, and test files.
- **FactRepository**: Effect service (Context/Layer) that uses `Db` and implements:
  - `create(input: { content: string }, appUserId: string): Effect<FactRow, Error>` — procedure passes `ctx.appUser.id` so INSERT includes `user_id` and satisfies RLS WITH CHECK.
  - `list(): Effect<FactRow[], Error>`
  - `getById(id: string): Effect<FactRow | null, Error>`
  - `update(id: string, input: { content: string }): Effect<FactRow, Error>`
  - `delete(id: string): Effect<void, Error>`
  - All rely on RLS (no explicit `userId` in WHERE for list/getById). For `create`, the **client** does not send `userId`; the **procedure** passes `ctx.appUser.id` into the repository so the INSERT includes `user_id` (required for the row to satisfy RLS WITH CHECK).
- **Schemas**: Use **drizzle-zod** (`createSelectSchema`) for fact row/output. For create/update input use Zod (e.g. `content` string, min/max length or refinements as needed).
- **Router**: `fact.create`, `fact.list`, `fact.getById`, `fact.update`, `fact.delete` using `protectedProcedure`, each calling the repository inside the request-scoped Effect layer. Initially stubbed (e.g. return empty list, or throw "not implemented") so that Patch 7 only implements repository + unskips tests.
- **Test stubs**: Add tests with `.skip` and `// PENDING: Patch 7` for: fact.create returns new fact; fact.list returns only current user's facts; fact.getById returns fact when owned else null; fact.update / fact.delete succeed when owned. Document expectations in comments.

### 7. Implement fact CRUD and unskip tests

- **Files**: `src/server/effect/fact-repository.ts`, `src/server/trpc/routers/fact.ts`, and the fact test file(s).
- **Changes**: Implement repository methods (insert/select/update/delete against `fact` table). Wire router procedures to repository. Remove `.skip` and implement test bodies; ensure tests run with real DB and request-scoped layer so RLS is exercised. Optional: add test that sets `app.user_id` to user A, inserts fact, then sets to user B and lists — should get no rows.

## Acceptance Criteria

- [ ] `app_user` table exists with id (prefixed), authUserId (FK to auth user, unique), createdAt, updatedAt.
- [ ] `app_user` is created exactly once via `databaseHooks.user.create.after` when a new auth user is created.
- [ ] On each authenticated request, tRPC context resolves session → auth user → app user (SELECT only; never creates).
- [ ] `fact` table exists with id (prefixed), userId (FK to app_user.id), content, createdAt, updatedAt.
- [ ] RLS enabled on `fact`; policies restrict SELECT/INSERT/UPDATE/DELETE by `current_setting('app.user_id')`; app code does not add explicit `WHERE userId = ?` for isolation.
- [ ] tRPC context includes current app user (or null); protectedProcedure requires auth and sets `app.user_id` before running queries.
- [ ] tRPC procedures: fact create, list, getById, update, delete; all use protectedProcedure and rely on RLS.
- [ ] Migrations for app_user, fact, and RLS; docs or comments on running migrations and RLS dependency on session variable.

## Open Questions

- None remaining; SCRATCH.md and workstream locked SET LOCAL only (no dedicated DB role), tRPC-only resolve/create, and DB-side prefixed IDs.

## Explicit Opinions

1. **SET LOCAL only**: We set `app.user_id` in protectedProcedure before any query; RLS on `fact` uses `current_setting('app.user_id')`. No dedicated Postgres role for M1.
2. **app_user created in auth hook, read in tRPC context**: `app_user` is created exactly once via `databaseHooks.user.create.after` in `auth.ts`. tRPC context only SELECTs — no create-if-missing on the hot path.
3. **No title/source on fact in M1**: Fact has id, userId, content, createdAt, updatedAt only.
4. **Prefixed IDs**: DB-side per-table DEFAULT: `'user_' || gen_random_uuid()::text` for app_user.id, `'fact_' || gen_random_uuid()::text` for fact.id. No app-side id helper for these tables.
5. **Effect required**: Fact CRUD and tRPC integration use Effect (Context/Layer, Effect.runPromise). Tests use Effect DI and real DB.
6. **drizzle-zod**: Use `createSelectSchema` from `drizzle-zod` for fact row/output; extend with ad-hoc Zod for create/update input (e.g. content length).
7. **One migration per patch**: Each patch that touches the DB has one migration; each migration is one logical step (app_user, then fact, then RLS).
8. **RLS on fact only**: No RLS on app_user for M1.

## Patches

### Patch 1 [INFRA]: app_user table and migration

**Files to modify:**

- `src/server/db/schema-app.ts`
- New migration: `drizzle/NNNN_app_user.sql` (or Drizzle Kit naming)

**Changes:**

1. Add `app_user` table to schema-app: `id` text PK with default `sql\`'user_' || gen_random_uuid()::text\``, `authUserId` text NOT NULL UNIQUE referencing `user.id`, `createdAt`/`updatedAt` timestamptz.
2. Export any relations if needed.
3. Generate and add migration that creates `app_user` only.

### Patch 2 [INFRA]: fact table and migration

**Files to modify:**

- `src/server/db/schema-app.ts`
- New migration

**Changes:**

1. Add `fact` table: `id` text PK default `sql\`'fact_' || gen_random_uuid()::text\``, `userId` text NOT NULL FK to `app_user.id`, `content` text NOT NULL, `createdAt`/`updatedAt` timestamptz.
2. Generate and add migration that creates `fact` only.

### Patch 3 [INFRA]: RLS on fact

**Files to modify:**

- New migration only (raw SQL or Drizzle migration that enables RLS and adds policy)

**Changes:**

1. Migration: `ALTER TABLE fact ENABLE ROW LEVEL SECURITY`.
2. Add policy: FOR ALL TO current role USING / WITH CHECK `(user_id = current_setting('app.user_id', true)::text)` (adjust column name if using camelCase in DB: `userId` → `user_id` per Drizzle convention).
3. Document in migration comment or README that RLS requires `app.user_id` to be set (e.g. in protectedProcedure).

### Patch 4 [INFRA]: tRPC context with session and app user

**Files to modify:**

- `src/server/auth.ts`
- `app/api/trpc/[trpc]/route.ts`
- `src/server/trpc/trpc.ts`
- New helper: `src/server/trpc/app-user.ts`

**Changes:**

1. Add `databaseHooks.user.create.after` to `auth.ts`: insert `app_user` row on auth user creation.
2. Change `createContext` to async and accept `opts` from fetch adapter; use `auth.api.getSession({ headers: opts.req.headers })`. If no session, return `{ appUser: null }`. If session, SELECT `app_user` by `session.user.id`, return `{ appUser: { id } }`.
3. Update `Context` type in trpc.ts to `{ appUser: { id: string } | null }`.
4. Implement `getAppUserByAuthId(db, authUserId)` that selects by authUserId and returns `{ id }` or `null`.

### Patch 5 [BEHAVIOR]: protectedProcedure and SET LOCAL layer

**Files to modify:**

- `src/server/trpc/trpc.ts`
- `src/server/effect/db.ts` or new `src/server/effect/request-db.ts`
- Root router: add `me`/`whoami` procedure for testing

**Changes:**

1. Add `protectedProcedure` that runs middleware: if `!ctx.appUser` throw TRPCError UNAUTHORIZED. Otherwise build request-scoped DB layer (get connection from pool or transaction, run `SET LOCAL app.user_id = ctx.appUser.id`, provide Drizzle client for that connection to Effect) and run handler with that layer.
2. Add minimal `me` procedure using protectedProcedure returning `ctx.appUser`.
3. Add tests: unauthenticated call to protected procedure returns 401; authenticated call gets app user; first request creates app_user row.

### Patch 6 [INFRA]: Fact repository, schemas, router stubs, test stubs

**Files to modify/create:**

- `src/server/effect/fact-repository.ts` (or `repositories/fact.ts`)
- `src/server/schemas/fact.ts`
- `src/server/trpc/routers/fact.ts`
- `src/server/trpc/root.ts`
- New test file(s) for fact CRUD

**Changes:**

1. Define FactRepository as Effect Context/Layer; implement create/list/getById/update/delete that use `Db` and RLS (no explicit userId in WHERE for list/getById; create uses session variable via RLS).
2. Add zod-drizzle schema for fact row; add input schemas for create/update (content with refinements).
3. Add fact router with create, list, getById, update, delete using protectedProcedure; each runs Effect with request-scoped Db layer; implementation can be stub (e.g. list returns [], getById returns null) so Patch 7 implements.
4. Register fact router on appRouter.
5. Add test stubs with `.skip` and `// PENDING: Patch 7` for: create returns new fact; list returns only current user's facts; getById returns fact when owned; update/delete succeed when owned. Introduces test stubs per Test Map.

### Patch 7 [BEHAVIOR]: Implement fact CRUD and unskip tests

**Files to modify:**

- `src/server/effect/fact-repository.ts`
- `src/server/trpc/routers/fact.ts`
- Fact CRUD test file(s)

**Changes:**

1. Implement all FactRepository methods (insert with returning, select from fact, update, delete). Ensure all run in context where `app.user_id` is set so RLS applies.
2. Wire fact router procedures to repository; remove stubs.
3. Unskip and implement tests from Patch 6; ensure they use real DB and Effect DI. Optional: add RLS test (user A's fact not visible to user B).

## Test Map

| Test Name | File | Stub Patch | Impl Patch |
|-----------|------|------------|------------|
| protectedProcedure > returns 401 when no session | src/server/trpc/trpc.test.ts (or auth.test.ts) | 5 | 5 |
| createContext > creates app_user on first authenticated request | src/server/trpc/context.test.ts (or same) | 5 | 5 |
| me > returns app user when authenticated | src/server/trpc/routers/me.test.ts (or same) | 5 | 5 |
| fact.create > returns new fact with id and content | src/server/trpc/routers/fact.test.ts | 6 | 7 |
| fact.list > returns only current user's facts | src/server/trpc/routers/fact.test.ts | 6 | 7 |
| fact.getById > returns fact when owned, null otherwise | src/server/trpc/routers/fact.test.ts | 6 | 7 |
| fact.update > updates content when owned | src/server/trpc/routers/fact.test.ts | 6 | 7 |
| fact.delete > deletes when owned | src/server/trpc/routers/fact.test.ts | 6 | 7 |

Optional (same file or RLS-specific):

| fact (RLS) > user B cannot see user A's facts | fact.test.ts or rls.test.ts | 6 | 7 |

## Dependency Graph

```
- Patch 1 [INFRA] -> []
- Patch 2 [INFRA] -> [1]
- Patch 3 [INFRA] -> [2]
- Patch 4 [INFRA] -> [1]
- Patch 5 [BEHAVIOR] -> [4]
- Patch 6 [INFRA] -> [3, 5]
- Patch 7 [BEHAVIOR] -> [6]
```

**Mergability insight**: 5 of 7 patches are `[INFRA]` and can ship without changing observable behavior until Patch 5 (auth) and Patch 7 (fact CRUD). Patches 1–4 and 6 are non-behavioral.

## Mergability Checklist

- [x] Feature flag strategy documented (not needed)
- [x] Early patches contain only non-functional changes ([INFRA])
- [x] Test stubs with `.skip` in Patch 6; auth tests in Patch 5
- [x] Test implementations co-located with code (Patch 5 and 7)
- [x] Test Map complete with Stub/Impl patches
- [x] [BEHAVIOR] patches minimal (5: auth; 7: fact CRUD)
- [x] Dependency graph: INFRA early, BEHAVIOR late
- [x] Each BEHAVIOR patch justified (auth and CRUD cannot be gated)
