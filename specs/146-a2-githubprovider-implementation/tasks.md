# Tasks: A2: GitHubProvider Implementation (gh CLI)

**Input**: Design documents from `/specs/146-a2-githubprovider-implementation/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md
**Status**: Complete

## Format: `[ID] [P?] [Story] Description`
- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story/acceptance criterion this task addresses

## Phase 1: Setup & Error Types

- [X] T001 [AC7] Create `packages/agency-plugin-spec-kit/src/providers/github-cli.ts` with file structure and imports
- [X] T002 [P] [AC7] Define `GitHubCliError`, `GitHubCliAuthError`, `GitHubCliNotFoundError` error classes in github-cli.ts
- [X] T003 [P] [AC7] Define internal interfaces `RepoContext`, `GhExecOptions`, `GitHubIssueJson`, `GitHubRepoJson`

## Phase 2: Core Infrastructure

- [X] T004 [AC3] Implement `ghExec()` helper function for safe CLI execution with `execFileSync`
- [X] T005 [AC6] Implement `withRetry<T>()` helper for exponential backoff (transient errors)
- [X] T006 [AC1] Create `GitHubCliProvider` class skeleton implementing `BacklogProvider` interface
- [X] T007 [AC3] Implement `ensureRepoContext()` method for auto-detecting repository via `gh repo view`

## Phase 3: Core CRUD Operations

- [X] T008 [AC2][AC5] Implement `parseRef()` method - parse #123, 123, owner/repo#123, and full URL formats
- [X] T009 [AC2] Implement `getTicketUrl()` method - generate full GitHub URL from ref
- [X] T010 [AC4] Implement `checkAuth()` method using `gh auth status`
- [X] T011 [AC2] Implement `getTicket()` method using `gh issue view --json`
- [X] T012 [AC2] Implement `createTicket()` method using `gh issue create`
- [X] T013 [AC2] Implement `updateTicket()` method using `gh issue edit`

## Phase 4: Label Operations

- [X] T014 [AC7] Implement `getLabels()` method using `gh issue view --json labels`
- [X] T015 [AC7] Implement `setLabels()` method using `gh issue edit --add-label/--remove-label`

## Phase 5: Search (Optional)

- [X] T016 [P] [AC2] Implement `searchTickets()` method using `gh search issues`

## Phase 6: Registration & Export

- [X] T017 [AC1] Register `GitHubCliProvider` in `registry.ts` with factory function
- [X] T018 [P] [AC1] Export `GitHubCliProvider` from `packages/agency-plugin-spec-kit/src/providers/index.ts`

## Phase 7: Testing

- [X] T019 [AC2] Create `tests/providers/github-cli.test.ts` with test setup and mocks
- [X] T020 [P] [AC5] Add tests for `parseRef()` - all supported formats
- [X] T021 [P] [AC4] Add tests for `checkAuth()` - success and failure cases
- [X] T022 [AC2] Add tests for `getTicket()` - success, not found, auth error
- [X] T023 [AC2] Add tests for `createTicket()` - success and error handling
- [X] T024 [AC2] Add tests for `updateTicket()` - partial updates and errors
- [X] T025 [AC7] Add tests for `setLabels()` and `getLabels()` - add/remove label scenarios
- [X] T026 [AC6] Add tests for retry logic - transient error recovery

## Dependencies & Execution Order

**Phase 1 → Phase 2**: Error types needed before core infrastructure
**Phase 2 → Phase 3-5**: Infrastructure (`ghExec`, `withRetry`, `ensureRepoContext`) needed before CRUD operations
**Phase 3-5 → Phase 6**: All methods implemented before registration
**Phase 6 → Phase 7**: Provider registered before comprehensive testing

**Parallel Opportunities**:
- T002 and T003 can run in parallel (both define types/interfaces)
- T008 and T009 can run in parallel if T007 is complete (both URL-related, no shared state)
- T014 and T015 can run sequentially but T016 can run in parallel with them
- T017 and T018 can run in parallel (different files)
- T020, T021 can run in parallel after T019 creates test file
- T022-T026 should run sequentially (build on prior test infrastructure)

**Acceptance Criteria Mapping**:
- AC1: `src/providers/github.ts` → Using `github-cli.ts` per plan
- AC2: Implement all BacklogProvider interface methods
- AC3: Use `gh` CLI for all GitHub operations
- AC4: Support authentication check via `gh auth status`
- AC5: Parse GitHub URLs and issue numbers
- AC6: Handle rate limiting and errors gracefully
- AC7: Support label operations
