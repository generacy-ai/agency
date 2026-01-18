/**
 * Docker Compose Logs tool - run.docker_compose_logs
 *
 * View service logs (snapshot, not streaming).
 */

import { z } from 'zod';
import type { AgencyTool, ToolResult } from '@generacy-ai/agency';
import { TerseOutput, terseToMcpToolResult } from '@generacy-ai/agency';
import { execDockerCompose } from '../utils/exec.js';
import { formatDockerError } from '../utils/error-classifier.js';

/**
 * Input schema for compose logs
 */
export const composeLogsSchema = z.object({
  /** Compose file path */
  file: z.string().optional(),

  /** Specific services to show logs for */
  services: z.array(z.string()).optional(),

  /** Number of lines to tail (default: 100) */
  tail: z.number().int().positive().default(100),

  /** Show timestamps */
  timestamps: z.boolean().optional(),
});

export type ComposeLogsParams = z.infer<typeof composeLogsSchema>;

/**
 * Execute docker compose logs
 */
async function execute(params: unknown): Promise<ToolResult> {
  const parsed = composeLogsSchema.parse(params);
  const { file, services, tail, timestamps } = parsed;

  const args: string[] = [];

  if (file) {
    args.push('-f', file);
  }

  args.push('logs');

  // No-follow for snapshot behavior
  args.push('--no-follow');

  args.push('--tail', String(tail));

  if (timestamps) {
    args.push('-t');
  }

  if (services && services.length > 0) {
    args.push(...services);
  }

  const result = await execDockerCompose(args);

  if (result.success) {
    // For logs, we return the actual output, not just a success message
    const output = result.stdout || '(no logs)';
    return terseToMcpToolResult(TerseOutput.success(output));
  }

  return terseToMcpToolResult(
    TerseOutput.failure(formatDockerError(result.error!))
  );
}

/**
 * Docker Compose Logs tool definition
 */
export const composeLogsTool: AgencyTool = {
  name: 'run.docker_compose_logs',
  description: 'View logs from Docker Compose services (snapshot)',
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
        description: 'Specific services to show logs for',
      },
      tail: {
        type: 'number',
        description: 'Number of lines to show from the end of logs (default: 100)',
        default: 100,
      },
      timestamps: {
        type: 'boolean',
        description: 'Show timestamps in log output',
      },
    },
  },
  execute,
};
