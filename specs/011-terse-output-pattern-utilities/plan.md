# Implementation Plan: Terse Output Pattern Utilities

**Feature**: Utilities and helpers for the terse output pattern - minimal output on success, detailed output on failure
**Branch**: `011-terse-output-pattern-utilities`
**Status**: Complete

## Summary

Implement a `TerseOutput` utility class in the `@generacy-ai/agency` package that provides a consistent, platform-agnostic way to format tool output. This follows the terse output pattern: minimal messages on success, full context on failure.

The utility is designed for agent efficiency - agents consume every token, so success cases should be brief while failure cases should contain all debugging information.

## Technical Context

- **Language**: TypeScript 5.x (ES2022 target)
- **Runtime**: Node.js 20+
- **Package**: `@generacy-ai/agency` (core package)
- **Test Framework**: Vitest
- **Validation**: Zod (consistent with existing codebase)

### Dependencies

No new external dependencies required. The utility is self-contained.

### Key Decisions (from clarifications)

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Result type | Custom `TerseToolResult` | Platform-agnostic; avoids coupling to MCP SDK |
| NORMAL verbosity | Short message + summary | Token-efficient, actionable information |
| Configuration | Constructor injection | No file I/O; flexible, testable |
| ExecResult | Minimal self-defined interface | Self-contained, no external deps |
| Context serialization | JSON.stringify (2-space indent) | Agent-parseable, consistent format |

**Note**: The existing `ToolResult` in `tools/types.ts` is MCP-aligned (with `content` array). This new `TerseToolResult` is simpler and platform-agnostic. Conversion happens at MCP boundary.

## Project Structure

```text
packages/agency/src/
├── output/
│   ├── index.ts              # Public exports
│   ├── types.ts              # TerseToolResult, ExecResult, TerseOutputConfig, Verbosity
│   ├── terse-output.ts       # TerseOutput class implementation
│   ├── format-error.ts       # formatError function
│   ├── success-messages.ts   # Standard success message constants
│   └── terse-output.test.ts  # Unit tests
└── index.ts                  # Update to export output module
```

## Implementation Components

### 1. Types (`output/types.ts`)

Define the core interfaces:

- `TerseToolResult`: Simple `{ success: boolean; output: string }` interface
- `ExecResult`: Minimal interface for process results `{ exitCode, stdout, stderr, shortMessage? }`
- `TerseOutputConfig`: Configuration `{ verbosity?, maxSuccessLength?, includeTimings? }`
- `Verbosity`: Enum with `TERSE`, `NORMAL`, `VERBOSE` levels

### 2. TerseOutput Class (`output/terse-output.ts`)

Static methods for stateless usage:
- `TerseOutput.success(message: string): TerseToolResult`
- `TerseOutput.failure(error: Error | string, context?: unknown): TerseToolResult`
- `TerseOutput.fromExec(result: ExecResult): TerseToolResult`

Instance methods for configured usage:
- Constructor accepts `TerseOutputConfig`
- Instance methods respect verbosity settings
- `successWithSummary(message: string, summary: string)` for NORMAL mode

### 3. Error Formatting (`output/format-error.ts`)

`formatError(error: Error | string, context?: unknown): string`

Output includes:
- Error message
- Stack trace (if Error object)
- Context serialized as `JSON.stringify(context, null, 2)`

### 4. Success Messages (`output/success-messages.ts`)

Standard message constants:

```typescript
export const SUCCESS_MESSAGES = {
  git_commit: 'Committed successfully.',
  git_push: 'Pushed to remote.',
  build_install: 'Dependencies installed.',
  build_compile: 'Build completed.',
  test_unit: 'All tests passed.',
  file_write: 'File written.',
  file_delete: 'File deleted.',
} as const;
```

### 5. MCP Boundary Conversion

The existing `ToolResult` in `tools/types.ts` remains unchanged. A helper function converts `TerseToolResult` to the MCP-compatible format:

```typescript
export function toMcpToolResult(result: TerseToolResult): ToolResult {
  return {
    content: [{ type: 'text', text: result.output }],
    isError: !result.success,
  };
}
```

## Integration Points

1. **Package exports**: Add `output` module to `src/index.ts`
2. **Plugins**: Built-in plugins will use `TerseOutput` for consistent formatting
3. **AgencyTool interface**: Already has `outputPattern: 'terse'` field for documentation

## Testing Strategy

Unit tests in `output/terse-output.test.ts`:

1. **TerseOutput.success()**: Returns correct structure, respects maxSuccessLength
2. **TerseOutput.failure()**: Includes error message, stack trace, serialized context
3. **TerseOutput.fromExec()**: Handles success/failure exit codes correctly
4. **Verbosity modes**: TERSE, NORMAL, VERBOSE produce expected output
5. **toMcpToolResult()**: Correct conversion to MCP format

## Risks and Mitigations

| Risk | Mitigation |
|------|------------|
| Naming collision with existing `ToolResult` | Use `TerseToolResult` name; document difference |
| Large context objects | JSON.stringify handles circular refs with try/catch fallback |
| Plugin migration effort | Plugins adopt incrementally; backward compatible |

## Out of Scope

- MCP SDK type changes
- File-based configuration loading
- Logging/telemetry integration (separate concern)
- Updating all existing plugins (tracked separately)

---

*Generated by speckit*
