/**
 * Docker Build tool - run.docker_build
 *
 * Build a Docker image.
 */

import { z } from 'zod';
import type { AgencyTool, ToolResult } from '@generacy-ai/agency';
import { TerseOutput, terseToMcpToolResult } from '@generacy-ai/agency';
import { execDocker } from '../utils/exec.js';
import { formatDockerError } from '../utils/error-classifier.js';

/**
 * Input schema for docker build
 */
export const dockerBuildSchema = z.object({
  /** Build context path (required) */
  context: z.string(),

  /** Image tag */
  tag: z.string().optional(),

  /** Dockerfile path (relative to context) */
  dockerfile: z.string().optional(),

  /** Build arguments */
  buildArgs: z.record(z.string()).optional(),
});

export type DockerBuildParams = z.infer<typeof dockerBuildSchema>;

/**
 * Execute docker build
 */
async function execute(params: unknown): Promise<ToolResult> {
  const parsed = dockerBuildSchema.parse(params);
  const { context, tag, dockerfile, buildArgs } = parsed;

  const args: string[] = ['build'];

  if (tag) {
    args.push('-t', tag);
  }

  if (dockerfile) {
    args.push('-f', dockerfile);
  }

  if (buildArgs) {
    for (const [key, value] of Object.entries(buildArgs)) {
      args.push('--build-arg', `${key}=${value}`);
    }
  }

  args.push(context);

  const result = await execDocker(args, {
    shortMessage: tag ? `Image built: ${tag}` : 'Image built.',
  });

  if (result.success) {
    return terseToMcpToolResult(TerseOutput.success(result.shortMessage!));
  }

  return terseToMcpToolResult(
    TerseOutput.failure(formatDockerError(result.error!))
  );
}

/**
 * Docker Build tool definition
 */
export const dockerBuildTool: AgencyTool = {
  name: 'run.docker_build',
  description: 'Build a Docker image from a Dockerfile',
  namespace: 'run',
  outputPattern: 'terse',
  inputSchema: {
    type: 'object',
    properties: {
      context: {
        type: 'string',
        description: 'Build context path (directory containing Dockerfile)',
      },
      tag: {
        type: 'string',
        description: 'Name and optionally a tag (name:tag)',
      },
      dockerfile: {
        type: 'string',
        description: 'Path to the Dockerfile (relative to context)',
      },
      buildArgs: {
        type: 'object',
        description: 'Build-time variables',
      },
    },
    required: ['context'],
  },
  execute,
};
