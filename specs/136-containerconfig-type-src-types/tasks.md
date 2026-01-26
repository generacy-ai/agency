# Tasks: Add mcpCommand Field to ContainerConfig Schema

**Input**: Design documents from `/specs/136-containerconfig-type-src-types/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md
**Status**: Complete

## Format: `[ID] [P?] [Story] Description`
- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to

## Phase 1: Schema and Type Updates

- [ ] T001 [P] [US1] Add `mcpCommand` and `mcpArgs` fields to `ContainerConfigSchema` in `packages/agency-extension/src/config/ConfigSchema.ts`
- [ ] T002 [P] [US1] Add `mcpArgs?: string[]` field to `ContainerConfig` interface in `packages/agency-extension/src/types/container.ts`
- [ ] T003 [P] [US1] Add `args?: string[]` field to `McpConnectionOptions` interface in `packages/agency-extension/src/types/mcp.ts`

## Phase 2: Service Integration

- [ ] T004 [US1] [US2] Update `McpClientService._doConnect()` in `packages/agency-extension/src/services/McpClientService.ts` to use `options.args` when building docker exec command, with default fallback to `['@modelcontextprotocol/server']`

## Phase 3: Verification

- [ ] T005 Run `pnpm build` to verify TypeScript compilation succeeds with no type errors
- [ ] T006 Run `pnpm test` to verify no regressions in existing tests

## Dependencies & Execution Order

**Parallel opportunities:**
- T001, T002, T003 can run in parallel (independent file changes)

**Sequential dependencies:**
- T004 depends on T003 (needs `McpConnectionOptions.args` to exist)
- T005 depends on T001, T002, T003, T004 (all code changes must be complete)
- T006 depends on T005 (build must pass before running tests)

**Execution order:**
1. T001 + T002 + T003 (parallel)
2. T004
3. T005
4. T006
