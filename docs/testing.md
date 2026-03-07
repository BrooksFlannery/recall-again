# Testing & DI Conventions

Project rules for testing and dependency injection. These are non-negotiable for this codebase.

## Bun-only project

This is a **Bun project**. Use **Bun** for everything: installs, scripts, and testing.

- **Install deps**: `bun install` (not npm/pnpm/yarn)
- **Run scripts**: `bun run dev`, `bun run build`, `bun run db:migrate`, etc.
- **Test**: `bun test` (see below)

Do not introduce or document npm, pnpm, or yarn for this repo.

## Test runner: Bun test

We use the **Bun test runner** as the exclusive test runner.

- Run tests with: `bun test`
- The `test` script in `package.json` is: `"test": "bun test"`
- Do not introduce Jest, Vitest, or Node’s built-in test runner for this project.

## No mocking: use Effect DI

We should **not** need to mock things. If we find ourselves mocking, that’s a sign the code isn’t effectful enough.

- **Prefer Effect’s DI**: Put dependencies (DB, config, external services) in the Effect **context** (the `R` in `Effect<A, E, R>`). Build them with **Layers** and provide the right layer at runtime.
- **In tests**: Provide test implementations via Layers (e.g. a test DB layer, a in-memory or test double for an external API) instead of mocking. Swap the layer when running tests; no `jest.fn()` or similar.
- **Refactor signal**: Needing to mock a module or function usually means that dependency should be in the Effect context so tests can supply a different implementation.

## Real database for tests

We are **not allowed** to mock the database.

- Tests must run against a **real** database (Postgres).
- Options: use the same Docker Compose Postgres with a dedicated test database (e.g. `DATABASE_URL_TEST`), or spin up a real Postgres (e.g. testcontainers or CI service) before the test suite.
- Run migrations (or apply schema) before tests so the test DB has the correct schema.
- No fake DBs, in-memory SQLite substitutes for Postgres, or DB mocks in the test suite.

## Summary

| Rule | Meaning |
|------|--------|
| **Bun-only project** | Use Bun for install, scripts, and testing; no npm/pnpm/yarn. |
| **Bun test** | `bun test` is the only test runner (no Jest, Vitest, etc.). |
| **No mocking** | Use Effect Layers/Context for DI; if you’re mocking, refactor to be more effectful. |
| **Real DB** | Tests use a real Postgres instance; never mock the DB. |

See also: [Effect docs](./effect/README.md) for Layer/Context usage.
