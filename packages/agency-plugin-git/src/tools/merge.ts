/**
 * source_control.merge tool
 *
 * Merge branches with conflict detection.
 */

import type { AgencyTool, ToolResult } from '@generacy-ai/agency';
import { TerseOutput, terseToMcpToolResult } from '@generacy-ai/agency';
import type { GitPluginConfig } from '../config.js';
import type { MergeParams } from '../types.js';
import { execGit, classifyError } from '../utils/exec-git.js';
import { parseConflictsFromFiles, getConflictedFilesFromStatus } from '../utils/conflict-parser.js';
import { ConflictError } from '../errors/index.js';

export function createMergeTool(config: GitPluginConfig): AgencyTool {
  return {
    name: 'source_control.merge',
    description: 'Merge branches',
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
        branch: {
          type: 'string',
          description: 'Branch to merge (required)',
        },
        noCommit: {
          type: 'boolean',
          description: "Don't auto-commit the merge",
        },
        strategy: {
          type: 'string',
          enum: ['ours', 'theirs', 'recursive'],
          description: 'Merge strategy',
        },
        squash: {
          type: 'boolean',
          description: 'Squash commits',
        },
      },
      required: ['branch'],
    },

    async execute(params: unknown): Promise<ToolResult> {
      const {
        cwd,
        branch,
        noCommit = false,
        strategy,
        squash = false,
      } = (params as MergeParams) || {};

      if (!branch) {
        return terseToMcpToolResult(
          TerseOutput.failure('branch parameter is required')
        );
      }

      try {
        const args: string[] = ['merge'];

        if (noCommit) {
          args.push('--no-commit');
        }

        if (strategy) {
          args.push('-s', strategy);
        }

        if (squash) {
          args.push('--squash');
        }

        args.push(branch);

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

            throw new ConflictError(`Merge conflict with ${branch}`, {
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
          summary = `Fast-forward merge of '${branch}'`;
        } else if (squash) {
          summary = `Squash merged '${branch}'${noCommit ? ' (not committed)' : ''}`;
        } else {
          summary = `Merged '${branch}'${noCommit ? ' (not committed)' : ''}`;
        }

        return terseToMcpToolResult(
          TerseOutput.success(
            JSON.stringify({
              success: true,
              branch,
              upToDate: isUpToDate,
              fastForward: isFastForward,
              squash,
              noCommit,
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
                branch,
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
