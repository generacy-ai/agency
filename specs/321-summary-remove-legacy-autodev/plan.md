# Implementation Plan: Remove Legacy Autodev References

**Feature**: Remove legacy `autodev` references from the agency codebase
**Branch**: `321-summary-remove-legacy-autodev`
**Status**: Complete

## Summary

Clean up all legacy `autodev` references across the codebase. The `autodev` system has been fully superseded by `speckit`. This involves three categories of changes:

1. **Source code** — Update JSDoc example in `plugin.ts`
2. **Configuration** — Delete `.claude/autodev.json`
3. **Command definitions** — Remove stale `/autodev:start` and `/autodev:continue` references from 18 command markdown files across two plugin packages

## Technical Context

- **Language**: TypeScript (source), Markdown (command definitions)
- **Build system**: pnpm workspaces
- **Packages affected**:
  - `packages/agency-extension` (1 source file)
  - `packages/claude-plugin-agency-spec-kit` (9 command files + README)
  - `packages/agency-plugin-spec-kit` (9 command files)
- **Root config**: `.claude/autodev.json` (to delete)

## Project Structure

```
Changes by file:

packages/agency-extension/src/types/plugin.ts        # FR-001: Update JSDoc
.claude/autodev.json                                   # FR-002: Delete file

# Command markdown files — remove /autodev:* workflow references
packages/claude-plugin-agency-spec-kit/commands/
  ├── analyze.md
  ├── checklist.md
  ├── clarify.md
  ├── constitution.md
  ├── implement.md
  ├── plan.md
  ├── specify.md
  ├── tasks.md
  └── taskstoissues.md

packages/agency-plugin-spec-kit/commands/
  ├── analyze.md
  ├── checklist.md
  ├── clarify.md
  ├── constitution.md
  ├── implement.md
  ├── plan.md
  ├── specify.md
  ├── tasks.md
  └── taskstoissues.md

packages/claude-plugin-agency-spec-kit/README.md       # Documentation reference
```

## Implementation Approach

### Phase 1: Source Code & Config (FR-001, FR-002)

1. **Update `plugin.ts` line 10** — Change JSDoc from `'autodev', 'speckit'` to `'speckit'`
2. **Delete `.claude/autodev.json`** — Configuration is obsolete

### Phase 2: Command Markdown Cleanup

Each command `.md` file has a "Post-Command Check" section at the bottom containing stale references to `/autodev:start` and `/autodev:continue`. Since these commands don't exist, replace references with the actual current workflow commands (`/speckit:start`, `/speckit:continue`).

The pattern in most files is:
```markdown
If this command was invoked as part of a larger workflow (e.g., `/autodev:start` or `/autodev:continue`):
```

Replace with:
```markdown
If this command was invoked as part of a larger workflow (e.g., `/speckit:start` or `/speckit:continue`):
```

For `clarify.md` which has an additional "When running as part of an autodev workflow" reference, update to "speckit workflow".

### Phase 3: Documentation

Update the README.md reference in `packages/claude-plugin-agency-spec-kit/README.md` if it refers to autodev in active documentation context.

### Phase 4: Verification

1. Run `pnpm build` to confirm no regressions
2. Grep for remaining `autodev` references in non-spec source files
3. Confirm only `specs/` markdown files contain historical references

## Risk Assessment

- **Low risk**: All changes are string replacements in comments, documentation, and config deletion
- **No runtime impact**: No executable code references `autodev`
- **No migration needed**: `.generacy/` config files already exist

## Verification Criteria

| Check | Command |
|-------|---------|
| No source autodev refs | `grep -r "autodev" --include="*.ts" --include="*.md" packages/ \| grep -v specs/` should return 0 results |
| Build passes | `pnpm build` exits 0 |
| Config deleted | `.claude/autodev.json` does not exist |
