# CLI

Better Auth includes a built-in CLI for managing database schemas, initializing your project, generating a secret key, and gathering diagnostic information.

## Generate

Creates the schema required by Better Auth. For Drizzle (or Prisma), it generates the right schema for your ORM. For Kysely, it generates an SQL file.

```bash
npx auth@latest generate
```

### Options

- **`--yes`** — Skip the confirmation prompt and generate the schema directly.
- **`--config`** — Path to your Better Auth config file. Default: CLI searches for `auth.ts` in `./`, `./utils`, `./lib`, or under `src/`.
- **`--output`** — Where to save the generated schema. For Drizzle, default is `schema.ts` in project root. Use e.g. `--output src/server/db/schema.ts` to place it in your app.

**Output locations by adapter:**

- **Prisma**: `prisma/schema.prisma`
- **Drizzle**: `schema.ts` (project root) unless `--output` is set
- **Kysely**: `schema.sql` (project root)

After generation, apply migrations with your ORM (e.g. `drizzle-kit generate` then `drizzle-kit migrate`).

## Migrate

Applies the Better Auth schema directly to the database. **Only available for the built-in Kysely adapter.** For Drizzle/Prisma, use `generate` and then your ORM’s migrate commands.

```bash
npx auth@latest migrate
```

### Options

- **`--yes`** — Skip confirmation.
- **`--config`** — Path to auth config file.

## Init

Initialize Better Auth in your project:

```bash
npx auth@latest init
```

Options: `--package-manager`, `--database`, `--plugins`, `--framework`, `--name`.

## Info

Diagnostic information about your Better Auth setup:

```bash
npx auth@latest info
```

Options: `--json`, `--config`. Sensitive data (secrets, DB URLs) is auto-redacted.

## Secret

Generate a secret key for your Better Auth instance:

```bash
npx auth@latest secret
```

Source: https://www.better-auth.com/docs/concepts/cli
