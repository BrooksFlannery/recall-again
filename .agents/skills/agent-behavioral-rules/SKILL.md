---
name: agent-behavioral-rules
description: Behavioral rules for AI agents in this codebase. Always apply when editing or generating code - file editing, read before write, ask when uncertain, follow patterns, verify changes.
---

# Agent Behavioral Rules

1. **File Editing:** NEVER use shell commands (heredocs, `cat >`, etc.) to edit files. ALWAYS use proper file editing tools.
2. **Read Before Write:** ALWAYS read files before editing (unless creating new).
3. **Ask When Uncertain:** ALWAYS ask for clarification on ambiguous requirements.
4. **Follow Patterns:** ALWAYS review existing patterns before adding similar functionality.
5. **Verify Changes:** ALWAYS ensure code compiles and passes linting after edits.
