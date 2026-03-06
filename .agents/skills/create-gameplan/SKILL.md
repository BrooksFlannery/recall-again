# Create Gameplan

Create a structured plan ("gameplan") for a complex codebase change. The gameplan aligns the team on scope, patches, tests, and dependencies before any code is written.

**Core principle**: It should be 5-10x easier to review a gameplan than the code it produces.

## Workstream Context (Optional)

A gameplan can be **standalone** or part of a **workstream** (a larger project spanning multiple gameplans as milestones).

**If the user provides a workstream reference** (Notion URL or workstream name):
1. Fetch the workstream from Notion to understand the broader context
2. Identify which milestone this gameplan corresponds to
3. Review the milestone's "Definition of Done" — this informs your acceptance criteria
4. Ensure your gameplan leaves the codebase in a consistent state

**If no workstream is provided**, treat this as a standalone gameplan.

## Gameplan Structure

| Section | Purpose |
|---------|---------|
| **Project Name** | Short kebab-case identifier (e.g., `subscription-adjustments`). Used in branch names and PR titles. |
| **Workstream** | (If applicable) Name, milestone, prior milestones, what this unlocks |
| **Problem Statement** | 2-4 sentences: what problem, why it matters |
| **Solution Summary** | 3-5 sentences: high-level approach |
| **Mergability Strategy** | Feature flag strategy + patch ordering strategy |
| **Current State Analysis** | Where the codebase is now vs. where it needs to be |
| **Required Changes** | Specific files, line numbers, function signatures |
| **Acceptance Criteria** | Bullet list of "done" conditions |
| **Open Questions** | Decisions for the team |
| **Explicit Opinions** | Design decisions with rationale |
| **Patches** | Ordered list with classification, files, and changes |
| **Test Map** | Tracks stub → implementation relationships |
| **Dependency Graph** | Patch dependencies in tooling-compatible format |
| **Mergability Checklist** | Quality gate before finalizing |

## Patch Classification

Each patch heading includes a classification marker:

- `[INFRA]` — No observable behavior change. Types, schemas, helpers, test stubs, feature flag additions. Safe to merge anytime.
- `[GATED]` — New behavior behind a feature flag. Observable behavior unchanged until flag is enabled.
- `[BEHAVIOR]` — Changes observable behavior. Requires careful review. Should be as small as possible.

**Format**: `### Patch N [CLASSIFICATION]: Description`

**Goal**: Maximize `[INFRA]` and `[GATED]` patches. Minimize `[BEHAVIOR]` patches.

## Mergability Strategy

### Feature Flagging

If the gameplan introduces new behavior that should be gated:

**Environment Variable Flags** (global on/off):
- Pattern: `const isEnabled = process.env.ENABLE_FEATURE === 'true'`
- No database access required, available at module load time

Document the flag: name, which patch introduces it, which patch activates it.

### Patch Ordering

Order patches to ship non-functional changes early:

- **Early** (`[INFRA]`): Types, schemas, helpers, test stubs, migrations
- **Middle** (`[GATED]`): Business logic behind flags, new gated endpoints
- **Late** (`[BEHAVIOR]`): Wire up UI/API, enable flags, remove old code

## Test-First Pattern

Write test stubs with `.skip` markers BEFORE implementation:

**Stub patches** (`[INFRA]`):
- Add tests with `.skip` marker and `// PENDING: Patch N` comment
- Document setup and expectations in comments

**Implementation patches** (`[GATED]` or `[BEHAVIOR]`):
- Remove `.skip` and `// PENDING` comment
- Implement the test body
- Must be in the SAME patch as the code being tested

See `references/gameplan-format.md` for full stub/implementation examples.

## Test Map

Track stub → implementation relationships:

```
| Test Name | File | Stub Patch | Impl Patch |
|-----------|------|------------|------------|
| describe > should do X | src/foo.test.ts | 2 | 4 |
```

- **Test Name**: Full describe/it path
- **Stub Patch**: The `[INFRA]` patch introducing the `.skip` test
- **Impl Patch**: The patch implementing the code AND unskipping the test

Reference the map in patch descriptions:
- Stub patches: "Introduces test stubs: [list from map where Stub Patch = N]"
- Impl patches: "Unskips and implements: [list from map where Impl Patch = N]"

## Dependency Graph

Express patch dependencies in this exact format (including classification):

```
- Patch 1 [INFRA] -> []
- Patch 2 [INFRA] -> [1]
- Patch 3 [GATED] -> [1]
- Patch 4 [BEHAVIOR] -> [2, 3]
```

Where `[]` means no dependencies, and `[1, 2]` means depends on patches 1 and 2. This format enables automated tooling to fan out parallel patch execution.

Include a mergability insight: "X of Y patches are `[INFRA]`/`[GATED]` and can ship without changing observable behavior."

## Mergability Checklist

Before finalizing, verify:

- [ ] Feature flag strategy documented (or explained why not needed)
- [ ] Early patches contain only non-functional changes (`[INFRA]`)
- [ ] Test stubs with `.skip` markers are in early `[INFRA]` patches
- [ ] Test implementations are co-located with the code they test (same patch)
- [ ] Test Map is complete: every test has Stub Patch and Impl Patch assigned
- [ ] Test Map Impl Patch matches the patch that implements the tested code
- [ ] `[BEHAVIOR]` patches are as small as possible
- [ ] Dependency graph shows `[INFRA]` patches early, `[BEHAVIOR]` patches late
- [ ] Each `[BEHAVIOR]` patch is clearly justified (cannot be gated or deferred)

## Required Changes Format

Be specific. Cite files with approximate line numbers and name functions. For new/modified function signatures, use TypeScript codeblocks:

```ts
const someFunction = (args: { first: Subscription.Record, second: Date }): Promise<Subscription.Item | null>
```

## Recording in Notion

When the gameplan is approved, create an entry in the **Gameplans** database:

| Field | Value |
|-------|-------|
| **Gameplan** | The project name |
| **Status** | "Ready to Execute" |
| **Workstream** | Link to workstream (if applicable) |
| **Markdown** | Attach the gameplan markdown file |

Use `/notion-find Gameplans` or the Notion MCP tools to locate the database.

## Guidelines

- **Be explicit** — easy to execute patch-by-patch by a coding agent with no context window
- **Include function signatures** for new/modified functions
- **Keep it concise** — 10x easier to review than the resulting code
- **Workstream alignment** — if part of a workstream, acceptance criteria must align with milestone's "Definition of Done"

## References

For the full output template, test examples, and a complete real-world gameplan, read `references/gameplan-format.md`.
