/**
 * Docker Compose Down tool - run.docker_compose_down
 *
 * Stop and remove services.
 */

import { z } from 'zod';
import type { AgencyTool, ToolResult } from '@generacy-ai/agency';
import { TerseOutput, terseToMcpToolResult } from '@generacy-ai/agency';
import { execDockerCompose } from '../utils/exec.js';
import { formatDockerError } from '../utils/error-classifier.js';

/**
 * Input schema for compose down
 */
export const composeDownSchema = z.object({
  /** Compose file path */
  file: z.string().optional(),

  /** Remove named volumes */
  volumes: z.boolean().optional(),

  /** Remove orphan containers */
  removeOrphans: z.boolean().optional(),
});

export type ComposeDownParams = z.infer<typeof composeDownSchema>;

/**
 * Execute docker compose down
 */
async function execute(params: unknown): Promise<ToolResult> {
  const parsed = composeDownSchema.parse(params);
  const { file, volumes, removeOrphans } = parsed;

  const args: string[] = [];

  if (file) {
    args.push('-f', file);
  }

  args.push('down');

  if (volumes) {
    args.push('-v');
  }

  if (removeOrphans) {
    args.push('--remove-orphans');
  }

  const result = await execDockerCompose(args, {
    shortMessage: 'Services stopped.',
  });

  if (result.success) {
    return terseToMcpToolResult(TerseOutput.success(result.shortMessage!));
  }

  return terseToMcpToolResult(
    TerseOutput.failure(formatDockerError(result.error!))
  );
}

/**
 * Docker Compose Down tool definition
 */
export const composeDownTool: AgencyTool = {
  name: 'run.docker_compose_down',
  description: 'Stop and remove Docker Compose services',
  namespace: 'run',
  outputPattern: 'terse',
  inputSchema: {
    type: 'object',
    properties: {
      file: {
        type: 'string',
        description: 'Path to the compose file',
      },
      volumes: {
        type: 'boolean',
        description: 'Remove named volumes declared in the volumes section',
      },
      removeOrphans: {
        type: 'boolean',
        description: 'Remove containers for services not defined in the Compose file',
      },
    },
  },
  execute,
};
