/**
 * Firebase Deploy Tool
 *
 * Deploys to Firebase with configurable options.
 */

import type { AgencyTool, ToolResult, ToolContent } from '@generacy-ai/agency';
import { TerseOutput } from '@generacy-ai/agency';
import { z } from 'zod';
import { DeployParamsSchema } from '../config/schema.js';
import { execSync } from 'node:child_process';
import type { FirebasePluginConfig } from '../config/types.js';

/**
 * Deploy parameters type
 */
export type DeployParams = z.infer<typeof DeployParamsSchema>;

/**
 * Create the deploy tool
 *
 * @param config - Plugin configuration
 * @returns AgencyTool implementation
 */
export function createDeployTool(config: FirebasePluginConfig): AgencyTool {
  return {
    name: 'run.firebase_deploy',
    description: 'Deploy to Firebase',
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
          description: 'Deploy targets',
        },
        project: {
          type: 'string',
          description: 'Firebase project ID',
        },
        message: {
          type: 'string',
          description: 'Deploy message',
        },
      },
    },

    async execute(params: unknown): Promise<ToolResult> {
      try {
        // Validate parameters
        const parsed = DeployParamsSchema.parse(params);

        // Build command arguments
        const args = ['firebase', 'deploy'];

        // Use only from params, then config, or default to ['functions']
        const onlyTargets = parsed.only ?? config.deploy?.targets ?? ['functions'];
        if (onlyTargets.length > 0) {
          args.push('--only', onlyTargets.join(','));
        }

        // Project ID
        const project = parsed.project ?? config.project;
        if (project) {
          args.push('--project', project);
        }

        // Deploy message
        if (parsed.message) {
          args.push('--message', parsed.message);
        }

        // Execute the deploy command
        execSync(args.join(' '), {
          stdio: 'pipe',
          encoding: 'utf-8',
        });

        const result = TerseOutput.success('Deploy complete.');
        const content: ToolContent[] = [{ type: 'text', text: result.output }];
        return { content, isError: false };
      } catch (error) {
        const errorMessage =
          error instanceof Error
            ? (error as Error & { stderr?: string }).stderr ?? error.message
            : String(error);
        const result = TerseOutput.failure(errorMessage);
        const content: ToolContent[] = [{ type: 'text', text: result.output }];
        return { content, isError: true };
      }
    },
  };
}
