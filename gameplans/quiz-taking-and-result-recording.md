# Gameplan: quiz-taking-and-result-recording

## Workstream

- **Workstream**: Recall — Facts & Quizzes ([`workstreams/recall-facts-quizzes.md`](../workstreams/recall-facts-quizzes.md))
- **Milestone**: 3c (quiz-taking-and-result-recording)
- **Prior milestones**:
  - **Required**: 1 (facts), 2 (flashcards / questions to display), 3a (manual quizzes), [`m3-schema-foundation.md`](m3-schema-foundation.md) (answer columns + `fact_review_state` on `quiz_item` / DB)
  - **For full scheduled flow**: 3b ([`scheduled-quizzes.md`](scheduled-quizzes.md)) — cron-created scheduled quizzes; 3c behavior differs by `quiz.mode`
- **Unlocks**: Product polish (notifications, history UI, analytics)

## Problem Statement

Users can **create** quizzes (M3a) and the system can **generate** scheduled quizzes (M3b), but there is no first-class API to **load a quiz for study**, **record self-graded correct/incorrect per item**, or **advance spaced-repetition state** for scheduled items. Without M3c, the recall loop does not close.

## Solution Summary

Add **tRPC procedures** (Effect + repositories) to fetch a quiz with items (and joined **active** [`flashcard`](../src/server/db/schema-app.ts) for prompts), and to **submit** a result per `quiz_item`. Persist to **`quiz_item.result`** and **`quiz_item.answeredAt`** (from schema foundation). Use [`src/lib/spaced-repetition.ts`](../src/lib/spaced-repetition.ts) (introduced in M3b gameplan) inside a transaction: **manual** quizzes only update item rows; **scheduled** quizzes also update **`fact_review_state`** (correct → next Fibonacci interval; wrong → reset step + next day). Enforce ownership via **`protectedProcedure`** and RLS.

## Mergability Strategy

### Feature Flagging Strategy

**Optional:** `QUIZ_SUBMIT_ENABLED=true` for staged rollout—only if you need to deploy API before UI. Default: no flag; feature is additive.

### Patch Ordering Strategy

- **[INFRA]**: Test stubs (`.skip`) for router/repository.
- **[BEHAVIOR]**: Repository methods + tRPC; unskip tests in same patches.
- Split **get** vs **submit** only if review surface area is large; otherwise one behavioral patch is fine.

## Current State Analysis

| Area | Current state | Gap for M3c |
|------|---------------|-----------|
| **Schema** | Assumed from [`m3-schema-foundation.md`](m3-schema-foundation.md) | `quiz_item` answer columns + `fact_review_state` must exist |
| **Fibonacci / dates** | From M3b ([`scheduled-quizzes.md`](scheduled-quizzes.md)) | Import helpers; apply on submit for `mode === 'scheduled'` |
| **tRPC** | [`quiz.ts`](../src/server/trpc/routers/quiz.ts): `createManual`, `getById` | Add `submitItemResult`, optionally `getTodayScheduled` or enrich `getById` with flashcard payload |
| **UI** | Minimal per milestone | At least one path to take a quiz and submit (or API-only + tests) |

## Required Changes

### 1) Input / output schemas

```ts
// Example — align with actual router naming
SubmitQuizItemInputSchema = z.object({
  quizItemId: z.string(),
  result: z.enum(["correct", "incorrect"]),
});
```

- Output: updated `quiz_item` row or a small DTO including whether `fact_review_state` was updated.

### 2) Repository layer

Extend [`QuizRepository`](../src/server/effect/quiz-repository.ts) or add `FactReviewStateRepository`:

```ts
submitQuizItemResult: (
  appUserId: string,
  input: { quizItemId: string; result: "correct" | "incorrect" },
) => Effect.Effect<{ quizItem: QuizItemSelect; reviewStateUpdated: boolean }>;
```

- Load `quiz_item` → `quiz` → verify `quiz.userId === appUserId` (RLS should enforce).
- If `quiz.mode === 'manual'`: `UPDATE quiz_item` set `result`, `answered_at`.
- If `quiz.mode === 'scheduled'`: same update, then `UPDATE fact_review_state` for `(userId, factId)` using Fibonacci rules (delegate to pure functions from `spaced-repetition`).

### 3) tRPC router

- `quiz.submitItem` — `protectedProcedure`, `.mutation`.
- Optional: `quiz.getById` already exists — extend output to include **flashcard** (active) per item for rendering, or add `quiz.getWithFlashcardsById` to avoid breaking clients.

### 4) Idempotency / double submit

- Define behavior if `quiz_item` already has `result`: reject, no-op, or overwrite—document in Explicit Opinions.

## Acceptance Criteria

- [ ] Authenticated user can submit `correct` / `incorrect` for their own `quiz_item`; cross-user access fails (RLS / NOT_FOUND).
- [ ] **Manual** quiz: `fact_review_state` rows **unchanged** by submission.
- [ ] **Scheduled** quiz: `fact_review_state` updates match workstream rules (correct → advance Fibonacci + `nextReviewAt`; wrong → reset step + next day).
- [ ] `quiz_item.result` and `answered_at` persisted.
- [ ] Tests cover manual vs scheduled behavior and RLS.
- [ ] Minimal UI or documented API contract for “take quiz” (per team bar).

## Open Questions

1. **Partial quiz completion**: Allow submitting items in any order; quiz “complete” when all items answered (computed) vs stored flag on `quiz`.
2. **Flashcard selection**: If multiple flashcards per fact, which to show (active only is already in schema).

## Explicit Opinions

1. **Second submit** returns **409 Conflict** or validation error if `answered_at` already set—avoids accidental schedule drift.
2. **Transaction**: `UPDATE quiz_item` + `UPDATE fact_review_state` in one DB transaction for scheduled mode.
3. **`getById` enrichment**: Return flashcard text for each item in one query (join or batched) for simpler UI.

## Patches

### Patch 1 [INFRA]: Test stubs

**Files:** `src/server/trpc/routers/quiz.test.ts` (or dedicated file)

**Changes:** `it.skip` for submit manual, submit scheduled updates state, RLS denial; `// PENDING: Patch 2`.

### Patch 2 [BEHAVIOR]: Submit + (optional) enriched get

**Files:**

- `src/server/effect/quiz-repository.ts` (+ optional new repository file)
- `src/server/trpc/routers/quiz.ts`
- `src/server/schemas/*` for input/output
- `src/lib/spaced-repetition.ts` — **only if not already added by M3b**; otherwise import from M3b

**Changes:**

1. Implement `submitQuizItemResult` with manual vs scheduled branching.
2. Unskip Patch 1 tests.
3. Extend get payload if agreed.

### Patch 3 [BEHAVIOR] (optional): Minimal UI

**Files:** `app/quiz/[id]/page.tsx` or equivalent

**Changes:** Wire buttons to `submitItem`; show question from flashcard.

## Test Map

| Test Name | File | Stub Patch | Impl Patch |
|-----------|------|------------|------------|
| submitItem > manual does not change fact_review_state | quiz.test.ts | 1 | 2 |
| submitItem > scheduled updates nextReviewAt and fib step on correct | quiz.test.ts | 1 | 2 |
| submitItem > scheduled resets on incorrect | quiz.test.ts | 1 | 2 |
| submitItem > cannot submit another user's item (RLS) | quiz.test.ts | 1 | 2 |
| submitItem > rejects second submit when already answered | quiz.test.ts | 1 | 2 |

## Dependency Graph

```
- Patch 1 [INFRA] -> []
- Patch 2 [BEHAVIOR] -> [1]
- Patch 3 [BEHAVIOR] -> [2]
```

**Prerequisites (not patches):** [`m3-schema-foundation.md`](m3-schema-foundation.md) merged; M3b helpers merged if `spaced-repetition` lives there; M2 for flashcard join.

**Mergability insight:** 1 of 3 patches is `[INFRA]`; core behavior in Patch 2.

## Mergability Checklist

- [x] Feature flag documented as optional only
- [x] Stubs before implementation
- [x] Test map ties stub → Patch 2
- [x] `[BEHAVIOR]` scoped to submit (+ optional UI)

## Related gameplans

- Prerequisite schema: [`m3-schema-foundation.md`](m3-schema-foundation.md)
- Scheduled quiz creation: [`scheduled-quizzes.md`](scheduled-quizzes.md)
- Manual quiz creation: [`manual-quizzes.md`](manual-quizzes.md)
