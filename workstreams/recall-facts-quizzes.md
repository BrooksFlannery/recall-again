# Workstream: Recall — Facts & Quizzes

## Vision

Users create and manage **facts** (things they want to remember). The system generates **questions** from facts via AI, and runs **auto-generated daily quizzes** that use spaced repetition (Fibonacci schedule): correct answers push the next review further out (1, 1, 2, 3, 5, 8… days); wrong answers reset to “next day.” Data is isolated per user via Row Level Security (RLS) so CRUD and quizzes never need to filter by user explicitly.

## Current State

- **Auth**: Better Auth with Drizzle adapter; `user`, `session`, `account` tables (auth provider owns these). Sign-in/sign-up (email/password + Google) working.
- **Users**: No app-level user table yet. App would currently couple directly to Better Auth’s `user` table; we want to avoid that.
- **API**: tRPC v11, Effect TS, Drizzle ORM, PostgreSQL (Docker locally, Neon in prod). Example `ping` router exists; tRPC context does not yet include the current user.
- **App tables**: Only `ping` in `schema-app.ts`. No `app_user`, `facts`, `questions`, `quizzes`, or scheduling tables.

## Key Challenges

- **Decoupling from auth provider**: App data (facts, quizzes, etc.) should reference an **app-level user**, not the auth provider’s user table. That way we can switch or extend auth without rewriting app schema and RLS.
- **RLS design**: Policies must enforce “user can only see/edit their own facts” so application code can rely on the DB and avoid passing `userId` everywhere. RLS will use the **app user** id.
- **Session → app user**: tRPC (and any cron) need to resolve session → auth user → app user (create app user on first sign-in if missing) and use app user id for RLS and all app logic.
- **AI inference**: Choosing model, prompt shape, and where it runs (serverless vs long-running) for “fact → question(s)” generation.
- **Scheduling semantics**: Fibonacci sequence (1, 1, 2, 3, 5, 8…) and “reset on wrong” must be represented in the schema and cron logic; “due” definition (e.g. due date ≤ today) and timezone handling.
- **Cron ownership**: Daily job must iterate users and create quizzes from overdue facts without impersonating a single user session (e.g. service role or per-user connection with RLS).

## Milestones

### Milestone 1: facts-crud-rls

**Definition of Done**:

- **App user table**: `app_user` table (or equivalent) with: `id` (prefixed id, e.g. `user_<uuid>` — see [docs/ids.md](../docs/ids.md)), `authUserId` (FK to Better Auth `user.id`, unique so one app user per auth user), `createdAt`, `updatedAt`. All app domain data (facts, later quizzes, etc.) references this table, not the auth `user` table.
- **Resolve or create app user**: On each authenticated request, resolve session → auth user → app user; if no app user exists for that auth user, create one (e.g. on first sign-in). tRPC context exposes the **app user** (id and any needed fields), not the raw auth user.
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

### Milestone 3a: quiz-data-model-and-scheduling

**Definition of Done**:

- **Scheduling model**: Per-fact (or per fact+user) state for “next review date” and “current step in Fibonacci sequence.” Schema chosen so that:
  - Correct answer → advance to next Fibonacci step (e.g. 1→1→2→3→5→8… days from today).
  - Wrong answer → reset to “next day” (and reset sequence step to start).
- **Tables**: e.g. `fact_review_state` or equivalent: `userId` (FK to `app_user.id`), `factId`, `nextReviewAt`, `fibonacciStepIndex` (or equivalent), `updatedAt`. Optional: `quiz` (id e.g. `quiz_<uuid>`), `quiz_item` if you want to represent “a quiz” as an entity (e.g. daily quiz = one row with many items). All ids follow [prefixed ID convention](../docs/ids.md).
- **Queries**: “Overdue facts for user” = facts where `nextReviewAt <= today` (or similar), scoped by app user. No cron yet; logic can be exercised via tRPC or script.
- **Initial state**: When a fact (or fact+question) is first eligible for quizzing, it gets “due next day” and step 0 or 1 in the sequence.

**Why this is a safe pause point**: Data model and scheduling rules are in place and testable. No cron or UI dependency.

**Unlocks**: M3b (daily quiz creation) and M3c (taking quizzes and recording results).

---

### Milestone 3b: daily-quiz-cron

**Definition of Done**:

- **Cron job**: Runs on a schedule (e.g. daily). For each **app user** (or in batches), finds facts that are due for review (using the scheduling model from M3a).
- **Quiz creation**: Creates a “daily quiz” record (if using `quiz` table) and attaches items (e.g. one item per fact or per question) for overdue facts. Only includes facts/questions for that app user.
- **Execution context**: Job runs with a service role or per-user DB session so that either RLS is bypassed in a controlled way or each app user’s context is set correctly when building their quiz. No reliance on a single “current user” from a web session.
- **Deployment**: Cron runs in your production environment (e.g. Vercel cron, GitHub Actions, or worker). Document how to run it and how often.

**Why this is a safe pause point**: Daily quizzes are created automatically from overdue facts. No UI required to verify creation (e.g. via DB or admin script).

**Unlocks**: M3c can assume “there is a quiz to take” and focus on submission and schedule updates.

---

### Milestone 3c: quiz-taking-and-result-recording

**Definition of Done**:

- **API**: tRPC procedures to: get “current” or “today’s” quiz for the user; submit an answer for a quiz item (e.g. fact/question id + correct/incorrect). Uses protected procedure.
- **Schedule updates**: On submit:
  - **Correct**: Update that fact’s review state to next Fibonacci step and set `nextReviewAt = today + fib(step)` (or equivalent).
  - **Wrong**: Reset that fact’s review state to “next day” and reset Fibonacci step.
- **Persistence**: Quiz and item results stored so you can show history or “last quiz” (e.g. `quiz_item.result` or a separate `review_event` table). No orphaned state.
- **UI (minimal)**: User can open “today’s quiz,” see questions (from M2), and submit correct/incorrect; backend applies scheduling rules. Optional: show next review dates.

**Why this is a safe pause point**: End-to-end flow works: cron creates quizzes, user takes quiz, answers update Fibonacci schedule. Product is usable for core recall loop.

**Unlocks**: Polish (notifications, multiple question types, manual quizzes if desired).

---

## Dependency Graph

```
1 (facts-crud-rls)           → []
2 (ai-question-generation)   → [1]
3a (quiz-data-model-and-scheduling) → [1]
3b (daily-quiz-cron)         → [3a]
3c (quiz-taking-and-result-recording) → [2, 3a, 3b]
```

- **3a** can start after **1** (needs facts and user identity).
- **2** can run in parallel with **3a** after **1**.
- **3b** needs **3a** (scheduling model and “overdue” query).
- **3c** needs **2** (questions to show), **3a** (schedule updates), and **3b** (quizzes to take).

## Open Questions

| Question | Notes | Resolve By |
|----------|--------|------------|
| RLS vs app-only checks | Whether to use PostgreSQL RLS or enforce in app with `userId` in every query. | M1 |
| Where to run AI (Edge vs serverless vs worker) | Affects latency and cost for question generation. | M2 |
| One question vs many per fact | Storing multiple questions per fact affects schema and UX. | M2 |
| Timezone for “today” / due date | User timezone vs UTC for cron and “next day.” | M3a / M3b |
| Manual quizzes | Whether to support “quiz me on these facts” in addition to auto daily. | After M3c |

## Decisions Made

| Decision | Rationale |
|----------|-----------|
| **App user table with FK to auth user** | Decouple app from auth provider: app has its own `app_user` table with `authUserId` → Better Auth `user.id`. All domain data (facts, quizzes, etc.) references `app_user.id`. Switching or extending auth does not require changing app schema or RLS. |
| **Prefixed IDs (max 4-letter prefix)** | All app entity ids use format `{prefix}_{id}` (e.g. `user_abc…`, `fact_abc…`, `quiz_abc…`). Prefix is 1–4 letters; suffix is a unique value (e.g. UUID). See [docs/ids.md](../docs/ids.md). |
| Fibonacci spaced repetition | You specified: correct → next in sequence (1,1,2,3,5,8… days); wrong → reset to next day. |
| RLS for facts | Simplifies CRUD (no explicit user filter in app code) and enforces isolation at the DB. RLS uses app user id. |
| Separate M3 into 3a / 3b / 3c | Smaller milestones: data model first, then cron, then taking and recording. Each leaves the system in a consistent state. |
| “Daily quiz” = one entity per user per day | Assumed for clarity; can be refined in M3a (e.g. multiple quizzes per day if needed). |
