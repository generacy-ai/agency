# Research: @generacy-ai/agency-plugin-docker

## Technology Decisions

### Process Execution: execa

**Decision**: Use `execa` for Docker CLI execution

**Rationale**:
- Clean async/await API
- Cross-platform compatibility
- Better error handling than child_process
- Already used in Node.js ecosystem for CLI wrappers

**Alternatives Considered**:
- `dockerode` (Docker Engine API client): Lower-level, more complex, requires Docker socket access
- `child_process.spawn`: More verbose, less ergonomic error handling

### Error Classification

**Decision**: Classify errors by category with summarized messages

**Categories**:
| Category | Detection Pattern | Example |
|----------|-------------------|---------|
| `daemon` | "Cannot connect to the Docker daemon" | Docker not running |
| `permission` | "permission denied" | Socket access issues |
| `not_found` | "No such image", "No such container" | Missing resources |
| `network` | "network", "timeout", "EOF" | Pull/push failures |
| `resource` | "no space left", "out of memory" | Resource limits |
| `config` | "yaml", "compose", "invalid" | Bad compose file |

**Implementation Pattern**:
```typescript
function classifyDockerError(stderr: string, exitCode: number): DockerErrorCategory {
  const lowerStderr = stderr.toLowerCase();

  if (lowerStderr.includes('cannot connect to the docker daemon')) return 'daemon';
  if (lowerStderr.includes('permission denied')) return 'permission';
  if (lowerStderr.includes('no such')) return 'not_found';
  if (/network|timeout|eof/i.test(lowerStderr)) return 'network';
  if (/no space|out of memory/i.test(lowerStderr)) return 'resource';
  if (/yaml|compose|invalid/i.test(lowerStderr)) return 'config';

  return 'unknown';
}
```

### Logs Implementation

**Decision**: Snapshot-based logs (no streaming)

**Rationale**:
- MCP uses request-response model, not streaming
- SSE would add complexity without clear benefit
- Tail N lines covers 90% of use cases
- Agent can call repeatedly for "follow" behavior

**Default tail**: 100 lines (configurable)

### Testing Approach

**Decision**: Dual-layer testing (unit + integration)

**Unit Tests**:
```typescript
// Fast, mocked execa
vi.mock('execa', () => ({
  execa: vi.fn().mockResolvedValue({ exitCode: 0, stdout: 'ok', stderr: '' }),
}));
```

**Integration Tests**:
```typescript
// Real Docker required
beforeAll(async () => {
  const hasDocker = await checkDockerAvailable();
  if (!hasDocker) {
    console.log('Skipping Docker integration tests');
    return;
  }
});
```

## Implementation Patterns

### Tool Structure

Each tool follows this pattern:
```typescript
import { AgencyTool, ToolResult } from '@generacy-ai/agency';
import { TerseOutput, toMcpToolResult } from '@generacy-ai/agency/output';
import { z } from 'zod';
import { execDocker } from '../utils/exec.js';

const paramsSchema = z.object({
  // tool-specific params
});

export const dockerToolName: AgencyTool = {
  name: 'run.docker_tool_name',
  description: 'Tool description',
  namespace: 'run',
  outputPattern: 'terse',
  modes: ['debug', 'coding'],
  inputSchema: {
    type: 'object',
    properties: { /* from zod schema */ },
    required: ['requiredParam'],
  },
  async execute(params: unknown): Promise<ToolResult> {
    const validated = paramsSchema.parse(params);
    const result = await execDocker(['command', ...args]);
    return toMcpToolResult(TerseOutput.fromExec(result));
  },
};
```

### Docker CLI Wrapper

```typescript
import { execa, type ExecaReturnValue } from 'execa';
import { ExecResult } from '@generacy-ai/agency/output';
import { classifyDockerError } from './error-classifier.js';

export async function execDocker(
  args: string[],
  options?: { cwd?: string; timeout?: number }
): Promise<ExecResult> {
  try {
    const result = await execa('docker', args, {
      cwd: options?.cwd,
      timeout: options?.timeout,
      reject: false, // Don't throw on non-zero exit
    });

    return {
      exitCode: result.exitCode,
      stdout: result.stdout,
      stderr: result.stderr,
      shortMessage: result.exitCode === 0 ? undefined : formatError(result),
    };
  } catch (error) {
    return handleExecError(error);
  }
}

function formatError(result: ExecaReturnValue): string {
  const category = classifyDockerError(result.stderr, result.exitCode);
  const summary = result.stderr.split('\n')[0] || 'Unknown error';
  return `[${category.toUpperCase()}] ${summary}`;
}
```

## Key References

- [Docker CLI Reference](https://docs.docker.com/reference/cli/docker/)
- [Docker Compose CLI](https://docs.docker.com/compose/reference/)
- [MCP Tool Protocol](https://modelcontextprotocol.io/docs/concepts/tools)
- [execa Documentation](https://github.com/sindresorhus/execa)
