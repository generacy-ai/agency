/**
 * Firebase Emulators Start Tool
 *
 * Starts Firebase emulators with configurable options.
 */

import type { AgencyTool, ToolResult, ToolContent } from '@generacy-ai/agency';
import { TerseOutput } from '@generacy-ai/agency';
import { z } from 'zod';
import { EmulatorsStartParamsSchema } from '../config/schema.js';
import { ProcessManager } from '../process/manager.js';
import type { EmulatorType, FirebasePluginConfig } from '../config/types.js';

/**
 * Ready pattern for emulator startup
 */
const READY_PATTERN = /All emulators ready/;

/**
 * Default ready timeout (60 seconds)
 */
const DEFAULT_READY_TIMEOUT = 60000;

/**
 * Emulators start parameters type
 */
export type EmulatorsStartParams = z.infer<typeof EmulatorsStartParamsSchema>;

/**
 * Create the emulators-start tool
 *
 * @param processManager - Process manager instance
 * @param config - Plugin configuration
 * @returns AgencyTool implementation
 */
export function createEmulatorsStartTool(
  processManager: ProcessManager,
  config: FirebasePluginConfig
): AgencyTool {
  return {
    name: 'run.firebase_emulators_start',
    description: 'Start Firebase emulators with optional configuration',
    namespace: 'run',
    outputPattern: 'terse',
    modes: ['debug', 'coding'],
    inputSchema: {
      type: 'object',
      properties: {
        only: {
          type: 'array',
          items: {
            type: 'string',
            enum: ['auth', 'firestore', 'database', 'functions', 'hosting', 'pubsub', 'storage'],
          },
          description: 'Specific emulators to start',
        },
        import: {
          type: 'string',
          description: 'Path to import emulator data from',
        },
        export: {
          type: 'string',
          description: 'Path to export emulator data on exit',
        },
        project: {
          type: 'string',
          description: 'Firebase project ID',
        },
      },
    },

    async execute(params: unknown): Promise<ToolResult> {
      try {
        // Validate parameters
        const parsed = EmulatorsStartParamsSchema.parse(params);

        // Build command arguments
        const args = ['emulators:start'];

        // Use only from params, then config, or default to all
        const onlyEmulators = parsed.only ?? config.emulators?.only;
        if (onlyEmulators && onlyEmulators.length > 0) {
          args.push('--only', onlyEmulators.join(','));
        }

        // Import data path
        if (parsed.import) {
          args.push('--import', parsed.import);
        }

        // Export on exit path
        if (parsed.export) {
          args.push('--export-on-exit', parsed.export);
        }

        // Project ID
        const project = parsed.project ?? config.project;
        if (project) {
          args.push('--project', project);
        }

        // Start the emulators
        const handle = await processManager.start('firebase', args, {
          readyPattern: READY_PATTERN,
          readyTimeout: DEFAULT_READY_TIMEOUT,
          cleanup: config.cleanup,
        });

        // Build success output with emulator URLs
        const emulators = onlyEmulators ?? ['auth', 'firestore', 'functions'] as EmulatorType[];
        const emulatorInfos: string[] = [];

        for (const emulator of emulators) {
          const info = processManager.getEmulatorInfo(handle, emulator);
          if (info) {
            emulatorInfos.push(`${emulator}: ${info.url}`);
          }
        }

        const message = emulatorInfos.length > 0
          ? `Emulators started. ${emulatorInfos.join(', ')}`
          : 'Emulators started.';

        const result = TerseOutput.success(message);
        const content: ToolContent[] = [{ type: 'text', text: result.output }];
        return { content, isError: false };
      } catch (error) {
        const result = TerseOutput.failure(error instanceof Error ? error : String(error));
        const content: ToolContent[] = [{ type: 'text', text: result.output }];
        return { content, isError: true };
      }
    },
  };
}
