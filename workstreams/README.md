# Workstreams

This folder holds **workstream** definitions: high-level roadmaps for multi-milestone projects. Each workstream is a single document that describes vision, current state, milestones (gameplans), dependencies, and open questions.

## Contents

| Document | Description |
|----------|-------------|
| [recall-facts-quizzes.md](./recall-facts-quizzes.md) | Facts CRUD + RLS, AI question generation, and spaced-repetition quizzes (Fibonacci schedule, daily cron) |

## Format

Each workstream follows the structure from `.agents/skills/create-workstream/`:

- **Vision** — End state and why it matters
- **Current State** — Where the codebase is today
- **Key Challenges** — Hard parts and unknowns
- **Milestones** — Ordered gameplans with Definition of Done, safe pause points, and unlocks
- **Dependency Graph** — Which milestones depend on which (for tooling or planning)
- **Open Questions** — Unresolved decisions
- **Decisions Made** — Recorded choices and rationale

Milestones are intended to be **safe pause points**: after any milestone, the app remains in a consistent, shippable state.

## Using a workstream

1. Read the workstream doc to understand scope and order.
2. Execute milestones as gameplans (one at a time, in dependency order).
3. Update the doc when you resolve open questions or make new decisions.
4. When creating gameplans in external tools (e.g. Notion), link them to this workstream by name.
