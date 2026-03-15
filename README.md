# nextjs-effect-trpc-drizzle-boilerplate

A production-ready Next.js App Router boilerplate using **Effect TS**, **tRPC v11**, **Drizzle ORM**, **Zod**, and **Better Auth** — with PostgreSQL as the only database target.

## Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 15 (App Router) |
| Business logic / error handling | Effect TS |
| API | tRPC v11 + React Query |
| Database ORM | Drizzle ORM |
| Schema validation | Zod + drizzle-zod |
| Auth | Better Auth (Drizzle adapter) |
| Database | PostgreSQL (Docker locally, Neon in prod) |
| Runtime / package manager | Bun |

## Quick Start

### 1. Install dependencies

```bash
bun install
```

### 2. Configure environment variables

```bash
cp .env.example .env
```

Edit `.env` — see [Environment Variables](#environment-variables) below.

### 3. Start the database (local)

```bash
bun run db:up
```

This starts a standard PostgreSQL container on `localhost:5432` and immediately runs any pending migrations.

### 4. Start the dev server

```bash
bun run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Scripts

| Command | Description |
|---|---|
| `bun run dev` | Start Next.js dev server |
| `bun run build` | Production build |
| `bun run start` | Start production server |
| `bun test` | Run tests with Bun test runner |
| `bun run db:up` | Start local Postgres via Docker Compose |
| `bun run db:generate` | Generate Drizzle migration files from schema |
| `bun run db:migrate` | Apply pending migrations to the database |
| `bun run db:studio` | Open Drizzle Studio (local DB browser) |
| `bun run auth:generate` | Regenerate Better Auth Drizzle schema via CLI |

> **Bun only** — use `bun install` and `bun run <script>` for everything. Do not use npm or yarn.

## Environment Variables

Copy `.env.example` to `.env` and fill in the values.

### `DATABASE_URL`

**Local** (Docker Compose):
```
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/recall_again
```

**Production** (Neon):
```
DATABASE_URL=postgresql://<user>:<password>@<host>.neon.tech/<dbname>?sslmode=require
```

Use a standard PostgreSQL connection string — no extensions or fancy drivers required.

### `BETTER_AUTH_SECRET`

A random string of at least 32 characters used to sign sessions. Generate one with:

```bash
openssl rand -base64 32
```

### `BETTER_AUTH_URL`

The public base URL of your app.

- Local: `http://localhost:3000`
- Production: `https://your-domain.com`

## Database

### Local development

A `docker-compose.yml` is included. Start Postgres and apply migrations with:

```bash
bun run db:up
```

### Production (Neon)

Set `DATABASE_URL` to your Neon connection string (with `?sslmode=require`). Run `bun run db:migrate` as part of your deploy step.

### Schema changes

1. Edit schema files under `src/server/db/`
2. `bun run db:generate` — generate a new migration
3. `bun run db:migrate` — apply it

## Auth

Better Auth is mounted at `/api/auth/*`. The Drizzle schema for auth tables (user, session, account, verification) was generated with:

```bash
bun run auth:generate
```

Re-run this command if you add Better Auth plugins that require new tables.

## Example Procedure

The `ping.getLatest` tRPC procedure demonstrates the full stack:

- tRPC router at `src/server/routers/`
- Effect TS for business logic (wrapped with `Effect.runPromise`)
- Drizzle query against the example `ping` table
- Zod/drizzle-zod for input/output validation
- Called from the client via `createTRPCReact` + React Query in `app/page.tsx`

## Testing

Tests use **Bun test** exclusively (`bun test`). The test suite runs against a real PostgreSQL database — no mocking. Start the Docker database and run migrations before running tests.

See [docs/testing.md](docs/testing.md) for conventions and setup details.

## Docs

- [docs/betterauth/](docs/betterauth/) — Better Auth integration notes
- [docs/effect/](docs/effect/) — Effect TS patterns used in this project
- [docs/ids.md](docs/ids.md) — Prefixed ID convention (e.g. `user_`, `fact_`, `quiz_`)
- [docs/testing.md](docs/testing.md) — Testing conventions and Bun test runner setup
