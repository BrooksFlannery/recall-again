# Effect — Reference

This project uses [Effect](https://effect.website) (Effect TS) for server-side business logic, error handling, and dependency injection.

## Official docs

- **Documentation**: https://effect.website/docs
- **API Reference**: https://effect.website/docs/api
- **GitHub**: https://github.com/Effect-TS/effect

## Key concepts (summary)

- **Effect&lt;A, E, R&gt;** — A value that describes a program that may succeed with `A`, fail with `E`, and require services `R`.
- **Layer** — A recipe for building services (e.g. DB client, config). Compose layers and provide them to your effect program.
- **Context** — The `R` in `Effect<A, E, R>`; the set of services required to run the effect. Provided at runtime via `Layer` or `Effect.provide`.
- **Runtime** — Run an effect with `Effect.runPromise`, `Effect.runPromiseExit`, or a custom runtime. Provide layers so all required services are available.

## In this repo

- Server-side tRPC procedures use Effect for DB access and business logic (e.g. `Effect.runPromise` to execute effects).
- DB and config are provided via Effect layers (see `src/server/effect/` or `src/lib/effect/`).

For full guides and examples, see the official Effect documentation.
