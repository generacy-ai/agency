/**
 * Docker Stop tool - run.docker_stop
 *
 * Stop a running container.
 */

import { z } from 'zod';
import type { AgencyTool, ToolResult } from '@generacy-ai/agency';
import { TerseOutput, terseToMcpToolResult } from '@generacy-ai/agency';
import { execDocker } from '../utils/exec.js';
import { formatDockerError } from '../utils/error-classifier.js';

/**
 * Input schema for docker stop
 */
export const dockerStopSchema = z.object({
  /** Container ID or name (required) */
  container: z.string(),

  /** Timeout in seconds before killing */
  time: z.number().int().positive().optional(),
});

export type DockerStopParams = z.infer<typeof dockerStopSchema>;

/**
 * Execute docker stop
 */
async function execute(params: unknown): Promise<ToolResult> {
  const parsed = dockerStopSchema.parse(params);
  const { container, time } = parsed;

  const args: string[] = ['stop'];

  if (time !== undefined) {
    args.push('-t', String(time));
  }

  args.push(container);

  const result = await execDocker(args, {
    shortMessage: 'Container stopped.',
  });

  if (result.success) {
    return terseToMcpToolResult(TerseOutput.success(result.shortMessage!));
  }

  return terseToMcpToolResult(
    TerseOutput.failure(formatDockerError(result.error!))
  );
}

/**
 * Docker Stop tool definition
 */
export const dockerStopTool: AgencyTool = {
  name: 'run.docker_stop',
  description: 'Stop a running Docker container',
  namespace: 'run',
  outputPattern: 'terse',
  inputSchema: {
    type: 'object',
    properties: {
      container: {
        type: 'string',
        description: 'Container ID or name',
      },
      time: {
        type: 'number',
        description: 'Seconds to wait before killing the container',
      },
    },
    required: ['container'],
  },
  execute,
};
