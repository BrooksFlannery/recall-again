---
name: template-fp-philosophy
description: Functional programming and type-safety philosophy for this template - parse don't validate, illegal states unrepresentable, RLS, etc. Use when designing types, APIs, or business logic.
---

# Template FP Philosophy

1. **Parse, Don't Validate** — Return `Option<T>` or `Either<E, T>`, not `boolean`. Parse at boundaries.
2. **Make Illegal States Unrepresentable** — Encode invariants in types. If it compiles, it's valid.
3. **Push Burden of Proof Upward** — Require validated types. Prefer passing `Option`/`Either` back to callers.
4. **Distinct Types for Distinct Concepts** — Use branded types. Don't reuse types with same shape.
5. **Minimize Abstraction Boundaries** — Prefer direct functions over wrappers. Don't abstract until multiple use cases exist.
6. **Do Work for the User** — Provide safe APIs with opaque types. Make right way the easy way.
7. **Comments are Self-Contained** — No spatially alien (non-local code) or temporally alien (past/future state) references.
8. **Use Most Restrictive Type** — Prefer `readonly`, `Option`, `Either`, branded types.
9. **Put Everything in Type System** — Encode business rules in types. Use type-level programming.
10. **Handle Responsibility Explicitly** — Never silently ignore `Option`/`Either`. Use `match`/`getOrElse` or pass back.
11. **Avoid Change Detector Tests** — Test behavior/outcomes, not implementation details.
12. **RLS as Security Boundary** — DB-enforced isolation via RLS. Use `SET LOCAL app.user_id`. Write queries as if already scoped. Test policies thoroughly. Stay provider-agnostic.
