/**
 * source_control.commit tool
 *
 * Create a commit with structured output.
 */

import type { AgencyTool, ToolResult } from '@generacy-ai/agency';
import { TerseOutput, terseToMcpToolResult } from '@generacy-ai/agency';
import type { GitPluginConfig } from '../config.js';
import type { CommitParams, CommitResult } from '../types.js';
import { execGitOrThrow, execGit } from '../utils/exec-git.js';

export function createCommitTool(config: GitPluginConfig): AgencyTool {
  return {
    name: 'source_control.commit',
    description: 'Create a commit',
    namespace: 'source_control',
    outputPattern: 'terse',
    modes: ['coding'],
    inputSchema: {
      type: 'object',
      properties: {
        cwd: {
          type: 'string',
          description: 'Working directory',
        },
        message: {
          type: 'string',
          description: 'Commit message (required)',
        },
        files: {
          type: 'array',
          items: { type: 'string' },
          description: 'Specific files to commit. If omitted, commits all staged',
        },
        amend: {
          type: 'boolean',
          description: 'Amend the previous commit',
        },
        allowEmpty: {
          type: 'boolean',
          description: 'Allow empty commit',
        },
      },
      required: ['message'],
    },

    async execute(params: unknown): Promise<ToolResult> {
      const {
        cwd,
        message,
        files,
        amend = false,
        allowEmpty = false,
      } = (params as CommitParams) || {};

      if (!message) {
        return terseToMcpToolResult(
          TerseOutput.failure('message parameter is required')
        );
      }

      try {
        // If files specified, stage them first
        if (files && files.length > 0) {
          await execGitOrThrow(['add', '--', ...files], { cwd, timeout: config.timeout });
        }

        // Build commit args
        const args: string[] = ['commit', '-m', message];

        if (amend) {
          args.push('--amend');
        }

        if (allowEmpty) {
          args.push('--allow-empty');
        }

        if (config.signCommits) {
          args.push('-S');
        }

        await execGitOrThrow(args, { cwd, timeout: config.timeout });

        // Get commit info
        const logResult = await execGit(
          ['log', '-1', '--format=%H%n%h%n%D'],
          { cwd, timeout: config.timeout }
        );

        const [hash, shortHash, refs] = logResult.stdout.split('\n');

        // Extract branch name from refs
        const branchMatch = refs?.match(/HEAD -> ([^,]+)/);
        const branch = branchMatch?.[1] ?? 'HEAD';

        // Get files changed count
        const diffResult = await execGit(
          ['diff-tree', '--no-commit-id', '--name-only', '-r', 'HEAD'],
          { cwd, timeout: config.timeout }
        );
        const filesChanged = diffResult.stdout.split('\n').filter(Boolean).length;

        const result: CommitResult = {
          hash: hash ?? '',
          shortHash: shortHash ?? '',
          branch,
          filesChanged,
        };

        return terseToMcpToolResult(
          TerseOutput.success(
            JSON.stringify({
              ...result,
              summary: `Created commit ${shortHash} on ${branch} (${filesChanged} files)`,
            })
          )
        );
      } catch (error) {
        return terseToMcpToolResult(
          TerseOutput.failure(error instanceof Error ? error : String(error))
        );
      }
    },
  };
}
