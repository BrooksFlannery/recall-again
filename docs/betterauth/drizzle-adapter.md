# Drizzle ORM Adapter

Use Better Auth with Drizzle ORM and PostgreSQL (or MySQL, SQLite).

## Installation

Drizzle adapter is built into Better Auth. Ensure Drizzle is installed and configured.

## Example usage

```ts
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "./database.ts";

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg", // or "sqlite" or "mysql"
  }),
  // ... rest of config
});
```

## Schema generation and migration

1. **Generate** the Drizzle schema required by Better Auth (and any plugins):

   ```bash
   npx auth@latest generate
   ```

   Use `--output src/server/db/schema.ts` to control where the schema file is written. Default for Drizzle is `schema.ts` in project root.

2. **Apply** migrations with Drizzle:

   ```bash
   npx drizzle-kit generate
   npx drizzle-kit migrate
   ```

See [CLI](./cli.md) and [Database](./database.md).

## Modifying table names

If your Drizzle schema uses different table names (e.g. `users` instead of `user`), pass the schema and map in the adapter:

```ts
export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      ...schema,
      user: schema.users,
    },
  }),
});
```

Or set `user.modelName: "users"` (and similar) in the auth config.

## Modifying field names

Change column names in your Drizzle schema; keep the schema property names the same so Better Auth still infers correctly. Or use `user.fields: { email: "email_address" }` in the auth config.

## Using plural table names

If all tables are plural, use:

```ts
drizzleAdapter(db, {
  provider: "pg",
  usePlural: true,
})
```

## Experimental joins

For better performance (fewer round-trips), enable joins in auth config:

```ts
export const auth = betterAuth({
  experimental: { joins: true },
});
```

Ensure your Drizzle schema has the necessary relations. The CLI can generate relations; use the latest CLI or add them manually with Drizzle’s `relations()`.

Source: https://www.better-auth.com/docs/adapters/drizzle
