# Quickstart: Terse Output Pattern Utilities

## Installation

The terse output utilities are part of the `@generacy-ai/agency` core package:

```bash
pnpm add @generacy-ai/agency
```

## Basic Usage

### Static Methods (Quick Usage)

```typescript
import { TerseOutput } from '@generacy-ai/agency';

// Success case - minimal output
const result = TerseOutput.success('Committed successfully.');
// { success: true, output: 'Committed successfully.' }

// Failure case - full context
const error = new Error('Permission denied');
const result = TerseOutput.failure(error, { path: '/etc/passwd' });
// { success: false, output: 'Permission denied\n\nStack trace:\n...\n\nContext:\n{"path": "/etc/passwd"}' }

// From process execution
const execResult = { exitCode: 0, stdout: '...', stderr: '', shortMessage: 'Built 3 files.' };
const result = TerseOutput.fromExec(execResult);
// { success: true, output: 'Built 3 files.' }
```

### Configured Instance

```typescript
import { TerseOutput, Verbosity } from '@generacy-ai/agency';

// Create configured instance
const output = new TerseOutput({
  verbosity: Verbosity.NORMAL,
  maxSuccessLength: 100,
});

// Instance methods respect configuration
const result = output.success('Done.', { summary: '3 files processed' });
// { success: true, output: 'Done. (3 files processed)' }
```

## Converting to MCP Format

At the MCP server boundary, convert to MCP-compatible format:

```typescript
import { TerseOutput, toMcpToolResult } from '@generacy-ai/agency';

// In tool implementation
const terseResult = TerseOutput.success('Done.');

// At MCP boundary
const mcpResult = toMcpToolResult(terseResult);
// { content: [{ type: 'text', text: 'Done.' }], isError: false }
```

## Verbosity Levels

### TERSE (Default)

Minimal success output, full failure details:

```typescript
const output = new TerseOutput({ verbosity: Verbosity.TERSE });

output.success('Done.');                  // "Done."
output.failure(new Error('Failed'), ctx); // Full error + stack + context
```

### NORMAL

Success with summary, full failure details:

```typescript
const output = new TerseOutput({ verbosity: Verbosity.NORMAL });

output.success('Done.', { summary: '3 files' }); // "Done. (3 files)"
output.failure(new Error('Failed'), ctx);        // Full error + stack + context
```

### VERBOSE

Full output always (for debugging):

```typescript
const output = new TerseOutput({ verbosity: Verbosity.VERBOSE });

// Even success shows all details
const result = output.fromExec({
  exitCode: 0,
  stdout: 'Compiling...\nLinking...\nDone.',
  stderr: '',
});
// Shows full stdout in VERBOSE mode
```

## Standard Success Messages

Use predefined messages for consistency:

```typescript
import { SUCCESS_MESSAGES, TerseOutput } from '@generacy-ai/agency';

return TerseOutput.success(SUCCESS_MESSAGES.git_commit);
// { success: true, output: 'Committed successfully.' }

return TerseOutput.success(SUCCESS_MESSAGES.build_compile);
// { success: true, output: 'Build completed.' }
```

Available messages:
- `git_commit`, `git_push`, `git_pull`, `git_checkout`
- `build_install`, `build_compile`, `build_clean`
- `test_unit`, `test_lint`, `test_typecheck`
- `file_write`, `file_delete`, `file_copy`
- `completed`

## Error Formatting

The `failure()` method automatically formats errors with context:

```typescript
// With Error object
TerseOutput.failure(new Error('Connection timeout'), {
  host: 'api.example.com',
  port: 443,
  attempt: 3,
});

// Output:
// Connection timeout
//
// Stack trace:
// Error: Connection timeout
//     at connectToServer (src/client.ts:42)
//     ...
//
// Context:
// {
//   "host": "api.example.com",
//   "port": 443,
//   "attempt": 3
// }
```

```typescript
// With string error
TerseOutput.failure('Invalid input: expected number', { received: 'string' });

// Output:
// Invalid input: expected number
//
// Context:
// {
//   "received": "string"
// }
```

## Plugin Integration Example

```typescript
import { AgencyTool, TerseOutput, toMcpToolResult } from '@generacy-ai/agency';

const myTool: AgencyTool = {
  name: 'my_plugin.do_something',
  description: 'Does something useful',
  inputSchema: { type: 'object', properties: {} },
  namespace: 'my_plugin',
  outputPattern: 'terse',

  async execute(params) {
    try {
      await doSomething(params);
      return toMcpToolResult(TerseOutput.success('Done.'));
    } catch (error) {
      return toMcpToolResult(TerseOutput.failure(error, { params }));
    }
  },
};
```

## Troubleshooting

### Circular Reference in Context

If context has circular references, serialization falls back to `String(context)`:

```typescript
const obj = { a: 1 };
obj.self = obj;  // Circular

TerseOutput.failure(new Error('Failed'), obj);
// Context shown as "[object Object]" or similar fallback
```

### Long Success Messages

Messages exceeding `maxSuccessLength` are truncated:

```typescript
const output = new TerseOutput({ maxSuccessLength: 20 });
output.success('This is a very long message');
// "This is a very lo..."
```

---

*Generated by speckit*
