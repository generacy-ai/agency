# Tasks: D1: Implement get_ticket tool

**Input**: Design documents from `/specs/160-d1-implement-get-ticket/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md
**Status**: Complete

## Format: `[ID] [P?] [Story] Description`
- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which acceptance criteria this task addresses

## Phase 1: Core Infrastructure

- [ ] T001 Create reference auto-detection utility (`src/utils/detect-ticket-ref.ts`)
  - Implement `detectTicketRef(input: string, defaultProvider: BacklogProviderName): TicketRef | null`
  - Parse GitHub URLs: `https://github.com/owner/repo/issues/123`
  - Parse GitHub shorthand: `#123`, `owner/repo#123`
  - Parse Jira format: `PROJ-123`
  - Parse Shortcut format: `sc-123`
  - Return null for invalid input

- [ ] T002 [P] Create provider registry (`src/providers/registry.ts`)
  - Implement `ProviderRegistry` class with lazy provider instantiation
  - Add `getProvider(name?: BacklogProviderName): BacklogProvider` method
  - Add `detectProvider(ref: string): BacklogProviderName | null` method
  - Cache provider instances per type
  - Fall back to configured default provider

## Phase 2: GitHub Provider Implementation

- [ ] T003 Implement GitHub provider (`src/providers/github.ts`)
  - Create `GitHubProvider` class implementing `BacklogProvider` interface
  - Initialize Octokit with `GITHUB_TOKEN` from environment
  - Implement `getTicket(ref: string): Promise<Ticket>`
  - Implement `parseRef(input: string): TicketRef | null`
  - Implement `getTicketUrl(ref: string): string`
  - Implement `checkAuth(): Promise<AuthCheckResult>`
  - Map GitHub issue state to `TicketState` (open/closed/in_progress)
  - Extract owner/repo from git remote for local `#123` references

- [ ] T004 [P] Create stub providers for Jira, Shortcut, Local (`src/providers/jira.ts`, `src/providers/shortcut.ts`, `src/providers/local.ts`)
  - Implement minimal classes implementing `BacklogProvider`
  - Throw `NotFoundError` with helpful message for unimplemented providers
  - Include provider name and setup instructions in error messages

## Phase 3: Tool Integration

- [ ] T005 Create get_ticket tool (`src/tools/get-ticket.ts`)
  - Implement `createGetTicketTool(config: SpecKitConfig, getProvider: () => BacklogProvider): AgencyTool`
  - Define input schema with `ref` parameter
  - Call `detectTicketRef()` to parse input
  - Fetch ticket via provider
  - Return normalized JSON response
  - Let provider exceptions propagate (per clarification Q3)

- [ ] T006 Register tool in tools index (`src/tools/index.ts`)
  - Import `createGetTicketTool` from `get-ticket.ts`
  - Add to tool registration list
  - Export from module

- [ ] T007 [P] Update providers index exports (`src/providers/index.ts`)
  - Export `ProviderRegistry` class
  - Export `GitHubProvider` class
  - Export stub provider classes
  - Export `detectTicketRef` utility

## Phase 4: Testing

- [ ] T008 Add unit tests for detect-ticket-ref utility
  - Test GitHub URL parsing (various formats)
  - Test GitHub shorthand parsing (`#123`, `owner/repo#123`)
  - Test Jira format parsing (`PROJ-123`)
  - Test Shortcut format parsing (`sc-123`)
  - Test invalid input returns null
  - Test ambiguous input uses default provider

- [ ] T009 [P] Add unit tests for GitHub provider
  - Mock Octokit responses
  - Test `getTicket()` returns normalized Ticket
  - Test state mapping (open/closed/in_progress labels)
  - Test `parseRef()` for various input formats
  - Test error handling for 404 responses

- [ ] T010 [P] Add integration test for get_ticket tool
  - Test tool invocation via MCP protocol format
  - Test error response for invalid references
  - Verify JSON output structure matches Ticket interface

## Dependencies & Execution Order

**Phase 1** (Setup):
- T001 and T002 can run in parallel - no dependencies between them

**Phase 2** (Providers):
- T003 depends on T001 (uses detectTicketRef) and T002 (registry pattern)
- T004 can run in parallel with T003 - stub implementations only

**Phase 3** (Integration):
- T005 depends on T001, T002, T003 - needs all core components
- T006 depends on T005 - registers the tool
- T007 can run in parallel with T005/T006 - just exports

**Phase 4** (Testing):
- T008 depends on T001 completion
- T009 depends on T003 completion
- T010 depends on T005, T006 completion
- T008, T009, T010 can run in parallel within phase

**Parallel Opportunities**:
- T001 || T002 (Phase 1)
- T003 || T004 (Phase 2)
- T005/T006 || T007 (Phase 3)
- T008 || T009 || T010 (Phase 4)
