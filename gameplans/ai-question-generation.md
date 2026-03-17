# Gameplan: ai-question-generation

## Workstream

- **Workstream**: Recall — Facts & Quizzes
- **Milestone**: 2 (ai-question-generation)
- **Prior milestones**: M1 (facts-crud-rls) — app_user, fact table, RLS, fact CRUD, protectedProcedure
- **Unlocks**: M3c (quiz-taking) — quizzes need questions from facts

## Problem Statement

Facts exist and are editable per user (M1), but there is no way to turn a fact into quiz questions. The product needs AI-generated questions from fact content so that later milestones can build daily quizzes from "facts + questions." Without a defined schema, API, and one implemented AI path, we cannot safely build quiz flows.

## Solution Summary

Add a `question` table linked to `fact` (ownership via fact → app_user; no RLS on question — access only through fact ownership checks). Implement one AI path: call OpenAI (e.g. gpt-4o-mini) with a prompt that takes fact content and returns structured questions; validate input/output with Zod and handle errors. Expose a tRPC procedure to generate one question for a fact (e.g. "generate question for this fact id") using protectedProcedure; enforce that the caller owns the fact. Semantics: **append** — each call creates a new question row for that fact. We keep history (one fact can have many question rows over time). When we later build a quiz (out of scope for M2), we create one question per fact and serve that; we don’t need the quiz to reference old questions—those are just historical record (and in a future version we might use them to avoid duplicate questions; for now we rely on AI non-determinism). Prompt: only fact content is sent to the model (workstream DoD: no PII/secrets in prompts). Optional env-based rate or guardrails. Effect service for AI + repository for questions; tests with stubs then implementation.

## Mergability Strategy

### Feature Flagging Strategy

**No feature flag.** New table and procedures are additive. Generation is only callable by the fact owner via existing protectedProcedure. No change to existing fact CRUD or auth.

### Patch Ordering Strategy

- **Early ([INFRA])**: Migration + Drizzle schema for `question`; question schemas (Zod); QuestionRepository interface + live implementation (stub or minimal); test stubs with `.skip` for repository and generate procedure.
- **Middle ([INFRA] / [GATED])**: AI service (OpenAI client, prompt, Zod parse for response); env var for API key and optional model name; wire "generate questions" to AI + repository behind procedure. Could gate behind `ENABLE_QUESTION_GENERATION` if desired; this gameplan keeps it simple and does not gate.
- **Late ([BEHAVIOR])**: Implement generate procedure (fact ownership check, call AI, append one new question for fact, return it); unskip tests.

## Current State Analysis

| Area | Current state |
|------|----------------|
| **Schema (app)** | `src/server/db/schema-app.ts`: `app_user`, `fact`, `factRelations`. No `question` table. |
| **Fact router** | `src/server/trpc/routers/fact.ts`: create, list, getById, update, delete. All use protectedProcedure + requestDbLayer + FactRepository. |
| **Effect** | `FactRepository` in `src/server/effect/fact-repository.ts`; `Db` tag and request-scoped layer in trpc. No AI or question services. |
| **Auth / RLS** | protectedProcedure sets `app.user_id`; RLS on `fact`. No RLS on other app tables. |
| **IDs** | Prefixed IDs per `docs/ids.md`: `user_`, `fact_`; question prefix `ques_`. |
| **Dependencies** | No OpenAI or other LLM SDK in package.json. |
| **Env** | `.env.example`: DATABASE_URL, BETTER_AUTH_*, NEXT_PUBLIC_APP_URL, GOOGLE_*. No OPENAI_API_KEY. |

## Required Changes

### 1. Question table (Drizzle + migration)

- **File**: `src/server/db/schema-app.ts`
- **Table**: `question` with:
  - `id` text PK, default `'ques_' || gen_random_uuid()::text`
  - `factId` text NOT NULL, FK to `fact.id` (onDelete: cascade)
  - `text` text NOT NULL (question text)
  - `createdAt` timestamptz default now
  - Optional: `type` text (e.g. 'freeform', 'multiple_choice') for future use; or a JSONB `metadata` column
- **Relations**: Add `questions` to `factRelations`; add `fact` to question relations.
- **Migration**: New migration under `drizzle/` that creates `question`. No RLS (access controlled by fact ownership in app).

### 2. Question schemas (Zod)

- **File**: `src/server/schemas/question.ts` (new)
- **Exports**: `QuestionSelectSchema` (drizzle-zod from question table), `QuestionCreateInputSchema` (factId, text; for internal use), and a schema for AI response (single question: `{ text: string }`).

### 3. QuestionRepository (Effect service)

- **File**: `src/server/effect/question-repository.ts` (new)
- **Interface**:
  - `listByFactId(factId: string): Effect<QuestionSelect[], Error>`
  - `create(factId: string, text: string): Effect<QuestionSelect, Error>` — insert one question, return the new row
- **Implementation**: Uses `Db`; all queries run in request-scoped layer. Caller ensures fact is owned (procedure loads fact first under RLS). Append-only; old questions kept as history.

### 4. Fact ownership check

- **Location**: In the "generate questions" procedure: load fact by id via FactRepository (with requestDbLayer so RLS applies). If null, return NOT_FOUND. No need to pass userId — RLS already restricts to current app user.

### 5. AI integration (OpenAI)

- **File**: `src/server/effect/question-generator.ts` (new)
- **Signature**:

```ts
// One call → one question. Input: fact content. Output: single question text.
generateQuestionFromFact(content: string): Effect.Effect<string>
```

- **Implementation**: Call OpenAI API (chat completions) with a system + user prompt; request a single question as JSON `{ "text": string }`; parse with Zod. Use env `OPENAI_API_KEY`; optional `OPENAI_QUESTION_MODEL` (default `gpt-4o-mini`). Send only fact content to the model (no user identifiers—workstream DoD). **Serverless** = request in → call OpenAI → response back → persist and return; no queues or background jobs.
- **Effect**: `QuestionGenerator` tag with `QuestionGeneratorLive` using `openai` package. Inject API key from env at layer construction.

### 6. tRPC procedure: generateQuestion (singular)

- **Router**: Add to `fact` router.
- **Procedure**: `fact.generateQuestion` — `protectedProcedure`, input `z.object({ factId: z.string() })`, output `QuestionSelectSchema`.
- **Steps**: (1) Get fact by id via FactRepository (RLS ensures ownership). (2) If no fact, throw NOT_FOUND. (3) Call QuestionGenerator.generateQuestionFromFact(fact.content) → one question text. (4) QuestionRepository.create(factId, text). (5) Return the new question row.
- **Semantics**: Append. Each call creates one new question for that fact; we keep history. When building a quiz later, we use one question per fact (e.g. the one we create at quiz time); old questions are historical record only.

### 7. Optional: list questions for a fact

- **Procedure**: `fact.listQuestions` — input `{ factId }`, output array of QuestionSelect. Load fact first (RLS); if null, NOT_FOUND; else QuestionRepository.listByFactId(factId). Enables UI to show questions after generate.

### 8. Env and dependencies

- **package.json**: Add `openai` (official SDK).
- **.env.example**: Add `OPENAI_API_KEY=`, optional `OPENAI_QUESTION_MODEL=gpt-4o-mini`.
- **Cost/safety**: Only fact content in the prompt (workstream DoD: no PII/secrets). Optional: rate limit in a later iteration (not required for M2 DoD).

## Acceptance Criteria

- [ ] `question` table exists with id (prefixed `ques_`), factId (FK to fact), text, createdAt (and optional type/metadata).
- [ ] One implemented AI path: fact content → structured questions via OpenAI; input/output validated (Zod); errors handled.
- [ ] tRPC procedure to generate one question for a fact id; uses protectedProcedure; only fact owner can trigger; append semantics (new question row, existing questions unchanged).
- [ ] Fact ownership enforced by loading fact under requestDbLayer (RLS); no explicit userId in question table; access to questions only through fact.
- [ ] Only fact content sent to the model (no user identifiers); OPENAI_API_KEY in env; optional model env var.
- [ ] Migrations and docs/ids.md convention followed; QuestionRepository and generator as Effect services.

## Open Questions

None for M2; see Explicit Opinions for decisions.

## Explicit Opinions

1. **No RLS on question**: Ownership inferred via fact; all access goes through "get fact (RLS) then questions for that fact." Simpler than duplicating user id on question or adding RLS.
2. **Append semantics; history only**: Each generate call creates one new question for that fact. We never replace or delete. Over time a fact can have many question rows (history). When we build a quiz (later milestones), we create one question per fact and put that in the quiz; the quiz doesn’t need to reference old questions—they’re for history (and maybe future dedup; for now we rely on AI non-determinism).
3. **One call = one question**: One tRPC call → one OpenAI request → one question returned → one new row. Simple and predictable. If we later want "generate N questions" we can add a separate procedure.
4. **Serverless**: Generation runs inside the tRPC mutation: receive request → call OpenAI API → get response → insert row → return. No queues, workers, or polling. Just an API call and response.
5. **OpenAI + gpt-4o-mini**: Good cost/latency; switchable via env. No background job for M2.
6. **Effect for AI and repo**: Same pattern as FactRepository; generator as a Context.Tag so tests can swap implementation.
7. **Procedure on fact router**: `fact.generateQuestion` and `fact.listQuestions` keep fact as the aggregate entry point.

## Patches

### Patch 1 [INFRA]: Question table and migration

**Files to modify:**
- `src/server/db/schema-app.ts`

**Changes:**
1. Add `question` table: id (text PK, default `'ques_' || gen_random_uuid()::text`), factId (FK to fact.id, onDelete cascade), text (text NOT NULL), createdAt (timestamptz default now).
2. Add `questionRelations` and add `questions: many(question)` to `factRelations`.
3. New migration under `drizzle/` for creating `question` table.

### Patch 2 [INFRA]: Question schemas and repository interface + stub

**Files to create/modify:**
- `src/server/schemas/question.ts` (new): QuestionSelectSchema (createSelectSchema), type export, and AI response schema for one question: `QuestionGeneratedSchema = z.object({ text: z.string() })`.
- `src/server/effect/question-repository.ts` (new): QuestionRepository tag, interface (listByFactId, create), QuestionRepositoryLive with real implementation (listByFactId select; create = single insert, return row).

**Changes:**
1. Schemas for DB row and for AI JSON output.
2. Repository full implementation (no stub) so Patch 3 can focus on AI + procedure.

### Patch 3 [INFRA]: OpenAI dependency, env, and question generator service

**Files to create/modify:**
- `package.json`: add `openai`.
- `.env.example`: add `OPENAI_API_KEY=`, `OPENAI_QUESTION_MODEL=gpt-4o-mini`.
- `src/server/effect/question-generator.ts` (new): QuestionGenerator tag, `generateQuestionFromFact(content: string): Effect<string>`, Live layer that reads env and calls OpenAI; prompt that requests one question as JSON `{ "text": "..." }`; parse with Zod; return single string.

**Changes:**
1. Install openai; document env vars.
2. Generator service with explicit prompt and structured output parsing; only fact content in prompt.

### Patch 4 [INFRA]: Test stubs for generate and listQuestions

**Files to create/modify:**
- `src/server/trpc/routers/fact.test.ts` (extend) or new `src/server/effect/question-generator.test.ts` / `question-repository` tests as needed.

**Changes:**
1. Add tests with `.skip` and `// PENDING: Patch 5`: fact.generateQuestion returns the new question for owned fact; fact.generateQuestion returns NOT_FOUND for missing fact; fact.generateQuestion rejects unowned fact (via RLS); fact.listQuestions returns questions for owned fact.
2. Test Map below references these.

### Patch 5 [BEHAVIOR]: fact.generateQuestion and fact.listQuestions procedures

**Files to modify:**
- `src/server/trpc/routers/fact.ts`

**Changes:**
1. Add `generateQuestion`: protectedProcedure, input `{ factId }`, get fact by id (FactRepository.getById), if null throw NOT_FOUND; yield QuestionGenerator.generateQuestionFromFact(fact.content); yield QuestionRepository.create(factId, text); return the new question. Provide FactRepository + QuestionRepository + QuestionGenerator layers with ctx.requestDbLayer.
2. Add `listQuestions`: protectedProcedure, input `{ factId }`, get fact by id; if null throw NOT_FOUND; return QuestionRepository.listByFactId(factId).
3. Unskip and implement tests from Patch 4.

## Test Map

| Test Name | File | Stub Patch | Impl Patch |
|-----------|------|------------|------------|
| fact.generateQuestion > returns new question for owned fact | src/server/trpc/routers/fact.test.ts | 4 | 5 |
| fact.generateQuestion > returns NOT_FOUND for missing fact | src/server/trpc/routers/fact.test.ts | 4 | 5 |
| fact.generateQuestion > returns NOT_FOUND for unowned fact (RLS) | src/server/trpc/routers/fact.test.ts | 4 | 5 |
| fact.listQuestions > returns questions for owned fact | src/server/trpc/routers/fact.test.ts | 4 | 5 |

## Dependency Graph

```
- Patch 1 [INFRA] -> []
- Patch 2 [INFRA] -> [1]
- Patch 3 [INFRA] -> []
- Patch 4 [INFRA] -> [2, 3]
- Patch 5 [BEHAVIOR] -> [1, 2, 3, 4]
```

**Mergability insight**: 4 of 5 patches are `[INFRA]` and can ship without changing observable behavior until Patch 5 wires procedures and unskips tests.

## Mergability Checklist

- [ ] Feature flag strategy documented (not needed — additive, owner-only)
- [ ] Early patches contain only non-functional changes (`[INFRA]`)
- [ ] Test stubs with `.skip` markers are in Patch 4 (`[INFRA]`)
- [ ] Test implementations are co-located with the code they test (Patch 5)
- [ ] Test Map is complete: every test has Stub Patch and Impl Patch assigned
- [ ] Test Map Impl Patch matches the patch that implements the tested code
- [ ] `[BEHAVIOR]` patch is as small as possible (single patch for procedures + unskip)
- [ ] Dependency graph shows `[INFRA]` early, `[BEHAVIOR]` last
- [ ] Single `[BEHAVIOR]` patch is justified (cannot be gated; need API to use feature)
