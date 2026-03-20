# [manual-quizzes] Patch 6: Implement manual quiz creation, retrieval, and unskip tests

## Problem Statement
The workstream needs a first quiz flow that is **user-triggered** and intentionally **not tied to spaced repetition**. Today we have facts (with RLS) and flashcards/questions, but we do not have a “quiz session” data model, nor an API to create a quiz by selecting **N random facts** for the current user. We need manual quizzes to validate quiz session modeling and UI wiring while guaranteeing that manual quiz answers **do not** affect any future scheduled review state.

## Solution Summary
Introduce `quiz` + `quiz_item` tables with a `mode` field, starting with `manual`. Enable RLS on both tables using the same `current_setting('app.user_id')` mechanism already used for `fact`, and grant `recall_app` the required privileges. Add a `QuizRepository` Effect service that can: create a manual quiz, randomly select N facts owned by the user, insert quiz items, and fetch a quiz with its items. Expose this via a new `quiz` tRPC router (`quiz.createManual`, `quiz.getById`) built on `protectedProcedure`. Add Bun tests that prove: selection is random+bounded, cross-user isolation holds, and manual quiz creation has **no schedule side-effects** (i.e., it does not touch any future `fact_review_state` table).

## Design Decisions (Non-negotiable)
1. **Denormalize `userId` onto `quiz_item`.** It makes RLS policies simple and consistent with `fact` and `quiz` (single-table check against `current_setting('app.user_id')`). The redundancy is low-risk and avoids a join inside RLS.
2. **Start with `factId` only for quiz items.** It keeps M3a lightweight. If the UI needs question text, it can fetch the latest flashcard for the fact (or show fact content) until M3c tightens the “take quiz” shape.
3. **Use `ORDER BY random()`** for selection. It’s simple and correct for small-to-medium datasets. If performance becomes an issue later, we can optimize with sampling strategies.

## Dependencies Completed
Patch 2 added migrations for `quiz`/`quiz_item` with RLS and `recall_app` grants.
Patch 3 added Zod schemas for quiz + quiz items (select + inputs).
Patch 4 added skipped test stubs in `src/server/trpc/routers/quiz.test.ts`.
Patch 5 added `QuizRepository` skeleton, `quizRouter`, and wired `quiz` into `appRouter`.

## Your Task
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

## Test Stubs to Add
None - this patch does not introduce test stubs.

## Tests to Unskip and Implement
- **Test**: `quiz.createManual > returns quiz with N items`
- **File**: `src/server/trpc/routers/quiz.test.ts`
- **Stub Patch**: 4 (the test stub with setup/expectation comments is already in the codebase)
- **Action**: Remove `.skip`, implement the test body per the stub comments

- **Test**: `quiz.createManual > only selects current user's facts (RLS)`
- **File**: `src/server/trpc/routers/quiz.test.ts`
- **Stub Patch**: 4
- **Action**: Remove `.skip`, implement the test body per the stub comments

- **Test**: `quiz.createManual > validates/bounds count`
- **File**: `src/server/trpc/routers/quiz.test.ts`
- **Stub Patch**: 4
- **Action**: Remove `.skip`, implement the test body per the stub comments

- **Test**: `quiz.getById > user cannot read another user's quiz (RLS)`
- **File**: `src/server/trpc/routers/quiz.test.ts`
- **Stub Patch**: 4
- **Action**: Remove `.skip`, implement the test body per the stub comments

## Git Instructions
- Branch from: `main`
- Branch name: `manual-quizzes/patch-6-manual-quiz-behavior`
- PR base: `main`

**IMPORTANT: Open a draft PR immediately after your first commit.** Do not wait until implementation is complete. This ensures the PR title format is correct from the start.

After your first commit, run:
```bash
gh pr create --draft --title "[manual-quizzes] Patch 6: Implement manual quiz creation, retrieval, and unskip tests" --body "Work in progress" --base main
```

Then continue implementing. When finished:
1. Run `bun test` to verify tests pass
2. Update the PR description with a proper summary
3. Mark the PR as ready for review when complete

## PR Title (CRITICAL)
**You MUST use this EXACT title format:**

`[manual-quizzes] Patch 6: Implement manual quiz creation, retrieval, and unskip tests`

Do NOT use conventional commit format (e.g., `feat:`, `fix:`). The bracketed project name and patch number are required for tracking.
