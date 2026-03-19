# [ai-question-generation] Patch 5: fact.generateQuestion and fact.listQuestions procedures

## Problem Statement

Facts exist and are editable per user (M1), but there is no way to turn a fact into quiz questions. The product needs AI-generated questions from fact content so that later milestones can build daily quizzes from "facts + questions." Without a defined schema, API, and one implemented AI path, we cannot safely build quiz flows.

## Solution Summary

Add a `question` table linked to `fact` (ownership via fact → app_user; no RLS on question — access only through fact ownership checks). Implement one AI path: call OpenAI (e.g. gpt-4o-mini) with a prompt that takes fact content and returns structured questions; validate input/output with Zod and handle errors. Expose a tRPC procedure to generate one question for a fact (e.g. "generate question for this fact id") using protectedProcedure; enforce that the caller owns the fact. Semantics: **append** — each call creates a new question row for that fact. We keep history (one fact can have many question rows over time). When we later build a quiz (out of scope for M2), we create one question per fact and serve that; we don’t need the quiz to reference old questions—those are just historical record (and in a future version we might use them to avoid duplicate questions; for now we rely on AI non-determinism). Effect service for AI + repository for questions; tests with stubs then implementation.

## Design Decisions (Non-negotiable)

1. **No RLS on question**: Ownership inferred via fact; all access goes through "get fact (RLS) then questions for that fact." Simpler than duplicating user id on question or adding RLS.
2. **Append semantics; history only**: Each generate call creates one new question for that fact. We never replace or delete. Over time a fact can have many question rows (history). When we build a quiz (later milestones), we create one question per fact and put that in the quiz; the quiz doesn’t need to reference old questions—they’re for history (and maybe future dedup; for now we rely on AI non-determinism).
3. **One call = one question**: One tRPC call → one OpenAI request → one question returned → one new row. Simple and predictable. If we later want "generate N questions" we can add a separate procedure.
4. **Serverless**: Generation runs inside the tRPC mutation: receive request → call OpenAI API → get response → insert row → return. No queues, workers, or polling. Just an API call and response.
5. **OpenAI + gpt-4o-mini**: Good cost/latency; switchable via env. No background job for M2.
6. **Effect for AI and repo**: Same pattern as FactRepository; generator as a Context.Tag so tests can swap implementation.
7. **Procedure on fact router**: `fact.generateQuestion` and `fact.listQuestions` keep fact as the aggregate entry point.

## Dependencies Completed

- Patch 1 added `question` table (schema + migration) and `questionRelations` wiring.
- Patch 2 added `src/server/schemas/question.ts` plus `QuestionRepository` (interface + live implementation).
- Patch 3 added OpenAI dependency, env vars, and `QuestionGenerator` service (Effect tag + prompt + Zod parsing).
- Patch 4 added the `.skip` test stubs for `fact.generateQuestion` and `fact.listQuestions`.

## Your Task

**Files to modify:**
- `src/server/trpc/routers/fact.ts`

**Changes:**
1. Add `generateQuestion`: protectedProcedure, input `{ factId }`, get fact by id (FactRepository.getById), if null throw NOT_FOUND; yield QuestionGenerator.generateQuestionFromFact(fact.content); yield QuestionRepository.create(factId, text); return the new question. Provide FactRepository + QuestionRepository + QuestionGenerator layers with ctx.requestDbLayer.
2. Add `listQuestions`: protectedProcedure, input `{ factId }`, get fact by id; if null throw NOT_FOUND; return QuestionRepository.listByFactId(factId).
3. Unskip and implement tests from Patch 4.

## Test Stubs to Add

None - this patch does not introduce test stubs.

## Tests to Unskip and Implement

- **Test**: `fact.generateQuestion > returns new question for owned fact`
- **File**: `src/server/trpc/routers/fact.test.ts`
- **Stub Patch**: 4
- **Action**: Remove `.skip`, implement the test body per the stub comments.

- **Test**: `fact.generateQuestion > returns NOT_FOUND for missing fact`
- **File**: `src/server/trpc/routers/fact.test.ts`
- **Stub Patch**: 4
- **Action**: Remove `.skip`, implement the test body per the stub comments.

- **Test**: `fact.generateQuestion > returns NOT_FOUND for unowned fact (RLS)`
- **File**: `src/server/trpc/routers/fact.test.ts`
- **Stub Patch**: 4
- **Action**: Remove `.skip`, implement the test body per the stub comments.

- **Test**: `fact.listQuestions > returns questions for owned fact`
- **File**: `src/server/trpc/routers/fact.test.ts`
- **Stub Patch**: 4
- **Action**: Remove `.skip`, implement the test body per the stub comments.

## Git Instructions

- Branch from: `main`
- Branch name: `ai-question-generation/patch-5-fact-generate-and-listquestions`
- PR base: `main`

**IMPORTANT: Open a draft PR immediately after your first commit.** Do not wait until implementation is complete. This ensures the PR title format is correct from the start.

After your first commit, run:
```bash
gh pr create --draft --title "[ai-question-generation] Patch 5: fact.generateQuestion and fact.listQuestions procedures" --body "Work in progress" --base main
```

Then continue implementing. When finished:
1. Run `bun test` to verify tests pass
2. Update the PR description with a proper summary
3. Mark the PR as ready for review when complete

## PR Title (CRITICAL)

**You MUST use this EXACT title format:**

`[ai-question-generation] Patch 5: fact.generateQuestion and fact.listQuestions procedures`

Do NOT use conventional commit format (e.g., `feat:`, `fix:`). The bracketed project name and patch number are required for tracking.

