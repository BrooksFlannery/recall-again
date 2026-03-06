# Patch File Template

## Full Template

Each patch file at `llm-prompts/patches/{project-name}/patch-{N}.md` should follow this structure:

````markdown
# [{project-name}] Patch {N}: {Title}

## Problem Statement
{verbatim from gameplan}

## Solution Summary
{verbatim from gameplan}

## Design Decisions (Non-negotiable)
{verbatim "Explicit Opinions" section from gameplan}

## Dependencies Completed
{For each dependency, one line summarizing what it added, e.g.:
"Patch 2 added `adjustSubscription` function in src/subscriptions/adjust.ts"}
{If no dependencies: "None - this patch has no dependencies."}

## Your Task
{Patch instructions verbatim from gameplan, including files to modify/create and specific changes}

## Test Stubs to Add
{If this patch introduces test stubs (from Test Map where Stub Patch = N), list them here with file paths}
{Format: "Add the following `.skip` tests to {file}:" followed by the test stub code from the gameplan}
{If none: "None - this patch does not introduce test stubs."}

## Tests to Unskip and Implement
{If this patch implements tests (from Test Map where Impl Patch = N), list them here}
{Format for each test:}
- **Test**: `{full test name from Test Map}`
- **File**: `{file path}`
- **Stub Patch**: {N} (the test stub with setup/expectation comments is already in the codebase)
- **Action**: Remove `.skip`, implement the test body per the stub comments

{If none: "None - this patch does not implement tests."}

## Git Instructions
- Branch from: `{base branch determined in step 5}`
- Branch name: `{project-name}/patch-{N}-{descriptive-slug}`
- PR base: `{base branch determined in step 5}`

**IMPORTANT: Open a draft PR immediately after your first commit.** Do not wait until implementation is complete. This ensures the PR title format is correct from the start.

After your first commit, run:
```bash
gh pr create --draft --title "[{project-name}] Patch {N}: {Title}" --body "Work in progress" --base {base branch}
```

Then continue implementing. When finished:
1. Run `bun test` to verify tests pass
2. Update the PR description with a proper summary
3. Mark the PR as ready for review when complete

## PR Title (CRITICAL)
**You MUST use this EXACT title format:**

`[{project-name}] Patch {N}: {Title}`

For example: `[redis-cache-helpers] Patch 1: Cache Infrastructure`

Do NOT use conventional commit format (e.g., `feat:`, `fix:`). The bracketed project name and patch number are required for tracking.
````

---

## Example Walkthrough

Given a gameplan with:
- **Project Name**: `stripe-tests`
- **Dependency graph**:
  ```
  - Patch 1 -> []
  - Patch 2 -> [1]
  - Patch 3 -> [1, 2]
  - Patch 4 -> [1, 3]
  - Patch 5 -> [1]
  - Patch 6 -> [5]
  - Patch 7 -> [1]
  - Patch 8 -> [5, 7]
  ```

### Step 2 (detect completed):
```bash
gh pr list --state merged --search "[stripe-tests]" --json number,title
```
Result: `[{"number": 100, "title": "[stripe-tests] Patch 1: Setup"}, {"number": 101, "title": "[stripe-tests] Patch 2: Core"}]`

Merged: [1, 2]

### Step 3 (detect open PRs):
```bash
gh pr list --state open --search "[stripe-tests]" --json number,title,headRefName
```
Result:
```json
[
  {"number": 102, "title": "[stripe-tests] Patch 5: Tax tests", "headRefName": "stripe-tests/patch-5-tax"},
  {"number": 103, "title": "[stripe-tests] Patch 7: Utils", "headRefName": "stripe-tests/patch-7-utils"}
]
```

Open PRs: {5: "stripe-tests/patch-5-tax", 7: "stripe-tests/patch-7-utils"}

### Step 4 (find unblocked):
- Patch 1: merged (skip)
- Patch 2: merged (skip)
- Patch 3: depends on [1, 2], both merged, no open PR → **candidate**
- Patch 4: depends on [1, 3], patch 3 not merged/open → **blocked**
- Patch 5: has open PR (skip)
- Patch 6: depends on [5], patch 5 has open PR → **candidate**
- Patch 7: has open PR (skip)
- Patch 8: depends on [5, 7], both have open PRs → **candidate**

Candidates: [3, 6, 8]

### Step 5 (determine base branch per patch):
- Patch 3: deps [1, 2] — 0 open PRs in chain → base: `main`
- Patch 6: deps [5] — 1 open PR (#102) in chain → base: `stripe-tests/patch-5-tax`
- Patch 8: deps [5, 7] — 2 open PRs (#102, #103) in chain → **blocked** (skip)

Proceeding with: [3, 6]

### Result:
Create:
- `llm-prompts/patches/stripe-tests/patch-3.md` (base: `main`)
- `llm-prompts/patches/stripe-tests/patch-6.md` (base: `stripe-tests/patch-5-tax`)

Output: "Created prompts for patches: [3, 6]"
