# Prefixed IDs

All primary keys and public identifiers for app entities use **prefixed IDs**.

## Rule

- **Format**: `{prefix}_{id}`
- **Prefix**: 1–4 letters, lowercase. Indicates the entity type (e.g. `user`, `fact`, `quiz`).
- **Id**: A **UUID** (v4 random). Use your runtime’s built-in support (e.g. `crypto.randomUUID()` in Node/Bun) and prepend the prefix.

## Examples

| Entity   | Prefix | Example ID        |
|----------|--------|-------------------|
| App user | `user` | `user_550e8400-e29b-41d4-a716-446655440000` |
| Fact     | `fact` | `fact_a1b2c3d4-e5f6-7890-1234-5678abcdef00`  |
| Quiz     | `quiz` | `quiz_fedcba98-7654-3210-fedc-ba9876543210`  |
| Question | `ques` | `ques_01234567-89ab-cdef-0123-456789abcdef`  |

## Why

- **Type safety**: You can tell the entity type from the id in logs, URLs, and APIs.
- **Consistency**: One pattern for all app-owned ids; UUID is the standard for the suffix—no nanoid/cuid mix.
- **Database**: UUIDs are well-supported (e.g. PostgreSQL `uuid` type), and you can use `crypto.randomUUID()` with no extra deps.
- **Debugging**: Easier to spot mistakes (e.g. passing a `fact_` id where a `user_` id is expected).

## Scope

This applies to **app-defined** entities (e.g. `app_user`, `fact`, `quiz`, `question`). Auth-provider tables (Better Auth `user`, `session`, `account`) keep their existing id format.
