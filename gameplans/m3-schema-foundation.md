# Gameplan: m3-schema-foundation

## Workstream

- **Workstream**: Recall — Facts & Quizzes ([`workstreams/recall-facts-quizzes.md`](../workstreams/recall-facts-quizzes.md))
- **Milestone**: 3-pre (shared schema for M3b + M3c)
- **Prior milestones**: 1 (facts-crud-rls), 3a (manual-quizzes) — must exist: `app_user`, `fact`, `quiz`, `quiz_item`, RLS for those tables
- **Unlocks**: [`scheduled-quizzes.md`](scheduled-quizzes.md) (M3b) and [`quiz-taking-and-result-recording.md`](quiz-taking-and-result-recording.md) (M3c) can proceed **in parallel** as code-only work; no competing migrations

## Problem Statement

Milestone **3b** needs `fact_review_state`, scheduled quiz columns, and indexes for due queries and idempotent cron. Milestone **3c** needs somewhere to persist **per-item correct/incorrect** (and timestamps) on `quiz_item`. If those land as separate migrations, branches conflict and ordering is fragile. One **additive** schema patch defines the full **data contract** so follow-up gameplans only add logic, tests, and routes.

## Solution Summary

Ship a **single `[INFRA]` patch**: Drizzle updates in [`schema-app.ts`](../src/server/db/schema-app.ts), one SQL migration (RLS, grants, backfills, indexes), and Zod exports for new fields. **No** new tRPC procedures, cron, Fibonacci helpers in app code, or writes to new columns from production paths—nullable columns stay `NULL` until M3b/M3c.

## Mergability Strategy

### Feature Flagging Strategy

**Not needed.** Schema-only; observable API behavior unchanged.

### Patch Ordering Strategy

Single patch. Land before branching heavy M3b / M3c work.

## Current State Analysis

| Area | Before this patch | After this patch |
|------|-------------------|------------------|
| **Review / scheduling** | No `fact_review_state` | Table + RLS + backfill from `fact` |
| **`quiz`** | `mode` + timestamps | `scheduled_for` nullable (`date` recommended; see [`scheduled-quizzes.md`](scheduled-quizzes.md) opinions) |
| **`quiz_item`** | No answer fields | Nullable `result` + `answered_at` (or equivalent; see Required Changes) |
| **Grants** | `SELECT`/`INSERT` on `quiz`/`quiz_item` | `UPDATE` on `quiz_item` for M3c; `SELECT`/`INSERT`/`UPDATE` on `fact_review_state` |

## Required Changes

### 1) `fact_review_state`

- Composite primary key `(userId, factId)` → FKs to `app_user`, `fact` (ON DELETE CASCADE).
- Columns: `nextReviewAt` (timestamptz, not null), `fibonacciStepIndex` (integer, not null, default `0`), `updatedAt` (timestamptz, same pattern as other app tables).
- Enable + **FORCE** RLS; policy: `user_id = current_setting('app.user_id', true)::text`.
- `GRANT SELECT, INSERT, UPDATE` to `recall_app` (same pattern as [`drizzle/0011_quiz_grants.sql`](../drizzle/0011_quiz_grants.sql)).
- **Backfill**: `INSERT … SELECT` from `fact` for every fact; set `next_review_at` to “due soon” per team rule (e.g. start of next UTC day), `fibonacci_step_index = 0`.
- Optional index: `(user_id, next_review_at)` for due queries.

### 2) `quiz`

- Add nullable `scheduledFor` — PostgreSQL `date` (UTC calendar day) recommended for idempotency with M3b cron.
- Partial **unique** index: one scheduled quiz per user per calendar day, e.g. `UNIQUE (user_id, scheduled_for) WHERE mode = 'scheduled'` (exact predicate matches how M3b sets `mode`).

### 3) `quiz_item`

- Add nullable **`result`** — store app-level values `'correct' | 'incorrect'` as `text` with Zod union at runtime, or a native enum in SQL if preferred.
- Add nullable **`answeredAt`** — `timestamptz`.
- Extend RLS policies so `recall_app` may **UPDATE** rows for the current `app.user_id` (existing policies may be SELECT/INSERT-only; migration must `GRANT UPDATE` and add `FOR UPDATE` policy as needed).

### 4) New facts going forward

- Either document follow-up in M3b/M3c to insert `fact_review_state` in `FactRepository.create`, or add a **trigger** in this migration—pick one and reference it in [`scheduled-quizzes.md`](scheduled-quizzes.md) / [`quiz-taking-and-result-recording.md`](quiz-taking-and-result-recording.md).

### 5) Zod / exports

- `src/server/schemas/quiz.ts` — include `scheduledFor` in select schema.
- `src/server/schemas/quiz-item.ts` — include `result`, `answeredAt`.
- New `src/server/schemas/fact-review-state.ts` — `createSelectSchema` from Drizzle table.

## Acceptance Criteria

- [ ] One migration applies cleanly on fresh DB and on DBs that already have M3a tables.
- [ ] `fact_review_state` has RLS consistent with `fact` / `quiz` (`recall_app` + `app.user_id`).
- [ ] `quiz_item` is updatable under RLS for the owning user (M3c).
- [ ] Backfill covers existing facts; new-fact story documented for follow-up milestones.
- [ ] No production code path **required** to populate new fields yet; existing tests pass.
- [ ] [`drizzle/meta/_journal.json`](../drizzle/meta/_journal.json) updated per Drizzle workflow.

## Open Questions

1. **Enum storage**: `text` + Zod vs PostgreSQL `ENUM` for `quiz_item.result`.
2. **Trigger vs app** for inserting `fact_review_state` on new `fact` rows.

## Explicit Opinions

1. **Single migration** beats two—fewer rebase conflicts between M3b and M3c branches.
2. **`scheduled_for` as `date`** aligns with partial unique index for “one scheduled quiz per user per day” (UTC v1).
3. **Grant `UPDATE` on `quiz_item` now** so M3c does not need a follow-up migration for permissions.

## Patches

### Patch 1 [INFRA]: Shared M3 schema (DDL + RLS + Zod)

**Files:**

- `src/server/db/schema-app.ts` — `factReviewState`; `quiz.scheduledFor`; `quizItem.result`, `quizItem.answeredAt`; relations
- `drizzle/*.sql` — CREATE/ALTER; RLS; grants; indexes; backfill; optional trigger
- `drizzle/meta/_journal.json`
- `src/server/schemas/quiz.ts`, `quiz-item.ts`, `fact-review-state.ts` (new)
- `src/server/db/index.ts` exports if needed

**Changes:** As in Required Changes. No routers, no cron, no `src/lib/spaced-repetition.ts`.

## Test Map

| Test Name | File | Stub Patch | Impl Patch |
|-----------|------|------------|------------|
| (optional) migration smoke / schema contract | existing test harness or manual checklist | — | 1 |

No behavioral tests required; optional smoke that migration runs in CI.

## Dependency Graph

```
- Patch 1 [INFRA] -> []
```

**Prerequisite (human ordering):** Implement after milestones **1** and **3a** so base tables exist.

**Mergability insight:** 1/1 patches are `[INFRA]`; safe to merge without changing user-visible behavior.

## Mergability Checklist

- [x] Feature flag strategy documented (not needed)
- [x] Single non-functional patch
- [x] M3b/M3c can add tests in their own gameplans
- [x] `[BEHAVIOR]` patches: none

## Related gameplans

- Next: [`scheduled-quizzes.md`](scheduled-quizzes.md) (M3b — logic + cron)
- Next: [`quiz-taking-and-result-recording.md`](quiz-taking-and-result-recording.md) (M3c — submit + schedule updates)
