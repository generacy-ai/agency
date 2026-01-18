# Tasks: Plugin: @generacy-ai/agency-plugin-git

**Input**: Design documents from `/specs/014-plugin-generacy-ai-agency/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md
**Status**: Complete

## Format: `[ID] [P?] [Story] Description`
- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1=commit, US2=conflicts, US3=force push)

## Phase 1: Foundation

- [X] T001 Create `packages/agency-plugin-git/package.json` with peer deps on `@generacy-ai/agency`
- [X] T002 [P] Create `packages/agency-plugin-git/tsconfig.json` extending root config
- [X] T003 [P] Create `packages/agency-plugin-git/src/index.ts` plugin entry point with manifest
- [X] T004 Create `packages/agency-plugin-git/src/plugin.ts` GitPlugin class implementing AgencyPlugin interface
- [X] T005 Create `packages/agency-plugin-git/src/config.ts` with GitPluginConfig schema and defaults (defaultRemote, signCommits, allowForcePush)
- [X] T006 Create `packages/agency-plugin-git/src/types.ts` with BaseToolParams, all tool param interfaces, result interfaces

## Phase 2: Error Handling & Git Execution

- [X] T007 Create `packages/agency-plugin-git/src/errors/git-error.ts` base GitError class with command, exitCode, stderr, cwd fields
- [X] T008 [P] Create `packages/agency-plugin-git/src/errors/auth-error.ts` AuthError extending GitError
- [X] T009 [P] Create `packages/agency-plugin-git/src/errors/network-error.ts` NetworkError extending GitError with remote field
- [X] T010 [P] Create `packages/agency-plugin-git/src/errors/conflict-error.ts` ConflictError extending GitError with ConflictInfo array
- [X] T011 [P] Create `packages/agency-plugin-git/src/errors/detached-head-error.ts` DetachedHeadError extending GitError with headCommit field
- [X] T012 Create `packages/agency-plugin-git/src/errors/index.ts` exporting all error types
- [X] T013 Create `packages/agency-plugin-git/src/utils/exec-git.ts` with execGit() using child_process.spawn, error classification logic
- [X] T014 [US1] Create `packages/agency-plugin-git/tests/exec-git.test.ts` testing exit code classification, timeout handling

## Phase 3: Parsers

- [X] T015 Create `packages/agency-plugin-git/src/utils/parse-status.ts` parsing `git status --porcelain=v2` into StatusResult
- [X] T016 [P] Create `packages/agency-plugin-git/src/utils/parse-diff.ts` parsing `git diff --numstat` into DiffResult
- [X] T017 [P] Create `packages/agency-plugin-git/src/utils/parse-log.ts` parsing formatted log output into LogResult
- [X] T018 [P] Create `packages/agency-plugin-git/src/utils/parse-blame.ts` parsing `git blame --porcelain` into BlameResult
- [X] T019 [P] [US2] Create `packages/agency-plugin-git/src/utils/conflict-parser.ts` parsing conflict markers (<<<, ===, >>>) from files into ConflictInfo
- [X] T020 Create `packages/agency-plugin-git/tests/parse-status.test.ts` testing staged, unstaged, untracked, conflict parsing
- [X] T021 [P] Create `packages/agency-plugin-git/tests/conflict-parser.test.ts` testing all conflict types (content, add-add, delete-modify, rename)

## Phase 4: Read-Only Tools

- [X] T022 Create `packages/agency-plugin-git/tests/utils/mock-git.ts` helper for creating temp git repos with commits, branches, conflicts
- [X] T023 Create `packages/agency-plugin-git/src/tools/status.ts` source_control.status tool using parseStatus, modes: research/coding/review
- [X] T024 [P] Create `packages/agency-plugin-git/src/tools/diff.ts` source_control.diff tool with staged/format options, modes: research/coding/review
- [X] T025 [P] Create `packages/agency-plugin-git/src/tools/log.ts` source_control.log tool with limit/ref/author filters, modes: research/coding/review
- [X] T026 [P] Create `packages/agency-plugin-git/src/tools/blame.ts` source_control.blame tool with line range support, modes: research/coding/review
- [X] T027 Create `packages/agency-plugin-git/tests/tools/status.test.ts` integration tests with mock git repo
- [ ] T028 [P] Create `packages/agency-plugin-git/tests/tools/diff.test.ts` testing all format options [manual]
- [ ] T029 [P] Create `packages/agency-plugin-git/tests/tools/log.test.ts` testing filters and pagination [manual]
- [ ] T030 [P] Create `packages/agency-plugin-git/tests/tools/blame.test.ts` testing line ranges [manual]

## Phase 5: Write Tools

- [X] T031 [US1] Create `packages/agency-plugin-git/src/tools/commit.ts` source_control.commit tool with message/files/amend params, returning CommitResult
- [X] T032 [P] Create `packages/agency-plugin-git/src/tools/checkout.ts` source_control.checkout tool with ref/create/force/files params
- [X] T033 [P] Create `packages/agency-plugin-git/src/tools/branch.ts` source_control.branch tool with list/create/delete/rename actions
- [X] T034 [P] Create `packages/agency-plugin-git/src/tools/stash.ts` source_control.stash tool with push/pop/apply/drop/list/show actions
- [X] T035 [US1] Create `packages/agency-plugin-git/tests/tools/commit.test.ts` testing partial staging, amend, error handling
- [ ] T036 [P] Create `packages/agency-plugin-git/tests/tools/checkout.test.ts` testing branch switch, file restore, detached HEAD [manual]
- [ ] T037 [P] Create `packages/agency-plugin-git/tests/tools/branch.test.ts` testing all branch actions [manual]
- [ ] T038 [P] Create `packages/agency-plugin-git/tests/tools/stash.test.ts` testing stash operations [manual]

## Phase 6: Remote Operations

- [X] T039 [US3] Create `packages/agency-plugin-git/src/tools/push.ts` source_control.push tool with force escalation via Humancy
- [X] T040 [P] Create `packages/agency-plugin-git/src/tools/pull.ts` source_control.pull tool with rebase/autostash options
- [ ] T041 [US3] Create `packages/agency-plugin-git/tests/tools/push.test.ts` testing force push blocking and escalation flow [manual]
- [ ] T042 [P] Create `packages/agency-plugin-git/tests/tools/pull.test.ts` testing merge/rebase modes, conflict handling [manual]

## Phase 7: Merge/Rebase Tools

- [X] T043 [US2] Create `packages/agency-plugin-git/src/tools/merge.ts` source_control.merge tool with conflict detection, returning ConflictInfo on failure
- [X] T044 [P] [US2] Create `packages/agency-plugin-git/src/tools/rebase.ts` source_control.rebase tool with abort/continue/skip actions, conflict handling
- [ ] T045 [US2] Create `packages/agency-plugin-git/tests/tools/merge.test.ts` testing clean merge, conflict scenarios, strategy options [manual]
- [ ] T046 [P] [US2] Create `packages/agency-plugin-git/tests/tools/rebase.test.ts` testing rebase flow, conflict resolution, abort/continue [manual]

## Phase 8: Integration & Polish

- [X] T047 Create `packages/agency-plugin-git/src/tools/index.ts` exporting all tools and createTools factory function
- [X] T048 Update `packages/agency-plugin-git/src/plugin.ts` to register all 12 tools with correct mode affiliations
- [X] T049 Create `packages/agency-plugin-git/tests/plugin.test.ts` testing plugin lifecycle (initialize, shutdown, tool registration)
- [X] T050 Ensure all tools follow TerseOutput pattern (TerseOutput.success, TerseOutput.failure, TerseOutput.fromExec)
- [X] T051 Add plugin to `pnpm-workspace.yaml` and verify build with `pnpm build`
- [X] T052 Run `pnpm test` and verify 80%+ coverage across all tool files

## Dependencies & Execution Order

### Phase Dependencies (Sequential)
- **Phase 1 → Phase 2**: Error types needed before exec-git can classify errors
- **Phase 2 → Phase 3**: exec-git needed for parsers to process git output
- **Phase 3 → Phase 4**: Parsers needed for read-only tools
- **Phase 4 → Phase 5**: Mock git utilities needed for write tool tests
- **Phase 5 → Phase 6**: Write tools (commit) needed before push tests
- **Phase 6 → Phase 7**: Pull needed to create merge scenarios
- **Phase 7 → Phase 8**: All tools needed for integration tests

### Parallel Opportunities Within Phases
- **Phase 1**: T002, T003 can run in parallel after T001
- **Phase 2**: T008-T011 (all error classes) can run in parallel
- **Phase 3**: T016-T019 (parsers), T020-T021 (tests) can run in parallel
- **Phase 4**: T024-T026 (tools), T028-T030 (tests) can run in parallel after T022-T023
- **Phase 5**: T032-T034 (tools), T036-T038 (tests) can run in parallel
- **Phase 6**: T039-T040, T041-T042 can run in parallel
- **Phase 7**: T043-T044, T045-T046 can run in parallel

### Key Dependencies
- T007 → T008-T011 (GitError base → specific errors)
- T013 → all tools (exec-git used by all)
- T015-T019 → T023-T026 (parsers → tools that use them)
- T022 → T027-T030, T035-T046 (mock-git → all integration tests)
- T047 → T048 (tool exports → plugin registration)
