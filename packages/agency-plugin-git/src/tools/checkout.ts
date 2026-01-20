/**
 * source_control.checkout tool
 *
 * Switch branches or restore files.
 */

import type { AgencyTool, ToolResult } from '@generacy-ai/agency';
import { TerseOutput, terseToMcpToolResult } from '@generacy-ai/agency';
import type { GitPluginConfig } from '../config.js';
import type { CheckoutParams } from '../types.js';
import { execGitOrThrow, execGit } from '../utils/exec-git.js';

export function createCheckoutTool(config: GitPluginConfig): AgencyTool {
  return {
    name: 'source_control.checkout',
    description: 'Switch branches or restore files',
    namespace: 'source_control',
    outputPattern: 'terse',
    modes: ['default', 'coding'],
    inputSchema: {
      type: 'object',
      properties: {
        cwd: {
          type: 'string',
          description: 'Working directory',
        },
        ref: {
          type: 'string',
          description: 'Branch, commit, or file path to checkout (required)',
        },
        create: {
          type: 'boolean',
          description: 'Create new branch',
        },
        force: {
          type: 'boolean',
          description: 'Force checkout (discard local changes)',
        },
        files: {
          type: 'array',
          items: { type: 'string' },
          description: 'Checkout specific files only',
        },
      },
      required: ['ref'],
    },

    async execute(params: unknown): Promise<ToolResult> {
      const {
        cwd,
        ref,
        create = false,
        force = false,
        files,
      } = (params as CheckoutParams) || {};

      if (!ref) {
        return terseToMcpToolResult(
          TerseOutput.failure('ref parameter is required')
        );
      }

      try {
        const args: string[] = ['checkout'];

        if (create) {
          args.push('-b');
        }

        if (force) {
          args.push('-f');
        }

        args.push(ref);

        if (files && files.length > 0) {
          args.push('--', ...files);
        }

        await execGitOrThrow(args, { cwd, timeout: config.timeout });

        // Get current state
        const branchResult = await execGit(
          ['rev-parse', '--abbrev-ref', 'HEAD'],
          { cwd, timeout: config.timeout }
        );

        const currentBranch = branchResult.stdout.trim();
        const isDetached = currentBranch === 'HEAD';

        let summary: string;
        if (files && files.length > 0) {
          summary = `Restored ${files.length} file(s) from ${ref}`;
        } else if (create) {
          summary = `Created and switched to branch '${ref}'`;
        } else if (isDetached) {
          const hashResult = await execGit(
            ['rev-parse', '--short', 'HEAD'],
            { cwd, timeout: config.timeout }
          );
          summary = `HEAD detached at ${hashResult.stdout.trim()}`;
        } else {
          summary = `Switched to branch '${currentBranch}'`;
        }

        return terseToMcpToolResult(
          TerseOutput.success(
            JSON.stringify({
              success: true,
              ref,
              branch: isDetached ? null : currentBranch,
              detached: isDetached,
              created: create,
              files: files ?? [],
              summary,
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
