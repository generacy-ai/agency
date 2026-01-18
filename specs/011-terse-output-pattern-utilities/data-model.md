# Data Model: Terse Output Pattern Utilities

## Core Entities

### TerseToolResult

The primary output type for tools using the terse output pattern.

```typescript
/**
 * Platform-agnostic tool result type.
 * Convert to MCP CallToolResult at the MCP server boundary.
 */
interface TerseToolResult {
  /** Whether the operation succeeded */
  success: boolean;

  /** Human-readable output message */
  output: string;
}
```

**Usage**:
- Returned by all `TerseOutput` methods
- Converted to MCP `ToolResult` at server boundary
- Simple structure enables easy testing and composition

### ExecResult

Minimal interface for process execution results.

```typescript
/**
 * Minimal interface for process execution results.
 * Callers map from execa/child_process to this interface.
 */
interface ExecResult {
  /** Process exit code (0 = success) */
  exitCode: number;

  /** Standard output content */
  stdout: string;

  /** Standard error content */
  stderr: string;

  /** Optional short summary for success case (NORMAL verbosity) */
  shortMessage?: string;
}
```

**Mapping Examples**:

From `execa`:
```typescript
const result = await execa('git', ['commit', '-m', 'msg']);
const execResult: ExecResult = {
  exitCode: result.exitCode,
  stdout: result.stdout,
  stderr: result.stderr,
  shortMessage: 'Committed successfully.',
};
```

From Node.js `child_process`:
```typescript
const { status, stdout, stderr } = spawnSync('npm', ['install']);
const execResult: ExecResult = {
  exitCode: status ?? 1,
  stdout: stdout.toString(),
  stderr: stderr.toString(),
};
```

### TerseOutputConfig

Configuration for `TerseOutput` instance behavior.

```typescript
/**
 * Configuration for TerseOutput instance.
 * Passed via constructor, not read from files.
 */
interface TerseOutputConfig {
  /** Output verbosity level (default: TERSE) */
  verbosity?: Verbosity;

  /** Maximum length for success messages (default: 100) */
  maxSuccessLength?: number;

  /** Include timing information in output (default: false) */
  includeTimings?: boolean;
}
```

**Defaults**:
```typescript
const DEFAULT_CONFIG: Required<TerseOutputConfig> = {
  verbosity: Verbosity.TERSE,
  maxSuccessLength: 100,
  includeTimings: false,
};
```

### Verbosity

Enum defining output verbosity levels.

```typescript
/**
 * Output verbosity levels for terse output pattern.
 */
enum Verbosity {
  /** Minimal success output, full failure output (default) */
  TERSE = 'terse',

  /** Success with summary, full failure output */
  NORMAL = 'normal',

  /** Full output always (debugging mode) */
  VERBOSE = 'verbose',
}
```

**Behavior Matrix**:

| Verbosity | Success | Failure |
|-----------|---------|---------|
| TERSE | Short message only | Full details |
| NORMAL | Message + summary | Full details |
| VERBOSE | Full stdout/stderr | Full details |

## Type Relationships

```text
┌─────────────────────┐
│  TerseOutputConfig  │
│  ─────────────────  │
│  verbosity?         │
│  maxSuccessLength?  │
│  includeTimings?    │
└─────────┬───────────┘
          │
          │ configures
          ▼
┌─────────────────────┐
│    TerseOutput      │──────────────────┐
│  ─────────────────  │                  │
│  success()          │                  │
│  failure()          │                  │
│  fromExec()         │                  │
└─────────┬───────────┘                  │
          │                              │
          │ returns                      │ accepts
          ▼                              │
┌─────────────────────┐     ┌────────────┴────────┐
│   TerseToolResult   │     │     ExecResult      │
│  ─────────────────  │     │  ────────────────   │
│  success: boolean   │     │  exitCode: number   │
│  output: string     │     │  stdout: string     │
└─────────────────────┘     │  stderr: string     │
                            │  shortMessage?      │
                            └─────────────────────┘
```

## Validation Rules

### TerseToolResult

- `success`: Required boolean
- `output`: Required string, may be empty for success cases

### ExecResult

- `exitCode`: Required number (0 = success, non-zero = failure)
- `stdout`: Required string (may be empty)
- `stderr`: Required string (may be empty)
- `shortMessage`: Optional string for summary in NORMAL mode

### TerseOutputConfig

- `verbosity`: Optional, must be valid `Verbosity` enum value
- `maxSuccessLength`: Optional, must be positive integer
- `includeTimings`: Optional boolean

## Constants

### SUCCESS_MESSAGES

Standard success messages for common operations:

```typescript
const SUCCESS_MESSAGES = {
  // Git operations
  git_commit: 'Committed successfully.',
  git_push: 'Pushed to remote.',
  git_pull: 'Pulled from remote.',
  git_checkout: 'Switched branch.',

  // Build operations
  build_install: 'Dependencies installed.',
  build_compile: 'Build completed.',
  build_clean: 'Build artifacts cleaned.',

  // Test operations
  test_unit: 'All tests passed.',
  test_lint: 'Linting passed.',
  test_typecheck: 'Type checking passed.',

  // File operations
  file_write: 'File written.',
  file_delete: 'File deleted.',
  file_copy: 'File copied.',

  // Generic
  completed: 'Completed successfully.',
} as const;

type SuccessMessageKey = keyof typeof SUCCESS_MESSAGES;
```

## MCP Conversion

Converting `TerseToolResult` to MCP-compatible `ToolResult`:

```typescript
import { ToolResult, ToolContent } from '../tools/types.js';

function toMcpToolResult(result: TerseToolResult): ToolResult {
  return {
    content: [{ type: 'text', text: result.output }],
    isError: !result.success,
  };
}
```

---

*Generated by speckit*
