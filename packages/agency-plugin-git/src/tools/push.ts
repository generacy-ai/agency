/**
 * source_control.push tool
 *
 * Push to remote with force push escalation.
 */

import type { AgencyTool, ToolResult, AgencyCoreAPI } from '@generacy-ai/agency';
import { TerseOutput, terseToMcpToolResult } from '@generacy-ai/agency';
import type { GitPluginConfig } from '../config.js';
import type { PushParams, ForcePushEscalation } from '../types.js';
import { execGitOrThrow, execGit } from '../utils/exec-git.js';

export function createPushTool(
  config: GitPluginConfig,
  core: AgencyCoreAPI
): AgencyTool {
  return {
    name: 'source_control.push',
    description: 'Push to remote',
    namespace: 'source_control',
    outputPattern: 'terse',
    modes: ['default', 'coding'],
    inputSchema: {
      type: 'object',
      properties: {
        cwd: {
          type: 'string',
          description: 'Working directory',
        },
        remote: {
          type: 'string',
          description: `Remote name (default: ${config.defaultRemote})`,
        },
        branch: {
          type: 'string',
          description: 'Branch to push (default: current branch)',
        },
        force: {
          type: 'boolean',
          description: 'Force push (requires approval if allowForcePush is false)',
        },
        setUpstream: {
          type: 'boolean',
          description: 'Set upstream tracking',
        },
        tags: {
          type: 'boolean',
          description: 'Push tags',
        },
      },
    },

    async execute(params: unknown): Promise<ToolResult> {
      const {
        cwd,
        remote = config.defaultRemote,
        branch,
        force = false,
        setUpstream = false,
        tags = false,
      } = (params as PushParams) || {};

      try {
        // Handle force push
        if (force && !config.allowForcePush) {
          // Try to escalate via Humancy
          const approved = await requestForcePushApproval(
            core,
            remote,
            branch ?? 'current branch',
            cwd
          );

          if (!approved) {
            return terseToMcpToolResult(
              TerseOutput.failure(
                'Force push requires approval. Set allowForcePush: true in config or get Humancy approval.'
              )
            );
          }
        }

        const args: string[] = ['push'];

        if (force) {
          args.push('--force-with-lease');
        }

        if (setUpstream) {
          args.push('-u');
        }

        if (tags) {
          args.push('--tags');
        }

        args.push(remote);

        if (branch) {
          args.push(branch);
        }

        await execGitOrThrow(args, { cwd, timeout: config.timeout });

        return terseToMcpToolResult(
          TerseOutput.success(
            JSON.stringify({
              success: true,
              remote,
              branch: branch ?? 'current',
              force,
              summary: `Pushed to ${remote}${branch ? `/${branch}` : ''}`,
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

async function requestForcePushApproval(
  core: AgencyCoreAPI,
  remote: string,
  branch: string,
  cwd?: string
): Promise<boolean> {
  try {
    // Get commits that would be lost
    const result = await execGit(
      ['log', '--format=%H %s', `${remote}/${branch}..HEAD`, '-n', '10'],
      { cwd }
    );

    const commitsToLose = result.stdout.split('\n').filter(Boolean);

    const escalation: ForcePushEscalation = {
      type: 'approval_request',
      urgency: 'blocking_now',
      title: 'Force Push Approval Required',
      description: `Agent requests force push to ${remote}/${branch}`,
      context: {
        remote,
        branch,
        commitsToLose,
      },
    };

    // Try to send escalation via humancy channel
    core.sendMessage('humancy.escalation', {
      id: `force-push-${Date.now()}`,
      channel: 'humancy.escalation',
      sender: core.getPluginId(),
      timestamp: new Date(),
      payload: escalation,
    });

    // For now, we can't wait for response in this architecture
    // Return false to indicate approval not yet received
    return false;
  } catch {
    return false;
  }
}
