# Gameplan: ai-question-generation

## Workstream

- **Workstream**: Recall — Facts & Quizzes
- **Milestone**: 2 (ai-question-generation)
- **Prior milestones**: M1 (facts-crud-rls) — app_user, fact table, RLS, fact CRUD, protectedProcedure
- **Unlocks**: M3c (quiz-taking) — quizzes need flashcards from facts

## Problem Statement

Facts exist and are editable per user (M1), but there is no way to turn a fact into quiz material. The product needs AI-generated flashcards (a question + canonical answer pair) from fact content so that later milestones can build daily quizzes from "facts + flashcards." Without a defined schema, API, and one implemented AI path, we cannot safely build quiz flows.

## Solution Summary

Add a `flashcard` table linked to `fact` (ownership via fact → app_user; no RLS on flashcard — access only through fact ownership checks). Implement one AI path: call OpenAI (e.g. gpt-4o-mini) with a prompt that takes fact content and returns a structured flashcard with a `question` and `canonical_answer`; validate input/output with Zod and handle errors. Expose a tRPC procedure to generate one flashcard for a fact (e.g. "generate flashcard for this fact id") using protectedProcedure; enforce that the caller owns the fact. Semantics: **append** — each call creates a new flashcard row for that fact. We keep history (one fact can have many flashcard rows over time). When we later build a quiz (out of scope for M2), we create one flashcard per fact and serve that; we don't need the quiz to reference old flashcards—those are just historical record (and in a future version we might use them to avoid duplicate questions; for now we rely on AI non-determinism). Prompt: only fact content is sent to the model (workstream DoD: no PII/secrets in prompts). Effect service for AI + repository for flashcards; tests with stubs then implementation.

## Mergability Strategy

### Feature Flagging Strategy

**No feature flag.** New table and procedures are additive. Generation is only callable by the fact owner via existing protectedProcedure. No change to existing fact CRUD or auth.

### Patch Ordering Strategy

- **Early ([INFRA])**: Migration + Drizzle schema for `flashcard`; flashcard schemas (Zod); FlashcardRepository interface + live implementation (stub or minimal); test stubs with `.skip` for repository and generate procedure.
- **Middle ([INFRA] / [GATED])**: AI service (OpenAI client, prompt, Zod parse for response); env var for API key and optional model name; wire "generate flashcard" to AI + repository behind procedure. Could gate behind `ENABLE_FLASHCARD_GENERATION` if desired; this gameplan keeps it simple and does not gate.
- **Late ([BEHAVIOR])**: Implement generate procedure (fact ownership check, call AI, append one new flashcard for fact, return it); unskip tests.

## Current State Analysis

| Area | Current state |
|------|----------------|
| **Schema (app)** | `src/server/db/schema-app.ts`: `app_user`, `fact`, `factRelations`. No `flashcard` table. |
| **Fact router** | `src/server/trpc/routers/fact.ts`: create, list, getById, update, delete. All use protectedProcedure + requestDbLayer + FactRepository. |
| **Effect** | `FactRepository` in `src/server/effect/fact-repository.ts`; `Db` tag and request-scoped layer in trpc. No AI or flashcard services. |
| **Auth / RLS** | protectedProcedure sets `app.user_id`; RLS on `fact`. No RLS on other app tables. |
| **IDs** | Prefixed IDs per `docs/ids.md`: `user_`, `fact_`; flashcard prefix `fc_`. |
| **Dependencies** | No OpenAI or other LLM SDK in package.json. |
| **Env** | `.env.example`: DATABASE_URL, BETTER_AUTH_*, NEXT_PUBLIC_APP_URL, GOOGLE_*. No OPENAI_API_KEY. |

## Required Changes

### 1. Flashcard table (Drizzle + migration)

- **File**: `src/server/db/schema-app.ts`
- **Table**: `flashcard` with:
  - `id` text PK, default `'fc_' || gen_random_uuid()::text`
  - `factId` text NOT NULL, FK to `fact.id` (onDelete: cascade)
  - `question` text NOT NULL
  - `canonicalAnswer` text NOT NULL (column: `canonical_answer`)
  - `createdAt` timestamptz default now
- **Relations**: Add `flashcards` to `factRelations`; add `fact` to flashcard relations.
- **Migration**: Run `bun run db:generate` after schema change. No RLS (access controlled by fact ownership in app).

### 2. Flashcard schemas (Zod)

- **File**: `src/server/schemas/flashcard.ts` (new)
- **Exports**: `FlashcardSelectSchema` (drizzle-zod from flashcard table), type export, and AI response schema: `FlashcardGeneratedSchema = z.object({ question: z.string(), canonicalAnswer: z.string() })`.

### 3. FlashcardRepository (Effect service)

- **File**: `src/server/effect/flashcard-repository.ts` (new)
- **Interface**:
  - `listByFactId(factId: string): Effect<FlashcardSelect[], Error>`
  - `create(factId: string, question: string, canonicalAnswer: string): Effect<FlashcardSelect, Error>` — insert one flashcard, return the new row
- **Implementation**: Uses `Db`; all queries run in request-scoped layer. Caller ensures fact is owned (procedure loads fact first under RLS). Append-only; old flashcards kept as history.

### 4. Fact ownership check

- **Location**: In the "generate flashcard" procedure: load fact by id via FactRepository (with requestDbLayer so RLS applies). If null, return NOT_FOUND. No need to pass userId — RLS already restricts to current app user.

### 5. AI integration (OpenAI)

- **File**: `src/server/effect/flashcard-generator.ts` (new)
- **Signature**:

```ts
// One call → one flashcard. Input: fact content. Output: { question, canonicalAnswer }.
generateFlashcardFromFact(content: string): Effect.Effect<{ question: string; canonicalAnswer: string }>
```

- **Implementation**: Call OpenAI API (chat completions) with a system + user prompt; request a single flashcard as JSON `{ "question": string, "canonicalAnswer": string }`; parse with Zod (`FlashcardGeneratedSchema`). Use env `OPENAI_API_KEY`; optional `OPENAI_FLASHCARD_MODEL` (default `gpt-4o-mini`). Send only fact content to the model (no user identifiers—workstream DoD). **Serverless** = request in → call OpenAI → response back → persist and return; no queues or background jobs.
- **Effect**: `FlashcardGenerator` tag with `FlashcardGeneratorLive` using `openai` package. Inject API key from env at layer construction.

### 6. tRPC procedure: generateFlashcard (singular)

- **Router**: Add to `fact` router.
- **Procedure**: `fact.generateFlashcard` — `protectedProcedure`, input `z.object({ factId: z.string() })`, output `FlashcardSelectSchema`.
- **Steps**: (1) Get fact by id via FactRepository (RLS ensures ownership). (2) If no fact, throw NOT_FOUND. (3) Call FlashcardGenerator.generateFlashcardFromFact(fact.content) → `{ question, canonicalAnswer }`. (4) FlashcardRepository.create(factId, question, canonicalAnswer). (5) Return the new flashcard row.
- **Semantics**: Append. Each call creates one new flashcard for that fact; we keep history. When building a quiz later, we use one flashcard per fact (e.g. the one we create at quiz time); old flashcards are historical record only.

### 7. Optional: list flashcards for a fact

- **Procedure**: `fact.listFlashcards` — input `{ factId }`, output array of FlashcardSelect. Load fact first (RLS); if null, NOT_FOUND; else FlashcardRepository.listByFactId(factId). Enables UI to show flashcards after generate.

### 8. Env and dependencies

- **package.json**: Add `openai` (official SDK).
- **.env.example**: Add `OPENAI_API_KEY=`, optional `OPENAI_FLASHCARD_MODEL=gpt-4o-mini`.
- **Cost/safety**: Only fact content in the prompt (workstream DoD: no PII/secrets). Optional: rate limit in a later iteration (not required for M2 DoD).

## Acceptance Criteria

- [ ] `flashcard` table exists with id (prefixed `fc_`), factId (FK to fact), question, canonicalAnswer, createdAt.
- [ ] One implemented AI path: fact content → structured flashcard (question + canonicalAnswer) via OpenAI; input/output validated (Zod); errors handled.
- [ ] tRPC procedure to generate one flashcard for a fact id; uses protectedProcedure; only fact owner can trigger; append semantics (new flashcard row, existing flashcards unchanged).
- [ ] Fact ownership enforced by loading fact under requestDbLayer (RLS); no explicit userId in flashcard table; access to flashcards only through fact.
- [ ] Only fact content sent to the model (no user identifiers); OPENAI_API_KEY in env; optional model env var.
- [ ] Migrations generated via `bun run db:generate`; docs/ids.md convention followed; FlashcardRepository and generator as Effect services.

## Open Questions

None for M2; see Explicit Opinions for decisions.

## Explicit Opinions

1. **No RLS on flashcard**: Ownership inferred via fact; all access goes through "get fact (RLS) then flashcards for that fact." Simpler than duplicating user id on flashcard or adding RLS.
2. **Append semantics; history only**: Each generate call creates one new flashcard for that fact. We never replace or delete. Over time a fact can have many flashcard rows (history). When we build a quiz (later milestones), we create one flashcard per fact and put that in the quiz; the quiz doesn't need to reference old flashcards—they're for history (and maybe future dedup; for now we rely on AI non-determinism).
3. **One call = one flashcard**: One tRPC call → one OpenAI request → one flashcard returned → one new row. Simple and predictable. If we later want "generate N flashcards" we can add a separate procedure.
4. **Serverless**: Generation runs inside the tRPC mutation: receive request → call OpenAI API → get response → insert row → return. No queues, workers, or polling. Just an API call and response.
5. **OpenAI + gpt-4o-mini**: Good cost/latency; switchable via env. No background job for M2.
6. **Effect for AI and repo**: Same pattern as FactRepository; generator as a Context.Tag so tests can swap implementation.
7. **Procedure on fact router**: `fact.generateFlashcard` and `fact.listFlashcards` keep fact as the aggregate entry point.
8. **question + canonicalAnswer in same AI call**: One OpenAI call returns both fields as structured JSON. The flashcard is the atomic unit — never split across calls.

## Patches

### Patch 1 [INFRA]: Flashcard table and migration

**Files to modify:**
- `src/server/db/schema-app.ts`

**Changes:**
1. Add `flashcard` table: id (text PK, default `'fc_' || gen_random_uuid()::text`), factId (FK to fact.id, onDelete cascade), question (text NOT NULL), canonicalAnswer (text NOT NULL), createdAt (timestamptz default now).
2. Add `flashcardRelations` and add `flashcards: many(flashcard)` to `factRelations`.
3. Run `bun run db:generate` to produce the migration. Never hand-write migration SQL or edit `_journal.json`.

### Patch 2 [INFRA]: Flashcard schemas and repository

**Files to create/modify:**
- `src/server/schemas/flashcard.ts` (new): `FlashcardSelectSchema` (createSelectSchema), type export, and `FlashcardGeneratedSchema = z.object({ question: z.string(), canonicalAnswer: z.string() })`.
- `src/server/effect/flashcard-repository.ts` (new): `FlashcardRepository` tag, interface (`listByFactId`, `create`), `FlashcardRepositoryLive` with real implementation.

**Changes:**
1. Schemas for DB row and for AI JSON output.
2. Repository full implementation so Patch 3 can focus on AI + procedure.

### Patch 3 [INFRA]: OpenAI dependency, env, and flashcard generator service

**Files to create/modify:**
- `package.json`: add `openai`.
- `.env.example`: add `OPENAI_API_KEY=`, `OPENAI_FLASHCARD_MODEL=gpt-4o-mini`.
- `src/server/effect/flashcard-generator.ts` (new): `FlashcardGenerator` tag, `generateFlashcardFromFact(content: string): Effect<{ question: string; canonicalAnswer: string }>`, Live layer that reads env and calls OpenAI; prompt requests one flashcard as JSON `{ "question": "...", "canonicalAnswer": "..." }`; parse with `FlashcardGeneratedSchema`; return the object.

**Changes:**
1. Install openai; document env vars.
2. Generator service with explicit prompt and structured output parsing; only fact content in prompt.

### Patch 4 [INFRA]: Test stubs for generateFlashcard and listFlashcards

**Files to create/modify:**
- `src/server/trpc/routers/fact.test.ts` (extend) or new test files as needed.

**Changes:**
1. Add tests with `.skip` and `// PENDING: Patch 5`: fact.generateFlashcard returns the new flashcard for owned fact; fact.generateFlashcard returns NOT_FOUND for missing fact; fact.generateFlashcard rejects unowned fact (via RLS); fact.listFlashcards returns flashcards for owned fact.
2. Test Map below references these.

### Patch 5 [BEHAVIOR]: fact.generateFlashcard and fact.listFlashcards procedures

**Files to modify:**
- `src/server/trpc/routers/fact.ts`

**Changes:**
1. Add `generateFlashcard`: protectedProcedure, input `{ factId }`, get fact by id (FactRepository.getById), if null throw NOT_FOUND; yield FlashcardGenerator.generateFlashcardFromFact(fact.content) → `{ question, canonicalAnswer }`; yield FlashcardRepository.create(factId, question, canonicalAnswer); return the new flashcard. Provide FactRepository + FlashcardRepository + FlashcardGenerator layers with ctx.requestDbLayer.
2. Add `listFlashcards`: protectedProcedure, input `{ factId }`, get fact by id; if null throw NOT_FOUND; return FlashcardRepository.listByFactId(factId).
3. Unskip and implement tests from Patch 4.

## Test Map

| Test Name | File | Stub Patch | Impl Patch |
|-----------|------|------------|------------|
| fact.generateFlashcard > returns new flashcard for owned fact | src/server/trpc/routers/fact.test.ts | 4 | 5 |
| fact.generateFlashcard > returns NOT_FOUND for missing fact | src/server/trpc/routers/fact.test.ts | 4 | 5 |
| fact.generateFlashcard > returns NOT_FOUND for unowned fact (RLS) | src/server/trpc/routers/fact.test.ts | 4 | 5 |
| fact.listFlashcards > returns flashcards for owned fact | src/server/trpc/routers/fact.test.ts | 4 | 5 |

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
