/**
 * source_control.rebase tool
 *
 * Rebase current branch with conflict handling.
 */

import type { AgencyTool, ToolResult } from '@generacy-ai/agency';
import { TerseOutput, terseToMcpToolResult } from '@generacy-ai/agency';
import type { GitPluginConfig } from '../config.js';
import type { RebaseParams } from '../types.js';
import { execGit, classifyError } from '../utils/exec-git.js';
import { parseConflictsFromFiles, getConflictedFilesFromStatus } from '../utils/conflict-parser.js';
import { ConflictError } from '../errors/index.js';

export function createRebaseTool(config: GitPluginConfig): AgencyTool {
  return {
    name: 'source_control.rebase',
    description: 'Rebase current branch',
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
        onto: {
          type: 'string',
          description: 'Branch or commit to rebase onto',
        },
        abort: {
          type: 'boolean',
          description: 'Abort current rebase',
        },
        continue: {
          type: 'boolean',
          description: 'Continue after resolving conflicts',
        },
        skip: {
          type: 'boolean',
          description: 'Skip current commit',
        },
      },
    },

    async execute(params: unknown): Promise<ToolResult> {
      const {
        cwd,
        onto,
        abort = false,
        continue: continueRebase = false,
        skip = false,
      } = (params as RebaseParams) || {};

      try {
        // Handle control operations
        if (abort) {
          return await abortRebase(cwd, config);
        }

        if (continueRebase) {
          return await continueRebaseOp(cwd, config);
        }

        if (skip) {
          return await skipRebase(cwd, config);
        }

        // Start rebase
        if (!onto) {
          return terseToMcpToolResult(
            TerseOutput.failure('onto parameter is required to start rebase')
          );
        }

        const args = ['rebase', onto];
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

            throw new ConflictError(`Rebase conflict onto ${onto}`, {
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

        const isUpToDate = result.stdout.includes('is up to date');

        return terseToMcpToolResult(
          TerseOutput.success(
            JSON.stringify({
              success: true,
              onto,
              upToDate: isUpToDate,
              summary: isUpToDate
                ? 'Already up to date'
                : `Rebased onto '${onto}'`,
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
                onto,
                conflicts: error.conflicts,
                hint: 'Resolve conflicts and run rebase with continue: true, or abort: true to cancel',
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

async function abortRebase(
  cwd: string | undefined,
  config: GitPluginConfig
): Promise<ToolResult> {
  const result = await execGit(['rebase', '--abort'], { cwd, timeout: config.timeout });

  if (result.exitCode !== 0 && !result.stderr.includes('No rebase in progress')) {
    return terseToMcpToolResult(
      TerseOutput.failure(result.stderr || 'Failed to abort rebase')
    );
  }

  return terseToMcpToolResult(
    TerseOutput.success(
      JSON.stringify({
        success: true,
        action: 'abort',
        summary: 'Rebase aborted',
      })
    )
  );
}

async function continueRebaseOp(
  cwd: string | undefined,
  config: GitPluginConfig
): Promise<ToolResult> {
  const result = await execGit(['rebase', '--continue'], { cwd, timeout: config.timeout });

  if (result.exitCode !== 0) {
    // Check if still in conflict
    const statusResult = await execGit(
      ['status', '--porcelain=v2'],
      { cwd, timeout: config.timeout }
    );

    const conflictedFiles = getConflictedFilesFromStatus(statusResult.stdout);

    if (conflictedFiles.length > 0) {
      const conflicts = await parseConflictsFromFiles(conflictedFiles, cwd);

      return terseToMcpToolResult(
        TerseOutput.failure(
          JSON.stringify({
            error: 'conflict',
            message: 'Conflicts remain after continue',
            conflicts,
          })
        )
      );
    }

    return terseToMcpToolResult(
      TerseOutput.failure(result.stderr || 'Failed to continue rebase')
    );
  }

  return terseToMcpToolResult(
    TerseOutput.success(
      JSON.stringify({
        success: true,
        action: 'continue',
        summary: 'Rebase continued',
      })
    )
  );
}

async function skipRebase(
  cwd: string | undefined,
  config: GitPluginConfig
): Promise<ToolResult> {
  const result = await execGit(['rebase', '--skip'], { cwd, timeout: config.timeout });

  if (result.exitCode !== 0) {
    return terseToMcpToolResult(
      TerseOutput.failure(result.stderr || 'Failed to skip commit')
    );
  }

  return terseToMcpToolResult(
    TerseOutput.success(
      JSON.stringify({
        success: true,
        action: 'skip',
        summary: 'Skipped current commit',
      })
    )
  );
}
