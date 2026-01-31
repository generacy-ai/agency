# Implementation Plan: C3: Implement copy_template tool

**Feature**: Implement the `spec_kit.copy_template` MCP tool
**Branch**: `157-c3-implement-copy-template`
**Status**: Complete

## Summary

Implement the `spec_kit.copy_template` MCP tool that copies template files from the `.specify/templates/` directory to feature directories. The tool supports copying multiple templates in a single call, custom destination filenames for single-template copies, automatic directory creation, and special handling for checklists (placed in `checklists/` subdirectory) and agent files (placed at repo root).

## Technical Context

**Language/Version**: TypeScript 5.x
**Primary Dependencies**: Node.js fs/promises, path
**Testing**: Vitest
**Target Platform**: Node.js (MCP server)
**Project Type**: Single package (pnpm workspace)
**Constraints**: Must integrate with existing spec-kit plugin architecture

## Constitution Check

No constitution file found at `.specify/memory/constitution.md`. Proceeding with standard implementation patterns from existing codebase.

## Project Structure

### Documentation (this feature)

```text
specs/157-c3-implement-copy-template/
├── spec.md              # Feature specification
├── plan.md              # This file
├── research.md          # Technology research
├── data-model.md        # Type definitions
└── quickstart.md        # Usage guide
```

### Source Code

```text
packages/agency-plugin-spec-kit/
├── src/
│   ├── tools/
│   │   ├── copy-template.ts    # NEW: Main tool implementation
│   │   └── index.ts            # MODIFY: Export new tool
│   ├── config.ts               # Existing config (paths.templates)
│   └── utils/
│       └── fs.ts               # Existing FS utilities
└── tests/
    └── tools/
        └── copy-template.test.ts  # NEW: Tool tests
```

## Template Mapping

| Template | Source File | Default Destination |
|----------|-------------|---------------------|
| spec | `spec-template.md` | `{feature_dir}/spec.md` |
| plan | `plan-template.md` | `{feature_dir}/plan.md` |
| tasks | `tasks-template.md` | `{feature_dir}/tasks.md` |
| checklist | `checklist-template.md` | `{feature_dir}/checklists/{dest_filename or checklist.md}` |
| agent-file | `agent-file-template.md` | `{repo_root}/CLAUDE.md` |

## Key Design Decisions

1. **Template Resolution**: Use `config.paths.templates` to locate template source files
2. **Feature Directory**: Either provided via `feature_dir` param or auto-detected via `get_paths` logic
3. **Checklist Subdirectory**: Checklists always go to `{feature_dir}/checklists/` subdirectory
4. **Agent File at Root**: Agent files are written to repo root, not feature directory
5. **Multiple Templates**: When copying multiple templates, `dest_filename` is not allowed
6. **Directory Creation**: Parent directories created automatically using `mkdir` utility

## Complexity Tracking

No constitution violations. Implementation follows existing tool patterns.
