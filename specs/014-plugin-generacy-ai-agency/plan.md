# Implementation Plan: Plugin: @generacy-ai/agency-plugin-git

**Feature**: Git operations plugin providing source control tools for agents
**Branch**: `014-plugin-generacy-ai-agency`
**Status**: Complete

## Summary

Implement a comprehensive Git plugin for the Agency platform that provides 12 source control tools following the terse output pattern. The plugin enables agents to perform Git operations with structured outputs, categorized error handling, and human escalation for destructive operations.

## Technical Context

### Language & Framework
- **Language**: TypeScript 5.x (ES2022 target, Node16 modules)
- **Runtime**: Node.js 20+
- **Build**: tsc with ESM output
- **Testing**: Vitest with mock git repositories

### Dependencies
- `@generacy-ai/agency`: Core package (peer dependency) - provides `AgencyPlugin`, `TerseOutput`, `AgencyTool` interfaces
- Node.js `child_process`: For git command execution
- (Optional) `@generacy-ai/agency-plugin-humancy`: For escalation integration (optional peer dependency)

### Key Patterns from Core
- **Tool naming**: `namespace.action` format (e.g., `source_control.commit`)
- **Output pattern**: `TerseOutput.success()` / `TerseOutput.failure()` / `TerseOutput.fromExec()`
- **Plugin interface**: `AgencyPlugin` with manifest, `initialize()`, and `shutdown()`
- **Tool interface**: `AgencyTool` with `execute()` returning `ToolResult`

## Project Structure

```
packages/agency-plugin-git/
├── package.json                 # Package configuration
├── tsconfig.json                # TypeScript config
├── src/
│   ├── index.ts                 # Plugin entry point + manifest
│   ├── plugin.ts                # GitPlugin class implementing AgencyPlugin
│   ├── config.ts                # Configuration schema + defaults
│   ├── types.ts                 # Type definitions (errors, results, options)
│   ├── utils/
│   │   ├── exec-git.ts          # Git command execution wrapper
│   │   ├── parse-status.ts      # Parse git status --porcelain output
│   │   ├── parse-diff.ts        # Parse git diff output
│   │   ├── parse-log.ts         # Parse git log output
│   │   ├── parse-blame.ts       # Parse git blame output
│   │   └── conflict-parser.ts   # Parse conflict markers from files
│   ├── errors/
│   │   ├── index.ts             # Error exports
│   │   ├── git-error.ts         # Base GitError class
│   │   ├── auth-error.ts        # AuthError for credential failures
│   │   ├── network-error.ts     # NetworkError for remote failures
│   │   ├── conflict-error.ts    # ConflictError with structured conflict info
│   │   └── detached-head-error.ts # DetachedHeadError
│   └── tools/
│       ├── index.ts             # Tool exports + createTools factory
│       ├── status.ts            # source_control.status
│       ├── diff.ts              # source_control.diff
│       ├── log.ts               # source_control.log
│       ├── commit.ts            # source_control.commit
│       ├── push.ts              # source_control.push
│       ├── pull.ts              # source_control.pull
│       ├── checkout.ts          # source_control.checkout
│       ├── branch.ts            # source_control.branch
│       ├── stash.ts             # source_control.stash
│       ├── blame.ts             # source_control.blame
│       ├── merge.ts             # source_control.merge
│       └── rebase.ts            # source_control.rebase
└── tests/
    ├── utils/
    │   └── mock-git.ts          # Mock git repository helpers
    ├── exec-git.test.ts         # Git execution tests
    ├── parse-status.test.ts     # Status parsing tests
    ├── conflict-parser.test.ts  # Conflict parsing tests
    ├── tools/
    │   ├── status.test.ts       # Tool tests
    │   ├── commit.test.ts
    │   └── ...                  # One test file per tool
    └── plugin.test.ts           # Plugin lifecycle tests
```

## Core Components

### 1. Git Command Execution (`utils/exec-git.ts`)

Central utility for executing git commands with:
- Optional `cwd` parameter for multi-repo support
- Timeout handling
- Exit code to error type mapping
- Raw output capture for parsing

```typescript
interface ExecGitOptions {
  cwd?: string;
  timeout?: number;
  env?: Record<string, string>;
}

interface ExecGitResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  command: string;
}

async function execGit(args: string[], options?: ExecGitOptions): Promise<ExecGitResult>;
```

### 2. Error Classification (`errors/`)

Four primary error types extending a base `GitError`:

| Error Type | Trigger Conditions |
|------------|-------------------|
| `AuthError` | Credential failures, permission denied |
| `NetworkError` | Remote unreachable, DNS failures, timeouts |
| `ConflictError` | Merge/rebase conflicts with structured conflict info |
| `DetachedHeadError` | Operations requiring branch when in detached state |

`ConflictError` includes structured conflict information:
```typescript
interface ConflictInfo {
  file: string;
  type: 'content' | 'add-add' | 'delete-modify' | 'rename';
  ours?: string;
  theirs?: string;
  ancestor?: string;
}
```

### 3. Plugin Configuration (`config.ts`)

```typescript
interface GitPluginConfig {
  defaultRemote: string;    // Default: 'origin'
  signCommits: boolean;     // Default: false
  allowForcePush: boolean;  // Default: false
}
```

Accessed via `core.getConfig<GitPluginConfig>('plugins.git')`.

### 4. Mode Affiliations

| Mode | Tools Available |
|------|----------------|
| `research` | status, log, diff, blame |
| `coding` | All 12 tools |
| `review` | status, diff, log, blame |

### 5. Humancy Escalation

For force push attempts when `allowForcePush: false`:
- Check if `@generacy-ai/agency-plugin-humancy` is available
- If available, create escalation request with `blocking_now` urgency
- If not available, return error with manual escalation instructions

## Tool Specifications

| Tool | Key Parameters | Output on Success |
|------|----------------|-------------------|
| `status` | `cwd?` | Structured file status list |
| `diff` | `cwd?`, `staged?`, `ref1?`, `ref2?` | Diff summary or structured changes |
| `log` | `cwd?`, `limit?`, `ref?` | Commit list with hash, message, author |
| `commit` | `message`, `files?`, `amend?`, `cwd?` | Commit hash |
| `push` | `remote?`, `branch?`, `force?`, `cwd?` | "Pushed successfully." |
| `pull` | `remote?`, `branch?`, `rebase?`, `cwd?` | Merge/rebase result summary |
| `checkout` | `ref`, `files?`, `create?`, `cwd?` | "Switched to [branch/commit]." |
| `branch` | `action`, `name?`, `cwd?` | Branch list or action confirmation |
| `stash` | `action`, `message?`, `index?`, `cwd?` | Stash list or action confirmation |
| `blame` | `file`, `lines?`, `cwd?` | Line-by-line authorship |
| `merge` | `branch`, `noCommit?`, `cwd?` | Merge result or conflict info |
| `rebase` | `onto`, `interactive?`, `cwd?` | Rebase result or conflict info |

## Implementation Phases

### Phase 1: Foundation
- Plugin skeleton with manifest
- Git execution wrapper with error classification
- Configuration loading

### Phase 2: Read-Only Tools
- `status`, `log`, `diff`, `blame`
- Status/log/diff parsers
- Basic tests with mock repositories

### Phase 3: Write Tools
- `commit`, `checkout`, `branch`, `stash`
- Input validation for destructive operations

### Phase 4: Remote Operations
- `push`, `pull`
- Force push escalation
- Network error handling

### Phase 5: Merge/Rebase
- `merge`, `rebase`
- Conflict detection and parsing
- Structured conflict output

### Phase 6: Polish
- Complete test coverage
- Mode registration
- Documentation

## Testing Strategy

### Mock Git Repository
Create a test helper that:
1. Creates a temporary directory
2. Initializes git repository
3. Creates commits, branches, conflicts as needed
4. Cleans up after test

### Test Categories
- **Unit tests**: Parser functions, error classification
- **Integration tests**: Tool execution against mock repos
- **Edge cases**: Detached HEAD, empty repo, binary files, large diffs

## Success Criteria

| Metric | Target |
|--------|--------|
| Tool coverage | 12/12 implemented |
| Error types | 4 categorized (Auth, Network, Conflict, DetachedHead) |
| Test coverage | 80%+ |
| Build | Zero TypeScript errors |
| Lint | Zero ESLint errors |
