/**
 * git_ops tool implementation for spec-kit
 *
 * Provides git operations for spec-kit workflows including
 * create_branch, checkout, fetch, status, and current_branch.
 */

import type { AgencyTool, ToolResult } from '@generacy-ai/agency';
import { createError } from '../types/errors.js';
import { findRepoRoot, RepoNotFoundError } from '../utils/index.js';

/**
 * Git operations supported by this tool
 */
type GitOperation =
  | 'create_branch'
  | 'checkout'
  | 'fetch'
  | 'status'
  | 'current_branch';

/**
 * Parameters for the git_ops tool
 */
interface GitOpsParams {
  /** Git operation to perform */
  operation: GitOperation;
  /** Branch name (required for create_branch and checkout) */
  branch_name?: string;
  /** Working directory (defaults to process.cwd()) */
  cwd?: string;
  /** Whether to fetch all remotes (for fetch operation) */
  fetch_all?: boolean;
  /** Whether to prune deleted remote branches (for fetch) */
  prune?: boolean;
}

/**
 * Result type for current_branch operation
 */
interface CurrentBranchResult {
  success: true;
  branch: string;
}

/**
 * Result type for status operation
 */
interface StatusResult {
  success: true;
  clean: boolean;
  staged: string[];
  unstaged: string[];
  untracked: string[];
}

/**
 * Result type for checkout operation
 */
interface CheckoutResult {
  success: true;
  branch: string;
}

/**
 * Result type for create_branch operation
 */
interface CreateBranchResult {
  success: true;
  branch: string;
}

/**
 * Result type for fetch operation
 */
interface FetchResult {
  success: true;
  fetched: boolean;
}

/**
 * Validate that branch_name is provided for operations that require it
 */
function validateBranchName(
  operation: GitOperation,
  branchName: string | undefined
): string | null {
  if (operation === 'create_branch' || operation === 'checkout') {
    if (!branchName || branchName.trim() === '') {
      return `branch_name is required for ${operation} operation`;
    }
  }
  return null;
}

/**
 * Execute current_branch operation
 */
async function executeCurrentBranch(
  repoPath: string
): Promise<CurrentBranchResult> {
  const { simpleGit } = await import('simple-git');
  const git = simpleGit(repoPath);
  const branch = await git.revparse(['--abbrev-ref', 'HEAD']);
  return {
    success: true,
    branch: branch.trim(),
  };
}

/**
 * Execute status operation
 */
async function executeStatus(repoPath: string): Promise<StatusResult> {
  const { simpleGit } = await import('simple-git');
  const git = simpleGit(repoPath);
  const status = await git.status();

  return {
    success: true,
    clean: status.isClean(),
    staged: status.staged,
    unstaged: status.modified.filter((f) => !status.staged.includes(f)),
    untracked: status.not_added,
  };
}

/**
 * Execute checkout operation
 */
async function executeCheckout(
  repoPath: string,
  branchName: string
): Promise<CheckoutResult> {
  const { simpleGit } = await import('simple-git');
  const git = simpleGit(repoPath);
  await git.checkout(branchName);
  return {
    success: true,
    branch: branchName,
  };
}

/**
 * Execute create_branch operation
 */
async function executeCreateBranch(
  repoPath: string,
  branchName: string
): Promise<CreateBranchResult> {
  const { simpleGit } = await import('simple-git');
  const git = simpleGit(repoPath);
  await git.checkoutLocalBranch(branchName);
  return {
    success: true,
    branch: branchName,
  };
}

/**
 * Execute fetch operation
 */
async function executeFetch(
  repoPath: string,
  fetchAll: boolean,
  prune: boolean
): Promise<FetchResult> {
  const { simpleGit } = await import('simple-git');
  const git = simpleGit(repoPath);

  const options: string[] = [];
  if (fetchAll) {
    options.push('--all');
  }
  if (prune) {
    options.push('--prune');
  }

  await git.fetch(options);
  return {
    success: true,
    fetched: true,
  };
}

/**
 * Create the spec_kit.git_ops tool.
 *
 * This tool provides git operations for spec-kit workflows:
 * - create_branch: Create and checkout a new branch
 * - checkout: Switch to an existing branch
 * - fetch: Fetch from remotes with optional prune
 * - status: Get working directory status
 * - current_branch: Get current branch name
 *
 * @returns AgencyTool instance
 */
export function createGitOpsTool(): AgencyTool {
  return {
    name: 'spec_kit.git_ops',
    description:
      'Perform git operations (create_branch, checkout, fetch, status, current_branch)',
    namespace: 'spec_kit',
    outputPattern: 'terse',
    modes: ['coding', 'research'],
    inputSchema: {
      type: 'object',
      properties: {
        operation: {
          type: 'string',
          enum: ['create_branch', 'checkout', 'fetch', 'status', 'current_branch'],
          description: 'Git operation to perform',
        },
        branch_name: {
          type: 'string',
          description: 'Branch name (required for create_branch and checkout)',
        },
        cwd: {
          type: 'string',
          description: 'Working directory (defaults to process.cwd())',
        },
        fetch_all: {
          type: 'boolean',
          default: true,
          description: 'Whether to fetch all remotes (for fetch operation)',
        },
        prune: {
          type: 'boolean',
          default: true,
          description: 'Whether to prune deleted remote branches (for fetch)',
        },
      },
      required: ['operation'],
    },
    async execute(params: unknown): Promise<ToolResult> {
      const {
        operation,
        branch_name,
        cwd,
        fetch_all = true,
        prune = true,
      } = (params || {}) as GitOpsParams;

      // Resolve working directory
      const workDir = cwd || process.cwd();

      // Find repository root
      let repoRoot: string;
      try {
        repoRoot = await findRepoRoot(workDir);
      } catch (error) {
        if (error instanceof RepoNotFoundError) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  success: false,
                  error: createError(
                    'GIT_NOT_INITIALIZED',
                    'Could not find git repository root'
                  ),
                }),
              },
            ],
          };
        }
        throw error;
      }

      // Validate branch_name for operations that require it
      const validationError = validateBranchName(operation, branch_name);
      if (validationError) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: false,
                error: createError('GIT_OPERATION_FAILED', validationError),
              }),
            },
          ],
        };
      }

      try {
        let result:
          | CurrentBranchResult
          | StatusResult
          | CheckoutResult
          | CreateBranchResult
          | FetchResult;

        switch (operation) {
          case 'current_branch':
            result = await executeCurrentBranch(repoRoot);
            break;

          case 'status':
            result = await executeStatus(repoRoot);
            break;

          case 'checkout':
            result = await executeCheckout(repoRoot, branch_name!);
            break;

          case 'create_branch':
            result = await executeCreateBranch(repoRoot, branch_name!);
            break;

          case 'fetch':
            result = await executeFetch(repoRoot, fetch_all, prune);
            break;

          default: {
            // This should never happen due to schema validation
            const _exhaustive: never = operation;
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({
                    success: false,
                    error: createError(
                      'GIT_OPERATION_FAILED',
                      `Unknown operation: ${_exhaustive}`
                    ),
                  }),
                },
              ],
            };
          }
        }

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result),
            },
          ],
        };
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Unknown error occurred';
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: false,
                error: createError('GIT_OPERATION_FAILED', message, {
                  operation,
                  ...(branch_name ? { branch_name } : {}),
                }),
              }),
            },
          ],
        };
      }
    },
  };
}
