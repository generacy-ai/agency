/**
 * source_control.pull tool
 *
 * Pull from remote with conflict detection.
 */

import type { AgencyTool, ToolResult } from '@generacy-ai/agency';
import { TerseOutput, terseToMcpToolResult } from '@generacy-ai/agency';
import type { GitPluginConfig } from '../config.js';
import type { PullParams } from '../types.js';
import { execGit, classifyError } from '../utils/exec-git.js';
import { parseConflictsFromFiles, getConflictedFilesFromStatus } from '../utils/conflict-parser.js';
import { ConflictError } from '../errors/index.js';

export function createPullTool(config: GitPluginConfig): AgencyTool {
  return {
    name: 'source_control.pull',
    description: 'Pull from remote',
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
        remote: {
          type: 'string',
          description: `Remote name (default: ${config.defaultRemote})`,
        },
        branch: {
          type: 'string',
          description: 'Branch to pull (default: current tracking branch)',
        },
        rebase: {
          type: 'boolean',
          description: 'Rebase instead of merge',
        },
        autostash: {
          type: 'boolean',
          description: 'Auto-stash before pull',
        },
      },
    },

    async execute(params: unknown): Promise<ToolResult> {
      const {
        cwd,
        remote = config.defaultRemote,
        branch,
        rebase = false,
        autostash = false,
      } = (params as PullParams) || {};

      try {
        const args: string[] = ['pull'];

        if (rebase) {
          args.push('--rebase');
        }

        if (autostash) {
          args.push('--autostash');
        }

        args.push(remote);

        if (branch) {
          args.push(branch);
        }

        const result = await execGit(args, { cwd, timeout: config.timeout });

        if (result.exitCode !== 0) {
          // Check for conflicts
          const statusResult = await execGit(
            ['status', '--porcelain=v2'],
            { cwd, timeout: config.timeout }
          );

          const conflictedFiles = getConflictedFilesFromStatus(statusResult.stdout);

          if (conflictedFiles.length > 0) {
            const conflicts = await parseConflictsFromFiles(conflictedFiles, cwd);

            throw new ConflictError('Pull resulted in conflicts', {
              command: result.command,
              exitCode: result.exitCode,
              stderr: result.stderr,
              cwd: cwd ?? process.cwd(),
              conflicts,
            });
          }

          // Other error
          throw classifyError(result, cwd ?? process.cwd());
        }

        // Parse result
        const isUpToDate = result.stdout.includes('Already up to date');
        const isFastForward = result.stdout.includes('Fast-forward');

        let summary: string;
        if (isUpToDate) {
          summary = 'Already up to date';
        } else if (isFastForward) {
          summary = `Fast-forward merge from ${remote}${branch ? `/${branch}` : ''}`;
        } else if (rebase) {
          summary = `Rebased onto ${remote}${branch ? `/${branch}` : ''}`;
        } else {
          summary = `Merged from ${remote}${branch ? `/${branch}` : ''}`;
        }

        return terseToMcpToolResult(
          TerseOutput.success(
            JSON.stringify({
              success: true,
              remote,
              branch: branch ?? 'tracking',
              rebase,
              upToDate: isUpToDate,
              fastForward: isFastForward,
              summary,
            })
          )
        );
      } catch (error) {
        if (error instanceof ConflictError) {
          return terseToMcpToolResult(
            TerseOutput.failure(
              JSON.stringify({
                error: 'conflict',
                message: error.message,
                conflicts: error.conflicts,
              })
            )
          );
        }

        return terseToMcpToolResult(
          TerseOutput.failure(error instanceof Error ? error : String(error))
        );
      }
    },
  };
}
