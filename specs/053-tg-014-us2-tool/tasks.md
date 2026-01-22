# Tasks: Tool Execution Webview

**Input**: Design documents from `/specs/053-tg-014-us2-tool/`
**Prerequisites**: plan.md (required), spec.md (required)
**Status**: Complete

## Format: `[ID] [P?] [Story] Description`
- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US2: In-Situ MCP Testing)

---

## Phase 1: Core Implementation

### T001 [US2] Create ToolExecutionPanel class structure
**File**: `packages/agency-extension/src/views/tool-browser/ToolExecutionPanel.ts`

- [x] Create `ToolExecutionPanel` class extending `WebviewBase`
- [x] Define message types for webview communication (ExecuteToolMessage, ExecutionCompleteMessage, etc.)
- [x] Implement static `createOrShow()` factory method with panel tracking
- [x] Add constructor accepting `ToolInfo` parameter
- [x] Implement `handleMessage()` for incoming webview messages

---

### T002 [US2] Implement JSON Schema form generation
**File**: `packages/agency-extension/src/views/tool-browser/ToolExecutionPanel.ts`

- [x] Create `_generateParameterForm()` method from `inputSchema`
- [x] Handle string type with text input (pattern, minLength, maxLength)
- [x] Handle string + enum with select dropdown
- [x] Handle number type with number input (min, max)
- [x] Handle boolean type with checkbox
- [x] Handle array/object types with JSON textarea
- [x] Mark required fields and add descriptions

---

### T003 [US2] Implement tool execution with McpClientService
**File**: `packages/agency-extension/src/views/tool-browser/ToolExecutionPanel.ts`

- [x] Create `_handleExecuteTool()` method
- [x] Validate parameters before execution
- [x] Call `McpClientService.executeTool()` with parameters
- [x] Handle timeout and error cases
- [x] Create `ToolExecutionRecord` from result
- [x] Send `executionComplete` message to webview

---

### T004 [US2] Implement result display with syntax highlighting
**File**: `packages/agency-extension/src/views/tool-browser/ToolExecutionPanel.ts`

- [x] Create `_formatResultContent()` for different content types
- [x] Implement JSON syntax highlighting with CSS classes
- [x] Display execution timing (duration in ms)
- [x] Show success/failure status with visual indicators (icons/colors)
- [x] Handle text, image, and resource content types

---

### T005 [US2] Implement execution history management
**File**: `packages/agency-extension/src/views/tool-browser/ToolExecutionPanel.ts`

- [x] Add `_executionHistory: ToolExecutionRecord[]` array
- [x] Implement `_addToHistory()` method
- [x] Create `_handleClearHistory()` method
- [x] Implement `_handleRerunExecution()` for replaying previous executions
- [x] Persist history in webview state (retainContextWhenHidden)

---

### T006 [US2] Implement webview HTML template
**File**: `packages/agency-extension/src/views/tool-browser/ToolExecutionPanel.ts`

- [x] Implement `getHtmlContent()` with full UI layout
- [x] Create tool header section (name, description, connection status)
- [x] Create parameters form section with generated inputs
- [x] Create result display section with syntax-highlighted output
- [x] Create history list section with rerun buttons
- [x] Add loading spinner for execution state
- [x] Style using VS Code CSS variables for theme consistency

---

### T007 [US2] Implement webview JavaScript interaction
**File**: `packages/agency-extension/src/views/tool-browser/ToolExecutionPanel.ts`

- [x] Add form submission handler with parameter collection
- [x] Add client-side validation before sending executeTool message
- [x] Handle `executionStarted` message (show loading)
- [x] Handle `executionComplete` message (update result display)
- [x] Handle `historyUpdated` message (refresh history list)
- [x] Implement rerun button click handlers
- [x] Implement clear history button handler

---

## Phase 2: Integration

### T008 [US2] Export ToolExecutionPanel from views index
**File**: `packages/agency-extension/src/views/index.ts`

- [x] Add export for `ToolExecutionPanel` class

---

### T009 [US2] Integrate with tool-commands.ts
**File**: `packages/agency-extension/src/commands/tool-commands.ts`

- [x] Import `ToolExecutionPanel` from views
- [x] Update `testTool` command to open `ToolExecutionPanel` with selected tool
- [x] Pass `ToolInfo` from tree selection to panel

---

## Phase 3: Testing

### T010 [P] [US2] Add unit tests for form generation
**File**: `packages/agency-extension/src/__tests__/views/ToolExecutionPanel.test.ts`

- [x] Test string field generation from schema
- [x] Test number field generation with min/max
- [x] Test boolean checkbox generation
- [x] Test enum select dropdown generation
- [x] Test array/object textarea generation
- [x] Test required field marking

---

### T011 [P] [US2] Add unit tests for execution handling
**File**: `packages/agency-extension/src/__tests__/views/ToolExecutionPanel.test.ts`

- [x] Test parameter validation
- [x] Test successful execution flow
- [x] Test error handling
- [x] Test timeout handling
- [x] Test history record creation

---

## Dependencies & Execution Order

**Sequential dependencies**:
- T001 → T002 → T003 → T004 → T005 (core panel implementation builds incrementally)
- T006 depends on T001-T005 (HTML needs all handlers defined)
- T007 depends on T006 (JS interacts with HTML elements)
- T008, T009 depend on T001-T007 (integration after core complete)

**Parallel opportunities**:
- T010 and T011 can run in parallel (different test focuses)

**Execution flow**:
```
Phase 1: T001 → T002 → T003 → T004 → T005 → T006 → T007
Phase 2: T008 → T009
Phase 3: T010 ─┬─ (parallel)
         T011 ─┘
```

---

*Generated by speckit*
