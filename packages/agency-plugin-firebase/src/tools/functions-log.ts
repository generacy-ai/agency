/**
 * Firebase Functions Log Tool
 *
 * Views Firebase Functions logs with configurable options.
 */

import type { AgencyTool, ToolResult, ToolContent } from '@generacy-ai/agency';
import { TerseOutput } from '@generacy-ai/agency';
import { z } from 'zod';
import { FunctionsLogParamsSchema } from '../config/schema.js';
import { execSync } from 'node:child_process';
import type { FirebasePluginConfig } from '../config/types.js';

/**
 * Default number of log lines to retrieve
 */
const DEFAULT_LINES = 20;

/**
 * Functions log parameters type
 */
export type FunctionsLogParams = z.infer<typeof FunctionsLogParamsSchema>;

/**
 * Create the functions-log tool
 *
 * @param config - Plugin configuration
 * @returns AgencyTool implementation
 */
export function createFunctionsLogTool(config: FirebasePluginConfig): AgencyTool {
  return {
    name: 'run.firebase_functions_log',
    description: 'View Firebase Functions logs',
    namespace: 'run',
    outputPattern: 'terse',
    modes: ['debug'],
    inputSchema: {
      type: 'object',
      properties: {
        only: {
          type: 'array',
          items: {
            type: 'string',
          },
          description: 'Specific function names to filter logs',
        },
        lines: {
          type: 'number',
          description: 'Number of log lines to retrieve (default: 20, max: 1000)',
        },
      },
    },

    async execute(params: unknown): Promise<ToolResult> {
      try {
        // Validate parameters
        const parsed = FunctionsLogParamsSchema.parse(params);

        // Build command arguments
        const args = ['functions:log'];

        // Filter by function names
        if (parsed.only && parsed.only.length > 0) {
          args.push('--only', parsed.only.join(','));
        }

        // Number of lines
        const lines = parsed.lines ?? DEFAULT_LINES;
        args.push('--lines', String(lines));

        // Project ID
        if (config.project) {
          args.push('--project', config.project);
        }

        // Execute the command
        const command = `firebase ${args.join(' ')}`;
        const output = execSync(command, { encoding: 'utf-8' });

        const result = TerseOutput.success(output.trim());
        const content: ToolContent[] = [{ type: 'text', text: result.output }];
        return { content, isError: false };
      } catch (error) {
        const result = TerseOutput.failure(error instanceof Error ? error : String(error));
        const content: ToolContent[] = [{ type: 'text', text: result.output }];
        return { content, isError: true };
      }
    },
  };
}
