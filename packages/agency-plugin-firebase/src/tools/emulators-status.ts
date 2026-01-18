/**
 * Firebase Emulators Status Tool
 *
 * Checks status of running Firebase emulators.
 */

import type { AgencyTool, ToolResult, ToolContent } from '@generacy-ai/agency';
import { TerseOutput } from '@generacy-ai/agency';
import { ProcessManager } from '../process/manager.js';
import type { EmulatorType } from '../config/types.js';

/**
 * Common emulator types to check
 */
const EMULATOR_TYPES: EmulatorType[] = [
  'auth',
  'firestore',
  'database',
  'functions',
  'hosting',
  'pubsub',
  'storage',
];

/**
 * Create the emulators-status tool
 *
 * @param processManager - Process manager instance
 * @returns AgencyTool implementation
 */
export function createEmulatorsStatusTool(
  processManager: ProcessManager
): AgencyTool {
  return {
    name: 'run.firebase_emulators_status',
    description: 'Check status of Firebase emulators',
    namespace: 'run',
    outputPattern: 'terse',
    modes: ['debug', 'coding'],
    inputSchema: {
      type: 'object',
      properties: {},
    },

    async execute(): Promise<ToolResult> {
      try {
        // Get all running processes
        const runningProcesses = processManager.getRunningProcesses();

        if (runningProcesses.length === 0) {
          const result = TerseOutput.success('Emulators not running.');
          const content: ToolContent[] = [{ type: 'text', text: result.output }];
          return { content, isError: false };
        }

        // Build status output for each running process
        const emulatorInfos: string[] = [];

        for (const handle of runningProcesses) {
          for (const emulatorType of EMULATOR_TYPES) {
            const info = processManager.getEmulatorInfo(handle, emulatorType);
            if (info && info.ready) {
              emulatorInfos.push(`${emulatorType} (localhost:${info.port})`);
            }
          }
        }

        const message = emulatorInfos.length > 0
          ? `Emulators running: ${emulatorInfos.join(', ')}`
          : 'Emulators not running.';

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
