# Gameplan Format Reference

## Output Template

```markdown
# Gameplan: {project-name}

## Problem Statement
{2-4 sentences: what problem, why it matters}

## Solution Summary
{3-5 sentences: high-level approach}

## Mergability Strategy

### Feature Flagging Strategy
{Document flag approach, or explain why not needed}

**Feature Flag Template** (if using flags):
- Flag Type: [Environment Variable]
- Flag Name: [ENABLE_MY_FEATURE]
- Introduced: Patch N (as [INFRA] - adding the flag itself)
- Activated: Patch M (as [BEHAVIOR] - wiring up the flag)

### Patch Ordering Strategy
{Describe how patches are ordered: early/middle/late}

## Current State Analysis
{What's the current state of the codebase relative to where we want it to be}

## Required Changes
{Specific files, line numbers, function signatures}

## Acceptance Criteria
- [ ] {Criterion 1}
- [ ] {Criterion 2}

## Open Questions
{What decisions should be made as a team?}

## Explicit Opinions
{Design decisions with rationale}

## Patches

### Patch 1 [INFRA]: {Title}
**Files to modify:**
- {file path}

**Changes:**
1. {Specific change}

### Patch 2 [BEHAVIOR]: {Title}
...

## Test Map

| Test Name | File | Stub Patch | Impl Patch |
|-----------|------|------------|------------|
| describe > should do X | src/foo.test.ts | 2 | 4 |

## Dependency Graph
- Patch 1 [INFRA] -> []
- Patch 2 [INFRA] -> [1]
- Patch 3 [BEHAVIOR] -> [1, 2]

**Mergability insight**: X of Y patches are `[INFRA]`/`[GATED]` and can ship without changing observable behavior.

## Mergability Checklist
- [ ] Feature flag strategy documented (or explained why not needed)
- [ ] Early patches contain only non-functional changes (`[INFRA]`)
- [ ] Test stubs with `.skip` markers are in early `[INFRA]` patches
- [ ] Test implementations are co-located with the code they test (same patch)
- [ ] Test Map is complete: every test has Stub Patch and Impl Patch assigned
- [ ] Test Map Impl Patch matches the patch that implements the tested code
- [ ] `[BEHAVIOR]` patches are as small as possible
- [ ] Dependency graph shows `[INFRA]` patches early, `[BEHAVIOR]` patches late
- [ ] Each `[BEHAVIOR]` patch is clearly justified (cannot be gated or deferred)
```

## Test Stub Example

**Test stub (in an `[INFRA]` patch):**
```ts
describe('adjustSubscription', async () => {
    it.skip('should fail if the subscription is in a terminal state', async () => {
        // PENDING: Patch 4
        // setup: get a subscription into a terminal state
        // expectation: throw error with message "Cannot adjust terminated subscription"
    })

    it.skip('should fail for free plan subscriptions', async () => {
        // PENDING: Patch 4
        // setup: create a free plan subscription
        // expectation: throw error with message "Cannot adjust free plan"
    })

    it.skip('should execute successfully for an active, paid subscription', async () => {
        // PENDING: Patch 5
        // setup: create non-free plan subscription
        // expectations:
        // - creates billing run
        // - billing run is executed
        // - payment is created and successfully received
        // - old subscription items are expired
        // - new subscription items are created based on what was provided
    })
})
```

**Test implementation (in Patch 4, a `[GATED]` or `[BEHAVIOR]` patch):**
```ts
it('should fail if the subscription is in a terminal state', async () => {
    // setup
    const subscription = await createTerminatedSubscription()

    // act & assert
    await expect(adjustSubscription(subscription.id, {...}))
        .rejects.toThrow('Cannot adjust terminated subscription')
})
```

---

## Complete Example: trigger-transaction-consistency

Below is a real-world gameplan demonstrating all sections. Use this as a quality reference.

# Gameplan: trigger-transaction-consistency

## Problem Statement

Trigger.dev tasks are currently called directly inside database transactions (e.g., `await attemptBillingRunTask.trigger(...)` in `adjustSubscription.ts:1094`). This creates a consistency problem: if the transaction rolls back after the trigger fires, the background task has already been dispatched with stale/invalid data. Additionally, testing trigger invocations requires fragile module mocking rather than type-safe effect inspection.

## Solution Summary

Extend the existing `TransactionEffects` system with a new `enqueueTriggerTask()` callback. Trigger task invocations will be collected during the transaction and dispatched **only after the transaction commits successfully** (similar to how `invalidateCache()` works). This ensures trigger tasks only run when the data they depend on has been persisted, and enables type-safe inspection of trigger invocations in tests.

## Mergability Strategy

### Feature Flagging Strategy

**No feature flag needed.** This is a refactoring of internal infrastructure that preserves existing behavior. The change is transparent to callers - tasks still get triggered, just at a slightly different time (after commit instead of during transaction).

### Patch Ordering Strategy

**Early Patches** (ship first, no behavior change):
- New types and interfaces for queued trigger tasks
- New `enqueueTriggerTask` callback infrastructure
- Test stubs with `.skip` markers

**Middle Patches** (incremental migration):
- Migrate individual call sites from direct `.trigger()` to `enqueueTriggerTask()`
- Each migration patch is independently shippable

**Late Patches** (cleanup):
- Add lint rule to prevent direct `.trigger()` calls inside transactions
- Update documentation

## Current State Analysis

### Existing Effects System (`src/db/transactionEffectsHelpers.ts`)

The codebase already has an effects accumulator pattern:

```tsx
interface TransactionEffects {
  cacheInvalidations: CacheDependencyKey[]  // After commit
  eventsToInsert: Event.Insert[]             // Before commit
  ledgerCommands: LedgerCommand[]            // Before commit
}
```

- `emitEvent()` and `enqueueLedgerCommand()` - processed **before** commit (inside transaction)
- `invalidateCache()` - processed **after** commit (fire-and-forget)

### Current Trigger Invocation Locations

| File | Line | Task | Context |
|------|------|------|---------|
| `subscriptions/adjustSubscription.ts` | 1094 | `attemptBillingRunTask` | Inside `adjustSubscription`, after billing run created |
| `subscriptions/adjustSubscription.ts` | 1155, 1174 | Notification tasks | After subscription item adjustment |
| `subscriptions/cancelSubscription.ts` | 419, 432 | Notification tasks | Inside `cancelSubscriptionImmediately` |
| `subscriptions/cancelSubscription.ts` | 586, 600 | Notification tasks | Inside `scheduleSubscriptionCancellation` |
| `subscriptions/createSubscription/helpers.ts` | 288 | `attemptBillingRunTask` | After subscription created |
| `subscriptions/billingPeriodHelpers.ts` | 413 | `attemptBillingRunTask` | Inside billing period transition |
| `subscriptions/billingRunHelpers.ts` | 972 | `generateInvoicePdfTask` | After billing run processing |

### The Consistency Problem

```
1. User calls adjustSubscription()
2. Billing period items inserted
3. Billing run created
4. attemptBillingRunTask.trigger() called  <-- Task dispatched immediately
5. Function returns with pendingBillingRunId
6. Transaction attempts to commit...
7. Commit fails (e.g., serialization conflict) → ROLLBACK
8. Task executes: tries to access billing run that doesn't exist
```

## Required Changes

### 1. New Types (`src/db/types.ts`)

```tsx
export interface QueuedTriggerTask<TPayload = unknown> {
  key: string
  task: {
    id: string
    trigger: (payload: TPayload, options?: { idempotencyKey?: string }) => Promise<{ id: string }>
  }
  payload: TPayload
  idempotencyKey?: string
}

export interface TriggerTaskHandle {
  id: string
}

export type EnqueueTriggerTaskCallback = <TPayload>(
  key: string,
  task: {
    id: string
    trigger: (payload: TPayload, options?: { idempotencyKey?: string }) => Promise<{ id: string }>
  },
  payload: TPayload,
  options?: { idempotencyKey?: string }
) => void

export interface TransactionResult<T> {
  result: T
  triggerHandles: Map<string, TriggerTaskHandle>
}
```

### 2. Effects Accumulator (`src/db/transactionEffectsHelpers.ts`)

Update `createEffectsAccumulator` to include `triggerTasks` array and `enqueueTriggerTask` callback.

Add `dispatchTriggerTasksAfterCommit`:

```tsx
export async function dispatchTriggerTasksAfterCommit(
  triggerTasks: QueuedTriggerTask[]
): Promise<Map<string, TriggerTaskHandle>>
```

### 3. Transaction Wrappers

Change return types to `Promise<TransactionResult<T>>`:

```tsx
// Before
const subscription = await comprehensiveAuthenticatedTransaction(...)
// After
const { result: subscription, triggerHandles } = await comprehensiveAuthenticatedTransaction(...)
```

### 4-9. Migrate Call Sites

Each call site replaces direct `.trigger()` with `ctx.enqueueTriggerTask()`:

```tsx
// Before
const billingRunHandle = await attemptBillingRunTask.trigger({ billingRun })
pendingBillingRunId = billingRunHandle.id

// After
ctx.enqueueTriggerTask(
  'billingRun',
  attemptBillingRunTask,
  { billingRun },
  { idempotencyKey: `billing-run-${billingRun.id}` }
)
```

### 10. Test Helpers (`src/test/helpers/triggerTestHelpers.ts`)

```tsx
export function createTestEffectsContext(
  transaction: DbTransaction,
  options?: { livemode?: boolean }
): {
  ctx: TransactionEffectsContext
  getQueuedTriggerTasks: () => QueuedTriggerTask[]
  getQueuedTriggerTaskByKey: (key: string) => QueuedTriggerTask | undefined
  getCacheInvalidations: () => CacheDependencyKey[]
  getEvents: () => Event.Insert[]
}
```

### 11. Remove Idempotent Wrappers

Remove all `idempotent...` wrapper functions from notification task files. Pattern becomes:
- Inside transaction: `ctx.enqueueTriggerTask('key', task, payload, { idempotencyKey })`
- Outside transaction: `await task.trigger(payload, { idempotencyKey })`

## Acceptance Criteria

- [ ] `enqueueTriggerTask` callback is available on `TransactionEffectsContext`
- [ ] Trigger tasks are dispatched only after transaction commits
- [ ] If transaction rolls back, trigger tasks are NOT dispatched
- [ ] All existing call sites migrated from direct `.trigger()` to `enqueueTriggerTask()`
- [ ] Tests can inspect queued trigger tasks without module mocking
- [ ] No change to observable behavior (tasks still get triggered)
- [ ] All existing tests pass
- [ ] New tests cover the transaction rollback scenario
- [ ] Existing business logic tests enriched with trigger assertions

## Open Questions

1. **Error handling for trigger dispatch failures**: Log failures (recommended — Trigger.dev has its own retry mechanism).
2. **Admin transaction support**: Add comprehensive admin transaction with effects for consistency.

## Explicit Opinions

1. **Dispatch after commit, not before**: Unlike `emitEvent` and `enqueueLedgerCommand` which run inside the transaction, trigger tasks run after commit because they operate independently with their own transactions.
2. **Transaction returns result + trigger handles at same level**: `{ result: T, triggerHandles: Map<string, { id: string }> }` cleanly separates business logic from infrastructure.
3. **Trigger handles preserve Trigger.dev run IDs**: Dispatch happens after commit but before the wrapper returns, so run IDs are still available to callers.
4. **Fire-and-forget dispatch with handle collection**: Dispatch failures don't fail the original request, but successful handles are collected.
5. **Remove idempotent wrappers**: Makes the distinction between in-transaction and out-of-transaction explicit.
6. **No lint rule initially**: Deferred — distinguishing transaction context is complex.

## Test Map

### New Infrastructure Tests

| Test Name | File | Stub Patch | Impl Patch |
|-----------|------|------------|------------|
| enqueueTriggerTask > should accumulate trigger tasks in effects with key | src/db/transactionEffectsHelpers.unit.test.ts | 2 | 3 |
| enqueueTriggerTask > should not dispatch tasks if transaction rolls back | src/db/authenticatedTransaction.db.test.ts | 2 | 3 |
| enqueueTriggerTask > should dispatch tasks after commit and return handles | src/db/authenticatedTransaction.db.test.ts | 2 | 3 |
| enqueueTriggerTask > should return handles keyed by user-provided key | src/db/authenticatedTransaction.db.test.ts | 2 | 3 |
| dispatchTriggerTasksAfterCommit > should log errors but not throw, omit failed from handles | src/db/transactionEffectsHelpers.unit.test.ts | 2 | 3 |
| comprehensiveAuthenticatedTransaction > should return result and triggerHandles at same level | src/db/authenticatedTransaction.db.test.ts | 2 | 3 |

### Migration Tests

| Test Name | File | Stub Patch | Impl Patch |
|-----------|------|------------|------------|
| adjustSubscription > should queue billing run trigger via enqueueTriggerTask | src/subscriptions/adjustSubscription.db.test.ts | 4 | 5 |
| adjustSubscription > should queue notification triggers via enqueueTriggerTask | src/subscriptions/adjustSubscription.db.test.ts | 4 | 5 |
| cancelSubscription > should queue notification triggers via enqueueTriggerTask | src/subscriptions/cancelSubscription.db.test.ts | 4 | 6 |

## Patches

### Patch 1 [INFRA]: Add types for queued trigger tasks

**Files to modify:** `src/db/types.ts`

**Changes:**
1. Add `QueuedTriggerTask` interface
2. Add `EnqueueTriggerTaskCallback` type
3. Add `triggerTasks` to `TransactionEffects`
4. Add `enqueueTriggerTask` to `TransactionCallbacks`

### Patch 2 [INFRA]: Add test stubs for trigger task infrastructure

**Files to create/modify:**
- `src/db/transactionEffectsHelpers.unit.test.ts`
- `src/db/authenticatedTransaction.db.test.ts`

### Patch 3 [BEHAVIOR]: Implement trigger task queueing infrastructure

**Files to modify:**
- `src/db/transactionEffectsHelpers.ts`
- `src/db/authenticatedTransaction.ts`
- `src/db/adminTransaction.ts`

### Patch 3a [BEHAVIOR]: Migrate existing transaction wrapper callers

**Files to modify (26 files):** All callers of transaction wrappers — destructure `{ result }`.

### Patch 4 [INFRA]: Add test stubs for migrated call sites

### Patch 5 [BEHAVIOR]: Migrate adjustSubscription trigger calls

### Patch 6 [BEHAVIOR]: Migrate cancelSubscription trigger calls

### Patch 7 [BEHAVIOR]: Migrate createSubscription trigger calls

### Patch 8 [BEHAVIOR]: Migrate billingPeriodHelpers trigger calls

### Patch 9 [BEHAVIOR]: Migrate billingRunHelpers trigger calls

### Patch 10 [INFRA]: Add test helper for inspecting queued triggers

### Patch 11 [BEHAVIOR]: Remove idempotent wrapper functions

### Patch 12 [INFRA]: Enrich existing business logic tests with trigger assertions

## Dependency Graph

```
- Patch 1 [INFRA] -> []
- Patch 2 [INFRA] -> [1]
- Patch 3 [BEHAVIOR] -> [1, 2]
- Patch 3a [BEHAVIOR] -> [3]
- Patch 4 [INFRA] -> [3a]
- Patch 5 [BEHAVIOR] -> [3a, 4]
- Patch 6 [BEHAVIOR] -> [3a, 4]
- Patch 7 [BEHAVIOR] -> [3a]
- Patch 8 [BEHAVIOR] -> [3a]
- Patch 9 [BEHAVIOR] -> [3a]
- Patch 10 [INFRA] -> [3a]
- Patch 11 [BEHAVIOR] -> [5, 6, 7, 8, 9]
- Patch 12 [INFRA] -> [5, 6, 7, 8, 9]
```

**Mergability insight**: 4 of 13 patches are `[INFRA]` and can ship without changing observable behavior. Patches 5-9 can be parallelized after Patch 3a.

## Mergability Checklist

- [x] Feature flag strategy documented (not needed — transparent refactoring)
- [x] Early patches contain only non-functional changes (`[INFRA]`)
- [x] Test stubs with `.skip` markers are in early `[INFRA]` patches
- [x] Test implementations are co-located with the code they test (same patch)
- [x] Test Map is complete: every test has Stub Patch and Impl Patch assigned
- [x] Test Map Impl Patch matches the patch that implements the tested code
- [x] `[BEHAVIOR]` patches are as small as possible
- [x] Dependency graph shows `[INFRA]` patches early, `[BEHAVIOR]` patches late
- [x] Each `[BEHAVIOR]` patch is clearly justified (cannot be gated or deferred)
