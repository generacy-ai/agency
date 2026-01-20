/**
 * source_control.status tool
 *
 * Get working tree status with structured output.
 */

import type { AgencyTool, ToolResult } from '@generacy-ai/agency';
import { TerseOutput, terseToMcpToolResult } from '@generacy-ai/agency';
import type { GitPluginConfig } from '../config.js';
import type { StatusParams, StatusResult } from '../types.js';
import { execGitOrThrow } from '../utils/exec-git.js';
import { parseStatus } from '../utils/parse-status.js';

export function createStatusTool(config: GitPluginConfig): AgencyTool {
  return {
    name: 'source_control.status',
    description: 'Get working tree status',
    namespace: 'source_control',
    outputPattern: 'terse',
    modes: ['default', 'research', 'coding', 'review'],
    inputSchema: {
      type: 'object',
      properties: {
        cwd: {
          type: 'string',
          description: 'Working directory. Defaults to current directory.',
        },
      },
    },

    async execute(params: unknown): Promise<ToolResult> {
      const { cwd } = (params as StatusParams) || {};

      try {
        const result = await execGitOrThrow(
          ['status', '--porcelain=v2', '--branch'],
          { cwd, timeout: config.timeout }
        );

        const status = parseStatus(result.stdout);
        const summary = formatStatusSummary(status);

        return terseToMcpToolResult(
          TerseOutput.success(JSON.stringify({ ...status, summary }))
        );
      } catch (error) {
        return terseToMcpToolResult(
          TerseOutput.failure(error instanceof Error ? error : String(error))
        );
      }
    },
  };
}

function formatStatusSummary(status: StatusResult): string {
  const parts: string[] = [];

  if (status.branch) {
    parts.push(`On branch ${status.branch}`);
  }

  if (status.upstream) {
    if (status.ahead > 0 && status.behind > 0) {
      parts.push(`diverged from ${status.upstream} (+${status.ahead}/-${status.behind})`);
    } else if (status.ahead > 0) {
      parts.push(`ahead of ${status.upstream} by ${status.ahead}`);
    } else if (status.behind > 0) {
      parts.push(`behind ${status.upstream} by ${status.behind}`);
    }
  }

  const changes: string[] = [];
  if (status.staged.length > 0) {
    changes.push(`${status.staged.length} staged`);
  }
  if (status.unstaged.length > 0) {
    changes.push(`${status.unstaged.length} modified`);
  }
  if (status.untracked.length > 0) {
    changes.push(`${status.untracked.length} untracked`);
  }
  if (status.conflicts.length > 0) {
    changes.push(`${status.conflicts.length} conflicts`);
  }

  if (changes.length > 0) {
    parts.push(changes.join(', '));
  } else {
    parts.push('working tree clean');
  }

  return parts.join('. ');
}
