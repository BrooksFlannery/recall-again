# Gameplan: local-dev-ephemeral-db

## Problem Statement

There is no local dev environment setup — `DATABASE_URL` and other secrets must be manually configured per machine, and there is no isolation between worktrees or parallel test runs. Developers working across multiple worktrees (one per feature branch) share the same database, causing state collisions. Running `bun test` from two agents simultaneously against the same DB produces flaky, non-deterministic results.

## Solution Summary

Use `direnv` to automatically derive a per-worktree `DATABASE_URL` from the current git branch name, sourcing shared secrets from a machine-local file outside the repo. Add lightweight DB lifecycle scripts (`db:create`, `db:drop`, `db:setup`, `db:reset`) and worktree wrapper scripts (`wt:new`, `wt:rm`) that provision/teardown a dedicated Postgres database alongside each worktree. Add a Bun test preload file that creates a uniquely-named ephemeral database for each test run and drops it on exit, so parallel agents never share a DB.

## Mergability Strategy

### Feature Flagging Strategy

No feature flag needed. This is pure dev tooling — no app behavior changes.

### Patch Ordering Strategy

- **Patches 1–3** (`[INFRA]`): Config, scripts, and tooling with no app behavior change. Ship in sequence.
- **Patch 4** (`[BEHAVIOR]`): Changes how `bun test` resolves its database. Depends on Patch 2. Can be parallelized with Patch 3.

## Current State Analysis

- No `.envrc` — `DATABASE_URL` must be set manually per worktree/shell session.
- No `~/.recall-again-secrets` convention — Google OAuth and auth secret must be copy-pasted each setup.
- `db:up` runs `docker compose up -d && drizzle-kit migrate` against whatever `DATABASE_URL` is set, with no per-worktree isolation.
- No `scripts/` directory exists.
- No `bunfig.toml` — test preload is not configured.
- `src/server/db/index.test.ts` fails when `DATABASE_URL` is unset; when set, it mutates the shared dev DB.
- `src/server/trpc/routers/ping.test.ts` has the same issue.

## Required Changes

### 1. `.envrc` (new, committed)

```bash
# Source machine-local secrets (never committed)
source_env_if_present ~/.recall-again-secrets

# Derive a per-worktree DB name from the current git branch
# e.g. "facts-crud-rls/patch-1-app-user-table" → "recall_again_facts_crud_rls_patch_1_app_user_table"
_BRANCH=$(git branch --show-current 2>/dev/null | sed 's/[^a-zA-Z0-9]/_/g' | tr '[:upper:]' '[:lower:]')
export DATABASE_URL="postgresql://postgres:postgres@localhost:5432/recall_again_${_BRANCH:-dev}"
unset _BRANCH

export BETTER_AUTH_URL=http://localhost:3000
export NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### 2. `~/.recall-again-secrets` (machine-local, never committed — documented only)

```bash
export GOOGLE_CLIENT_ID=...
export GOOGLE_CLIENT_SECRET=...
export BETTER_AUTH_SECRET=...
```

### 3. `scripts/db-create.ts` (new)

Reads `DATABASE_URL`, extracts the DB name, and issues `CREATE DATABASE` against the admin (`postgres`) database. Ignores error if DB already exists.

```ts
import { execSync } from "child_process";
const parsed = new URL(process.env.DATABASE_URL!);
const dbName = parsed.pathname.slice(1);
const adminUrl = `${parsed.protocol}//${parsed.username}:${parsed.password}@${parsed.host}/postgres`;
try {
  execSync(`psql "${adminUrl}" -c "CREATE DATABASE \\"${dbName}\\""`, { stdio: "inherit" });
} catch {} // already exists — ok
```

### 4. `scripts/db-drop.ts` (new)

```ts
import { execSync } from "child_process";
const parsed = new URL(process.env.DATABASE_URL!);
const dbName = parsed.pathname.slice(1);
const adminUrl = `${parsed.protocol}//${parsed.username}:${parsed.password}@${parsed.host}/postgres`;
execSync(`psql "${adminUrl}" -c "DROP DATABASE IF EXISTS \\"${dbName}\\""`, { stdio: "inherit" });
```

### 5. `scripts/wt-new.sh` (new)

Creates a git worktree for a new branch, runs `direnv allow`, and provisions the worktree's DB via `direnv exec`.

```bash
#!/usr/bin/env bash
set -e
BRANCH=$1
[ -z "$BRANCH" ] && echo "Usage: bun run wt:new <branch>" && exit 1
SAFE=$(echo "$BRANCH" | sed 's/[^a-zA-Z0-9]/_/g' | tr '[:upper:]' '[:lower:]')
REPO_ROOT=$(git rev-parse --show-toplevel)
WD="${REPO_ROOT}/../recall-again--${SAFE}"
git worktree add "$WD" -b "$BRANCH"
direnv allow "$WD/.envrc"
direnv exec "$WD" bun --cwd "$WD" run db:setup
echo "✓ Worktree ready at $WD  (DB: recall_again_${SAFE})"
```

### 6. `scripts/wt-rm.sh` (new)

```bash
#!/usr/bin/env bash
set -e
WD=$(realpath "$1")
[ -z "$WD" ] && echo "Usage: bun run wt:rm <path>" && exit 1
direnv exec "$WD" bun --cwd "$WD" run db:drop
git worktree remove "$WD"
echo "✓ Worktree and DB removed"
```

### 7. `package.json` — new scripts

```json
"db:docker": "docker compose up -d",
"db:create": "bun scripts/db-create.ts",
"db:drop":   "bun scripts/db-drop.ts",
"db:setup":  "bun run db:docker && bun run db:create && bun run db:migrate",
"db:reset":  "bun run db:drop && bun run db:create && bun run db:migrate",
"wt:new":    "bash scripts/wt-new.sh",
"wt:rm":     "bash scripts/wt-rm.sh"
```

`db:up` is superseded by `db:setup` but can be left in place for now.

### 8. `src/test/setup.ts` (new)

Preloaded by Bun before every test run. Derives base URL from `DATABASE_URL` (set by direnv), creates a randomly-named test DB, runs migrations programmatically, and drops the DB on process exit.

```ts
import { execSync } from "child_process";
import { randomBytes } from "crypto";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

const devUrl = process.env.DATABASE_URL;
if (!devUrl) throw new Error("DATABASE_URL not set — is direnv loaded?");

const parsed = new URL(devUrl);
const adminUrl = `${parsed.protocol}//${parsed.username}:${parsed.password}@${parsed.host}/postgres`;
const dbName = `recall_test_${randomBytes(4).toString("hex")}`;
const testUrl = `${parsed.protocol}//${parsed.username}:${parsed.password}@${parsed.host}/${dbName}`;

process.env.DATABASE_URL = testUrl;

execSync(`psql "${adminUrl}" -c "CREATE DATABASE \\"${dbName}\\""`, { stdio: "pipe" });

const pool = new Pool({ connectionString: testUrl });
await migrate(drizzle({ client: pool }), { migrationsFolder: "./drizzle" });
await pool.end();

process.on("exit", () => {
  try { execSync(`psql "${adminUrl}" -c "DROP DATABASE IF EXISTS \\"${dbName}\\""`, { stdio: "pipe" }); } catch {}
});
```

### 9. `bunfig.toml` (new)

```toml
[test]
preload = ["./src/test/setup.ts"]
```

### 10. `src/server/db/index.test.ts` — remove redundant `beforeAll`

The `beforeAll` that calls `migrate()` is superseded by `setup.ts`. Remove it to avoid running migrations twice.

### 11. `.gitignore` — add `.direnv/`

direnv writes a cache directory `.direnv/` to each project root. Add it to `.gitignore`.

## Acceptance Criteria

- [ ] `cd`-ing into any worktree automatically exports `DATABASE_URL` pointing at that worktree's uniquely-named Postgres database (requires `direnv allow` once per worktree)
- [ ] `bun run wt:new <branch>` creates a worktree, creates its DB, and runs migrations in one command
- [ ] `bun run wt:rm <path>` drops the DB and removes the worktree in one command
- [ ] `bun run db:setup` provisions the current worktree's DB and runs migrations from scratch
- [ ] `bun run db:reset` drops and re-provisions the current worktree's DB
- [ ] `bun test` runs against a freshly-created ephemeral DB and drops it on exit
- [ ] Two simultaneous `bun test` invocations from the same worktree use different databases and do not interfere
- [ ] Two worktrees on different branches have different `DATABASE_URL` values
- [ ] Google OAuth credentials and `BETTER_AUTH_SECRET` are sourced from `~/.recall-again-secrets` without any per-worktree setup
- [ ] `direnv allow` is the only manual step required when entering a new worktree for the first time

## Open Questions

1. **Existing worktrees**: This worktree (`facts-crud-rls/patch-1-app-user-table`) already exists. After Patch 1 lands, running `direnv allow` here and then `bun run db:setup` will provision its DB. Document this as a one-time migration step for existing worktrees.
2. **`psql` availability**: `psql` must be installed locally for `db:create`, `db:drop`, and `src/test/setup.ts`. Should we add a check/error message if it's missing?

## Explicit Opinions

1. **`direnv` over `.env.local` per-worktree**: `.env.local` files would need to be created in each new worktree. `direnv` with a committed `.envrc` means new worktrees get the right config for free (after one `direnv allow`).
2. **Branch name as DB name**: Git enforces that no two worktrees share a branch, so the branch name is a reliable unique key per worktree. No UUID or random suffix needed for dev DBs.
3. **`~/.recall-again-secrets` over `vercel env pull`**: Avoids a Vercel CLI dependency for local dev. The secrets file is set up once per machine.
4. **Programmatic migrate in `setup.ts`**: Uses `drizzle-orm`'s `migrate()` directly instead of spawning `drizzle-kit migrate` in a subprocess — faster and avoids a `drizzle-kit` dependency at test time.
5. **`process.on("exit")` for test DB cleanup**: Best-effort. If the process is SIGKILLed, the test DB leaks. This is acceptable — orphaned `recall_test_*` databases can be cleaned up manually and don't affect correctness.
6. **`db:setup` supersedes `db:up`**: `db:up` is left in place but `db:setup` should be the canonical command going forward.

## Patches

### Patch 1 [INFRA]: `.envrc`, `.gitignore`, and machine setup docs

**Files to modify/create:**
- `.envrc` (new)
- `.gitignore` (add `.direnv/`)

**Changes:**
1. Create `.envrc` as described in Required Changes §1.
2. Add `.direnv/` to `.gitignore`.

**One-time machine setup (not in code, just documented):**
- `brew install direnv`
- Add `eval "$(direnv hook zsh)"` to `~/.zshrc`
- Create `~/.recall-again-secrets` with real credentials

---

### Patch 2 [INFRA]: DB lifecycle scripts and `package.json` additions

**Files to modify/create:**
- `scripts/db-create.ts` (new)
- `scripts/db-drop.ts` (new)
- `package.json` (add `db:docker`, `db:create`, `db:drop`, `db:setup`, `db:reset`)

**Changes:**
1. Create `scripts/db-create.ts` as described in Required Changes §3.
2. Create `scripts/db-drop.ts` as described in Required Changes §4.
3. Add scripts to `package.json` as described in Required Changes §7.

---

### Patch 3 [INFRA]: Worktree lifecycle scripts and `package.json` additions

**Files to modify/create:**
- `scripts/wt-new.sh` (new)
- `scripts/wt-rm.sh` (new)
- `package.json` (add `wt:new`, `wt:rm`)

**Changes:**
1. Create `scripts/wt-new.sh` as described in Required Changes §5. Make executable (`chmod +x`).
2. Create `scripts/wt-rm.sh` as described in Required Changes §6. Make executable (`chmod +x`).
3. Add `wt:new` and `wt:rm` to `package.json`.

**Depends on:** Patch 2 (uses `db:setup` and `db:drop`)

---

### Patch 4 [BEHAVIOR]: Ephemeral test DB per run

**Files to modify/create:**
- `src/test/setup.ts` (new)
- `bunfig.toml` (new)
- `src/server/db/index.test.ts` (remove redundant `beforeAll`)

**Changes:**
1. Create `src/test/setup.ts` as described in Required Changes §8.
2. Create `bunfig.toml` as described in Required Changes §9.
3. In `src/server/db/index.test.ts`, remove the `beforeAll` block that calls `migrate()` — migrations are now handled by `setup.ts`.

**Depends on:** Patch 2 (test setup uses `DATABASE_URL` from direnv-derived env, which Patch 1 provides; Patch 2 establishes the DB lifecycle pattern the test setup mirrors)

---

## Test Map

No new test stubs introduced. This gameplan is pure dev tooling — no business logic tests.

After Patch 4, the existing tests (`src/server/db/index.test.ts`, `src/server/trpc/routers/ping.test.ts`) run against the ephemeral test DB and serve as the smoke test for the full setup.

---

## Dependency Graph

```
- Patch 1 [INFRA] -> []
- Patch 2 [INFRA] -> [1]
- Patch 3 [INFRA] -> [2]
- Patch 4 [BEHAVIOR] -> [2]
```

**Mergability insight**: 3 of 4 patches are `[INFRA]` and ship without changing any app or test behavior. Patches 3 and 4 can be executed in parallel after Patch 2.

---

## Mergability Checklist

- [x] Feature flag strategy documented (not needed — dev tooling only)
- [x] Early patches contain only non-functional changes (`[INFRA]`)
- [x] No test stubs needed — this is infrastructure with no business logic
- [x] Test Map is complete (no new tests; existing tests serve as smoke test)
- [x] `[BEHAVIOR]` patches are as small as possible (Patch 4 is 3 files)
- [x] Dependency graph shows `[INFRA]` patches early, `[BEHAVIOR]` patch last
- [x] Patch 4 `[BEHAVIOR]` is justified — test isolation requires runtime DB creation, cannot be gated
