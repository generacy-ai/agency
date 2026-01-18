/**
 * @generacy-ai/agency-plugin-git
 *
 * Git operations plugin providing source control tools for agents.
 *
 * Tools:
 * - source_control.status - Get working tree status
 * - source_control.diff - Show changes
 * - source_control.log - View commit history
 * - source_control.commit - Create a commit
 * - source_control.push - Push to remote
 * - source_control.pull - Pull from remote
 * - source_control.checkout - Switch branches or restore files
 * - source_control.branch - Create, list, or delete branches
 * - source_control.stash - Stash/unstash changes
 * - source_control.blame - Show line-by-line authorship
 * - source_control.merge - Merge branches
 * - source_control.rebase - Rebase current branch
 */

// Plugin
export { GitPlugin, createGitPlugin } from './plugin.js';

// Configuration
export { type GitPluginConfig, DEFAULT_CONFIG, resolveConfig } from './config.js';

// Types
export type {
  // Base
  BaseToolParams,
  ExecGitOptions,
  ExecGitResult,
  // Status
  StatusParams,
  StatusResult,
  FileChange,
  // Diff
  DiffParams,
  DiffResult,
  DiffFileStat,
  // Log
  LogParams,
  LogResult,
  CommitInfo,
  // Commit
  CommitParams,
  CommitResult,
  // Push
  PushParams,
  // Pull
  PullParams,
  // Checkout
  CheckoutParams,
  // Branch
  BranchParams,
  BranchInfo,
  BranchListResult,
  // Stash
  StashParams,
  StashEntry,
  StashListResult,
  // Blame
  BlameParams,
  BlameResult,
  BlameLine,
  // Merge
  MergeParams,
  // Rebase
  RebaseParams,
  // Conflicts
  ConflictInfo,
  // Escalation
  ForcePushEscalation,
  EscalationResponse,
} from './types.js';

// Errors
export {
  GitError,
  AuthError,
  NetworkError,
  ConflictError,
  DetachedHeadError,
} from './errors/index.js';

// Default export for plugin
import { GitPlugin } from './plugin.js';
export default GitPlugin;
