# Database

Better Auth connects to a database to store users, sessions, and more. Plugins can define additional tables.

## CLI: Generate schema

Use the **generate** command to create the schema required by Better Auth (and your chosen ORM):

```bash
npx auth@latest generate
```

For Drizzle/Prisma, then run your ORM’s migrate. For Kysely, you can use `npx auth@latest migrate` to apply directly.

See [CLI](./cli.md).

## Core schema

Better Auth requires these tables. The CLI generates them for your ORM.

### User

**Table name:** `user`

| Field         | Type    | Key | Description                    |
|---------------|---------|-----|--------------------------------|
| id            | string  | pk  | Unique identifier              |
| name          | string  | —   | Display name                   |
| email         | string  | —   | Email address                  |
| emailVerified | boolean | —   | Whether email is verified      |
| image         | string? | —   | User image URL                 |
| createdAt     | Date    | —   | Account creation time          |
| updatedAt     | Date    | —   | Last update time               |

### Session

**Table name:** `session`

| Field     | Type   | Key | Description     |
|-----------|--------|-----|-----------------|
| id        | string | pk  | Unique ID       |
| userId    | string | fk  | User ID         |
| token     | string | —   | Session token   |
| expiresAt | Date   | —   | Expiry time     |
| ipAddress | string?| —   | Device IP        |
| userAgent | string?| —   | User agent      |
| createdAt | Date   | —   | Creation time   |
| updatedAt | Date   | —   | Last update     |

### Account

**Table name:** `account`

| Field                  | Type   | Key | Description        |
|------------------------|--------|-----|--------------------|
| id                     | string | pk  | Unique ID          |
| userId                 | string | fk  | User ID            |
| accountId              | string | —   | Provider account ID|
| providerId             | string | —   | Provider ID        |
| accessToken            | string?| —   | OAuth access token |
| refreshToken           | string?| —   | OAuth refresh token|
| accessTokenExpiresAt   | Date?  | —   | Access token expiry|
| refreshTokenExpiresAt  | Date?  | —   | Refresh token expiry|
| scope                  | string?| —   | OAuth scope       |
| idToken                | string?| —   | ID token          |
| password               | string?| —   | Email/password    |
| createdAt              | Date   | —   | Creation time     |
| updatedAt              | Date   | —   | Last update       |

### Verification

**Table name:** `verification`

| Field       | Type   | Key | Description   |
|-------------|--------|-----|---------------|
| id          | string | pk  | Unique ID     |
| identifier  | string | —   | Request ID    |
| value       | string | —   | Value to verify|
| expiresAt   | Date   | —   | Expiry        |
| createdAt   | Date   | —   | Creation time |
| updatedAt   | Date   | —   | Last update   |

## Custom table names

Use `modelName` and `fields` in your auth config to map to different table/column names. Type inference in code still uses the original field names.

## Extending core schema

Use `user.additionalFields` and `session.additionalFields` in your auth config to add custom columns. The CLI will include them when you run `generate` again.

Source: https://www.better-auth.com/docs/concepts/database
