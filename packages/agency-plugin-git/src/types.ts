/**
 * Type definitions for @generacy-ai/agency-plugin-git
 *
 * Defines tool parameters, results, and error types for all git operations.
 */

/**
 * Base parameters shared by all tools
 */
export interface BaseToolParams {
  /** Working directory. Defaults to process.cwd() */
  cwd?: string;
}

// ============================================================================
// Status Tool Types
// ============================================================================

export interface StatusParams extends BaseToolParams {}

export interface FileChange {
  /** File path relative to repo root */
  path: string;
  /** Change type */
  status: 'added' | 'modified' | 'deleted' | 'renamed' | 'copied';
  /** Original path for renames/copies */
  oldPath?: string;
}

export interface StatusResult {
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

// ============================================================================
// Diff Tool Types
// ============================================================================

export interface DiffParams extends BaseToolParams {
  /** Show staged changes only */
  staged?: boolean;
  /** First ref for comparison (default: working tree) */
  ref1?: string;
  /** Second ref for comparison */
  ref2?: string;
  /** Specific files to diff */
  files?: string[];
  /** Output format */
  format?: 'summary' | 'stat' | 'full';
}

export interface DiffFileStat {
  path: string;
  insertions: number;
  deletions: number;
  binary?: boolean;
}

export interface DiffResult {
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

// ============================================================================
// Log Tool Types
// ============================================================================

export interface LogParams extends BaseToolParams {
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

export interface CommitInfo {
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

export interface LogResult {
  /** List of commits */
  commits: CommitInfo[];
  /** Whether there are more commits beyond limit */
  hasMore: boolean;
}

// ============================================================================
// Commit Tool Types
// ============================================================================

export interface CommitParams extends BaseToolParams {
  /** Commit message (required) */
  message: string;
  /** Specific files to commit. If omitted, commits all staged */
  files?: string[];
  /** Amend the previous commit */
  amend?: boolean;
  /** Allow empty commit */
  allowEmpty?: boolean;
}

export interface CommitResult {
  /** Created commit hash */
  hash: string;
  /** Short hash */
  shortHash: string;
  /** Branch name */
  branch: string;
  /** Files committed */
  filesChanged: number;
}

// ============================================================================
// Push Tool Types
// ============================================================================

export interface PushParams extends BaseToolParams {
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

// ============================================================================
// Pull Tool Types
// ============================================================================

export interface PullParams extends BaseToolParams {
  /** Remote name. Default: configured defaultRemote */
  remote?: string;
  /** Branch to pull. Default: current branch's upstream */
  branch?: string;
  /** Rebase instead of merge */
  rebase?: boolean;
  /** Auto-stash before pull */
  autostash?: boolean;
}

// ============================================================================
// Checkout Tool Types
// ============================================================================

export interface CheckoutParams extends BaseToolParams {
  /** Branch, commit, or file path to checkout */
  ref: string;
  /** Create new branch */
  create?: boolean;
  /** Force checkout (discard local changes) */
  force?: boolean;
  /** Checkout specific files only */
  files?: string[];
}

// ============================================================================
// Branch Tool Types
// ============================================================================

export interface BranchParams extends BaseToolParams {
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

export interface BranchInfo {
  /** Branch name */
  name: string;
  /** Whether this is the current branch */
  current: boolean;
  /** Whether this is a remote branch */
  remote: boolean;
  /** Upstream branch if tracking */
  upstream?: string;
  /** Latest commit hash */
  commit: string;
}

export interface BranchListResult {
  /** List of branches */
  branches: BranchInfo[];
  /** Current branch name */
  current: string;
}

// ============================================================================
// Stash Tool Types
// ============================================================================

export interface StashParams extends BaseToolParams {
  /** Action to perform */
  action: 'push' | 'pop' | 'apply' | 'drop' | 'list' | 'show';
  /** Stash message (for push) */
  message?: string;
  /** Stash index (for pop/apply/drop/show). Default: 0 */
  index?: number;
  /** Include untracked files (for push) */
  includeUntracked?: boolean;
}

export interface StashEntry {
  /** Stash index */
  index: number;
  /** Stash message */
  message: string;
  /** Branch where stash was created */
  branch: string;
}

export interface StashListResult {
  /** List of stash entries */
  entries: StashEntry[];
}

// ============================================================================
// Blame Tool Types
// ============================================================================

export interface BlameParams extends BaseToolParams {
  /** File to blame (required) */
  file: string;
  /** Line range: [start, end] */
  lines?: [number, number];
  /** Rev to blame from. Default: HEAD */
  rev?: string;
}

export interface BlameLine {
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

export interface BlameResult {
  /** Blame information per line */
  lines: BlameLine[];
}

// ============================================================================
// Merge Tool Types
// ============================================================================

export interface MergeParams extends BaseToolParams {
  /** Branch to merge in (required) */
  branch: string;
  /** Don't auto-commit the merge */
  noCommit?: boolean;
  /** Merge strategy */
  strategy?: 'ours' | 'theirs' | 'recursive';
  /** Squash commits */
  squash?: boolean;
}

// ============================================================================
// Rebase Tool Types
// ============================================================================

export interface RebaseParams extends BaseToolParams {
  /** Branch or commit to rebase onto (required for start) */
  onto?: string;
  /** Abort current rebase */
  abort?: boolean;
  /** Continue after resolving conflicts */
  continue?: boolean;
  /** Skip current commit */
  skip?: boolean;
}

// ============================================================================
// Conflict Types
// ============================================================================

export interface ConflictInfo {
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

// ============================================================================
// Escalation Types
// ============================================================================

export interface ForcePushEscalation {
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

export interface EscalationResponse {
  approved: boolean;
  approver?: string;
  reason?: string;
}

// ============================================================================
// Exec Types
// ============================================================================

export interface ExecGitOptions {
  cwd?: string;
  timeout?: number;
  env?: Record<string, string>;
}

export interface ExecGitResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  command: string;
}
