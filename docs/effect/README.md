# Effect — Reference

This project uses [Effect](https://effect.website) (Effect TS) for server-side business logic, error handling, and dependency injection.

## Official docs

- **Documentation**: https://effect.website/docs
- **API Reference**: https://effect.website/docs/api
- **GitHub**: https://github.com/Effect-TS/effect
- **Discord**: https://discord.gg/effect-ts

## What is Effect?

Effect is a TypeScript library for building composable, type-safe programs with structured error handling, dependency injection via Layers/Context, and fiber-based concurrency.

## The Effect type

```typescript
Effect<Success, Error, Requirements>
```

- **Success** (`A`) — the value the effect produces on success
- **Error** (`E`) — the typed error the effect may fail with
- **Requirements** (`R`) — the set of services/dependencies needed to run the effect

## Key concepts

### Pipelines & composition

Use `pipe` to compose effects sequentially. Core operators:

- **`Effect.map`** — transform the success value
- **`Effect.flatMap`** — chain effects where the next depends on the previous result
- **`Effect.andThen`** — universal chaining (values, functions, promises, or effects)
- **`Effect.tap`** — run side effects without changing the value
- **`Effect.all`** — combine multiple effects (concurrent or sequential)

```typescript
import { Effect, pipe } from "effect"

const program = pipe(
  fetchUser(id),
  Effect.flatMap((user) => fetchPosts(user.id)),
  Effect.map((posts) => posts.length),
)
```

### Layers & Dependency Injection

Layers are constructors for services. They carry the type:

```
Layer<RequirementsOut, Error, RequirementsIn>
```

Define a layer with no deps using `Layer.succeed`, or with deps using `Layer.effect`:

```typescript
import { Layer, Effect, Context } from "effect"

// Define a service tag
class Database extends Context.Tag("Database")<Database, { query: (sql: string) => Effect.Effect<unknown> }>() {}

// Live implementation
const DatabaseLive = Layer.effect(
  Database,
  Effect.gen(function* () {
    const config = yield* Config
    const pool = createPool(config.databaseUrl)
    return { query: (sql) => Effect.promise(() => pool.query(sql)) }
  }),
)

// Test implementation
const DatabaseTest = Layer.succeed(Database, {
  query: () => Effect.succeed([]),
})
```

Compose layers with `Layer.merge` and provide them to an effect with `Effect.provide`:

```typescript
const AppLayer = Layer.merge(DatabaseLive, ConfigLive)
const result = await Effect.runPromise(myProgram.pipe(Effect.provide(AppLayer)))
```

### Runtime

Run an effect with:

- `Effect.runPromise` — returns a Promise (throws on failure)
- `Effect.runPromiseExit` — returns a Promise of Exit (never throws)
- `Effect.runSync` — synchronous execution

## In this repo

- Server-side tRPC procedures use Effect for DB access and business logic.
- DB and config are provided via Effect Layers (see `src/server/effect/` or `src/lib/effect/`).
- Tests swap in test layers instead of mocking — see [docs/testing.md](../testing.md).

Source: https://effect.website/docs
