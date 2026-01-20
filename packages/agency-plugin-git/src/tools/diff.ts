/**
 * source_control.diff tool
 *
 * Show changes (staged, unstaged, or between refs).
 */

import type { AgencyTool, ToolResult } from '@generacy-ai/agency';
import { TerseOutput, terseToMcpToolResult } from '@generacy-ai/agency';
import type { GitPluginConfig } from '../config.js';
import type { DiffParams, DiffResult } from '../types.js';
import { execGitOrThrow } from '../utils/exec-git.js';
import { parseDiffNumstat, formatDiffSummary } from '../utils/parse-diff.js';

export function createDiffTool(config: GitPluginConfig): AgencyTool {
  return {
    name: 'source_control.diff',
    description: 'Show changes (staged, unstaged, or between refs)',
    namespace: 'source_control',
    outputPattern: 'terse',
    modes: ['default', 'research', 'coding', 'review'],
    inputSchema: {
      type: 'object',
      properties: {
        cwd: {
          type: 'string',
          description: 'Working directory',
        },
        staged: {
          type: 'boolean',
          description: 'Show staged changes only',
        },
        ref1: {
          type: 'string',
          description: 'First ref for comparison (default: working tree)',
        },
        ref2: {
          type: 'string',
          description: 'Second ref for comparison',
        },
        files: {
          type: 'array',
          items: { type: 'string' },
          description: 'Specific files to diff',
        },
        format: {
          type: 'string',
          enum: ['summary', 'stat', 'full'],
          description: 'Output format (default: summary)',
        },
      },
    },

    async execute(params: unknown): Promise<ToolResult> {
      const {
        cwd,
        staged = false,
        ref1,
        ref2,
        files,
        format = 'summary',
      } = (params as DiffParams) || {};

      try {
        // Build args based on mode
        const args: string[] = ['diff'];

        if (format !== 'full') {
          args.push('--numstat');
        }

        if (staged) {
          args.push('--cached');
        }

        if (ref1) {
          args.push(ref1);
        }
        if (ref2) {
          args.push(ref2);
        }

        if (files && files.length > 0) {
          args.push('--', ...files);
        }

        const result = await execGitOrThrow(args, { cwd, timeout: config.timeout });

        if (format === 'full') {
          // For full format, return the raw diff
          const diffResult: DiffResult = {
            filesChanged: 0,
            insertions: 0,
            deletions: 0,
            patch: result.stdout,
          };

          // Get stats separately
          const statsResult = await execGitOrThrow(
            [...args.filter((a) => a !== '--numstat'), '--numstat'],
            { cwd, timeout: config.timeout }
          );
          const stats = parseDiffNumstat(statsResult.stdout);
          diffResult.filesChanged = stats.filesChanged;
          diffResult.insertions = stats.insertions;
          diffResult.deletions = stats.deletions;

          return terseToMcpToolResult(
            TerseOutput.success(JSON.stringify(diffResult))
          );
        }

        const diffResult = parseDiffNumstat(result.stdout);
        const summary = formatDiffSummary(diffResult);

        return terseToMcpToolResult(
          TerseOutput.success(
            JSON.stringify({
              ...diffResult,
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
