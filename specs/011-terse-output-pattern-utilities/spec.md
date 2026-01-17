# Feature Specification: Terse output pattern utilities

**Branch**: `011-terse-output-pattern-utilities` | **Date**: 2026-01-17 | **Status**: Draft

## Summary

Implement utilities and helpers for the terse output pattern - minimal output on success, detailed output on failure.

## Parent Epic

#6 - Agency Core Package

## Background

Agents can't "glaze over" output like humans do. Every token in the response consumes context and attention. The terse output pattern optimizes for agent efficiency:

- **Success**: Short confirmation message
- **Failure**: Full error output with context for debugging

## Design Decisions

> Clarified via [#11 comments](https://github.com/generacy-ai/agency/issues/11)

| Decision | Choice | Rationale |
|----------|--------|-----------|
| ToolResult type | Custom type, convert at MCP boundary | Platform-agnostic design; works across Claude Code, Copilot, Cursor |
| NORMAL verbosity | Short message + summary of work done | Token-efficient, actionable information |
| Configuration source | Constructor/initialization (no file reading) | Flexible, plugin-friendly, testable |
| ExecResult type | Define minimal interface in this package | Self-contained, no external dependencies |
| Context serialization | JSON.stringify with 2-space indent | Agent-parseable, consistent format |

## Requirements

### Types

```typescript
/**
 * Platform-agnostic tool result type.
 * Convert to MCP CallToolResult at the MCP server boundary.
 */
interface ToolResult {
  success: boolean;
  output: string;
}

/**
 * Minimal interface for process execution results.
 * Callers map from execa/child_process to this interface.
 */
interface ExecResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  shortMessage?: string;  // Optional summary for success case
}

/**
 * Configuration passed via constructor, not read from files.
 */
interface TerseOutputConfig {
  verbosity?: Verbosity;
  maxSuccessLength?: number;
  includeTimings?: boolean;
}
```

### Output Helper

```typescript
class TerseOutput {
  constructor(config?: TerseOutputConfig);

  static success(message: string): ToolResult {
    return {
      success: true,
      output: message
    };
  }

  static failure(error: Error | string, context?: unknown): ToolResult {
    return {
      success: false,
      output: formatError(error, context)
    };
  }

  static fromExec(result: ExecResult): ToolResult {
    if (result.exitCode === 0) {
      return TerseOutput.success(result.shortMessage || 'Completed successfully.');
    } else {
      return TerseOutput.failure(result.stderr + '\n' + result.stdout);
    }
  }
}
```

### Standard Success Messages

```typescript
const SUCCESS_MESSAGES = {
  git_commit: 'Committed successfully.',
  git_push: 'Pushed to remote.',
  build_install: 'Dependencies installed.',
  build_compile: 'Build completed.',
  test_unit: 'All tests passed.',
  // ... etc
};
```

### Error Formatting

```typescript
function formatError(error: Error | string, context?: unknown): string {
  // Include:
  // - Error message
  // - Stack trace (if Error)
  // - Exit code (if process)
  // - Stderr output
  // - Stdout output (may contain useful info)
  // - Context serialized as JSON.stringify(context, null, 2)
}
```

### Verbosity Levels

```typescript
enum Verbosity {
  TERSE = 'terse',      // Default - minimal success, full failure
  NORMAL = 'normal',    // Short message + summary (e.g., "3 files compiled")
  VERBOSE = 'verbose',  // Full output always (debugging)
}
```

## Acceptance Criteria

- [ ] TerseOutput helper class implemented with custom ToolResult type
- [ ] ExecResult interface defined in this package
- [ ] Success messages are consistently short
- [ ] Failure output includes all relevant info with JSON-serialized context
- [ ] Verbosity configurable via constructor
- [ ] NORMAL verbosity includes summary of work done
- [ ] All built-in plugins use TerseOutput
- [ ] Documentation explains the pattern

## User Stories

### US1: Agent Tool Implementation

**As a** plugin developer,
**I want** a consistent way to format tool output,
**So that** agents receive efficient, parseable responses.

**Acceptance Criteria**:
- [ ] TerseOutput.success() returns minimal confirmation
- [ ] TerseOutput.failure() returns full error context
- [ ] TerseOutput.fromExec() handles process results

### US2: Configurable Verbosity

**As a** developer debugging agent behavior,
**I want** to increase output verbosity,
**So that** I can see full details during development.

**Acceptance Criteria**:
- [ ] TERSE mode shows minimal success, full failure
- [ ] NORMAL mode shows success with summary
- [ ] VERBOSE mode shows full output always

## Functional Requirements

| ID | Requirement | Priority | Notes |
|----|-------------|----------|-------|
| FR-001 | Implement ToolResult interface | P1 | Platform-agnostic |
| FR-002 | Implement ExecResult interface | P1 | Minimal, self-contained |
| FR-003 | Implement TerseOutput class | P1 | Static methods + configurable instance |
| FR-004 | Implement formatError function | P1 | JSON-serialize context |
| FR-005 | Support three verbosity levels | P2 | TERSE, NORMAL, VERBOSE |

## Success Criteria

| ID | Metric | Target | Measurement |
|----|--------|--------|-------------|
| SC-001 | Success message length | ≤100 chars | Automated check |
| SC-002 | Error context present | 100% | Includes stack, stderr, stdout |

## Assumptions

- Callers will map their execution results to ExecResult interface
- MCP boundary conversion is handled separately (not in this utility)
- Configuration is passed programmatically, not via config files

## Out of Scope

- MCP CallToolResult conversion (handled at server boundary)
- File-based configuration loading
- Logging/telemetry integration (separate concern)

---

*Generated by speckit*
