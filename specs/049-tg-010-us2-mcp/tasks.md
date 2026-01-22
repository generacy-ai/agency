# Tasks: MCP Transport Layer

**Input**: Design documents from `/specs/049-tg-010-us2-mcp/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, quickstart.md
**Status**: Complete

## Format: `[ID] [P?] [Story] Description`
- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to

## Phase 1: Types and Interfaces

- [x] T001 [US2] Define MCP transport types in `packages/agency-extension/src/mcp/types.ts`
  - DockerExecConfig interface
  - ConnectionState union type
  - ConnectionStateEvent interface
  - MessageEvent interface
  - ToolExecutionOptions interface
  - McpErrorCode enum
  - McpTransportError interface
  - createMcpTransportError helper
  - McpTransport interface
  - McpClient interface
  - ToolCallEventInternal interface
  - DEFAULT_CONFIG constants

- [x] T002 [P] [US2] Define tool types in `packages/agency-extension/src/types/tool.ts`
  - JsonSchema and JsonSchemaItem interfaces
  - ToolInfo interface
  - ToolExecutionRequest interface
  - ToolResultContent types (TextContent, ImageContent, ResourceContent)
  - ToolResult interface
  - ToolExecutionStatus type
  - ToolExecutionRecord interface

## Phase 2: Core Implementation

- [x] T003 [US2] Implement DockerExecTransport in `packages/agency-extension/src/mcp/DockerExecTransport.ts`
  - Process spawning with docker exec -i
  - Stdin/stdout pipe management
  - Newline-delimited JSON parsing
  - Connection state machine
  - Event emission (state change, message, error)
  - Reconnection logic with configurable attempts
  - Graceful shutdown

- [x] T004 [US2] Implement StdioClient in `packages/agency-extension/src/mcp/StdioClient.ts`
  - TransportAdapter class for MCP SDK compatibility
  - StdioClientConfig interface extending DockerExecConfig
  - connect() and disconnect() methods
  - listTools() with caching
  - executeTool() with timeout and retry support
  - Tool call event emission
  - Connection state change event emission
  - Content type conversion (text, image, resource)
  - Error wrapping with McpErrorCode

- [x] T005 [P] [US2] Create module exports in `packages/agency-extension/src/mcp/index.ts`
  - Export all types from types.ts
  - Export DockerExecTransport
  - Export StdioClient and StdioClientConfig

## Phase 3: Testing

- [x] T006 [US2] Write DockerExecTransport tests in `packages/agency-extension/src/__tests__/mcp/DockerExecTransport.test.ts`
  - Constructor and initialization tests
  - Start/stop lifecycle tests
  - Docker exec argument construction tests
  - Send message tests
  - Message parsing tests (single, multiple, split chunks)
  - State change event tests
  - Error handling tests
  - Process exit handling tests
  - Multiple listener tests

- [x] T007 [P] [US2] Write StdioClient tests in `packages/agency-extension/src/__tests__/mcp/StdioClient.test.ts`
  - Constructor and initialization tests
  - Connect/disconnect tests
  - listTools() tests with caching
  - executeTool() tests with various scenarios
  - Tool call event tests
  - Connection state event tests
  - Content conversion tests
  - Error wrapping tests
  - Timeout and retry tests

## Dependencies & Execution Order

**Phase 1** (Types):
- T001 and T002 can run in parallel [P]
- Both must complete before Phase 2

**Phase 2** (Implementation):
- T003 (DockerExecTransport) must complete before T004 (StdioClient depends on it)
- T005 (exports) can run in parallel with T004 [P]

**Phase 3** (Testing):
- T006 and T007 can run in parallel [P]
- Both depend on Phase 2 completion

## Summary

| Phase | Tasks | Parallel | Status |
|-------|-------|----------|--------|
| Types | T001, T002 | Yes | Complete |
| Implementation | T003, T004, T005 | Partial | Complete |
| Testing | T006, T007 | Yes | Complete |

**Total**: 7 tasks across 3 phases
**Parallel opportunities**: 4 task pairs identified
**All tasks completed**: Implementation is fully delivered
