# M1 Design Decisions — Deep Explanations

Comprehensive explainer for each design point before writing the facts-crud-rls gameplan. Use this to validate decisions and unblock implementation.

---

## 1. Postgres Roles and How They Work

### 1.1 What Is a "Role" in Postgres?

In PostgreSQL, a **role** is an identity that can **own database objects** (tables, schemas, functions) and **have privileges** (SELECT, INSERT, UPDATE, DELETE, etc.). The term "user" in classic SQL is just a "role that can log in"; in Postgres, **users and groups are both roles**. When you connect to Postgres, you connect *as* a role.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    POSTGRES ROLE MODEL                                       │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   ┌─────────────────┐     "logs in"      ┌─────────────────┐               │
│   │  Your app       │ ──────────────────► │  PostgreSQL     │               │
│   │  (Node/Bun)     │   connection string │  Server         │               │
│   └─────────────────┘                     └────────┬────────┘               │
│          │                                          │                        │
│          │  Connects as role "myapp"                 │                        │
│          │  (LOGIN = true)                          ▼                        │
│          │                                   ┌─────────────┐                 │
│          │                                   │  Role       │                 │
│          │                                   │  "myapp"    │                 │
│          │                                   │  (can login) │                 │
│          │                                   └──────┬──────┘                 │
│          │                                          │                        │
│          │                                          │ GRANT SELECT ON fact   │
│          │                                          ▼                        │
│          │                                   ┌─────────────┐                 │
│          │                                   │  Tables     │                 │
│          │                                   │  fact, user │                 │
│          │                                   └─────────────┘                 │
│                                                                             │
│   Key: Every query runs as exactly one role. That role's privileges        │
│   (and RLS policies) determine what rows you see and what you can change.  │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

| Term | Meaning | Example |
|------|---------|--------|
| **Role** | An identity in Postgres; can own objects and have privileges | `myapp`, `postgres`, `app_user` |
| **Login role** | Role with `LOGIN` attribute; can be used in a connection string | Your app connects as `myapp` |
| **Group role** | Role without `LOGIN`; used for grouping privileges | `readonly`, `app_user` (if we use it as a "logical" role) |
| **Session** | One connection to Postgres; has a "current role" for the duration of that connection | One tRPC request = one connection (or from pool) |

### 1.2 How Roles Relate to RLS (Row Level Security)

**RLS** means: "When this role queries this table, only return rows that pass a policy." Policies are **per role** (or per table and role). So:

- You enable RLS on table `fact`.
- You add a policy: "For role `app_user`, allow SELECT only where `fact.user_id = current_setting('app.user_id')`."
- When the **current role** of the session is `app_user` and `current_setting('app.user_id')` is set to `user_abc-123`, any `SELECT * FROM fact` automatically becomes "only rows where user_id = 'user_abc-123'".

So the two ways to make RLS "see" the current app user are:

1. **Session variable only**: Keep using your **same** login role (e.g. `myapp`) for every request. Before running queries, run `SET LOCAL app.user_id = 'user_xyz'`. Your RLS policies say: "Allow access where `user_id = current_setting('app.user_id')`." No role switching; only the variable changes.
2. **Role + session variable**: Create a second role (e.g. `app_user`) that has no LOGIN. Your app still connects as `myapp`. For each request you run `SET LOCAL app.user_id = 'user_xyz'` and then `SET ROLE app_user`. Now the "current role" is `app_user`, and RLS policies are defined for `app_user` that use `current_setting('app.user_id')`. So the *role* determines which policies apply; the *variable* carries the identity.

In both cases you set `app.user_id` (e.g. via `SET LOCAL`). The only difference is whether you also switch the current role to a dedicated `app_user` role.

### 1.3 SET LOCAL vs Session Variable (No Role Switch)

**SET LOCAL** sets a **session variable** for the rest of the **current transaction**. When the transaction ends (commit or rollback), the variable is cleared. So:

```
Time    Event                                    current_setting('app.user_id')
────    ─────                                    ───────────────────────────────
T=0     Connection from pool                     (not set)
T=1     BEGIN
T=2     SET LOCAL app.user_id = 'user_abc'        'user_abc'
T=3     SELECT * FROM fact  →  RLS uses it       'user_abc'
T=4     COMMIT                                  (cleared)
T=5     Next request reuses connection           (not set again until next SET LOCAL)
```

- **Same connection, next transaction**: You must run `SET LOCAL app.user_id = ...` again at the start of each request. So in tRPC you do: get app user from session → open/use DB connection → `SET LOCAL app.user_id = ctx.appUser.id` → run queries → commit. No role change; one login role for the app.

### 1.4 When Would You Use a Dedicated Role?

- You want **different privileges** per "logical user": e.g. role `app_user` can only SELECT/INSERT/UPDATE/DELETE on `fact` and `app_user`, and cannot touch `user`/`session`. Your app connects as a **superuser or owner** and then `SET ROLE app_user` so that even if code bugs, it can’t bypass RLS or touch auth tables.
- You’re in a **shared DB** and want to audit "who did what" by role. Then the role is `app_user` and the session variable is the concrete user id.

For a typical app with one service and RLS on `fact`, **SET LOCAL only** (no role switch) is the simplest: one login role, one place where you set `app.user_id` (e.g. in `protectedProcedure`), and RLS policies that depend only on `current_setting('app.user_id')`.

### 1.5 Summary Table

| Approach | How it works | Pros | Cons |
|----------|--------------|------|------|
| **SET LOCAL only** | One login role; set `app.user_id` at start of each request; RLS uses `current_setting('app.user_id')` | Simple, no role management, one place to set variable | App role has broad table access; must ensure every request sets variable |
| **Dedicated role + SET LOCAL** | App connects as owner; `SET LOCAL app.user_id` then `SET ROLE app_user`; RLS for `app_user` uses the variable | Stricter privilege boundary, clearer audit | More setup (create role, grant usage, define policies per role) |

**Decision for M1**: **SET LOCAL only** (no dedicated role). Document in the gameplan: "We set `app.user_id` in protectedProcedure before running any query; RLS on `fact` restricts by `current_setting('app.user_id')`."

---

## 2. "One Place" for Resolving / Creating App User

### 2.1 What "Place" Means Here

"Where in the request lifecycle do we **resolve session → auth user → app user** and **create the app user if missing**?"

It’s **one or the other** as the standard:

- **Option A — tRPC only**: The *only* place that does "resolve or create" is **tRPC context**. When a tRPC request runs, we: get session → get auth user → find or create app user → put in `ctx`. Middleware never touches app user. Any code that doesn’t go through tRPC (e.g. a static page) doesn’t need an app user.
- **Option B — Middleware only**: The *only* place that does "resolve or create" is **middleware** (or a root layout). Middleware: get session → get auth user → find or create app user → store in request-scoped cache (or similar). tRPC then **only reads** the already-resolved app user from that cache; it does **not** create. So you still have a single place that creates; the other place just consumes.

You do **not** do both: you don’t "create in middleware and also create in tRPC." You pick one place that owns "resolve or create"; the other (if any) only reads.

| Approach | Who resolves/creates? | Who only reads? |
|----------|----------------------|-----------------|
| **tRPC only** | tRPC context | — (middleware doesn’t need app user) |
| **Middleware only** | Middleware | tRPC reads from request cache |

### 2.2 Visual: One Place (tRPC) vs One Place (Middleware)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  OPTION A: tRPC is the single place that resolves/creates app user           │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   Request ──► Middleware (optional: check session exists)                   │
│                    │                                                        │
│                    ▼                                                        │
│              Page / API route                                               │
│                    │                                                        │
│                    └──► If tRPC procedure called:                           │
│                             ┌─────────────────────────────────────┐         │
│                             │ tRPC context creation               │         │
│                             │ 1. Get session (Better Auth)        │         │
│                             │ 2. Get auth user                     │         │
│                             │ 3. Find or CREATE app_user  ◄── ONLY HERE     │
│                             │ 4. Put appUser in ctx                │         │
│                             └─────────────────────────────────────┘         │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│  OPTION B: Middleware is the single place; tRPC only reads                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   Request ──► Middleware                                                    │
│                    │                                                        │
│                    │  ┌─────────────────────────────────────┐               │
│                    └─►│ Resolve session → auth user →        │               │
│                       │ find or CREATE app_user  ◄── ONLY HERE              │
│                       │ Store in request-scoped cache        │               │
│                       └─────────────────────────────────────┘               │
│                    │                                                        │
│                    ▼                                                        │
│              tRPC: read app user from cache (no create, no duplicate logic) │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.3 Why We Chose tRPC Only

- **Single responsibility**: Only tRPC context does "find or create"; no middleware logic for app user.
- **Lazy creation**: App user is created the first time they hit a tRPC procedure that requires auth. Static/public pages never create an app_user row.
- **Simpler gameplan**: One patch for "tRPC context: resolve session → auth user → app user (create if missing)." No middleware patch for app user.

**Decision for M1**: **Resolve and create app user in one place only: inside tRPC context creation.** Middleware may still run (e.g. redirecting unauthenticated users) but does **not** resolve or create the app user.

---

## 3. Schema Shape Sketch (for Your Validation)

### 3.1 Tables and Relationships

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  EXISTING (Better Auth — do not change)                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   user                    session                  account                  │
│   ┌──────────────┐       ┌──────────────┐         ┌──────────────┐         │
│   │ id (PK)      │◄──────│ user_id (FK) │         │ user_id (FK) │         │
│   │ name         │       │ token        │         │ providerId   │         │
│   │ email        │       │ expiresAt    │         │ ...          │         │
│   │ ...          │       └──────────────┘         └──────────────┘         │
│   └───────┬──────┘                                                          │
│           │                                                                 │
└───────────│─────────────────────────────────────────────────────────────────┘
            │
            │  auth_user_id (we don’t store this on app_user as "user.id",
            │  we store it as authUserId → user.id)
            ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  NEW IN M1                                                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   app_user                                                                  │
│   ┌──────────────────────────────────────┐                                  │
│   │ id (PK)         text  e.g. user_xxx │  ◄── DEFAULT in DB (see §4)      │
│   │ createdAt       timestamptz         │                                  │
│   │ updatedAt       timestamptz         │                                  │
│   └──────────────────┬─────────────────┘                                  │
│                      │                                                      │
│                      │  userId (FK)                                         │
│                      ▼                                                      │
│   fact                                                                      │
│   ┌──────────────────────────────────────┐                                  │
│   │ id (PK)         text  e.g. fact_xxx  │  ◄── DEFAULT in DB (see §4)      │
│   │ userId (FK)     text  → app_user.id  │  RLS filters on this             │
│   │ content         text  not null       │  the fact body                   │
│   │ createdAt       timestamptz         │                                  │
│   │ updatedAt       timestamptz         │                                  │
│   └──────────────────────────────────────┘                                  │
│   (no title/source in M1 — add later if needed)                             │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 3.2 Column-by-Column (Drizzle-Oriented)

| Table     | Column      | Type        | Constraints / Notes |
|----------|-------------|-------------|----------------------|
| **app_user** | id          | text (PK)   | Prefixed: `user_` + UUID. DEFAULT in DB: `'user_' \|\| gen_random_uuid()::text`. |
|           | authUserId  | text (FK→user.id) | UNIQUE. One app_user per Better Auth user. |
|           | createdAt   | timestamptz | default now() |
|           | updatedAt   | timestamptz | default now(), on update now() |
| **fact**  | id          | text (PK)   | Prefixed: `fact_` + UUID. DEFAULT in DB: `'fact_' \|\| gen_random_uuid()::text`. |
|           | userId      | text (FK→app_user.id) | RLS column: policies use this. |
|           | content     | text        | NOT NULL. Main fact text. |
|           | createdAt   | timestamptz | default now() |
|           | updatedAt   | timestamptz | default now(), on update now() |

No `title` or `source` on `fact` in M1; add in a later milestone if needed.

### 3.3 RLS (Conceptual)

- **fact**: Enable RLS. One policy for SELECT/INSERT/UPDATE/DELETE: `userId = current_setting('app.user_id')::text` (or equivalent). So we never add `WHERE userId = ?` in app code for isolation; RLS enforces it.
- **app_user**: We can enable RLS so that a role only sees its own row if we ever query by a non-primary-key path; for "look up by id" we might not need it. Minimal choice: RLS on `fact` only for M1; add RLS on `app_user` later if needed.

### 3.4 Decisions Locked

- **title / source**: Not in M1. Fact has only id, userId, content, createdAt, updatedAt. Add title/source in a later milestone if needed.
- Naming: `app_user` (singular), `authUserId` in Drizzle (snake_case in DB per migration).

---

## 4. App-Side vs Postgres for Prefixed IDs

### 4.1 What We Need

- Format: `{prefix}_{uuid}` (e.g. `fact_a1b2c3d4-e5f6-7890-1234-5678abcdef00`).
- Uniqueness and type: stored as `text`.

### 4.2 Per-Table DEFAULT in Postgres

Postgres has `gen_random_uuid()`. We use a **per-table DEFAULT** so the DB assigns the id when the row is inserted:

- **app_user**: `id text PRIMARY KEY DEFAULT ('user_' || gen_random_uuid()::text)`
- **fact**: `id text PRIMARY KEY DEFAULT ('fact_' || gen_random_uuid()::text)`

No app code to generate ids; no triggers. On INSERT, if `id` is omitted, Postgres evaluates the default. Drizzle can express this with a `.default(sql\`'user_' || gen_random_uuid()::text\`)`-style default (or equivalent) so migrations and inserts stay consistent.

### 4.3 Why Not Complicate It

- **No shared helper in app**: We don’t add `lib/ids.ts` or pass ids from the app for these tables; the DB owns the default.
- **Per-table is fine**: Each table has its own default expression. We don’t need a generic Postgres function that takes a prefix; the two defaults are simple and explicit.

### 4.4 Comparison (for reference)

| Approach    | Where ID is set        | Pros                          | Cons                               |
|------------|------------------------|-------------------------------|------------------------------------|
| **App-side** | In Node/Bun before INSERT | One place to change format; no DB dependency | Must remember to generate in app for every insert. |
| **DB default** | DEFAULT `'fact_' \|\| gen_random_uuid()::text` per table | Can’t forget; no app logic; simple | Per-table default (we’re fine with that). |

**Decision for M1**: **DB-side per-table DEFAULT.** Use `'user_' || gen_random_uuid()::text` for `app_user.id` and `'fact_' || gen_random_uuid()::text` for `fact.id`. No app-side id generation for these tables.

---

## 5. Effect Patterns — Absolute Requirement

We will use **Effect** for fact CRUD and tRPC integration:

- **Context/Layer**: Drizzle (and any repo) provided via Effect Context/Layer; procedures run in an Effect that uses that context.
- **Procedures**: Fact CRUD implemented as Effect programs (e.g. `FactRepository` in Context); tRPC handlers call `Effect.runPromise` (or equivalent) so the procedure body stays in Effect.
- **Errors**: Use Effect’s error handling (e.g. `Effect.fail`, typed errors) instead of ad-hoc throws where it adds value.
- **Testing**: Tests provide a test Layer (e.g. real DB or test double) and run the same Effect; no mocking of the DB, use Effect DI.

The gameplan will explicitly require: Effect-based fact repository, procedures that run in Effect, and tests that use Effect layers. Any patch that adds fact CRUD will be written to this pattern.

---

## 6. Zod-Drizzle — When We Might Break or Extend the Pattern

### 6.1 The Pattern

- **zod-drizzle**: Derive Zod schemas from Drizzle table definitions so that one source of truth (Drizzle schema) drives both DB shape and validation. Use for **output** (e.g. fact row → API response) and, where it fits, **input** (e.g. create/update payload).

### 6.2 When We Stay Fully Within the Pattern

- **Output**: Fact row from DB → use zod-drizzle derived schema (or a subset) for the procedure return type. No break.
- **Input**: "Create fact" is `{ content: string }` (id, userId, timestamps are server-set). We can derive an input schema from the table (pick `content`) or a minimal ad-hoc schema; zod-drizzle still drives the row/output shape.

### 6.3 When We "Break" or Extend the Pattern

We might **add** Zod rules that aren’t just "same shape as DB":

- **Length/format**: e.g. `content` min/max length, or `content` must not be only whitespace. Those are validation rules, not column types. We’d use Zod refinements or a separate input schema that **extends** or **composes** the derived one (e.g. `createFactInputSchema = z.object({ content: z.string().min(1).max(5000) })`).
- **Transforms**: e.g. trim `content`, default `title` to null. Again, an input schema that starts from the derived shape and adds `.transform()` or `.default()`.
- **Different input vs storage**: e.g. API accepts `sourceUrl` but we store `source` (normalized). Then input schema is not 1:1 with table; we still derive the **table** schema for output and use a custom input schema for the procedure.

So "break the pattern" = **introduce an input (or output) schema that is not a direct derivation of the Drizzle table** when we need validation or API shape that the table alone doesn’t express. We keep **zod-drizzle for the table/row shape** and layer **ad-hoc Zod** for input validation and API-specific fields. The gameplan will say: use zod-drizzle for fact row/output; use derived + refinements (or a composed input schema) for create/update so we don’t drop the pattern when we add rules.

---

## 7. Tests — Confirmation

Agreed approach:

- **Runner**: Bun; real DB (no DB mocks).
- **Effect DI**: Tests use the same Effect layers (or test-specific layers) so we don’t mock the DB.
- **Stubs**: Test stubs (e.g. `.skip` or pending describes) in early [INFRA] patches; implementation and un-skip in the same patch that implements the feature (per create-gameplan skill).
- **RLS**: If we want to assert "user A cannot see user B’s facts," we need two distinct "app user" contexts (two different `app.user_id` settings or two connections). We can add a test that sets `app.user_id`, inserts a fact, then sets `app.user_id` to another user and queries — should get no rows. That stays within "real DB + Effect."

The gameplan’s Test Map will list concrete tests (e.g. "fact.list returns only current user’s facts", "fact.create sets userId from context", optional "RLS blocks cross-user access") and assign stub vs impl patches.

---

## 8. One Migration per Patch, Scoped Work

- **Rule**: One migration file per patch. Each patch that touches the DB introduces exactly one migration (or a single migration that does one logical unit of work).
- **Scoping**: Patches are "reasonably scoped." So we might have:
  - Patch A: Migration 1 — create `app_user` table.
  - Patch B: Migration 2 — create `fact` table (and FK to `app_user`).
  - Patch C: Migration 3 — enable RLS on `fact` and add policies.

Or we could combine into fewer patches (e.g. one patch = one migration that does app_user + fact + RLS) if that’s the right scope. The important part is: **no patch introduces two unrelated migrations**; and **each migration is one logical step** (so we can roll back or re-run cleanly). The gameplan will list patches and, for each, "Migration N: …" with a single, focused migration per patch.

---

## Summary Table

| # | Topic | Decision / Direction |
|---|--------|----------------------|
| 1 | Postgres roles & RLS | **SET LOCAL only.** Set `app.user_id` in tRPC (e.g. in protectedProcedure). No dedicated DB role for M1. |
| 2 | Where to resolve app user | **One place: tRPC only.** Resolve/create app user only in tRPC context. Middleware does not resolve or create; it’s one or the other (we chose tRPC). |
| 3 | Schema shape | **app_user** (id, authUserId, createdAt, updatedAt); **fact** (id, userId, content, createdAt, updatedAt). **No title or source** on fact in M1. |
| 4 | Prefixed IDs | **DB-side per-table DEFAULT.** `'user_' \|\| gen_random_uuid()::text` for app_user; `'fact_' \|\| gen_random_uuid()::text` for fact. No app-side id helper for these tables. |
| 5 | Effect | **Required.** Fact CRUD and tRPC procedures use Effect (Context/Layer, Effect.runPromise). |
| 6 | Zod-drizzle | Use for fact row/output; extend with ad-hoc Zod for create/update input when we need validation. |
| 7 | Tests | Bun, real DB, Effect DI; stubs in early patches, impl in same patch as code; optional explicit RLS test. |
| 8 | Migrations | **One migration per patch**; each migration is one logical scope (e.g. app_user, then fact, then RLS). |

Decisions are locked; the gameplan can be written against this table.
