# Tasks: Integrate Label Protocol for Clarification and Phase Management

**Input**: Design documents from `/specs/226-update-spec-kit-agency/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md
**Status**: Complete

## Format: `[ID] [P?] [Story] Description`
- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to

## Scope Note

Per clarification Q1, spec-kit only owns **clarification comments** (US1). Stage comments (US2) and label management (US3) remain in the autodev orchestrator. Tasks below cover US1 and related FR-001 through FR-004, FR-009, FR-010 only.

## Phase 1: IssueTracker Facet Extension

- [ ] T001 [US1] Add `listComments(issueId: string): Promise<Comment[]>` method to IssueTracker facet interface in `/workspaces/latency/packages/latency/src/facets/issue-tracker.ts`
- [ ] T002 [US1] Implement `listComments` in the GitHub IssueTracker provider — find the provider implementation in the latency repo and add `gh api` or Octokit-based comment listing

## Phase 2: Types & Utilities

- [ ] T003 [P] [US1] Add GitHub comment output types to `/workspaces/agency/packages/agency-plugin-spec-kit/src/types/clarification.ts` — add `GitHubCommentResult`, `ParsedAnswer` interfaces per data-model.md, extend `ReadClarificationsOutput` and `AppendClarificationsOutput` with optional GitHub fields
- [ ] T004 [P] [US1] Create `/workspaces/agency/packages/agency-plugin-spec-kit/src/utils/issue-comment.ts` with: `buildClarificationMarker(batchNumber)`, `parseClarificationMarker(marker)`, `formatClarificationComment(batch, questions)` (renders the full markdown comment body with marker, questions, answer instructions), `parseAnswersFromComments(comments, questionNumbers)` (regex-based `Q<N>:` answer extraction from Comment[] array)

## Phase 3: Core Tool Extension

- [ ] T005 [US1] Add `issue_number` optional parameter to `ManageClarificationsParams` interface and the tool's `inputSchema` in `/workspaces/agency/packages/agency-plugin-spec-kit/src/tools/manage-clarifications.ts`
- [ ] T006 [US1] Add IssueTracker facet resolution to `createManageClarificationsTool` — extend `ExtendedCoreAPI` with `getFacet?(name: string)`, resolve at execution time with graceful fallback, pass to operation handlers
- [ ] T007 [US1] Extend `handleAppendOperation` — when `issue_number` is provided, format the batch as a GitHub comment using `formatClarificationComment`, post via `IssueTracker.addComment(issueId, body)`, include `GitHubCommentResult` in output
- [ ] T008 [US1] Extend `handleReadOperation` — when `issue_number` is provided, call `IssueTracker.listComments(issueId)`, find clarification batch comments by marker, parse answers from subsequent comments using `parseAnswersFromComments`, merge with file-based data, optionally update clarifications.md with discovered answers

## Phase 4: Manifest & Dependency Cleanup

- [ ] T009 [US1] Change Humancy from hard dependency to optional in `/workspaces/agency/packages/agency-plugin-spec-kit/src/manifest.ts` — update `dependencies` array or add `optional: true` flag per plugin manifest schema
- [ ] T010 [P] [US1] Verify IssueTracker facet is properly declared in manifest `requires` array (already present — confirm no changes needed)

## Phase 5: Tests

- [ ] T011 [P] [US1] Unit tests for `issue-comment.ts` — test `buildClarificationMarker`, `parseClarificationMarker`, `formatClarificationComment` (verify marker, heading, questions, answer instructions), `parseAnswersFromComments` (single answer, multi-answer, multi-line, bold formatting, missing answers, option references)
- [ ] T012 [P] [US1] Unit tests for extended `manage-clarifications.ts` — test append with `issue_number` (mock IssueTracker, verify comment posted), test read with `issue_number` (mock IssueTracker returning comments with answers, verify merging), test fallback when IssueTracker unavailable (file-only mode), test backward compatibility (no `issue_number` = existing behavior)
- [ ] T013 [US1] Build verification — run `pnpm build` in the agency-plugin-spec-kit package to confirm TypeScript compilation succeeds with all changes

## Dependencies & Execution Order

```
T001 → T002 (facet interface before implementation)
T003, T004 can run in parallel (separate files, no deps)
T005 → T006 → T007, T008 (schema before resolution before operations)
T007 depends on T004 (uses formatClarificationComment)
T008 depends on T004 (uses parseAnswersFromComments)
T008 depends on T001+T002 (uses listComments from facet)
T009, T010 can run in parallel, independent of T005-T008
T011 depends on T004 (tests the utilities)
T012 depends on T005-T008 (tests the extended tool)
T013 depends on all prior tasks
```

**Critical path**: T001 → T002 → T004 → T005 → T006 → T007/T008 → T012 → T013

**Parallel opportunities**:
- T003 + T004 (Phase 2)
- T009 + T010 (Phase 4)
- T011 + T012 (Phase 5, after their respective deps)
