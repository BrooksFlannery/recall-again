# Gameplan: nextjs-effect-trpc-drizzle-boilerplate

## Project Name

`nextjs-effect-trpc-drizzle-boilerplate`

## Problem Statement

We need a production-ready Next.js boilerplate that uses Effect TS for business logic and error handling, tRPC for type-safe API, Drizzle for the database, Zod (including zod-drizzle) for validation and schema derivation, and **Better Auth** for authentication. The repository currently has no application code—only agent/skill assets—so we are standing up the full stack from scratch. Deciding auth up front avoids creating redundant or useless tables; we use the Better Auth CLI to generate the exact Drizzle schema required.

## Solution Summary

Scaffold a Next.js App Router project, then add dependencies and configuration for Effect, tRPC (with Next.js server adapters), Drizzle (with a driver and migration tooling), Zod, zod-drizzle, and **Better Auth**. **Database**: PostgreSQL only—standard Postgres, nothing fancy. Local dev runs against a Postgres container via Docker; production uses Neon Postgres. **Auth**: Use Better Auth with the Drizzle adapter. Use the Better Auth CLI (`npx auth@latest generate`) to generate the required Drizzle schema (user, session, account, verification, plus any plugin tables) so we don’t hand-roll or duplicate auth tables; integrate the generated schema into our Drizzle setup. Introduce a minimal folder layout (server/routers, server/db, server/schemas, auth, shared types) and wire one example tRPC procedure that uses Effect and Drizzle; mount Better Auth at `/api/auth/*`. Copy relevant docs into `docs/` with subfolders per technology (e.g. `docs/betterauth/`, `docs/effect/`). All app code will live at the repo root.

## Mergability Strategy

### Feature Flagging Strategy

**No feature flags.** This is net-new boilerplate with no existing behavior to gate. Each patch adds either infra or a single, small behavior (e.g. one health/probe route).

### Patch Ordering Strategy

- **Early** (`[INFRA]`): Package init, deps, config files, folder structure, Drizzle schema + migrations, tRPC router skeleton, Effect context/setup.
- **Middle** (`[INFRA]` / `[GATED]`): tRPC API route handler, client provider, one example procedure (e.g. health or a trivial DB read) using Effect + Drizzle.
- **Late** (`[BEHAVIOR]`): Wire the example procedure to the UI (single page or component) so the stack is demonstrably working.

## Current State Analysis

- **Repo**: Git repo at `recall-again` with no commits on main; only `.agents/` directory (skills, rules, gameplans). No `package.json`, no `src/`, no `app/`, no existing Next.js or API code.
- **Target**: Next.js (App Router), Effect TS, tRPC, Drizzle, Zod, zod-drizzle, Better Auth (Drizzle adapter, CLI-generated schema), with one working example (e.g. health check or one DB-backed tRPC procedure and a minimal UI); `docs/betterauth/` and `docs/effect/` with copied reference docs.

## Required Changes

### 1. Package and dependency layout

- **Create** `package.json` with:
  - `next`, `react`, `react-dom` (Next.js 15+)
  - `@effect/platform`, `effect` (Effect TS)
  - `@trpc/server`, `@trpc/client`, `@trpc/react-query`, `@trpc/next` (or `@trpc/server/adapters/next` per tRPC v11)
  - `drizzle-orm`, `drizzle-kit`, `pg` (PostgreSQL driver)
  - `zod`, `zod-drizzle` (or `drizzle-zod` depending on package name in use)
  - `@tanstack/react-query`
  - `better-auth` (Drizzle adapter via `better-auth/adapters/drizzle`)
  - TypeScript types: `@types/node`, `@types/pg`, `@types/react`, `@types/react-dom` (if not bundled)
- **Create** `tsconfig.json` (and optionally `tsconfig.node.json`) with strict mode, path aliases (`@/` → `./src` or `./app`), and compatibility with Next.js and Effect.

### 2. Next.js configuration

- **Create** `next.config.ts` (or `.js`) with minimal settings (no experimental flags unless required for tRPC/Effect).

### 3. Drizzle configuration and schema (auth via Better Auth CLI)

- **Create** `drizzle.config.ts` pointing to schema file(s) and migration output (e.g. `drizzle/`), dialect `postgresql`.
- **Auth schema**: Create a minimal Better Auth config (e.g. `src/server/auth.ts` or `lib/auth.ts`) that uses the Drizzle adapter with `provider: "pg"`. Run **Better Auth CLI** to generate the required schema: `npx auth@latest generate --config <path-to-auth-config> --output src/server/db/schema.ts` (or merge CLI output into existing schema). The CLI generates the exact tables Better Auth needs (user, session, account, verification; plugins add more). Do not hand-roll auth tables.
- **Create** or merge into `src/server/db/schema.ts`: the CLI-generated auth schema; optionally one small app table (e.g. `health` or `ping`) for the example tRPC procedure.
- **Create** `src/server/db/index.ts`: instantiate Drizzle client from env; export client and schema.

### 4. Zod + Drizzle integration

- **Create** `src/server/schemas/` (or `shared/schemas/`): use zod-drizzle (or equivalent) to derive Zod schemas from the Drizzle table(s); export input/output schemas for the example procedure.

### 5. Effect setup

- **Create** `src/server/effect/` (or `src/lib/effect/`): minimal Effect runtime/layer setup (e.g. `Layer` for DB, `Context` for config). Define one small service used by the example procedure (e.g. `HealthService` or `PingRepository`) implemented with Effect and Drizzle.

### 6. tRPC router and procedure

- **Create** `src/server/trpc/`: `trpc.ts` (init with procedure builder, optional Effect middleware/context), `root.ts` (root router).
- **Create** one router (e.g. `health.ts` or `ping.ts`) with:
  - One query procedure (e.g. `getHealth` or `ping`) that runs in Effect and optionally reads/writes the example Drizzle table, with input/output validated by Zod (from zod-drizzle where applicable).
- **Wire** router into root; export type `AppRouter`.

### 7. tRPC API route (Next.js)

- **Create** App Router API route (e.g. `app/api/trpc/[trpc]/route.ts`) that uses the Next.js tRPC adapter and the created `AppRouter`.

### 8. tRPC client and React Query

- **Create** tRPC client factory (e.g. `src/trpc/client.ts` or `src/lib/trpc.ts`) and React Query + tRPC provider (e.g. `app/providers.tsx` or `app/layout.tsx`).

### 9. Minimal UI

- **Create** one page (e.g. `app/page.tsx`) that uses the tRPC client to call the example procedure and displays the result (and optionally shows loading/error via React Query).

### 10. Scripts and env

- **Add** to `package.json`: `dev`, `build`, `start`, `lint`, `db:generate`, `db:migrate`, `db:studio`, and `auth:generate` (runs `npx auth@latest generate` with our config/output so we can regenerate schema when auth config or plugins change).
- **Create** `.env.example`: `DATABASE_URL` (local: Docker Postgres; prod: Neon), `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`.

### 11. Documentation

- **Create** `README.md` at repo root: how to install deps, run dev, run migrations, run tests (`bun test`), auth setup, and what the example procedure does.
- **Create** `docs/` with technology subfolders and conventions; copy relevant reference docs so the repo is self-contained:
  - **`docs/betterauth/`** — copy from Better Auth: introduction, installation, CLI (generate/migrate/init/info/secret), database (core schema, adapters), Drizzle adapter. Source: https://www.better-auth.com/docs (and subpages).
  - **`docs/effect/`** — copy or link Effect TS docs (getting started, Layer/Context, runtime). Enables onboarding without relying on external links only.
  - **`docs/testing.md`** — testing and DI conventions: Bun-only test runner, no mocking (use Effect DI), real DB for tests (no DB mocks).

---

## Acceptance Criteria

- [ ] `pnpm install` (or npm/yarn) and `pnpm dev` start the Next.js app without errors.
- [ ] Drizzle schema exists; `db:generate` produces migrations; `db:migrate` applies them. Local dev uses Postgres in Docker; prod uses Neon.
- [ ] One tRPC query procedure is implemented using Effect (e.g. returns health or reads/writes the example table).
- [ ] Procedure input/output use Zod schemas; at least one schema is derived from Drizzle via zod-drizzle.
- [ ] App Router API route `api/trpc/[trpc]` serves tRPC; client calls the example procedure successfully.
- [ ] One page in the UI calls the procedure and displays the result (with loading/error states).
- [ ] README documents setup, env, and scripts.
- [ ] Better Auth is used for auth; Drizzle schema for auth tables is generated via `npx auth@latest generate` (no hand-rolled auth tables). Auth mounted at `/api/auth/*`; auth client available for the app.
- [ ] `docs/betterauth/` and `docs/effect/` exist with copied reference docs.
- [ ] Test suite runs with `bun test`; tests use a real DB (no DB mocks); no mocking by default—use Effect DI (layers) instead.

## Open Questions

1. **Effect scope**: Use Effect only in server procedures (tRPC context) vs. also for client-side (e.g. `Effect.runPromise` in React Query)? Recommendation: server-only for boilerplate; client can stay with React Query + tRPC.
2. **Package name for Zod/Drizzle**: Confirm npm package name (`zod-drizzle` vs `drizzle-zod` vs `@effect/schema` with Drizzle integration) and use consistently.

## Explicit Opinions

1. **App Router only**: Use Next.js App Router; no Pages Router.
2. **Effect on server**: Effect is used for server-side procedures (and optionally DB/config layers); tRPC procedures call `Effect.runPromise` (or similar) so the API remains simple.
3. **Single example table**: One small Drizzle table is enough to demonstrate migrations, zod-drizzle derivation, and one read/write procedure.
4. **tRPC v11**: Use current tRPC Next.js adapter and `createTRPCReact` + React Query on the client.
5. **Strict TypeScript**: Enable strict mode and path aliases from the start.
6. **PostgreSQL only**: Database is always PostgreSQL. **Local**: run Postgres in a Docker container; **Prod**: use Neon Postgres. Use bog-standard Postgres only—no extensions or fancy features required.
7. **Auth: Better Auth**: Use Better Auth with the Drizzle adapter. Use the **Better Auth CLI** (`npx auth@latest generate`) to generate the required Drizzle schema (user, session, account, verification + plugins) so we never hand-roll or duplicate auth tables. Saves us from useless or wrong tables.
8. **No mocking; Effect DI**: We should not need to mock things. Use Effect’s DI (Layers, Context) so dependencies are explicit and swappable at test time. If we find ourselves reaching for mocks, that’s a sign the code isn’t effectful enough—push dependencies into the Effect context instead.
9. **Real DB for tests**: We are not allowed to mock the database. The test suite must run against a real database (e.g. Postgres via Docker or a dedicated test DB). Set up a real DB for tests and run migrations before tests.
10. **Bun test only**: The test runner is **Bun** exclusively. Use `bun test` for the test suite (no Jest, Vitest, or Node’s built-in test runner).

## Testing Strategy

- **Test runner**: Bun only (`bun test`). Add a `test` script in `package.json` that runs `bun test`.
- **No mocks**: Prefer Effect DI (Layers/Context) so tests provide real or test implementations via layers. If you need to mock, refactor so the dependency is in the Effect context and provide a test layer instead.
- **Real database**: Tests hit a real Postgres instance (e.g. same Docker Compose service with a test DB or `DATABASE_URL_TEST`). No DB mocks; run migrations (or use a fresh schema) before the test suite. See `docs/testing.md` for setup.

## Patches

### Patch 1 [INFRA]: Initialize Next.js and dependencies

**Files to create:**

- `package.json` — Next.js 15+, React 18+, TypeScript; add dependencies: `effect`, `@effect/platform` (if needed), `@trpc/server`, `@trpc/client`, `@trpc/react-query`, `@trpc/next` (or adapter package), `drizzle-orm`, `drizzle-kit`, `pg`, `zod`, `zod-drizzle` (or chosen package), `better-auth`, `@tanstack/react-query`; dev deps: `typescript`, `@types/node`, `@types/pg`, `@types/react`, `@types/react-dom`, `eslint`, `eslint-config-next`.
- `tsconfig.json` — strict, path alias `@/*`, Next.js-compatible.
- `next.config.ts` — minimal.
- `.env.example` — `DATABASE_URL` (local: e.g. `postgresql://postgres:postgres@localhost:5432/recall_again` for Docker; prod: Neon connection string).
- `docker-compose.yml` — single service: official `postgres` image, expose 5432, one database (e.g. `recall_again`), minimal env (POSTGRES_USER, POSTGRES_PASSWORD, POSTGRES_DB). Used only for local dev.

**Changes:**

1. Add scripts: `dev`, `build`, `start`, `lint`, `test` (runs `bun test`), `db:generate`, `db:migrate`, `db:studio` (or `db:push` where appropriate).

### Patch 2 [INFRA]: Drizzle config, DB client, Better Auth config, and auth schema via CLI

**Files to create:**

- `drizzle.config.ts` — schema path (e.g. `src/server/db/schema.ts`), out dir (e.g. `drizzle`), dialect `postgresql`.
- `src/server/db/index.ts` — create Drizzle client from env (`drizzle(pool)`); export client (schema can be added after generate).
- `src/server/auth.ts` (or `lib/auth.ts`) — minimal Better Auth config: `betterAuth({ database: drizzleAdapter(db, { provider: "pg" }), ... })` so the CLI can run. No routes mounted yet.
- Run **Better Auth CLI**: `npx auth@latest generate --config src/server/auth.ts --output src/server/db/schema.ts` (or equivalent path). This produces the exact Drizzle schema (user, session, account, verification). Move or merge into `src/server/db/schema.ts` and ensure `drizzle.config.ts` points to it. Optionally add one small app table (e.g. `ping`) to the same file for the example procedure.

**Changes:**

1. No auth routes or app code yet; config, client, and schema only. Apply migrations via `drizzle-kit generate` + `drizzle-kit migrate`.

### Patch 2a [INFRA]: Better Auth API route and client

**Files to create:**

- `app/api/auth/[...all]/route.ts` — mount Better Auth handler: `import { toNextJsHandler } from "better-auth/next-js"; export const { POST, GET } = toNextJsHandler(auth);`
- `src/lib/auth-client.ts` (or `app/lib/auth-client.ts`) — `createAuthClient` from `better-auth/client` (or `better-auth/react`), with `baseURL` if needed.

**Changes:**

1. Auth is callable at `/api/auth/*`; client is available for sign-in/session. No tRPC integration yet.

### Patch 3 [INFRA]: Zod–Drizzle schemas and Effect DB layer

**Files to create:**

- `src/server/schemas/health.ts` (or `ping.ts`) — use zod-drizzle to derive Zod schema(s) from the Drizzle table; export input/output types/schemas for the example procedure.
- `src/server/effect/db.ts` (or `src/lib/effect/db.ts`) — Effect `Layer`/`Context` that provides the Drizzle client (or a small repository interface) so procedures run in Effect.

**Changes:**

1. No tRPC procedures yet; only schema and Effect layer.

### Patch 4 [INFRA]: tRPC init and root router skeleton

**Files to create:**

- `src/server/trpc/trpc.ts` — create tRPC instance (e.g. `initTRPC.context()`), optional context type that includes Effect runtime or DB.
- `src/server/trpc/root.ts` — root router; export type `AppRouter`.
- `src/server/trpc/routers/health.ts` (or `ping.ts`) — router with one query procedure stub (e.g. `getHealth`) that returns a constant or throws "not implemented"; input/output types referenced from `src/server/schemas/`.

**Changes:**

1. Procedure is not yet implemented with Effect/Drizzle; only router shape and types.

### Patch 5 [BEHAVIOR]: Implement example procedure with Effect and Drizzle

**Files to modify:**

- `src/server/trpc/routers/health.ts` (or `ping.ts`) — implement the query: run in Effect (e.g. `Effect.runPromise`), use Drizzle layer to read (and optionally write) the example table; validate with Zod (zod-drizzle) input/output.

**Files to create (if not in Patch 4):**

- `app/api/trpc/[trpc]/route.ts` — Next.js route using tRPC adapter and `AppRouter`.

**Changes:**

1. Procedure is fully implemented and callable via HTTP; no UI yet.

### Patch 6 [BEHAVIOR]: tRPC client and React Query provider

**Files to create:**

- `src/trpc/client.ts` (or `src/lib/trpc.ts`) — create tRPC client and `createTRPCReact<AppRouter>`.
- `app/providers.tsx` — wrap with `QueryClientProvider` and tRPC React provider; use in layout.

**Files to modify:**

- `app/layout.tsx` — wrap children with `Providers` (or inline providers).

**Changes:**

1. Client can call tRPC from React; no page yet.

### Patch 7 [BEHAVIOR]: Minimal UI page calling example procedure

**Files to create or modify:**

- `app/page.tsx` — use tRPC hook (e.g. `api.health.getHealth.useQuery()`), display result and loading/error states.

**Changes:**

1. Full stack verified: UI → tRPC client → API route → Effect + Drizzle → response.

### Patch 8 [INFRA]: Docs folder (betterauth, effect)

**Files to create:**

- `docs/betterauth/` — copy relevant Better Auth docs (e.g. introduction, installation, CLI, database core schema, Drizzle adapter) from https://www.better-auth.com/docs into markdown files so the repo has local reference.
- `docs/effect/` — copy or link Effect TS docs (e.g. getting started, Layer/Context, runtime) into markdown files or a README with links.
- `docs/testing.md` — testing and DI conventions (Bun only, no mocking, real DB). Already created; ensure README links to it.

**Changes:**

1. Developers can read auth, Effect, and testing/DI docs from `docs/` without leaving the repo.

### Patch 9 [INFRA]: README and scripts polish

**Files to create/modify:**

- `README.md` — install, env vars, `dev` / `build` / `test` (`bun test`) / `db:generate` / `db:migrate` / `auth:generate`; document **local**: start Postgres via `docker compose up -d`, then run migrations; **prod**: set `DATABASE_URL` to Neon; document `BETTER_AUTH_SECRET` and `BETTER_AUTH_URL`; point to `docs/betterauth`, `docs/effect`, and `docs/testing.md`; short description of the example procedure and stack.
- `.gitignore` — add `.env`, `node_modules`, `.next`, `drizzle/*.sql` if desired, etc.

**Changes:**

1. Any missing scripts or env notes in README; ensure `.env.example` documents Docker (local), Neon (prod), and Better Auth. No fancy Postgres—standard only.

## Test Map

| Test Name | File | Stub Patch | Impl Patch |
|-----------|------|------------|------------|
| (Optional) tRPC health procedure returns expected shape | `src/server/trpc/routers/health.test.ts` | 4 | 5 |
| (Optional) Drizzle client reads example table | `src/server/db/index.test.ts` | 2 | 3 |

Tests use **Bun** (`bun test`), a **real database** (no DB mocks), and **Effect DI** instead of mocks. See Testing Strategy and `docs/testing.md`.

## Dependency Graph

- Patch 1 [INFRA] → []
- Patch 2 [INFRA] → [1]
- Patch 2a [INFRA] → [2]
- Patch 3 [INFRA] → [1, 2]
- Patch 4 [INFRA] → [1, 3]
- Patch 5 [BEHAVIOR] → [2, 3, 4]
- Patch 6 [BEHAVIOR] → [1, 4]
- Patch 7 [BEHAVIOR] → [5, 6]
- Patch 8 [INFRA] → [] (docs; can run in parallel)
- Patch 9 [INFRA] → [1, 2, 5, 6, 7]

**Mergability insight**: Patches 1–4, 2a, 8, and 9 are `[INFRA]` and can land without user-facing behavior. Only 5, 6, 7 are `[BEHAVIOR]` (API implementation, client wiring, UI).

## Mergability Checklist

- [x] Feature flag strategy documented (not needed for greenfield boilerplate).
- [x] Early patches are `[INFRA]` (deps, config, schema, routers skeleton).
- [ ] Test stubs: optional; if added, stubs in Patch 2 or 4, impl in same patch as code (5 or 3).
- [x] Test Map: optional for this gameplan; placeholders above.
- [x] `[BEHAVIOR]` patches limited to: implement procedure, wire client, add UI.
- [x] Dependency graph: infra first, behavior after.
- [x] Each `[BEHAVIOR]` patch is justified (procedure impl, client, UI).
