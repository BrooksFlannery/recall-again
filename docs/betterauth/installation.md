# Installation

## Install the Package

```bash
npm install better-auth
```

If you're using a separate client and server setup, install Better Auth in both parts of your project.

## Set Environment Variables

Create a `.env` file in the root of your project:

```env
BETTER_AUTH_SECRET=   # At least 32 characters; use `openssl rand -base64 32` or the CLI: npx auth@latest secret
BETTER_AUTH_URL=http://localhost:3000   # Base URL of your app
```

## Create a Better Auth Instance

Create a file named `auth.ts` in one of: `utils/`, `lib/`, or project root (or under `src/`, `app/`, `server/`).

Export the auth instance as `auth` or as default:

```ts
import { betterAuth } from "better-auth";

export const auth = betterAuth({
  //...
});
```

## Configure Database

Better Auth requires a database. With **Drizzle** and **PostgreSQL**:

```ts
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "@/db";

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg", // or "mysql", "sqlite"
  }),
});
```

## Create Database Tables

Use the CLI to generate the schema required by Better Auth:

```bash
npx auth@latest generate
```

For Drizzle, the schema is generated; then use your ORM to migrate:

```bash
npx drizzle-kit generate
npx drizzle-kit migrate
```

See [CLI](./cli.md) and [Drizzle adapter](./drizzle-adapter.md).

## Mount Handler (Next.js App Router)

Create the catch-all route for `/api/auth/*`:

**`app/api/auth/[...all]/route.ts`**

```ts
import { auth } from "@/lib/auth";
import { toNextJsHandler } from "better-auth/next-js";

export const { POST, GET } = toNextJsHandler(auth);
```

## Create Client Instance

**`lib/auth-client.ts`** (React):

```ts
import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
  baseURL: "http://localhost:3000", // optional if same domain
});
```

Source: https://www.better-auth.com/docs/installation
