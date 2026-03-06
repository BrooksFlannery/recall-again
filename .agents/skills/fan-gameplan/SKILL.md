# Fan Gameplan

Take an approved gameplan and extract individual patch prompts for parallel execution by coding agents.

**Directory structure (required):** Patch files must be created at:
```
llm-prompts/patches/{project-name}/patch-{N}.md
```
This structure is required for compatibility with `scripts/fan-patches.sh`, which spins up parallel Claude Code sessions in git worktrees.

## Input Sources

The gameplan can come from:
1. **Pasted directly** in the conversation
2. **Notion URL** (e.g., `https://www.notion.so/...`)
3. **GP- prefix** (e.g., `GP-42`) — refers to a Gameplans database entry

## Retrieving from Notion

**IMPORTANT:** If the user provides a Notion URL or `GP-` reference, you MUST use the Notion MCP tools. Never use `WebFetch` or `curl` for Notion URLs.

**Step 1: Verify authentication**
Run a simple Notion query (e.g., `/notion-find Gameplans`) to verify you're authenticated. If it fails:
> "I need to access Notion to retrieve the gameplan, but I'm not authenticated. Please ensure the Notion MCP server is configured and authenticated, then try again."

**Step 2: Retrieve the gameplan**
- **Notion URL**: Use `/notion-find` or `/notion-search` to locate and retrieve the page contents
- **GP- prefix**: Search the Gameplans database for entries matching the GP identifier

## Process

### 1. Extract Project Name
Find the **Project Name** from the gameplan (e.g., `subscription-adjustments`).

### 2. Detect Merged Patches
```bash
gh pr list --state merged --search "[{project-name}]" --json number,title
```
Parse results for PRs matching `[{project-name}] Patch {N}: ...`. Extract patch numbers → `Merged: [1, 2, ...]`

### 3. Detect Open PRs
```bash
gh pr list --state open --search "[{project-name}]" --json number,title,headRefName
```
Build map: patch number → `{ prNumber, headRefName }`

### 4. Find Unblocked Patches
Parse the dependency graph. A patch is **unblocked** if:
- All dependencies are either merged OR have an open PR
- The patch itself is NOT merged and does NOT have an open PR

### 5. Determine Base Branch Per Patch
For each unblocked patch, check its dependency chain for open PRs:
- **0 open PRs in chain** → base: `main`
- **1 open PR in chain** → base: that PR's `headRefName`
- **2+ open PRs in chain** → **blocked** (skip, report why)

### 6. Create Patch Files
For each unblocked patch that passed step 5, create `llm-prompts/patches/{project-name}/patch-{N}.md`.

See `references/patch-template.md` for the full template. Key sections:

- **Problem Statement** + **Solution Summary** + **Design Decisions** — verbatim from gameplan
- **Dependencies Completed** — one line per dependency summarizing what it added
- **Your Task** — patch instructions verbatim from gameplan
- **Test Stubs to Add** — from Test Map where Stub Patch = N
- **Tests to Unskip and Implement** — from Test Map where Impl Patch = N
- **Git Instructions** — branch from, branch name, PR base (determined in step 5)
- **PR Title** — `[{project-name}] Patch {N}: {Title}` (CRITICAL: exact format required for tracking)

### 7. Output Summary
Print: "Created prompts for patches: [X, Y, Z]"

## Parallel Execution

After creating patch files, use `./skills/fan-gameplan/scripts/fan-patches.sh` to spin up parallel sessions:

```bash
./skills/fan-gameplan/scripts/fan-patches.sh <project-name>
```

This script:
1. Creates a git worktree per patch (siblings to the repo, not inside it)
2. Creates branches from the determined base branches
3. Copies patch files as `AGENT_PROMPT.md` into each worktree
4. Launches a tmux session with one window per patch
5. Starts `claude --dangerously-skip-permissions 'AGENT_PROMPT.md'` in each window

**Navigation**: `Ctrl-b n` (next), `Ctrl-b p` (prev), `Ctrl-b w` (list all windows)

## Dependency Graph Format

The gameplan's dependency graph must follow this format:
```
- Patch 1 [INFRA] -> []
- Patch 2 [INFRA] -> [1]
- Patch 3 [GATED] -> [1]
- Patch 4 [BEHAVIOR] -> [2, 3]
```
Where `[]` means no dependencies, and `[1, 2]` means depends on patches 1 and 2.

## References

For the full patch file template and a detailed walkthrough example, read `references/patch-template.md`.
