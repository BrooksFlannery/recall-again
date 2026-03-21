# Workstream: Recall — Facts & Quizzes

## Vision

Users create and manage **facts** (things they want to remember). The system generates **questions** from facts via AI, and runs **auto-generated daily quizzes** that use spaced repetition (Fibonacci schedule): correct answers push the next review further out (1, 1, 2, 3, 5, 8… days); wrong answers reset to “next day.” Data is isolated per user via Row Level Security (RLS) so CRUD and quizzes never need to filter by user explicitly.

## Current State

This section describes the **roadmap** and a snapshot of **how far along the repo is**. When in doubt, inspect [`src/server/db/schema-app.ts`](../src/server/db/schema-app.ts) and the [`gameplans/`](../gameplans/) folder.

- **Auth**: Better Auth with Drizzle adapter; `user`, `session`, `account` tables (auth provider owns these). Sign-in/sign-up (email/password + Google) working.
- **Users / app domain**: Target is an **app-level** user (`app_user`) and domain tables (`fact`, `quiz`, …) with RLS; **implementation may already include** these—see schema.
- **API**: tRPC v11, Effect TS, Drizzle ORM, PostgreSQL (Docker locally, Neon in prod). Example `ping` router exists; tRPC context exposes **`appUser`** for protected routes when implemented.
- **App tables**: Evolving in `schema-app.ts` (e.g. `app_user`, `fact`, `flashcard`, `quiz`, `quiz_item`). **Spaced-repetition and answer columns** are introduced in **Milestone 3-pre** ([`gameplans/m3-schema-foundation.md`](../gameplans/m3-schema-foundation.md)) before M3b/M3c.

### Related gameplans

| Milestone | Gameplan |
|-----------|----------|
| 1 — facts-crud-rls | [`gameplans/facts-crud-rls.md`](../gameplans/facts-crud-rls.md) |
| 2 — ai-question-generation | [`gameplans/ai-question-generation.md`](../gameplans/ai-question-generation.md) |
| 3a — manual-quizzes | [`gameplans/manual-quizzes.md`](../gameplans/manual-quizzes.md) |
| 3-pre — shared M3 schema | [`gameplans/m3-schema-foundation.md`](../gameplans/m3-schema-foundation.md) |
| 3b — scheduled-quizzes | [`gameplans/scheduled-quizzes.md`](../gameplans/scheduled-quizzes.md) |
| 3c — quiz-taking + results | [`gameplans/quiz-taking-and-result-recording.md`](../gameplans/quiz-taking-and-result-recording.md) |

## Key Challenges

- **Decoupling from auth provider**: App data (facts, quizzes, etc.) should reference an **app-level user**, not the auth provider’s user table. That way we can switch or extend auth without rewriting app schema and RLS.
- **RLS design**: Policies must enforce “user can only see/edit their own facts” so application code can rely on the DB and avoid passing `userId` everywhere. RLS will use the **app user** id.
- **Session → app user**: tRPC (and any cron) need to resolve session → auth user → app user and use app user id for RLS and all app logic. `app_user` is created at sign-up via a better-auth hook; tRPC context only reads.
- **AI inference**: Choosing model, prompt shape, and where it runs (serverless vs long-running) for “fact → question(s)” generation.
- **Scheduling semantics**: Fibonacci sequence (1, 1, 2, 3, 5, 8…) and “reset on wrong” must be represented in the schema and cron logic; “due” definition (e.g. due date ≤ today) and timezone handling.
- **Cron ownership**: Daily job must iterate users and create quizzes from overdue facts without impersonating a single user session (e.g. service role or per-user connection with RLS).

## Milestones

### Milestone 1: facts-crud-rls

**Definition of Done**:

- **App user table**: `app_user` table (or equivalent) with: `id` (prefixed id, e.g. `user_<uuid>` — see [docs/ids.md](../docs/ids.md)), `authUserId` (FK to Better Auth `user.id`, unique so one app user per auth user), `createdAt`, `updatedAt`. All app domain data (facts, later quizzes, etc.) references this table, not the auth `user` table.
- **Resolve app user**: `app_user` is created once via a better-auth `databaseHooks.user.create.after` hook at sign-up. On each authenticated request, tRPC context resolves session → auth user → app user via a simple SELECT. tRPC context exposes the **app user** (id and any needed fields), not the raw auth user.
- **Schema**: `fact` table with at least: `id` (prefixed id, e.g. `fact_<uuid>`), `userId` (FK to `app_user.id`), `content` (text), `createdAt`, `updatedAt`. Optional: `source`, `title` if needed for UX.
- **RLS**: PostgreSQL RLS enabled on `fact`; policies so that:
  - SELECT/INSERT/UPDATE/DELETE only allow rows where `userId` matches the authenticated **app user** id (e.g. `current_setting('app.user_id')` or equivalent).
  - Application code does not need to add `WHERE userId = ?` for normal CRUD; RLS enforces it.
- **Auth in tRPC**: tRPC context includes the current **app user** (resolved from Better Auth session). Protected procedure helper (e.g. `protectedProcedure`) that requires auth and sets DB role/session variable for RLS before running queries.
- **CRUD API**: tRPC procedures for facts: create, list (all for current user), getById, update, delete. All go through protected procedure and rely on RLS (no explicit `userId` in where-clauses for isolation).
- **Migrations**: Drizzle migrations for `app_user`, `fact`, and RLS (enable RLS, create policies). Docs or comments on how to run migrations and that RLS depends on session variable being set.

**Why this is a safe pause point**: Facts are stored and editable per user with clear ownership and security at the DB layer. No half-secured state.

**Unlocks**: M2 (questions from facts) and M3 (quizzes on facts) can assume facts exist and are scoped by user.

**Open Questions** (if any):

- Use of `SET LOCAL` vs dedicated DB role per request (e.g. `app_user` with `current_setting('app.user_id')`) for RLS.

---

### Milestone 2: ai-question-generation

**Definition of Done**:

- **Schema**: `question` table: `id` (prefixed, e.g. `ques_<uuid>`); links to `fact` (e.g. `factId`); stores generated question text and optionally type/metadata. Ownership inferred via `fact` → `app_user` (no RLS on `question` if access is always through fact; otherwise RLS or strict app-side checks).
- **AI integration**: One implemented path from “fact” → “one or more questions”: e.g. call to OpenAI (or chosen provider) with a prompt that takes fact content and returns structured questions. Input/output validated (e.g. Zod), errors handled.
- **API**: tRPC procedure(s) to generate questions for a fact (e.g. “generate questions for this fact id”). Idempotency or “replace questions for this fact” semantics defined. Uses protected procedure so only the fact owner can trigger.
- **Cost/safety**: No PII/secrets in prompts; optional rate limit or guardrails so generation is safe to expose from the app.

**Why this is a safe pause point**: Questions exist and are tied to facts; generation is behind an authenticated API. No quiz flow yet.

**Unlocks**: M3 can build quizzes from “facts + questions” instead of raw facts only.

**Open Questions** (if any):

- Model choice (e.g. GPT-4o-mini vs other) and where it runs (Edge, serverless, or background job).
- Whether multiple questions per fact are stored or only the “best” one; UI impact.

---

### Milestone 3a: manual-quizzes (on-demand)

**Definition of Done**:

- **User-triggered**: User can trigger a manual quiz at any time (e.g. “Quiz me now”).
- **Selection logic**: Manual quiz selects **N random facts** for the current user (N is configurable), without using or requiring any spaced-repetition “due” logic.
- **No scheduling side-effects**: Submitting answers for manual quizzes does **not** change any “next scheduled review” state for facts (neither for correct nor incorrect answers).
- **Tables**: Minimal quiz representation exists so the UI can render a quiz session:
  - `quiz` (id e.g. `quiz_<uuid>`, `userId`, `mode` = `manual`, `createdAt`)
  - `quiz_item` (id e.g. `qitm_<uuid>`, `quizId`, `factId` (and/or `questionId` if using M2), ordering, createdAt)
  - Optional: store per-item response/result for basic UX (but do not apply spaced repetition updates in this milestone)
  - All ids follow [prefixed ID convention](../docs/ids.md).
- **API**: tRPC procedure to create a manual quiz for the current user:
  - Input: `{ count: number }` (default configurable)
  - Output: quiz + items (fact/question refs) suitable for rendering
  - Uses protected procedure and relies on RLS for fact ownership.

**Why this is a safe pause point**: Manual quizzes work end-to-end without introducing scheduling complexity. It’s a thin slice that validates quiz rendering and submission UX.

**Unlocks**: M3-pre (shared schema), M3b (scheduled quizzes + spaced repetition), and M3c (taking quizzes and recording results).

---

### Milestone 3-pre: m3-schema-foundation (shared DDL for M3b + M3c)

**Intent**: One **schema-only** milestone so **M3b** and **M3c** can be implemented **in parallel** without competing migrations. See [`gameplans/m3-schema-foundation.md`](../gameplans/m3-schema-foundation.md).

**Definition of Done**:

- **`fact_review_state`** (or equivalent): `userId`, `factId`, `nextReviewAt`, `fibonacciStepIndex` (or equivalent), `updatedAt`; RLS + grants for `recall_app`.
- **`quiz`**: supports scheduled quizzes via `mode` = `scheduled` and nullable `scheduledFor` (e.g. calendar date); reuse `quiz_item`.
- **`quiz_item`**: nullable columns for **per-item result** (e.g. correct/incorrect) and **`answeredAt`** (or equivalent) so M3c can persist submissions without a follow-up migration.
- **Indexes**: e.g. partial unique index for **at most one scheduled quiz per user per day** (idempotent cron); index to support due-fact queries.
- **Backfill**: Existing facts get initial review rows (e.g. “due next day,” step 0) per team rules.
- **No new product behavior required**: DDL + Drizzle + Zod only; application code may still ignore new columns until M3b/M3c.

**Why this is a safe pause point**: Database is ready for scheduling and answer persistence; app behavior stays unchanged until later milestones.

**Unlocks**: M3b and M3c can branch from the same mainline without fighting over `drizzle/meta`.

---

### Milestone 3b: scheduled-quizzes (spaced repetition + creation)

**Execution plan**: [`gameplans/scheduled-quizzes.md`](../gameplans/scheduled-quizzes.md). **DDL** lives in **Milestone 3-pre**; 3b adds Fibonacci helpers, due selection, scheduled quiz creation, and cron.

**Definition of Done**:

- **Scheduling model** (behavior; schema from 3-pre): Per-user-per-fact state supports:
  - Correct answer → advance to next Fibonacci step (e.g. 1→1→2→3→5→8… days from today) — **applied in M3c on submit**; 3b only needs correct **storage** and **due** queries.
  - Wrong answer → reset to “next day” (and reset sequence step) — **M3c on submit**.
- **Due selection query**: “Due facts for user” = facts where `nextReviewAt <= today` (definition of “today” / timezone tracked as an open question), scoped by app user.
- **Initial state**: When a fact becomes eligible for scheduled quizzing, it gets “due next day” and step 0 in the sequence (backfill + new-fact path documented in 3-pre / 3b).
- **Quiz creation job**: Runs on a schedule (e.g. daily). For each **app user** (or in batches), finds due facts and creates a scheduled quiz with items for those facts/questions.
- **Execution context**: Job runs with a service role or per-user DB session so that either RLS is bypassed in a controlled way or each app user’s context is set correctly when building their quiz. No reliance on a single “current user” from a web session.
- **Deployment**: Cron runs in your production environment (e.g. Vercel cron, GitHub Actions, or worker). Document how to run it and how often.

**Why this is a safe pause point**: Scheduled quizzes can be generated automatically from due facts, and the spaced-repetition state is represented and queryable. UI can come later.

**Unlocks**: M3c can assume “there is a quiz to take” (manual or scheduled) and focus on submission, result recording, and schedule updates for scheduled quizzes.

---

### Milestone 3c: quiz-taking-and-result-recording

**Execution plan**: [`gameplans/quiz-taking-and-result-recording.md`](../gameplans/quiz-taking-and-result-recording.md).

**Definition of Done**:

- **API**: tRPC procedures to:
  - get a quiz for the user (by id; and/or “today’s scheduled quiz” if applicable)
  - submit an answer for a quiz item (e.g. quiz item id + correct/incorrect)
  - Uses protected procedure for user-triggered actions.
- **Behavior by quiz mode**:
  - **Manual quizzes**: submission records result (for UX/history), but does **not** update `fact_review_state` or any future scheduled selection.
  - **Scheduled quizzes**: submission records result and updates spaced-repetition state:
    - **Correct**: advance Fibonacci step and set `nextReviewAt = today + fib(step)` (or equivalent)
    - **Wrong**: reset to “next day” and reset Fibonacci step
- **Persistence**: Quiz and item results stored so you can show history or “last quiz” (columns from **3-pre** on `quiz_item` or a separate `review_event` table). No orphaned state.
- **UI (minimal)**: User can open “today’s quiz,” see questions (from M2), and submit correct/incorrect; backend applies scheduling rules. Optional: show next review dates.

**Why this is a safe pause point**: End-to-end flow works for both modes: user can take a manual quiz on demand, and scheduled quizzes can be generated and taken with answers updating the Fibonacci schedule. Product is usable for the core recall loop.

**Unlocks**: Polish (notifications, multiple question types, richer analytics/history).

---

## Dependency Graph

```
1 (facts-crud-rls)           → []
2 (ai-question-generation)   → [1]
3a (manual-quizzes)          → [1]
3-pre (m3-schema-foundation) → [1, 3a]
3b (scheduled-quizzes)       → [3-pre]
3c (quiz-taking-and-result-recording) → [2, 3a, 3b]
```

- **3a** starts after **1** (needs facts and user identity).
- **3-pre** starts after **1** and **3a** (needs `quiz` / `quiz_item` and RLS patterns).
- **3b** starts after **3-pre** (DDL for `fact_review_state` and scheduled quiz columns).
- **2** can run in parallel with **3a** / **3-pre** after **1**.
- **3b** and **3c** can be developed **in parallel** after **3-pre** (both assume schema); **3c** still **depends on 2** (flashcards/questions) and **3b** if you need the full “scheduled quiz in the wild” story.
- **3c** needs **2** (questions to show) and **3a** (manual quiz); for **scheduled** behavior it needs **3b**’s cron-created quizzes and **3-pre**’s columns (3-pre is transitive via **3b** for typical ordering).

## Open Questions

| Question | Notes | Resolve By |
|----------|--------|------------|
| RLS vs app-only checks | Whether to use PostgreSQL RLS or enforce in app with `userId` in every query. | M1 |
| Where to run AI (Edge vs serverless vs worker) | Affects latency and cost for question generation. | M2 |
| One question vs many per fact | Storing multiple questions per fact affects schema and UX. | M2 |
| Timezone for “today” / due date | User timezone vs UTC for cron and “next day” in scheduled quizzes. | M3b |
| Manual quizzes | Now explicitly modeled as M3a (on-demand, random N facts, no scheduling side-effects). | M3a |
| Shared schema before M3b/M3c | One DDL milestone (**3-pre**) so M3b and M3c avoid conflicting migrations. | 3-pre |

## Decisions Made

| Decision | Rationale |
|----------|-----------|
| **App user table with FK to auth user** | Decouple app from auth provider: app has its own `app_user` table with `authUserId` → Better Auth `user.id`. All domain data (facts, quizzes, etc.) references `app_user.id`. Switching or extending auth does not require changing app schema or RLS. |
| **Prefixed IDs (max 4-letter prefix)** | All app entity ids use format `{prefix}_{id}` (e.g. `user_abc…`, `fact_abc…`, `quiz_abc…`). Prefix is 1–4 letters; suffix is a unique value (e.g. UUID). See [docs/ids.md](../docs/ids.md). |
| Fibonacci spaced repetition | You specified: correct → next in sequence (1,1,2,3,5,8… days); wrong → reset to next day. |
| RLS for facts | Simplifies CRUD (no explicit user filter in app code) and enforces isolation at the DB. RLS uses app user id. |
| Separate M3 into 3a / **3-pre** / 3b / 3c | Manual quizzes first; **3-pre** lands shared DDL for scheduling + answer columns; **3b** adds cron + due logic; **3c** adds submit + schedule updates. M3b and M3c can proceed in parallel after 3-pre. |
| “Daily quiz” = one entity per user per day | Assumed for clarity; can be refined in M3a (e.g. multiple quizzes per day if needed). |
