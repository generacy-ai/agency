/**
 * Firebase Emulators Stop Tool
 *
 * Stops running Firebase emulators.
 */

import type { AgencyTool, ToolResult, ToolContent } from '@generacy-ai/agency';
import { TerseOutput } from '@generacy-ai/agency';
import { EmulatorsStopParamsSchema } from '../config/schema.js';
import { ProcessManager } from '../process/manager.js';

/**
 * Create the emulators-stop tool
 *
 * @param processManager - Process manager instance
 * @returns AgencyTool implementation
 */
export function createEmulatorsStopTool(processManager: ProcessManager): AgencyTool {
  return {
    name: 'run.firebase_emulators_stop',
    description: 'Stop running Firebase emulators',
    namespace: 'run',
    outputPattern: 'terse',
    modes: ['debug', 'coding'],
    inputSchema: {
      type: 'object',
      properties: {
        force: {
          type: 'boolean',
          description: 'Force stop without graceful shutdown',
        },
      },
    },

    async execute(params: unknown): Promise<ToolResult> {
      try {
        // Validate parameters
        const parsed = EmulatorsStopParamsSchema.parse(params);

        // Get all running processes
        const runningProcesses = processManager.getRunningProcesses();

        if (runningProcesses.length === 0) {
          const result = TerseOutput.success('No emulators running.');
          const content: ToolContent[] = [{ type: 'text', text: result.output }];
          return { content, isError: false };
        }

        // Stop each running process
        for (const handle of runningProcesses) {
          await processManager.stop(handle, parsed.force);
        }

        const result = TerseOutput.success('Emulators stopped.');
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
