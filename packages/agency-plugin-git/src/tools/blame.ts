/**
 * source_control.blame tool
 *
 * Show line-by-line authorship.
 */

import type { AgencyTool, ToolResult } from '@generacy-ai/agency';
import { TerseOutput, terseToMcpToolResult } from '@generacy-ai/agency';
import type { GitPluginConfig } from '../config.js';
import type { BlameParams } from '../types.js';
import { execGitOrThrow } from '../utils/exec-git.js';
import { parseBlame, formatBlame } from '../utils/parse-blame.js';

export function createBlameTool(config: GitPluginConfig): AgencyTool {
  return {
    name: 'source_control.blame',
    description: 'Show line-by-line authorship',
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
        file: {
          type: 'string',
          description: 'File to blame (required)',
        },
        lines: {
          type: 'array',
          items: { type: 'number' },
          description: 'Line range [start, end]',
        },
        rev: {
          type: 'string',
          description: 'Revision to blame from (default: HEAD)',
        },
      },
      required: ['file'],
    },

    async execute(params: unknown): Promise<ToolResult> {
      const { cwd, file, lines, rev } = (params as BlameParams) || {};

      if (!file) {
        return terseToMcpToolResult(
          TerseOutput.failure('file parameter is required')
        );
      }

      try {
        const args: string[] = ['blame', '--porcelain'];

        if (lines && lines.length === 2) {
          args.push(`-L${lines[0]},${lines[1]}`);
        }

        if (rev) {
          args.push(rev);
        }

        args.push('--', file);

        const result = await execGitOrThrow(args, { cwd, timeout: config.timeout });

        const blameResult = parseBlame(result.stdout);
        const summary = formatBlame(blameResult, false);

        return terseToMcpToolResult(
          TerseOutput.success(
            JSON.stringify({
              ...blameResult,
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
