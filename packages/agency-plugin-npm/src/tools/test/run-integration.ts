/**
 * test.run_integration tool implementation
 */

import type { AgencyTool, ToolResult } from '@generacy-ai/agency';
import { TerseOutput, terseToMcpToolResult } from '@generacy-ai/agency';
import { RunIntegrationSchema, zodToJsonSchema, type RunIntegrationParams } from '../schemas.js';
import { detectPackageManager, isDetectionSuccess, buildCommand } from '../../pm/index.js';
import { validateScript, formatScriptNotFoundError } from '../../scripts/index.js';
import { exec, formatCommand } from '../../exec/index.js';
import type { NpmPluginConfig } from '../../config.js';

/**
 * Create the test.run_integration tool
 */
export function createRunIntegrationTool(config: NpmPluginConfig): AgencyTool {
  return {
    name: 'test.run_integration',
    description: 'Run integration tests using the detected package manager',
    inputSchema: zodToJsonSchema(RunIntegrationSchema),
    namespace: 'test',
    outputPattern: 'terse',
    modes: ['default', 'coding'],

    async execute(params: unknown): Promise<ToolResult> {
      const parsed = RunIntegrationSchema.safeParse(params);
      if (!parsed.success) {
        return terseToMcpToolResult(
          TerseOutput.failure(`Invalid parameters: ${parsed.error.message}`)
        );
      }

      const { cwd = process.cwd(), workspace, pattern, watch } = parsed.data;
      const scriptName = parsed.data.script ?? config.scripts['test:integration'] ?? 'test:integration';

      // Validate script exists
      const validation = validateScript(cwd, scriptName);
      if (!validation.exists) {
        const error = formatScriptNotFoundError(scriptName, validation.availableScripts ?? []);
        return terseToMcpToolResult(TerseOutput.failure(error));
      }

      // Detect or use configured package manager
      let pm = config.packageManager;
      if (pm === 'auto') {
        const detection = detectPackageManager(cwd);
        if (!isDetectionSuccess(detection)) {
          return terseToMcpToolResult(TerseOutput.failure(detection.error));
        }
        pm = detection.packageManager;
      }

      // Build additional args
      const additionalArgs: string[] = [];
      if (pattern) {
        additionalArgs.push(pattern);
      }
      if (watch) {
        additionalArgs.push('--watch');
      }

      // Build the command
      const { command, args } = buildCommand(pm, 'run', {
        workspace,
        script: scriptName,
        args: additionalArgs.length > 0 ? additionalArgs : undefined,
      });

      // Execute
      const result = await exec(command, args, {
        cwd,
        shortMessage: 'All integration tests passed.',
      });

      if (result.exitCode !== 0) {
        const cmdStr = formatCommand(command, args);
        const output = [
          `Integration tests failed (exit code ${result.exitCode}):`,
          '',
          `> ${cmdStr}`,
          '',
          result.stdout || result.stderr,
          '',
          'Recovery: Fix the failing tests and run again.',
        ].join('\n');

        return terseToMcpToolResult(TerseOutput.failure(output));
      }

      return terseToMcpToolResult(TerseOutput.fromExec(result));
    },
  };
}
