# Research: Git Plugin Implementation

## Technology Decisions

### 1. Git Command Execution

**Decision**: Use Node.js `child_process.spawn` directly

**Rationale**:
- Zero runtime dependencies beyond Node.js
- Full control over argument escaping and environment
- Direct access to exit codes, stdout, stderr
- Avoids abstractions that might hide important error information

**Alternatives Considered**:
- `simple-git`: Popular library but adds 200KB+ dependency, abstracts away raw output we need for parsing
- `isomorphic-git`: Pure JS implementation but incomplete command coverage, different behavior from native git

### 2. Output Parsing Strategy

**Decision**: Custom parsers for each output type

**Rationale**:
- `--porcelain` flags provide machine-readable formats
- Parsing is straightforward with known formats
- Avoids dependency on third-party parsers
- Full control over structured output shape

**Key Formats**:
- `git status --porcelain=v2`: Machine-readable status
- `git log --format=format:'%H|%an|%ae|%s|%aI'`: Pipe-delimited log
- `git diff --numstat`: File-level diff stats
- `git blame --porcelain`: Machine-readable blame

### 3. Error Classification

**Decision**: Parse stderr and exit codes to categorize errors

**Patterns**:
```
AuthError:
  - "Permission denied"
  - "Authentication failed"
  - "could not read Username"

NetworkError:
  - "Could not resolve host"
  - "Connection refused"
  - "fatal: unable to access"
  - Exit code 128 with network-related message

ConflictError:
  - Exit code 1 with "CONFLICT" in output
  - "Automatic merge failed"
  - "needs merge"

DetachedHeadError:
  - "HEAD detached"
  - Operations requiring branch name when HEAD is detached
```

### 4. Conflict Parsing

**Decision**: Parse conflict markers directly from files

**Approach**:
1. On merge/rebase failure, identify conflicted files from status
2. Read conflicted files and parse `<<<<<<<`, `=======`, `>>>>>>>` markers
3. Extract our version, their version, and optionally base version (for diff3)
4. Return structured conflict info for agent resolution

**Conflict Types**:
- `content`: Both modified same lines
- `add-add`: Both added file with different content
- `delete-modify`: One deleted, other modified
- `rename`: Different rename targets

### 5. Multi-Repository Support

**Decision**: All tools accept optional `cwd` parameter

**Implementation**:
- Pass `cwd` to `spawn()` options
- When omitted, use `process.cwd()`
- Validate `cwd` exists and is a git repository before operations

**Use Cases**:
- Monorepos with multiple git roots
- Submodule operations
- Agents working across multiple projects

### 6. Force Push Escalation

**Decision**: Integrate with Humancy when available, fail gracefully when not

**Flow**:
1. Check `allowForcePush` config (default: false)
2. If force push requested and not allowed:
   a. Check if Humancy plugin is available via channel
   b. If available: Send escalation request with `blocking_now` urgency
   c. If not available: Return error with manual escalation instructions
3. Wait for approval before proceeding (blocking operation)

**Escalation Payload**:
```typescript
{
  type: 'approval_request',
  urgency: 'blocking_now',
  title: 'Force Push Approval Required',
  description: 'Agent requests force push to {branch}',
  context: {
    remote: 'origin',
    branch: 'feature-x',
    commits_to_lose: ['abc123...', 'def456...'],
    reason: 'Rebase to incorporate main changes'
  }
}
```

## Implementation Patterns

### Tool Factory Pattern

Each tool file exports a factory function that receives config and creates the AgencyTool:

```typescript
// tools/status.ts
export function createStatusTool(config: GitPluginConfig): AgencyTool {
  return {
    name: 'source_control.status',
    description: 'Get working tree status',
    namespace: 'source_control',
    outputPattern: 'terse',
    modes: ['research', 'coding', 'review'],
    inputSchema: { ... },
    execute: async (params) => { ... }
  };
}
```

### Structured Status Output

Instead of raw `git status` output, return structured data:

```typescript
interface StatusResult {
  branch: string;
  upstream?: string;
  ahead: number;
  behind: number;
  staged: FileChange[];
  unstaged: FileChange[];
  untracked: string[];
  conflicts: string[];
}

interface FileChange {
  path: string;
  status: 'added' | 'modified' | 'deleted' | 'renamed' | 'copied';
  oldPath?: string;  // For renames
}
```

### Diff Output Modes

Support multiple diff output modes:

1. **Summary mode** (default): File stats only
   ```
   3 files changed, 45 insertions, 12 deletions
   ```

2. **Stat mode**: Per-file stats
   ```
   src/index.ts | 30 +++++---
   src/utils.ts | 15 ++++
   ```

3. **Full mode**: Complete diff output (for specific files)

## Key Sources/References

1. **Git Porcelain Format**: https://git-scm.com/docs/git-status#_porcelain_format_version_2
2. **Git Exit Codes**: https://git-scm.com/docs/git#_exit_codes
3. **MCP Tool Patterns**: Internal `@generacy-ai/agency` codebase
4. **Terse Output Pattern**: `packages/agency/src/output/`

## Security Considerations

1. **Argument Injection**: Never construct git commands from unvalidated strings
   - Use array-based `spawn()` arguments
   - Validate ref names against git-check-ref-format

2. **Credential Exposure**: Never log or return credential-related error details
   - Sanitize stderr before including in errors
   - Use generic "Authentication failed" messages

3. **Path Traversal**: Validate `cwd` parameter
   - Resolve to absolute path
   - Verify is within allowed directories (if configured)

4. **Force Push Protection**: Default `allowForcePush: false`
   - Require explicit opt-in via config
   - Escalate to human when possible
