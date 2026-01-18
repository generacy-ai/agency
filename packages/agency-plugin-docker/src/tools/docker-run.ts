/**
 * Docker Run tool - run.docker_run
 *
 * Run a container from an image.
 */

import { z } from 'zod';
import type { AgencyTool, ToolResult } from '@generacy-ai/agency';
import { TerseOutput, terseToMcpToolResult } from '@generacy-ai/agency';
import { execDocker } from '../utils/exec.js';
import { formatDockerError } from '../utils/error-classifier.js';

/**
 * Port mapping validation
 */
const portMapping = z.string().regex(/^\d+:\d+$/, 'Port mapping must be host:container');

/**
 * Volume mapping validation
 */
const volumeMapping = z.string().regex(/^.+:.+$/, 'Volume mapping must be host:container');

/**
 * Input schema for docker run
 */
export const dockerRunSchema = z.object({
  /** Image to run (required) */
  image: z.string(),

  /** Container name */
  name: z.string().optional(),

  /** Port mappings (host:container) */
  ports: z.array(portMapping).optional(),

  /** Environment variables */
  env: z.record(z.string()).optional(),

  /** Volume mounts (host:container) */
  volumes: z.array(volumeMapping).optional(),

  /** Run in detached mode (default: true) */
  detach: z.boolean().default(true),

  /** Remove container when it exits */
  rm: z.boolean().optional(),

  /** Command to run */
  cmd: z.array(z.string()).optional(),
});

export type DockerRunParams = z.infer<typeof dockerRunSchema>;

/**
 * Execute docker run
 */
async function execute(params: unknown): Promise<ToolResult> {
  const parsed = dockerRunSchema.parse(params);
  const { image, name, ports, env, volumes, detach, rm, cmd } = parsed;

  const args: string[] = ['run'];

  if (detach) {
    args.push('-d');
  }

  if (name) {
    args.push('--name', name);
  }

  if (rm) {
    args.push('--rm');
  }

  if (ports) {
    for (const port of ports) {
      args.push('-p', port);
    }
  }

  if (env) {
    for (const [key, value] of Object.entries(env)) {
      args.push('-e', `${key}=${value}`);
    }
  }

  if (volumes) {
    for (const volume of volumes) {
      args.push('-v', volume);
    }
  }

  args.push(image);

  if (cmd && cmd.length > 0) {
    args.push(...cmd);
  }

  const result = await execDocker(args);

  if (result.success) {
    // stdout contains container ID when running in detached mode
    const containerId = result.stdout.trim().slice(0, 12);
    const message = name
      ? `Container started: ${name} (${containerId})`
      : `Container started: ${containerId}`;
    return terseToMcpToolResult(TerseOutput.success(message));
  }

  return terseToMcpToolResult(
    TerseOutput.failure(formatDockerError(result.error!))
  );
}

/**
 * Docker Run tool definition
 */
export const dockerRunTool: AgencyTool = {
  name: 'run.docker_run',
  description: 'Run a Docker container from an image',
  namespace: 'run',
  outputPattern: 'terse',
  inputSchema: {
    type: 'object',
    properties: {
      image: {
        type: 'string',
        description: 'Image name to run',
      },
      name: {
        type: 'string',
        description: 'Assign a name to the container',
      },
      ports: {
        type: 'array',
        items: { type: 'string' },
        description: 'Port mappings (host:container)',
      },
      env: {
        type: 'object',
        description: 'Environment variables',
      },
      volumes: {
        type: 'array',
        items: { type: 'string' },
        description: 'Volume mounts (host:container)',
      },
      detach: {
        type: 'boolean',
        description: 'Run container in background (default: true)',
        default: true,
      },
      rm: {
        type: 'boolean',
        description: 'Automatically remove the container when it exits',
      },
      cmd: {
        type: 'array',
        items: { type: 'string' },
        description: 'Command to run in the container',
      },
    },
    required: ['image'],
  },
  execute,
};
