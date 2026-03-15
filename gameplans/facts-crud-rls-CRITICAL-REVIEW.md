# Gameplan Critical Review: facts-crud-rls

Review of `gameplans/facts-crud-rls.md` before implementation. Codebase verified via exploration and file reads; subagent used for Supabase/Drizzle/tRPC/auth verification.

---

## 1. Assumptions

- **Better Auth `getSession` accepts Fetch `Request.headers`**  
  **Where:** Required Changes §4 (line 71): "Call `auth.api.getSession({ headers: opts.req.headers })`."  
  **Risk if wrong:** Context creation fails or session is never found; all protected procedures effectively 401.  
  **How to verify:** In Better Auth docs/API, confirm that `getSession({ headers })` accepts a Web API `Headers` (from `Request.headers`). If it expects Node `IncomingHttpHeaders`, use a small adapter or `fromNodeHeaders`-style conversion and document it.

- **`createContext` receives `opts` with `opts.req` (Fetch `Request`)**  
  **Where:** Required Changes §4 (line 71): "using `opts.req` (FetchCreateContextFnOptions)".  
  **Risk if wrong:** Cannot read session in context; protected flow broken.  
  **How to verify:** Confirmed: `FetchCreateContextFnOptions` in `@trpc/server` fetch adapter has `req: Request`. Route passes `req` into `fetchRequestHandler`, so `opts.req` is the same `Request`. No change needed; leave as verified.

- **Drizzle Kit generates correct SQL for `default: sql\`'user_' || gen_random_uuid()::text\``**  
  **Where:** Patch 1 (lines 49, 134): app_user `id` default; Patch 2 (lines 59, 141): fact `id` default.  
  **Risk if wrong:** Migration fails or uses wrong default; app_user/fact ids not prefixed.  
  **How to verify:** Run `bun run db:generate` after adding the schema with `sql` default; inspect generated migration SQL and run it against a local DB.

- **`db.transaction()` uses a single connection and `set_config(..., true)` is visible to subsequent queries on that connection**  
  **Where:** Patch 5 implementation note (lines 89–90): "obtain a connection from the pool (or start a transaction), run SET LOCAL ... then provide a Drizzle client bound to that connection."  
  **Risk if wrong:** RLS sees no or wrong `app.user_id`; cross-user data leak or denied access.  
  **How to verify:** Check Drizzle `transaction()` semantics for node-postgres (single client for the callback). Run a small test: open transaction, `set_config('app.user_id', 'user_xyz', true)`, select `current_setting('app.user_id', true)` and assert value.

- **Tests run with real DB and `DATABASE_URL` set**  
  **Where:** Solution summary (line 16): "tests use Bun and real DB with Effect DI"; Test Map implies DB-backed tests.  
  **Risk if wrong:** Tests fail in CI or locally if DB is missing or env not set.  
  **How to verify:** Ensure CI and local dev docs set `DATABASE_URL`; add a one-line check in test setup or README that migrations have been run.

- **Auth schema `user` table is in the same Drizzle schema namespace so `app_user.authUserId` can FK to `user.id`**  
  **Where:** Patch 1 (line 51): "FK to `user.id` (auth schema)"; Current State (line 37): schema-app and schema both in drizzle config.  
  **Risk if wrong:** FK fails at migration or runtime.  
  **How to verify:** Add `app_user` in `schema-app.ts` with `references(() => user.id)` and `import { user } from "./schema"`; run generate and migrate. (No circular dependency: schema does not import schema-app.)

- **RLS policy column name matches Drizzle-defined column**  
  **Where:** Patch 3 (line 141): "adjust column name if using camelCase in DB: `userId` → `user_id` per Drizzle convention."  
  **Risk if wrong:** Policy references non-existent column; RLS fails.  
  **How to verify:** Define fact with `userId: text("user_id")` so DB column is `user_id`; in migration use `user_id` in the policy.

---

## 2. Factual Errors

- **Claim:** "Use zod-drizzle for fact row/output" (Solution summary line 16; §6 line 103; Patch 6 line 217).  
  **Reality:** The package in the repo is **drizzle-zod** (`createSelectSchema` from `drizzle-zod`), not "zod-drizzle". See `package.json` ("drizzle-zod": "^0.5.0") and `src/server/schemas/health.ts` (`createSelectSchema` from "drizzle-zod").  
  **Impact:** Implementers may search for a "zod-drizzle" package; use the existing `drizzle-zod` and `createSelectSchema` for fact row/output.

- **Claim:** "No RLS on app_user for M1" (Explicit Opinions §8, line 131; Patch 1 line 53).  
  **Reality:** Correct; no RLS on `app_user` is intentional.  
  **Impact:** None. (Included only to confirm no error.)

---

## 3. Contradictions

- **Statement A:** "create does not pass `userId` (RLS/session variable implies it)" (Required Changes §6, line 102).  
  **Statement B:** "fact" table has "userId text NOT NULL" and RLS restricts by `current_setting('app.user_id')`; INSERT must supply a value for `user_id` for the row to satisfy WITH CHECK.  
  **Which is likely correct:** The intended meaning is that the **client** does not send `userId`; the server sets it from session (or a DB default). So either: (1) the repository receives the current app user id (e.g. from procedure ctx) and passes it in the INSERT, or (2) the `fact` table has a DEFAULT on `user_id` (e.g. `current_setting('app.user_id', true)::text`). The gameplan does not specify a DEFAULT for `userId` on `fact`, so (1) is the only option described elsewhere.  
  **Recommendation:** Treat "create does not pass userId" as "client input does not include userId; server sets it from context." Explicitly state in the gameplan that the procedure (or repository caller) passes `ctx.appUser.id` into the repository for `create`, or that the table has a DEFAULT for `user_id` and document which approach is chosen.

- **Patch 5 label:** Patch 5 is listed as **[BEHAVIOR]** (lines 157, 190) and also "protectedProcedure and SET LOCAL layer." The Dependency Graph (line 262) says "Patch 5 [BEHAVIOR] -> [4]". The Mergability Checklist (line 269) says "Each BEHAVIOR patch justified (auth and CRUD cannot be gated)." So Patch 5 is the first behavioral change (auth + whoami). No contradiction; just confirming Patch 5 is the first user-visible behavior change.

---

## 4. Open Questions & Default Decisions

- **Question:** How does `FactRepository.create` get the current app user id for the INSERT (so `user_id` is set and RLS WITH CHECK passes)?  
  **Where it matters:** Patch 6–7: repository implementation and procedure wiring.  
  **Default decision:** Procedure calls repository with `ctx.appUser.id` (e.g. `create(input, ctx.appUser.id)` or a RequestContext tag for current app user id). No DEFAULT on `fact.user_id` unless the gameplan is updated to add it.  
  **Confidence:** High that the server must provide the value; medium on whether it should be an argument vs. a context tag (argument is simpler and matches existing ctx usage).

- **Question:** Exact content validation for fact create/update (min/max length, allowed characters).  
  **Where it matters:** Patch 6 schemas, Patch 7 repository and API behavior.  
  **Default decision:** Use a reasonable ad-hoc Zod schema (e.g. `content: z.string().min(1).max(10_000)` or similar) and document in schema file; no HTML/script sanitization specified for M1.  
  **Confidence:** Medium; product may want different limits or sanitization later.

- **Question:** Error handling when `findOrCreateAppUserByAuthId` insert fails (e.g. race: two requests create same app_user).  
  **Where it matters:** Patch 4: context creation and helper.  
  **Default decision:** Use "SELECT or INSERT" in one transaction, or ON CONFLICT (authUserId) DO NOTHING / DO UPDATE and re-select; on unexpected failure return 500 and log.  
  **Confidence:** High that duplicate auth user id must be handled; medium on exact pattern (transaction + catch unique violation vs. ON CONFLICT).

- **Question:** Who sets `app.user_id` when running tests (e.g. fact.list returns only current user's facts)?  
  **Where it matters:** Patch 6–7 test implementation.  
  **Default decision:** Tests that need an authenticated user create a session (or mock context) and use the same request-scoped DB layer / SET LOCAL as production (e.g. via tRPC caller with context or a test helper that runs with a given app user id).  
  **Confidence:** High; otherwise RLS is not tested.

- **Question:** Drizzle migration for RLS: does Drizzle Kit emit RLS, or is it raw SQL only?  
  **Where it matters:** Patch 3: "New migration only (raw SQL or Drizzle migration that enables RLS and adds policy)".  
  **Default decision:** Use a raw SQL migration file for `ALTER TABLE fact ENABLE ROW LEVEL SECURITY` and the policy; Drizzle schema does not need to encode RLS for this.  
  **Confidence:** High; RLS is not represented in current Drizzle schema snapshot (meta shows `isRLSEnabled: false`).

- **Question:** `getById(id)` when id is owned by another user: return `null` vs. 403.  
  **Where it matters:** Patch 6–7: FactRepository.getById and procedure behavior; Test Map "returns fact when owned, null otherwise".  
  **Default decision:** Return `null` when the row is not visible (RLS filters it out), matching "null otherwise" in the Test Map.  
  **Confidence:** High.

- **Question:** Export of `pool` from `src/server/db/index.ts` for request-scoped connection (e.g. `pool.connect()`).  
  **Where it matters:** Patch 5 if middleware uses a dedicated connection instead of `db.transaction()`.  
  **Default decision:** Use `db.transaction()` so the callback gets a single connection; run SET LOCAL in that transaction and provide the transaction client as the Effect Db layer. No need to export `pool`.  
  **Confidence:** High; matches "or start a transaction" in the implementation note.

---

## Summary

- **Assumptions:** Six main ones (Better Auth headers, tRPC opts.req, Drizzle sql default, transaction + set_config visibility, DATABASE_URL for tests, FK and RLS column naming). All are verifiable with small code or doc checks.
- **Factual errors:** One: use **drizzle-zod** (and `createSelectSchema`), not "zod-drizzle," for fact row/output.
- **Contradictions:** One: clarify that "create does not pass userId" means client does not send it; server (or DB default) must set `user_id` for INSERT, and the gameplan should state how (procedure passes ctx.appUser.id or table DEFAULT).
- **Open questions:** Six; defaults given for repository create/getById, content validation, findOrCreateAppUser race, test auth, RLS migration format, and use of `db.transaction()` instead of exporting pool.
