# Gameplan: manual-quizzes

## Workstream

- **Workstream**: Recall — Facts & Quizzes
- **Milestone**: 3a (manual-quizzes / on-demand)
- **Prior milestones**: 1 (facts-crud-rls), 2 (ai-question-generation) optionally (for `questionId` attachment)
- **Unlocks**: 3b (scheduled-quizzes), 3c (quiz-taking-and-result-recording)

## Problem Statement

The workstream needs a first quiz flow that is **user-triggered** and intentionally **not tied to spaced repetition**. Today we have facts (with RLS) and flashcards/questions, but we do not have a “quiz session” data model, nor an API to create a quiz by selecting **N random facts** for the current user. We need manual quizzes to validate quiz session modeling and UI wiring while guaranteeing that manual quiz answers **do not** affect any future scheduled review state.

## Solution Summary

Introduce `quiz` + `quiz_item` tables with a `mode` field, starting with `manual`. Enable RLS on both tables using the same `current_setting('app.user_id')` mechanism already used for `fact`, and grant `recall_app` the required privileges. Add a `QuizRepository` Effect service that can: create a manual quiz, randomly select N facts owned by the user, insert quiz items, and fetch a quiz with its items. Expose this via a new `quiz` tRPC router (`quiz.createManual`, `quiz.getById`) built on `protectedProcedure`. Add Bun tests that prove: selection is random+bounded, cross-user isolation holds, and manual quiz creation has **no schedule side-effects** (i.e., it does not touch any future `fact_review_state` table).

## Mergability Strategy

### Feature Flagging Strategy

**No feature flag needed.** This is additive functionality behind authenticated endpoints. It does not change any existing behavior for facts/questions, and manual quizzes are explicitly separate from scheduled quizzes (M3b).

### Patch Ordering Strategy

- **Early ([INFRA])**: Schema + migrations for `quiz`/`quiz_item`, RLS policies, grants for `recall_app`, and Zod schemas.
- **Middle ([INFRA])**: Effect repository + tRPC router skeletons, plus test stubs (`.skip`) describing expected behavior.
- **Late ([BEHAVIOR])**: Implement repository logic + endpoints, unskip tests.

## Current State Analysis

| Area | Current state | Gap for M3a |
|------|---------------|-------------|
| **Facts** | `schemaApp.fact` exists with RLS, CRUD via `factRouter` + `FactRepository` | We can safely select facts per user, but no quiz session model exists |
| **Questions** | `schemaApp.flashcard` exists; generated via `fact.generateQuestion` | Manual quiz may attach `factId` only or optionally `questionId` |
| **RLS mechanism** | `protectedProcedure` uses `SET LOCAL ROLE recall_app` and `set_config('app.user_id', ...)` in `src/server/trpc/trpc.ts` | Need same pattern for new quiz tables |
| **Tests** | Bun tests run migrations, create app users manually, and call tRPC routers via caller factory | We can add quiz tests following `src/server/trpc/routers/fact.test.ts` patterns |

## Required Changes

### 1) DB schema (`src/server/db/schema-app.ts`)

- Add `quiz` and `quiz_item` tables, plus relations to `appUser`, `fact`, and optionally `flashcard`.
- Suggested fields:
  - `quiz.id` default `'quiz_' || gen_random_uuid()`
  - `quiz.userId` FK → `app_user.id`
  - `quiz.mode` as `text` (value: `'manual'` for now)
  - `quiz.createdAt`
  - `quiz_item.id` default `'qitm_' || gen_random_uuid()`
  - `quiz_item.quizId` FK → `quiz.id`
  - `quiz_item.factId` FK → `fact.id`
  - optional `quiz_item.flashcardId` FK → `flashcard.id` (if we want a stable question for the quiz item)
  - `quiz_item.position` integer ordering
  - `quiz_item.createdAt`

### 2) Migrations (`drizzle/*.sql`)

- Create tables.
- Enable + force RLS on `quiz` and `quiz_item`.
- Policies:
  - `quiz`: `user_id = current_setting('app.user_id', true)::text`
  - `quiz_item`: allow access via join on `quiz.user_id` OR denormalize `user_id` onto `quiz_item` (explicit opinion below).
- Grants to `recall_app`:
  - `GRANT SELECT, INSERT ON quiz TO recall_app`
  - `GRANT SELECT, INSERT ON quiz_item TO recall_app`

### 3) Zod schemas (`src/server/schemas/quiz.ts`, `src/server/schemas/quiz-item.ts`)

- `QuizSelectSchema` via `createSelectSchema(quiz)`
- `QuizItemSelectSchema` via `createSelectSchema(quizItem)`
- Input schemas:
  - `CreateManualQuizInputSchema`: `{ count?: number }` with bounds (e.g. 1–50) and defaulting in router
  - `QuizGetByIdInputSchema`: `{ id: string }`

### 4) Effect repository (`src/server/effect/quiz-repository.ts`)

New service with signatures like:

```ts
export interface IQuizRepository {
  createManualQuiz: (args: {
    appUserId: string;
    count: number;
  }) => Effect.Effect<{
    quiz: QuizSelect;
    items: Array<QuizItemSelect & { fact: FactSelect; flashcard?: QuestionSelect | null }>;
  }>;

  getById: (args: {
    id: string;
  }) => Effect.Effect<{
    quiz: QuizSelect;
    items: Array<QuizItemSelect & { fact: FactSelect; flashcard?: QuestionSelect | null }>;
  } | null>;
}
```

Implementation notes:
- Random selection can be `ORDER BY random() LIMIT count` over `fact` (RLS-safe).
- Use a single transaction via the request-scoped `Db` from `protectedProcedure` (already a transaction in `protectedProcedure`).
- Insert `quiz` then bulk insert `quiz_item`.
- Query back the quiz + items with joined fact (and optional flashcard).

### 5) tRPC router (`src/server/trpc/routers/quiz.ts`) + wiring (`src/server/trpc/root.ts`)

- Add `quizRouter` with procedures:
  - `createManual`: protected, input `{ count?: number }`, output `{ quiz, items }`
  - `getById`: protected, input `{ id: string }`, output nullable `{ quiz, items }`
- Wire it into `appRouter` in `src/server/trpc/root.ts` under `quiz`.

### 6) Tests (`src/server/trpc/routers/quiz.test.ts`)

- Mirror patterns from `fact.test.ts`:
  - Create two users, create facts, call `quiz.createManual`, assert quiz id prefix, item count, and that items reference only current user facts.
  - Assert `count` is bounded (e.g. request 100, get max or validation error).
  - Assert `quiz.getById` respects RLS: user B cannot load user A quiz.
  - Assert “no scheduling side-effects”: no writes outside `quiz`/`quiz_item` (practically: ensure the implementation does not reference `fact_review_state`; in M3a we can enforce this by absence of that table and code-level constraints).

## Acceptance Criteria

- [ ] A user can create a **manual** quiz via tRPC that selects **N random facts** owned by them.
- [ ] Manual quiz creation and retrieval are protected by auth and enforced by DB RLS (user B cannot read user A quiz/items).
- [ ] Manual quiz creation does **not** depend on any spaced repetition due-logic (no `nextReviewAt`, no “overdue” query).
- [ ] Manual quiz answers/results (if stored in M3a) have **no effect** on any future scheduled review state.
- [ ] Bun tests cover: happy path, cross-user isolation, and bounds/validation.

## Open Questions

1. **Should `quiz_item` denormalize `userId`?** If not, RLS needs a policy that checks ownership via `quiz_id` → `quiz.user_id`, which is more complex but avoids redundancy.
2. **Do manual quiz items point at `factId` only, or pin a specific `flashcardId`?** Pinning avoids “question changed since quiz created,” but requires generating/choosing a flashcard at creation time.
3. **Count bounds and defaults**: What are the default `count` and the maximum allowed? (Suggested default: 10, max: 50.)

## Explicit Opinions

1. **Denormalize `userId` onto `quiz_item`.** It makes RLS policies simple and consistent with `fact` and `quiz` (single-table check against `current_setting('app.user_id')`). The redundancy is low-risk and avoids a join inside RLS.
2. **Start with `factId` only for quiz items.** It keeps M3a lightweight. If the UI needs question text, it can fetch the latest flashcard for the fact (or show fact content) until M3c tightens the “take quiz” shape.
3. **Use `ORDER BY random()`** for selection. It’s simple and correct for small-to-medium datasets. If performance becomes an issue later, we can optimize with sampling strategies.

## Patches

### Patch 1 [INFRA]: Add `quiz` and `quiz_item` tables to Drizzle schema
**Files to modify:**
- `src/server/db/schema-app.ts`

**Changes:**
1. Add `quiz` and `quiz_item` tables (ids, FKs, timestamps, `mode`, `position`)
2. Add relations for joins used in repository reads

### Patch 2 [INFRA]: Add migrations for quiz tables + RLS + grants
**Files to add/modify:**
- `drizzle/0009_<name>.sql` (create tables)
- `drizzle/0010_<name>.sql` (enable/force RLS + policies)
- `drizzle/0011_<name>.sql` (grants to `recall_app`)

**Changes:**
1. Create `quiz`/`quiz_item`
2. Enable + force RLS on both
3. Add policies keyed by `app.user_id`
4. Grant required privileges to `recall_app`

### Patch 3 [INFRA]: Add quiz schemas (select + inputs)
**Files to add:**
- `src/server/schemas/quiz.ts`
- `src/server/schemas/quiz-item.ts`

**Changes:**
1. Add select schemas via `drizzle-zod`
2. Add `CreateManualQuizInputSchema` with defaults/bounds

### Patch 4 [INFRA]: Add test stubs for manual quiz behavior
Introduces test stubs: `quiz.createManual`, `quiz.getById` RLS, count validation.

**Files to add:**
- `src/server/trpc/routers/quiz.test.ts`

**Changes:**
1. Add `.skip` tests with `// PENDING: Patch 6` describing setup/expectations

### Patch 5 [INFRA]: Add `QuizRepository` service + router skeleton
**Files to add/modify:**
- `src/server/effect/quiz-repository.ts`
- `src/server/trpc/routers/quiz.ts`
- `src/server/trpc/root.ts`

**Changes:**
1. Add `QuizRepository` interface and live layer (methods may throw `NOT_IMPLEMENTED` initially)
2. Add `quizRouter` with `createManual` and `getById` procedures wired to the repository
3. Add `quiz` to `appRouter`

### Patch 6 [BEHAVIOR]: Implement manual quiz creation + retrieval and unskip tests
Unskips and implements: all tests in `src/server/trpc/routers/quiz.test.ts`.

**Files to modify:**
- `src/server/effect/quiz-repository.ts`
- `src/server/trpc/routers/quiz.ts`
- `src/server/trpc/routers/quiz.test.ts`

**Changes:**
1. Implement random fact selection (bounded by `count`)
2. Insert `quiz` + `quiz_item` rows
3. Implement `getById` returning quiz with items and joined facts
4. Enforce RLS behavior via `protectedProcedure` (already sets role + user id)
5. Remove `.skip` and implement assertions

## Test Map

| Test Name | File | Stub Patch | Impl Patch |
|-----------|------|------------|------------|
| quiz.createManual > returns quiz with N items | `src/server/trpc/routers/quiz.test.ts` | 4 | 6 |
| quiz.createManual > only selects current user's facts (RLS) | `src/server/trpc/routers/quiz.test.ts` | 4 | 6 |
| quiz.createManual > validates/bounds count | `src/server/trpc/routers/quiz.test.ts` | 4 | 6 |
| quiz.getById > user cannot read another user's quiz (RLS) | `src/server/trpc/routers/quiz.test.ts` | 4 | 6 |

## Dependency Graph

```
- Patch 1 [INFRA] -> []
- Patch 2 [INFRA] -> [1]
- Patch 3 [INFRA] -> [1]
- Patch 4 [INFRA] -> [2, 3]
- Patch 5 [INFRA] -> [1, 3]
- Patch 6 [BEHAVIOR] -> [2, 3, 4, 5]
```

**Mergability insight**: 5 of 6 patches are `[INFRA]` and can ship without changing observable behavior. Only Patch 6 introduces new user-visible behavior (creating/retrieving manual quizzes).

## Mergability Checklist

- [ ] Feature flag strategy documented (or explained why not needed)
- [ ] Early patches contain only non-functional changes (`[INFRA]`)
- [ ] Test stubs with `.skip` markers are in early `[INFRA]` patches
- [ ] Test implementations are co-located with the code they test (same patch)
- [ ] Test Map is complete: every test has Stub Patch and Impl Patch assigned
- [ ] Test Map Impl Patch matches the patch that implements the tested code
- [ ] `[BEHAVIOR]` patches are as small as possible
- [ ] Dependency graph shows `[INFRA]` patches early, `[BEHAVIOR]` patches late
- [ ] Each `[BEHAVIOR]` patch is clearly justified (cannot be gated or deferred)

