# Tasks: MCP Server Foundation

**Input**: Design documents from `/specs/007-mcp-server-foundation/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md
**Status**: Complete

## Format: `[ID] [P?] [Story] Description`
- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to

## Phase 1: Setup

- [x] T001 Initialize package structure at `packages/agency/`
- [x] T002 [P] Create `package.json` with dependencies (@modelcontextprotocol/sdk, zod, minimatch)
- [x] T003 [P] Create `tsconfig.json` with ES2022 target, Node16 resolution

## Phase 2: Core Types and Errors

- [x] T010 [P] [US2] Create `src/tools/types.ts` with AgencyTool and ToolResult interfaces
- [x] T011 [P] [US2] Create `src/plugins/types.ts` with AgencyPlugin interface
- [x] T012 [P] Create `src/errors/agency-error.ts` with AgencyError class and error codes
- [x] T013 [P] Create `src/config/schema.ts` with Zod schemas (AgencyConfig, JsonSchema)

## Phase 3: Configuration

- [x] T020 Create `src/config/loader.ts` with ConfigLoader class
- [x] T021 Implement `.agency/config.json` file loading in ConfigLoader
- [x] T022 Implement `package.json` "agency" field loading in ConfigLoader
- [x] T023 Implement environment variable override support in ConfigLoader
- [x] T024 Implement config merge by priority in ConfigLoader
- [x] T025 Create `src/config/index.ts` module exports

## Phase 4: Tool Registry

- [x] T030 [US1] Create `src/tools/registry.ts` with ToolRegistry class
- [x] T031 [US1] Implement tool register/unregister methods in ToolRegistry
- [x] T032 [US1] Implement glob pattern matching for mode filtering using minimatch
- [x] T033 [US1] Implement `getToolsForMode()` method in ToolRegistry
- [x] T034 Create `src/tools/index.ts` module exports

## Phase 5: Mode Manager

- [x] T040 [US1] Create `src/modes/manager.ts` with ModeManager class
- [x] T041 [US1] Implement `setMode()` and `getMode()` methods in ModeManager
- [x] T042 Create `src/modes/index.ts` module exports

## Phase 6: Plugin System

- [x] T050 [US2] Create `src/plugins/loader.ts` with PluginLoader class
- [x] T051 [US2] Implement `loadPlugin()` method with initialization in PluginLoader
- [x] T052 [US2] Implement `unloadPlugin()` method with cleanup in PluginLoader
- [x] T053 [US2] Implement tool registration from plugins in PluginLoader
- [x] T054 Create `src/plugins/index.ts` module exports

## Phase 7: Server Implementation

- [x] T060 [US1] Create `src/server/agency-server.ts` with AgencyServer class
- [x] T061 [US1] Integrate MCP SDK low-level Server with stdio transport
- [x] T062 [US1] Implement `tools/list` handler with mode filtering
- [x] T063 [US1] Implement `tools/call` handler with tool execution
- [x] T064 [US1] Implement `ping` handler for health checks
- [x] T065 [US1] Implement `start()` method with connection handling
- [x] T066 [US1] Implement `stop()` method with graceful shutdown
- [x] T067 [US1] Implement plugin integration (loadPlugin/unloadPlugin delegation)
- [x] T068 Create `src/server/index.ts` module exports

## Phase 8: Public API

- [x] T070 Create `src/index.ts` with all public exports

## Phase 9: Testing

- [x] T080 [P] Create `src/errors/agency-error.test.ts` - unit tests for AgencyError
- [x] T081 [P] Create `src/config/loader.test.ts` - unit tests for ConfigLoader
- [x] T082 [P] Create `src/tools/registry.test.ts` - unit tests for ToolRegistry
- [x] T083 [P] Create `src/modes/manager.test.ts` - unit tests for ModeManager
- [x] T084 [P] Create `src/plugins/loader.test.ts` - unit tests for PluginLoader
- [x] T085 Create `src/server/agency-server.test.ts` - integration tests for server lifecycle

## Dependencies & Execution Order

**Phase Dependencies**:
- Phase 1 (Setup) must complete before all other phases
- Phase 2 (Types/Errors) must complete before Phases 3-6
- Phase 3 (Config) can run in parallel with Phases 4-6 after Phase 2
- Phase 4 (Registry), Phase 5 (Modes), Phase 6 (Plugins) can run in parallel after Phase 2
- Phase 7 (Server) requires Phases 3-6 to complete
- Phase 8 (Public API) requires Phase 7 to complete
- Phase 9 (Testing) can start after each module is implemented

**Parallel Opportunities**:
- T002, T003 can run in parallel (independent config files)
- T010, T011, T012, T013 can run in parallel (independent type files)
- T080-T084 can run in parallel (independent test files)

**File Dependencies**:
- `agency-server.ts` depends on all other modules
- `loader.ts` (config) depends on `schema.ts`
- `loader.ts` (plugins) depends on `types.ts` (plugins) and `registry.ts` (tools)
- `registry.ts` depends on `types.ts` (tools)
