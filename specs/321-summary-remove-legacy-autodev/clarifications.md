# Clarifications

## Batch 1 — 2026-03-13

### Q1: Command markdown file scope
**Context**: The acceptance criteria states "No `autodev` references remain in source code (excluding historical spec markdown)." However, the tasks only list 2 changes (plugin.ts JSDoc + delete autodev.json). There are 22 `autodev` references across command `.md` files in `packages/claude-plugin-agency-spec-kit/commands/` and `packages/agency-plugin-spec-kit/commands/` (e.g., `/autodev:start`, `/autodev:continue`, "autodev workflow"). These are active command definitions, not historical specs. No actual `/autodev:start` or `/autodev:continue` commands exist in the codebase — they appear to be stale references.
**Question**: Should these command markdown files be updated to remove/replace `autodev` references as part of this issue? If so, what should `/autodev:start` and `/autodev:continue` be renamed to (e.g., `/speckit:start`, `/speckit:continue`)?
**Options**:
- A: Yes, update command markdown files — rename to `/speckit:start` and `/speckit:continue`
- B: Yes, update command markdown files — remove the autodev workflow references entirely (these commands don't exist)
- C: No, leave command markdown files as-is — they'll be addressed in a separate issue

**Answer**: *Pending*
