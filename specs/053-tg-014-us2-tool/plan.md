# Implementation Plan: Tool Execution Webview

**Feature**: Webview panel for testing MCP tools with parameter input and result display
**Branch**: `053-tg-014-us2-tool`
**Status**: Complete

## Summary

This feature implements a webview panel that allows developers to interactively test MCP tools against actual dev containers. The panel provides dynamic parameter input forms generated from JSON Schema, executes tools via the McpClientService, and displays results with syntax highlighting. It also maintains execution history within the session.

## Technical Context

| Technology | Version | Purpose |
|------------|---------|---------|
| TypeScript | 5.x | Primary language |
| VS Code Extension API | 1.85+ | Webview panel framework |
| JSON Schema | Draft-07 | Parameter form generation |

## Architecture

The Tool Execution Panel follows the established webview pattern using `WebviewBase`:

```
┌─────────────────────────────────────────────────────────┐
│                   ToolExecutionPanel                     │
│  (extends WebviewBase)                                   │
├─────────────────────────────────────────────────────────┤
│  - Tool selection and parameter form                     │
│  - Execute button with loading state                     │
│  - Results display with syntax highlighting             │
│  - Execution history list                               │
└────────────────────┬────────────────────────────────────┘
                     │ Messages
                     ▼
┌─────────────────────────────────────────────────────────┐
│                   McpClientService                       │
├─────────────────────────────────────────────────────────┤
│  executeTool(name, params) → ToolResult                 │
└─────────────────────────────────────────────────────────┘
```

## Project Structure

```
packages/agency-extension/src/views/tool-browser/
├── ToolExecutionPanel.ts      # Webview panel class
└── tool-execution.html        # (inline in TS, following existing pattern)
```

## Component Design

### ToolExecutionPanel Class

Extends `WebviewBase` to provide:

1. **Tool Configuration**
   - Accepts `ToolInfo` object with name, description, and inputSchema
   - Stores current tool context for execution

2. **Parameter Form Generation**
   - Dynamically generates HTML form inputs from JSON Schema
   - Supports: string, number, boolean, array, object types
   - Handles required fields, descriptions, defaults, enums
   - Validates input before execution

3. **Tool Execution**
   - Integrates with `McpClientService.executeTool()`
   - Shows loading spinner during execution
   - Handles timeouts and errors gracefully

4. **Result Display**
   - Renders text content with syntax highlighting for JSON
   - Shows execution timing (duration in ms)
   - Displays success/failure status with visual indicators
   - Handles multiple content types (text, images, resources)

5. **Execution History**
   - Maintains array of `ToolExecutionRecord` for the session
   - Allows re-running previous executions
   - Persists across panel visibility changes (retainContextWhenHidden)

### Message Protocol

**From Webview to Extension:**
- `executeTool`: Execute the current tool with provided parameters
- `loadHistory`: Request execution history refresh
- `clearHistory`: Clear execution history
- `rerunExecution`: Re-run a previous execution

**From Extension to Webview:**
- `toolLoaded`: Tool info and schema loaded
- `executionStarted`: Execution began (show loading)
- `executionComplete`: Execution finished with result
- `historyUpdated`: History list updated

## UI Layout

```
┌─────────────────────────────────────────────────────┐
│ Tool: [tool_name]                           [Status]│
│ Description text here...                            │
├─────────────────────────────────────────────────────┤
│ Parameters                                          │
│ ┌─────────────────────────────────────────────────┐│
│ │ param1 (string) *required                       ││
│ │ [________________________]                      ││
│ │ Description of param1                           ││
│ └─────────────────────────────────────────────────┘│
│ ┌─────────────────────────────────────────────────┐│
│ │ param2 (boolean)                                ││
│ │ [✓] Enable feature                              ││
│ └─────────────────────────────────────────────────┘│
│                                                     │
│ [Execute]                                          │
├─────────────────────────────────────────────────────┤
│ Result                              Duration: 42ms  │
│ ┌─────────────────────────────────────────────────┐│
│ │ {                                               ││
│ │   "status": "success",                         ││
│ │   "data": [...]                                ││
│ │ }                                              ││
│ └─────────────────────────────────────────────────┘│
├─────────────────────────────────────────────────────┤
│ History                              [Clear]       │
│ ┌─────────────────────────────────────────────────┐│
│ │ ✓ tool_name - 42ms - 10:30:15           [⟳]    ││
│ │ ✗ tool_name - 105ms - 10:29:45          [⟳]    ││
│ └─────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────┘
```

## Key Interfaces

### Panel-specific Types

```typescript
interface ExecuteToolMessage {
  type: 'executeTool';
  payload: {
    toolName: string;
    parameters: Record<string, unknown>;
  };
}

interface ExecutionCompleteMessage {
  type: 'executionComplete';
  payload: {
    record: ToolExecutionRecord;
  };
}
```

### Existing Types Used

- `ToolInfo` - Tool metadata including inputSchema
- `ToolExecutionRequest` - Request structure for execution
- `ToolResult` - Result with content, timing, error info
- `ToolExecutionRecord` - Full execution record with status
- `JsonSchema`, `JsonSchemaItem` - Schema types for form generation

## Form Generation Strategy

For each property in `inputSchema.properties`:

| Schema Type | HTML Input | Handling |
|-------------|------------|----------|
| `string` | `<input type="text">` | Pattern, minLength, maxLength |
| `string` + `enum` | `<select>` | Dropdown with options |
| `number` | `<input type="number">` | min, max, step |
| `boolean` | `<input type="checkbox">` | Checkbox |
| `array` | `<textarea>` | JSON array input |
| `object` | `<textarea>` | JSON object input |

Required fields marked with asterisk and validated on submit.

## Syntax Highlighting

For JSON content in results:
- Use simple CSS-based highlighting (no external dependencies)
- Apply VS Code theme variables for colors
- Handle large content with scroll and truncation

## Error Handling

| Scenario | Handling |
|----------|----------|
| Not connected | Show error message, suggest connecting |
| Timeout | Show timeout error with duration |
| Execution error | Display error message, show failure status |
| Invalid parameters | Show validation errors, prevent execution |

## Testing Strategy

| Test Type | Coverage |
|-----------|----------|
| Unit | Form generation from various schemas |
| Unit | Parameter validation |
| Integration | Message passing between extension and webview |
| Integration | Execution history management |

## Dependencies

Uses existing services and utilities:
- `McpClientService` - Tool execution
- `WebviewBase` - Webview panel infrastructure
- `createScopedLogger` - Logging
- Tool types from `types/tool.ts`

---

*Generated by speckit*
