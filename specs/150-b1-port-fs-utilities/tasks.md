# Tasks: Port fs utilities from speckit

**Input**: Design documents from `/specs/150-b1-port-fs-utilities/`
**Prerequisites**: plan.md (required), spec.md (required), research.md (available)
**Status**: Complete

## Format: `[ID] [P?] [Story] Description`
- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to

## Phase 1: Error Classes

- [X] T001 [US2] Create custom error classes in `packages/agency-plugin-spec-kit/src/utils/fs.ts`
  - `FileNotFoundError` with `path` property and `cause` support
  - `PermissionError` with `path` property and `cause` support
  - `RepoNotFoundError` with `path` property and `cause` support
  - Set `name` property explicitly in each class

## Phase 2: Core Functions

- [X] T002 [P] [US2] Implement `exists(path)` in `packages/agency-plugin-spec-kit/src/utils/fs.ts`
  - Use `fs.access()` for efficient existence check
  - Return `true` if path exists, `false` otherwise

- [X] T003 [P] [US2] Implement `isDirectory(path)` in `packages/agency-plugin-spec-kit/src/utils/fs.ts`
  - Use `fs.stat()` to check if path is a directory
  - Return `false` if path doesn't exist (don't throw)

- [X] T004 [P] [US2] Implement `isFile(path)` in `packages/agency-plugin-spec-kit/src/utils/fs.ts`
  - Use `fs.stat()` to check if path is a regular file
  - Return `false` if path doesn't exist (don't throw)

- [X] T005 [P] [US2] Implement `readFile(path)` in `packages/agency-plugin-spec-kit/src/utils/fs.ts`
  - Read file as UTF-8 string
  - Throw `FileNotFoundError` if file doesn't exist (ENOENT)
  - Throw `PermissionError` if access denied (EACCES)

- [X] T006 [P] [US2] Implement `writeFile(path, content)` in `packages/agency-plugin-spec-kit/src/utils/fs.ts`
  - Write string content to file
  - Create parent directories if needed
  - Throw `PermissionError` if access denied (EACCES)

- [X] T007 [P] [US2] Implement `mkdir(path, recursive?)` in `packages/agency-plugin-spec-kit/src/utils/fs.ts`
  - Default `recursive` to `true`
  - Use `fs.mkdir()` with recursive option
  - Throw `PermissionError` if access denied

- [X] T008 [P] [US2] Implement `readDir(path)` in `packages/agency-plugin-spec-kit/src/utils/fs.ts`
  - List directory contents
  - Throw `FileNotFoundError` if directory doesn't exist
  - Throw `PermissionError` if access denied

## Phase 3: Repository Root Detection

- [X] T009 [US1] Implement `findRepoRoot(startPath?)` in `packages/agency-plugin-spec-kit/src/utils/fs.ts`
  - Start from `startPath` or `process.cwd()`
  - Traverse up directories looking for `.git/` directory
  - Throw `RepoNotFoundError` when reaching filesystem root without finding `.git/`

## Phase 4: Integration

- [X] T010 Update `packages/agency-plugin-spec-kit/src/utils/index.ts` to export fs utilities
  - Export all functions: `exists`, `isDirectory`, `isFile`, `readFile`, `writeFile`, `mkdir`, `readDir`, `findRepoRoot`
  - Export all error classes: `FileNotFoundError`, `PermissionError`, `RepoNotFoundError`

- [X] T011 Verify TypeScript compilation with `pnpm build`
  - Ensure no type errors
  - Verify exports are accessible

## Dependencies & Execution Order

**Sequential dependencies**:
- T001 (error classes) must complete before T002-T009 (functions use error classes)
- T002-T009 can run in parallel after T001
- T009 depends on T003 (uses `isDirectory` internally to check for `.git/`)
- T010-T011 must wait for all functions to be implemented

**Parallel opportunities**:
- T002, T003, T004, T005, T006, T007, T008 can all run in parallel (marked with [P])
- These functions are independent of each other within Phase 2
