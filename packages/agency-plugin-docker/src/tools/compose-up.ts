/**
 * Docker Compose Up tool - run.docker_compose_up
 *
 * Start services defined in compose file.
 */

import { z } from 'zod';
import type { AgencyTool, ToolResult } from '@generacy-ai/agency';
import { TerseOutput, terseToMcpToolResult } from '@generacy-ai/agency';
import { execDockerCompose } from '../utils/exec.js';
import { formatDockerError } from '../utils/error-classifier.js';

/**
 * Input schema for compose up
 */
export const composeUpSchema = z.object({
  /** Compose file path */
  file: z.string().optional(),

  /** Specific services to start */
  services: z.array(z.string()).optional(),

  /** Run in detached mode (default: true) */
  detach: z.boolean().default(true),

  /** Build images before starting */
  build: z.boolean().optional(),
});

export type ComposeUpParams = z.infer<typeof composeUpSchema>;

/**
 * Execute docker compose up
 */
async function execute(params: unknown): Promise<ToolResult> {
  const parsed = composeUpSchema.parse(params);
  const { file, services, detach, build } = parsed;

  const args: string[] = [];

  if (file) {
    args.push('-f', file);
  }

  args.push('up');

  if (detach) {
    args.push('-d');
  }

  if (build) {
    args.push('--build');
  }

  if (services && services.length > 0) {
    args.push(...services);
  }

  const result = await execDockerCompose(args, {
    shortMessage: 'Services started.',
  });

  if (result.success) {
    return terseToMcpToolResult(TerseOutput.success(result.shortMessage!));
  }

  return terseToMcpToolResult(
    TerseOutput.failure(formatDockerError(result.error!))
  );
}

/**
 * Docker Compose Up tool definition
 */
export const composeUpTool: AgencyTool = {
  name: 'run.docker_compose_up',
  description: 'Start services defined in a Docker Compose file',
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
        description: 'Specific services to start',
      },
      detach: {
        type: 'boolean',
        description: 'Run containers in the background (default: true)',
        default: true,
      },
      build: {
        type: 'boolean',
        description: 'Build images before starting containers',
      },
    },
  },
  execute,
};
