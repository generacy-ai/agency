/**
 * Docker Compose Ps tool - run.docker_compose_ps
 *
 * List running services.
 */

import { z } from 'zod';
import type { AgencyTool, ToolResult } from '@generacy-ai/agency';
import { TerseOutput, terseToMcpToolResult } from '@generacy-ai/agency';
import { execDockerCompose } from '../utils/exec.js';
import { formatDockerError } from '../utils/error-classifier.js';

/**
 * Input schema for compose ps
 */
export const composePsSchema = z.object({
  /** Compose file path */
  file: z.string().optional(),

  /** Specific services to list */
  services: z.array(z.string()).optional(),

  /** Output format (table, json) */
  format: z.enum(['table', 'json']).optional(),
});

export type ComposePsParams = z.infer<typeof composePsSchema>;

/**
 * Execute docker compose ps
 */
async function execute(params: unknown): Promise<ToolResult> {
  const parsed = composePsSchema.parse(params);
  const { file, services, format } = parsed;

  const args: string[] = [];

  if (file) {
    args.push('-f', file);
  }

  args.push('ps');

  if (format) {
    args.push('--format', format);
  }

  if (services && services.length > 0) {
    args.push(...services);
  }

  const result = await execDockerCompose(args);

  if (result.success) {
    // Return the actual output showing service status
    const output = result.stdout || '(no services running)';
    return terseToMcpToolResult(TerseOutput.success(output));
  }

  return terseToMcpToolResult(
    TerseOutput.failure(formatDockerError(result.error!))
  );
}

/**
 * Docker Compose Ps tool definition
 */
export const composePsTool: AgencyTool = {
  name: 'run.docker_compose_ps',
  description: 'List Docker Compose services and their status',
  namespace: 'run',
  outputPattern: 'terse',
  inputSchema: {
    type: 'object',
    properties: {
      file: {
        type: 'string',
        description: 'Path to the compose file',
      },
      services: {
        type: 'array',
        items: { type: 'string' },
        description: 'Specific services to list',
      },
      format: {
        type: 'string',
        description: 'Output format (table or json)',
        enum: ['table', 'json'],
      },
    },
  },
  execute,
};
