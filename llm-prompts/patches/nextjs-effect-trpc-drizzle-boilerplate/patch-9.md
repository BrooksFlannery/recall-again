# [nextjs-effect-trpc-drizzle-boilerplate] Patch 9: README and scripts polish

## Problem Statement

We need a production-ready Next.js boilerplate that uses Effect TS for business logic and error handling, tRPC for type-safe API, Drizzle for the database, Zod (including zod-drizzle) for validation and schema derivation, and **Better Auth** for authentication. The repository currently has no application code—only agent/skill assets—so we are standing up the full stack from scratch. Deciding auth up front avoids creating redundant or useless tables; we use the Better Auth CLI to generate the exact Drizzle schema required.

## Solution Summary

Scaffold a Next.js App Router project, then add dependencies and configuration for Effect, tRPC (with Next.js server adapters), Drizzle (with a driver and migration tooling), Zod, zod-drizzle, and **Better Auth**. **Database**: PostgreSQL only—standard Postgres, nothing fancy. Local dev runs against a Postgres container via Docker; production uses Neon Postgres. **Auth**: Use Better Auth with the Drizzle adapter. Use the Better Auth CLI (`npx auth@latest generate`) to generate the required Drizzle schema (user, session, account, verification, plus any plugin tables) so we don't hand-roll or duplicate auth tables; integrate the generated schema into our Drizzle setup. Introduce a minimal folder layout (server/routers, server/db, server/schemas, auth, shared types) and wire one example tRPC procedure that uses Effect and Drizzle; mount Better Auth at `/api/auth/*`. Copy relevant docs into `docs/` with subfolders per technology (e.g. `docs/betterauth/`, `docs/effect/`). All app code will live at the repo root.

## Design Decisions (Non-negotiable)

1. **App Router only**: Use Next.js App Router; no Pages Router.
2. **Effect on server**: Effect is used for server-side procedures (and optionally DB/config layers); tRPC procedures call `Effect.runPromise` (or similar) so the API remains simple.
3. **Single example table**: One small Drizzle table is enough to demonstrate migrations, zod-drizzle derivation, and one read/write procedure.
4. **tRPC v11**: Use current tRPC Next.js adapter and `createTRPCReact` + React Query on the client.
5. **Strict TypeScript**: Enable strict mode and path aliases from the start.
6. **PostgreSQL only**: Database is always PostgreSQL. **Local**: run Postgres in a Docker container; **Prod**: use Neon Postgres. Use bog-standard Postgres only—no extensions or fancy features required.
7. **Auth: Better Auth**: Use Better Auth with the Drizzle adapter. Use the **Better Auth CLI** (`npx auth@latest generate`) to generate the required Drizzle schema (user, session, account, verification + plugins) so we never hand-roll or duplicate auth tables. Saves us from useless or wrong tables.
8. **No mocking; Effect DI**: We should not need to mock things. Use Effect's DI (Layers, Context) so dependencies are explicit and swappable at test time. If we find ourselves reaching for mocks, that's a sign the code isn't effectful enough—push dependencies into the Effect context instead.
9. **Real DB for tests**: We are not allowed to mock the database. The test suite must run against a real database (e.g. Postgres via Docker or a dedicated test DB). Set up a real DB for tests and run migrations before tests.
10. **Bun test only**: The test runner is **Bun** exclusively. Use `bun test` for the test suite (no Jest, Vitest, or Node's built-in test runner).

## Dependencies Completed

- Patch 1 added package.json, tsconfig, next.config, .env.example, docker-compose, and scripts.
- Patch 2 added Drizzle config, DB client, Better Auth config, and auth schema.
- Patch 5 added the implemented health (or ping) procedure and tRPC API route.
- Patch 6 added tRPC client and React Query provider.
- Patch 7 added the minimal UI page calling the example procedure.

## Your Task

**Files to create/modify:**

- `README.md` — install, env vars, `dev` / `build` / `test` (`bun test`) / `db:generate` / `db:migrate` / `auth:generate`; document **local**: start Postgres via `docker compose up -d`, then run migrations; **prod**: set `DATABASE_URL` to Neon; document `BETTER_AUTH_SECRET` and `BETTER_AUTH_URL`; point to `docs/betterauth`, `docs/effect`, and `docs/testing.md`; short description of the example procedure and stack.
- `.gitignore` — add `.env`, `node_modules`, `.next`, `drizzle/*.sql` if desired, etc.

**Changes:**

1. Any missing scripts or env notes in README; ensure `.env.example` documents Docker (local), Neon (prod), and Better Auth. No fancy Postgres—standard only.

## Test Stubs to Add

None — this patch does not introduce test stubs.

## Tests to Unskip and Implement

None — this patch does not implement tests.

## Git Instructions

- Branch from: `main`
- Branch name: `nextjs-effect-trpc-drizzle-boilerplate-patch-9-readme-scripts`
- PR base: `main`

**IMPORTANT: Open a draft PR immediately after your first commit.** Do not wait until implementation is complete. This ensures the PR title format is correct from the start.

After your first commit, run:
```bash
gh pr create --draft --title "[nextjs-effect-trpc-drizzle-boilerplate] Patch 9: README and scripts polish" --body "Work in progress" --base main
```

Then continue implementing. When finished:
1. Run `bun test` to verify tests pass
2. Update the PR description with a proper summary
3. Mark the PR as ready for review when complete

## PR Title (CRITICAL)

**You MUST use this EXACT title format:**

`[nextjs-effect-trpc-drizzle-boilerplate] Patch 9: README and scripts polish`

Do NOT use conventional commit format (e.g., `feat:`, `fix:`). The bracketed project name and patch number are required for tracking.
