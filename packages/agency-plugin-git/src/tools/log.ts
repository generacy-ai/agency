/**
 * source_control.log tool
 *
 * View commit history with structured output.
 */

import type { AgencyTool, ToolResult } from '@generacy-ai/agency';
import { TerseOutput, terseToMcpToolResult } from '@generacy-ai/agency';
import type { GitPluginConfig } from '../config.js';
import type { LogParams } from '../types.js';
import { execGitOrThrow } from '../utils/exec-git.js';
import { parseLog, LOG_FORMAT, formatLogList } from '../utils/parse-log.js';

export function createLogTool(config: GitPluginConfig): AgencyTool {
  return {
    name: 'source_control.log',
    description: 'View commit history',
    namespace: 'source_control',
    outputPattern: 'terse',
    modes: ['research', 'coding', 'review'],
    inputSchema: {
      type: 'object',
      properties: {
        cwd: {
          type: 'string',
          description: 'Working directory',
        },
        limit: {
          type: 'number',
          description: 'Maximum commits to return (default: 10)',
        },
        ref: {
          type: 'string',
          description: 'Starting ref (default: HEAD)',
        },
        file: {
          type: 'string',
          description: 'Show commits for specific file',
        },
        author: {
          type: 'string',
          description: 'Filter by author (email or name pattern)',
        },
        since: {
          type: 'string',
          description: 'Show commits since date (ISO format)',
        },
        until: {
          type: 'string',
          description: 'Show commits until date (ISO format)',
        },
      },
    },

    async execute(params: unknown): Promise<ToolResult> {
      const {
        cwd,
        limit = 10,
        ref,
        file,
        author,
        since,
        until,
      } = (params as LogParams) || {};

      try {
        const args: string[] = [
          'log',
          `--format=format:${LOG_FORMAT}`,
          `-n${limit + 1}`, // +1 to detect hasMore
        ];

        if (ref) {
          args.push(ref);
        }

        if (author) {
          args.push(`--author=${author}`);
        }

        if (since) {
          args.push(`--since=${since}`);
        }

        if (until) {
          args.push(`--until=${until}`);
        }

        if (file) {
          args.push('--', file);
        }

        const result = await execGitOrThrow(args, { cwd, timeout: config.timeout });

        const logResult = parseLog(result.stdout, limit);

        // Trim to actual limit
        if (logResult.commits.length > limit) {
          logResult.commits = logResult.commits.slice(0, limit);
          logResult.hasMore = true;
        }

        const summary = formatLogList(logResult);

        return terseToMcpToolResult(
          TerseOutput.success(
            JSON.stringify({
              ...logResult,
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
