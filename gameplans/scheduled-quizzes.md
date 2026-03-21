# Gameplan: scheduled-quizzes

## Workstream

- **Workstream**: Recall — Facts & Quizzes ([`workstreams/recall-facts-quizzes.md`](../workstreams/recall-facts-quizzes.md))
- **Milestone**: 3b (scheduled-quizzes — spaced repetition + creation)
- **Prior milestones**: 1, 3a, and **[`m3-schema-foundation.md`](m3-schema-foundation.md)** — `fact_review_state`, `quiz.scheduled_for`, indexes, and RLS must already exist; this gameplan adds **logic, helpers, tests, and cron only** (no new DDL here).
- **Unlocks**: [`quiz-taking-and-result-recording.md`](quiz-taking-and-result-recording.md) (M3c) can consume scheduled quizzes and update review state on submit

## Problem Statement

Manual quizzes (M3a) do not model **when** a fact should reappear or how **due** facts are selected for automatic quizzes. The product needs **Fibonacci interval helpers**, **due-fact selection**, **idempotent scheduled quiz creation** per user per day, and a **daily job** that runs without a browser session. Schema for `fact_review_state` and scheduled quiz columns lives in **`m3-schema-foundation`**; this milestone wires behavior on top.

## Solution Summary

Implement **Fibonacci day intervals** `[1, 1, 2, 3, 5, 8, …]` in a small module (e.g. `src/lib/spaced-repetition.ts`). Extend [`QuizRepository`](../src/server/effect/quiz-repository.ts) with **list due fact ids** and **create scheduled quiz** (idempotent using partial unique index from schema foundation). Add a **cron HTTP route** that iterates [`app_user`](../src/server/db/schema-app.ts), runs **per-user transactions** with `SET LOCAL ROLE recall_app` and `set_config('app.user_id', …)` per [`trpc.ts`](../src/server/trpc/trpc.ts), and calls the repository. Document **Vercel Cron** (or equivalent) and local `curl`.

## Mergability Strategy

### Feature Flagging Strategy

**No feature flag required for merging.** Optional ops toggle: `SCHEDULED_QUIZ_CRON_ENABLED=false` to skip work in a given environment—document only.

### Patch Ordering Strategy

- **[INFRA]**: Fibonacci/date helpers + unit tests; skipped integration test stubs.
- **[BEHAVIOR]**: Repository (due + create scheduled quiz); unskip repository tests.
- **[BEHAVIOR]**: Cron route + secret + deployment notes.

## Current State Analysis

| Area | After [`m3-schema-foundation.md`](m3-schema-foundation.md) | This milestone adds |
|------|----------------------------------------------------------|---------------------|
| **`fact_review_state` / `quiz.scheduled_for`** | Present in DB + Drizzle | Queries + inserts from app code |
| **Fibonacci** | N/A | Pure functions + tests |
| **RLS** | Already on new tables | Cron uses per-user `recall_app` + `app.user_id` |
| **Cron** | None | Route handler + scheduling docs |

## Required Changes

### 1) Pure helpers (`src/lib/spaced-repetition.ts` or `src/server/lib/…`)

```ts
/** Days until next review for the n-th successful review (0-based step). */
export const fibonacciIntervalDays = (stepIndex: number): number;
```

- Unit tests: `0 → 1`, `1 → 1`, `2 → 2`, … plus cap policy (see Explicit Opinions in this file).

### 2) Effect layer

Extend [`IQuizRepository`](../src/server/effect/quiz-repository.ts):

```ts
listDueFactIds: (userId: string, asOf: Date) => Effect.Effect<string[]>;

/** Idempotent: no-op if scheduled quiz already exists for (userId, scheduledFor). */
createScheduledQuizFromDueFacts: (
  userId: string,
  options: { scheduledFor: Date; asOf: Date },
) => Effect.Effect<QuizWithItems | null>;
```

- Runs inside a transaction where RLS matches `userId` (caller provides `requestDbLayer` from per-user cron transaction).

### 3) Cron route (e.g. `app/api/cron/scheduled-quizzes/route.ts`)

- `POST`; validate `Authorization: Bearer <CRON_SECRET>`.
- For each `app_user.id`: `db.transaction` → `SET LOCAL ROLE recall_app` + `set_config('app.user_id', appUserId, true)` → repository.
- JSON summary: `{ processedUsers, quizzesCreated, skipped }`.

### 4) Deployment docs

- `vercel.json` crons + env; local `curl`; link [`local-dev-ephemeral-db.md`](local-dev-ephemeral-db.md) if useful.

### 5) New facts → `fact_review_state`

- **Implemented in M3-pre:** `AFTER INSERT ON fact` trigger `fact_review_state_after_fact_insert` (migration `0013_m3_schema_foundation.sql`) inserts a row with `next_review_at` at start of next UTC day and `fibonacci_step_index = 0`. No `FactRepository.create` change is required for M3b unless that trigger is removed later.

## Acceptance Criteria

- [ ] [`m3-schema-foundation.md`](m3-schema-foundation.md) merged before this work (no duplicate migrations).
- [ ] Due facts query matches `nextReviewAt <= endOfRelevantDay(asOf)` (UTC v1 documented).
- [ ] Daily job creates **at most one** scheduled quiz per user per `scheduledFor` (DB constraint + idempotent insert).
- [ ] Job uses **per-user** `recall_app` + `app.user_id`.
- [ ] Cron endpoint secured; wrong secret → 401/403.
- [ ] Tests: Fibonacci helper; scheduled quiz creation + idempotency under RLS; cron auth.
- [ ] New facts get review state (trigger or application—see Open Questions).

## Open Questions

1. **Timezone for “today”**: UTC-only v1 vs per-user later ([workstream](../workstreams/recall-facts-quizzes.md)).
2. **Empty due set**: silent skip vs log.

## Explicit Opinions

1. **Per-user cron transactions** — no `BYPASSRLS` superuser.
2. **Cap Fibonacci step** — reuse last interval after max index.
3. **`scheduledFor`** semantics align with **`m3-schema-foundation`** (UTC `date`).

## Patches

### Patch 1 [INFRA]: Fibonacci / date helpers + unit tests

**Files:** `src/lib/spaced-repetition.ts`, `src/lib/spaced-repetition.test.ts`

### Patch 2 [INFRA]: Integration test stubs (skipped)

**Files:** `src/server/effect/quiz-repository.test.ts` or [`quiz.test.ts`](../src/server/trpc/routers/quiz.test.ts)

**Changes:** `it.skip` for due selection, idempotency, manual unchanged; `// PENDING: Patch 3`.

### Patch 3 [BEHAVIOR]: Repository — due facts + scheduled quiz creation

**Files:** [`quiz-repository.ts`](../src/server/effect/quiz-repository.ts); optional `fact-review-state` helper module

**Changes:** Implement methods; unskip Patch 2 tests; optional `FactRepository` hook for new facts.

### Patch 4 [BEHAVIOR]: Cron route + secret + docs

**Files:** `app/api/cron/scheduled-quizzes/route.ts`, `vercel.json` (if used), dev docs

## Test Map

| Test Name | File | Stub Patch | Impl Patch |
|-----------|------|------------|------------|
| fibonacciIntervalDays > early sequence | spaced-repetition.test.ts | — | 1 |
| fibonacciIntervalDays > cap | spaced-repetition.test.ts | — | 1 |
| createScheduledQuizFromDueFacts > creates scheduled quiz + items | quiz-repository or quiz.test | 2 | 3 |
| createScheduledQuizFromDueFacts > idempotent same day | same | 2 | 3 |
| cron route > rejects bad secret | route test / integration | 2 | 4 |

## Dependency Graph

```
- Patch 1 [INFRA] -> []
- Patch 2 [INFRA] -> []
- Patch 3 [BEHAVIOR] -> [1, 2]
- Patch 4 [BEHAVIOR] -> [3]
```

**Prerequisite:** [`m3-schema-foundation.md`](m3-schema-foundation.md) (DDL) merged.

**Mergability insight:** 2 of 4 patches are `[INFRA]` (helpers + stubs).

## Mergability Checklist

- [x] No duplicate schema work vs `m3-schema-foundation`
- [x] Stubs before repository/cron behavior
- [x] `[BEHAVIOR]` limited to repository + cron (+ optional fact hook)

## Related gameplans

- Prerequisite DDL: [`m3-schema-foundation.md`](m3-schema-foundation.md)
- Next: [`quiz-taking-and-result-recording.md`](quiz-taking-and-result-recording.md)
