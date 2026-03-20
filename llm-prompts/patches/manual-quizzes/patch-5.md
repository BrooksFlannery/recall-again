# [manual-quizzes] Patch 5: Add QuizRepository service and quiz router skeleton

## Problem Statement
The workstream needs a first quiz flow that is **user-triggered** and intentionally **not tied to spaced repetition**. Today we have facts (with RLS) and flashcards/questions, but we do not have a “quiz session” data model, nor an API to create a quiz by selecting **N random facts** for the current user. We need manual quizzes to validate quiz session modeling and UI wiring while guaranteeing that manual quiz answers **do not** affect any future scheduled review state.

## Solution Summary
Introduce `quiz` + `quiz_item` tables with a `mode` field, starting with `manual`. Enable RLS on both tables using the same `current_setting('app.user_id')` mechanism already used for `fact`, and grant `recall_app` the required privileges. Add a `QuizRepository` Effect service that can: create a manual quiz, randomly select N facts owned by the user, insert quiz items, and fetch a quiz with its items. Expose this via a new `quiz` tRPC router (`quiz.createManual`, `quiz.getById`) built on `protectedProcedure`. Add Bun tests that prove: selection is random+bounded, cross-user isolation holds, and manual quiz creation has **no schedule side-effects** (i.e., it does not touch any future `fact_review_state` table).

## Design Decisions (Non-negotiable)
1. **Denormalize `userId` onto `quiz_item`.** It makes RLS policies simple and consistent with `fact` and `quiz` (single-table check against `current_setting('app.user_id')`). The redundancy is low-risk and avoids a join inside RLS.
2. **Start with `factId` only for quiz items.** It keeps M3a lightweight. If the UI needs question text, it can fetch the latest flashcard for the fact (or show fact content) until M3c tightens the “take quiz” shape.
3. **Use `ORDER BY random()`** for selection. It’s simple and correct for small-to-medium datasets. If performance becomes an issue later, we can optimize with sampling strategies.

## Dependencies Completed
Patch 1 added `quiz` and `quiz_item` tables to `src/server/db/schema-app.ts`.
Patch 3 added Zod schemas for quiz + quiz items (select schemas + inputs).

## Your Task
### Patch 5 [INFRA]: Add `QuizRepository` service + router skeleton
**Files to add/modify:**
- `src/server/effect/quiz-repository.ts`
- `src/server/trpc/routers/quiz.ts`
- `src/server/trpc/root.ts`

**Changes:**
1. Add `QuizRepository` interface and live layer (methods may throw `NOT_IMPLEMENTED` initially)
2. Add `quizRouter` with `createManual` and `getById` procedures wired to the repository
3. Add `quiz` to `appRouter`

## Test Stubs to Add
None - this patch does not introduce test stubs.

## Tests to Unskip and Implement
None - this patch does not implement tests.

## Git Instructions
- Branch from: `main`
- Branch name: `manual-quizzes/patch-5-repo-router-skeleton`
- PR base: `main`

**IMPORTANT: Open a draft PR immediately after your first commit.** Do not wait until implementation is complete. This ensures the PR title format is correct from the start.

After your first commit, run:
```bash
gh pr create --draft --title "[manual-quizzes] Patch 5: Add QuizRepository service and quiz router skeleton" --body "Work in progress" --base main
```

Then continue implementing. When finished:
1. Run `bun test` to verify tests pass
2. Update the PR description with a proper summary
3. Mark the PR as ready for review when complete

## PR Title (CRITICAL)
**You MUST use this EXACT title format:**

`[manual-quizzes] Patch 5: Add QuizRepository service and quiz router skeleton`

Do NOT use conventional commit format (e.g., `feat:`, `fix:`). The bracketed project name and patch number are required for tracking.
