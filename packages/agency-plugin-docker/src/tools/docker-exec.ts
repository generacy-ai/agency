/**
 * Docker Exec tool - run.docker_exec
 *
 * Execute a command in a running container.
 */

import { z } from 'zod';
import type { AgencyTool, ToolResult } from '@generacy-ai/agency';
import { TerseOutput, terseToMcpToolResult } from '@generacy-ai/agency';
import { execDocker } from '../utils/exec.js';
import { formatDockerError } from '../utils/error-classifier.js';

/**
 * Input schema for docker exec
 */
export const dockerExecSchema = z.object({
  /** Container ID or name (required) */
  container: z.string(),

  /** Command to execute (required) */
  cmd: z.array(z.string()).nonempty(),

  /** Working directory inside container */
  workdir: z.string().optional(),

  /** User to run as */
  user: z.string().optional(),

  /** Keep STDIN open */
  interactive: z.boolean().optional(),
});

export type DockerExecParams = z.infer<typeof dockerExecSchema>;

/**
 * Execute docker exec
 */
async function execute(params: unknown): Promise<ToolResult> {
  const parsed = dockerExecSchema.parse(params);
  const { container, cmd, workdir, user, interactive } = parsed;

  const args: string[] = ['exec'];

  if (workdir) {
    args.push('-w', workdir);
  }

  if (user) {
    args.push('-u', user);
  }

  if (interactive) {
    args.push('-i');
  }

  args.push(container);
  args.push(...cmd);

  const result = await execDocker(args);

  if (result.success) {
    // Return command output
    const output = result.stdout || '(no output)';
    return terseToMcpToolResult(TerseOutput.success(output));
  }

  return terseToMcpToolResult(
    TerseOutput.failure(formatDockerError(result.error!))
  );
}

/**
 * Docker Exec tool definition
 */
export const dockerExecTool: AgencyTool = {
  name: 'run.docker_exec',
  description: 'Execute a command inside a running Docker container',
  namespace: 'run',
  outputPattern: 'terse',
  inputSchema: {
    type: 'object',
    properties: {
      container: {
        type: 'string',
        description: 'Container ID or name',
      },
      cmd: {
        type: 'array',
        items: { type: 'string' },
        description: 'Command and arguments to execute',
      },
      workdir: {
        type: 'string',
        description: 'Working directory inside the container',
      },
      user: {
        type: 'string',
        description: 'Username or UID to run the command as',
      },
      interactive: {
        type: 'boolean',
        description: 'Keep STDIN open even if not attached',
      },
    },
    required: ['container', 'cmd'],
  },
  execute,
};
