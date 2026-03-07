# Tasks: Distribute Speckit Commands via npm

**Input**: Design documents from `/specs/314-summary-generacy-ai-agency/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md
**Status**: Complete

## Format: `[ID] [P?] [Story] Description`
- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to

## Phase 1: Setup & File Migration

- [X] T001 [US1] Move command `.md` files from `packages/claude-plugin-agency-spec-kit/commands/` to `packages/agency-plugin-spec-kit/commands/` (all 9 files: analyze.md, checklist.md, clarify.md, constitution.md, implement.md, plan.md, specify.md, tasks.md, taskstoissues.md)
- [X] T002 [US1] Update `packages/agency-plugin-spec-kit/package.json`: add `"commands"` to `files` array, add `bin` entry for `agency-spec-kit` CLI, add `./commands` subpath export

## Phase 2: Core Implementation

- [X] T003 [P] [US1] Create `packages/agency-plugin-spec-kit/src/commands.ts`: export `commandsDir` (resolved via `import.meta.url`) and `installCommands(targetDir?)` function that copies `.md` files to target directory (defaults to `~/.claude/commands/agency-spec-kit/`)
- [X] T004 [P] [US1] Create `packages/agency-plugin-spec-kit/src/cli.ts`: CLI entry point with `install-commands` subcommand that calls `installCommands()` and reports copied files; add `#!/usr/bin/env node` shebang

## Phase 3: Integration

- [X] T005 [US1] Update `packages/agency-plugin-spec-kit/src/index.ts`: re-export `commandsDir` and `installCommands` from `./commands.js`

## Phase 4: Tests & Verification

- [X] T006 [US1] Create `packages/agency-plugin-spec-kit/tests/commands.test.ts`: test `commandsDir` resolves to existing directory with `.md` files, test `installCommands()` copies to temp dir, test overwrites existing files
- [X] T007 [US1] Build and verify: run `pnpm build` and `pnpm test` in `packages/agency-plugin-spec-kit/`, verify `dist/cli.js` and `dist/commands.js` are generated

## Phase 5: Cleanup

- [X] T008 Remove or deprecate `packages/claude-plugin-agency-spec-kit/commands/` directory (leave README noting deprecation or remove files)

## Dependencies & Execution Order

- **T001** must complete before T003/T004 (files must exist in target location)
- **T002** must complete before T005 (package.json exports must be configured)
- **T003 and T004** can run in parallel (independent modules)
- **T005** depends on T003 (re-exports from commands.ts)
- **T006** depends on T003 and T005 (tests import from the modules)
- **T007** depends on all implementation tasks (T001–T006)
- **T008** can run after T007 confirms everything works

```
T001 ──┬──→ T003 ──┐
       │           ├──→ T005 ──→ T006 ──→ T007 ──→ T008
T002 ──┴──→ T004 ──┘
```
