# [ai-question-generation] Patch 3: OpenAI dependency, env, and question generator service

## Problem Statement

Facts exist and are editable per user (M1), but there is no way to turn a fact into quiz questions. The product needs AI-generated questions from fact content so that later milestones can build daily quizzes from "facts + questions." Without a defined schema, API, and one implemented AI path, we cannot safely build quiz flows.

## Solution Summary

Add a `question` table linked to `fact` (ownership via fact → app_user; no RLS on question — access only through fact ownership checks). Implement one AI path: call OpenAI (e.g. gpt-4o-mini) with a prompt that takes fact content and returns structured questions; validate input/output with Zod and handle errors. Expose a tRPC procedure to generate one question for a fact (e.g. "generate question for this fact id") using protectedProcedure; enforce that the caller owns the fact. Semantics: **append** — each call creates a new question row for that fact. We keep history (one fact can have many question rows over time). When we later build a quiz (out of scope for M2), we create one question per fact and serve that; we don't need the quiz to reference old questions—those are just historical record (and in a future version we might use them to avoid duplicate questions; for now we rely on AI non-determinism). Effect service for AI + repository for questions; tests with stubs then implementation.

## Design Decisions (Non-negotiable)

1. **No RLS on question**: Ownership inferred via fact; all access goes through "get fact (RLS) then questions for that fact." Simpler than duplicating user id on question or adding RLS.
2. **Append semantics; history only**: Each generate call creates one new question for that fact. We never replace or delete. Over time a fact can have many question rows (history). When we build a quiz (later milestones), we create one question per fact and put that in the quiz; the quiz doesn't need to reference old questions—they're for history (and maybe future dedup; for now we rely on AI non-determinism).
3. **One call = one question**: One tRPC call → one OpenAI request → one question returned → one new row. Simple and predictable. If we later want "generate N questions" we can add a separate procedure.
4. **Serverless**: Generation runs inside the tRPC mutation: receive request → call OpenAI API → get response → insert row → return. No queues, workers, or polling. Just an API call and response.
5. **OpenAI + gpt-4o-mini**: Good cost/latency; switchable via env. No background job for M2.
6. **Effect for AI and repo**: Same pattern as FactRepository; generator as a Context.Tag so tests can swap implementation.
7. **Procedure on fact router**: `fact.generateQuestion` and `fact.listQuestions` keep fact as the aggregate entry point.

## Dependencies Completed

None - this patch has no dependencies.

## Your Task

**Files to create/modify:**
- `package.json`: add `openai`.
- `.env.example`: add `OPENAI_API_KEY=`, `OPENAI_QUESTION_MODEL=gpt-4o-mini`.
- `src/server/effect/question-generator.ts` (new): QuestionGenerator tag, `generateQuestionFromFact(content: string): Effect<string>`, Live layer that reads env and calls OpenAI; prompt that requests one question as JSON `{ "text": "..." }`; parse with Zod; return single string.

**Changes:**
1. Install openai; document env vars.
2. Generator service with explicit prompt and structured output parsing; only fact content in prompt.

## Test Stubs to Add

None - this patch does not introduce test stubs.

## Tests to Unskip and Implement

None - this patch does not implement tests.

## Git Instructions

- Branch from: `main`
- Branch name: `ai-question-generation/patch-3-openai-generator`
- PR base: `main`

**IMPORTANT: Open a draft PR immediately after your first commit.** Do not wait until implementation is complete. This ensures the PR title format is correct from the start.

After your first commit, run:
```bash
gh pr create --draft --title "[ai-question-generation] Patch 3: OpenAI dependency, env, and question generator service" --body "Work in progress" --base main
```

Then continue implementing. When finished:
1. Run `bun test` to verify tests pass
2. Update the PR description with a proper summary
3. Mark the PR as ready for review when complete

## PR Title (CRITICAL)

**You MUST use this EXACT title format:**

`[ai-question-generation] Patch 3: OpenAI dependency, env, and question generator service`

Do NOT use conventional commit format (e.g., `feat:`, `fix:`). The bracketed project name and patch number are required for tracking.
