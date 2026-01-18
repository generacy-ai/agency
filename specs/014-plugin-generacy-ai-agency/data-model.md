# Data Model: Git Plugin

## Core Entities

### Plugin Configuration

```typescript
/**
 * Git plugin configuration options
 */
interface GitPluginConfig {
  /** Default remote for push/pull operations. Default: 'origin' */
  defaultRemote: string;

  /** Whether to sign commits with GPG. Default: false */
  signCommits: boolean;

  /** Whether force push is allowed. Default: false (requires escalation) */
  allowForcePush: boolean;
}
```

### Tool Parameters

#### Common Parameters

```typescript
/**
 * Base parameters shared by all tools
 */
interface BaseToolParams {
  /** Working directory. Defaults to process.cwd() */
  cwd?: string;
}
```

#### Status Tool

```typescript
interface StatusParams extends BaseToolParams {
  // No additional params - status is simple
}
```

#### Diff Tool

```typescript
interface DiffParams extends BaseToolParams {
  /** Show staged changes only */
  staged?: boolean;

  /** First ref for comparison (default: working tree) */
  ref1?: string;

  /** Second ref for comparison */
  ref2?: string;

  /** Specific files to diff */
  files?: string[];

  /** Output format: 'summary' | 'stat' | 'full' */
  format?: 'summary' | 'stat' | 'full';
}
```

#### Log Tool

```typescript
interface LogParams extends BaseToolParams {
  /** Maximum commits to return. Default: 10 */
  limit?: number;

  /** Starting ref. Default: HEAD */
  ref?: string;

  /** Show commits for specific file */
  file?: string;

  /** Only show commits by author (email or name pattern) */
  author?: string;

  /** Only show commits since date (ISO format) */
  since?: string;

  /** Only show commits until date (ISO format) */
  until?: string;
}
```

#### Commit Tool

```typescript
interface CommitParams extends BaseToolParams {
  /** Commit message (required) */
  message: string;

  /** Specific files to commit. If omitted, commits all staged */
  files?: string[];

  /** Amend the previous commit */
  amend?: boolean;

  /** Allow empty commit */
  allowEmpty?: boolean;
}
```

#### Push Tool

```typescript
interface PushParams extends BaseToolParams {
  /** Remote name. Default: configured defaultRemote */
  remote?: string;

  /** Branch to push. Default: current branch */
  branch?: string;

  /** Force push. Requires allowForcePush or escalation */
  force?: boolean;

  /** Set upstream tracking */
  setUpstream?: boolean;

  /** Push tags */
  tags?: boolean;
}
```

#### Pull Tool

```typescript
interface PullParams extends BaseToolParams {
  /** Remote name. Default: configured defaultRemote */
  remote?: string;

  /** Branch to pull. Default: current branch's upstream */
  branch?: string;

  /** Rebase instead of merge */
  rebase?: boolean;

  /** Auto-stash before pull */
  autostash?: boolean;
}
```

#### Checkout Tool

```typescript
interface CheckoutParams extends BaseToolParams {
  /** Branch, commit, or file path to checkout */
  ref: string;

  /** Create new branch */
  create?: boolean;

  /** Force checkout (discard local changes) */
  force?: boolean;

  /** Checkout specific files only */
  files?: string[];
}
```

#### Branch Tool

```typescript
interface BranchParams extends BaseToolParams {
  /** Action to perform */
  action: 'list' | 'create' | 'delete' | 'rename';

  /** Branch name (required for create/delete/rename) */
  name?: string;

  /** New name (for rename) */
  newName?: string;

  /** Force delete unmerged branch */
  force?: boolean;

  /** Include remote branches in list */
  all?: boolean;
}
```

#### Stash Tool

```typescript
interface StashParams extends BaseToolParams {
  /** Action to perform */
  action: 'push' | 'pop' | 'apply' | 'drop' | 'list' | 'show';

  /** Stash message (for push) */
  message?: string;

  /** Stash index (for pop/apply/drop/show). Default: 0 */
  index?: number;

  /** Include untracked files (for push) */
  includeUntracked?: boolean;
}
```

#### Blame Tool

```typescript
interface BlameParams extends BaseToolParams {
  /** File to blame (required) */
  file: string;

  /** Line range: [start, end] */
  lines?: [number, number];

  /** Rev to blame from. Default: HEAD */
  rev?: string;
}
```

#### Merge Tool

```typescript
interface MergeParams extends BaseToolParams {
  /** Branch to merge in (required) */
  branch: string;

  /** Don't auto-commit the merge */
  noCommit?: boolean;

  /** Merge strategy */
  strategy?: 'ours' | 'theirs' | 'recursive';

  /** Squash commits */
  squash?: boolean;
}
```

#### Rebase Tool

```typescript
interface RebaseParams extends BaseToolParams {
  /** Branch or commit to rebase onto (required) */
  onto: string;

  /** Abort current rebase */
  abort?: boolean;

  /** Continue after resolving conflicts */
  continue?: boolean;

  /** Skip current commit */
  skip?: boolean;
}
```

### Tool Results

#### Status Result

```typescript
interface StatusResult {
  /** Current branch name */
  branch: string;

  /** Upstream branch if tracking */
  upstream?: string;

  /** Commits ahead of upstream */
  ahead: number;

  /** Commits behind upstream */
  behind: number;

  /** Files in staging area */
  staged: FileChange[];

  /** Modified but not staged files */
  unstaged: FileChange[];

  /** Untracked files */
  untracked: string[];

  /** Files with merge conflicts */
  conflicts: string[];
}

interface FileChange {
  /** File path relative to repo root */
  path: string;

  /** Change type */
  status: 'added' | 'modified' | 'deleted' | 'renamed' | 'copied';

  /** Original path for renames/copies */
  oldPath?: string;
}
```

#### Diff Result

```typescript
interface DiffResult {
  /** Number of files changed */
  filesChanged: number;

  /** Total insertions */
  insertions: number;

  /** Total deletions */
  deletions: number;

  /** Per-file stats (when format is 'stat' or 'full') */
  files?: DiffFileStat[];

  /** Full diff text (when format is 'full') */
  patch?: string;
}

interface DiffFileStat {
  path: string;
  insertions: number;
  deletions: number;
  binary?: boolean;
}
```

#### Log Result

```typescript
interface LogResult {
  /** List of commits */
  commits: CommitInfo[];

  /** Whether there are more commits beyond limit */
  hasMore: boolean;
}

interface CommitInfo {
  /** Full commit hash */
  hash: string;

  /** Short hash (7 chars) */
  shortHash: string;

  /** Commit message (first line) */
  subject: string;

  /** Full commit message */
  body?: string;

  /** Author name */
  authorName: string;

  /** Author email */
  authorEmail: string;

  /** Commit timestamp (ISO 8601) */
  date: string;

  /** Parent commit hashes */
  parents: string[];
}
```

#### Commit Result

```typescript
interface CommitResult {
  /** Created commit hash */
  hash: string;

  /** Short hash */
  shortHash: string;

  /** Branch name */
  branch: string;

  /** Files committed */
  filesChanged: number;
}
```

#### Blame Result

```typescript
interface BlameResult {
  /** Blame information per line */
  lines: BlameLine[];
}

interface BlameLine {
  /** Line number (1-indexed) */
  lineNumber: number;

  /** Commit hash that last modified this line */
  hash: string;

  /** Author name */
  author: string;

  /** Commit timestamp (ISO 8601) */
  date: string;

  /** Line content */
  content: string;
}
```

### Error Types

```typescript
/**
 * Base error for all git operations
 */
class GitError extends Error {
  /** Git command that failed */
  command: string;

  /** Exit code */
  exitCode: number;

  /** Full stderr output (sanitized) */
  stderr: string;

  /** Working directory */
  cwd: string;
}

/**
 * Authentication or permission failure
 */
class AuthError extends GitError {
  type: 'auth';
}

/**
 * Network-related failure
 */
class NetworkError extends GitError {
  type: 'network';

  /** Remote that failed */
  remote?: string;
}

/**
 * Merge or rebase conflict
 */
class ConflictError extends GitError {
  type: 'conflict';

  /** Structured conflict information */
  conflicts: ConflictInfo[];
}

interface ConflictInfo {
  /** Conflicted file path */
  file: string;

  /** Type of conflict */
  type: 'content' | 'add-add' | 'delete-modify' | 'rename';

  /** Our version (between <<<< and ====) */
  ours?: string;

  /** Their version (between ==== and >>>>) */
  theirs?: string;

  /** Base version (for diff3 conflicts) */
  ancestor?: string;
}

/**
 * Operation requires branch but HEAD is detached
 */
class DetachedHeadError extends GitError {
  type: 'detached_head';

  /** Current HEAD commit */
  headCommit: string;
}
```

### Escalation Payload

```typescript
/**
 * Escalation request sent to Humancy for force push approval
 */
interface ForcePushEscalation {
  type: 'approval_request';
  urgency: 'blocking_now';
  title: string;
  description: string;
  context: {
    remote: string;
    branch: string;
    commitsToLose: string[];
    reason?: string;
  };
}

interface EscalationResponse {
  approved: boolean;
  approver?: string;
  reason?: string;
}
```

## Validation Rules

### Ref Name Validation
- Must match git-check-ref-format rules
- No `.`, `..`, `/` at start/end
- No consecutive dots
- No control characters

### Path Validation
- Must be relative to repository root
- No path traversal (`../`)
- Must exist for read operations

### Message Validation
- Non-empty for commits
- UTF-8 encoded
- No null bytes

## Relationships

```
GitPlugin (1) ──> (12) AgencyTool
     │
     ├──> GitPluginConfig
     │
     └──> ErrorTypes
           ├── GitError (base)
           ├── AuthError
           ├── NetworkError
           ├── ConflictError
           └── DetachedHeadError
```

## Mode Mappings

| Tool | research | coding | review |
|------|:--------:|:------:|:------:|
| status | ✓ | ✓ | ✓ |
| diff | ✓ | ✓ | ✓ |
| log | ✓ | ✓ | ✓ |
| blame | ✓ | ✓ | ✓ |
| commit | | ✓ | |
| push | | ✓ | |
| pull | | ✓ | |
| checkout | | ✓ | |
| branch | | ✓ | |
| stash | | ✓ | |
| merge | | ✓ | |
| rebase | | ✓ | |
