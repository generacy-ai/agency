/**
 * test.run_coverage tool implementation
 */

import type { AgencyTool, ToolResult } from '@generacy-ai/agency';
import { TerseOutput, terseToMcpToolResult } from '@generacy-ai/agency';
import { RunCoverageSchema, zodToJsonSchema } from '../schemas.js';
import { detectPackageManager, isDetectionSuccess, buildCommand } from '../../pm/index.js';
import { validateScript, formatScriptNotFoundError } from '../../scripts/index.js';
import { exec, formatCommand } from '../../exec/index.js';
import type { NpmPluginConfig } from '../../config.js';

/**
 * Create the test.run_coverage tool
 */
export function createRunCoverageTool(config: NpmPluginConfig): AgencyTool {
  return {
    name: 'test.run_coverage',
    description: 'Run tests with coverage reporting using the detected package manager',
    inputSchema: zodToJsonSchema(RunCoverageSchema),
    namespace: 'test',
    outputPattern: 'terse',
    modes: ['default', 'coding'],

    async execute(params: unknown): Promise<ToolResult> {
      const parsed = RunCoverageSchema.safeParse(params);
      if (!parsed.success) {
        return terseToMcpToolResult(
          TerseOutput.failure(`Invalid parameters: ${parsed.error.message}`)
        );
      }

      const { cwd = process.cwd(), workspace, pattern, threshold } = parsed.data;
      const scriptName = parsed.data.script ?? config.scripts['test:coverage'] ?? 'test:coverage';

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
      if (threshold !== undefined) {
        additionalArgs.push('--coverage.threshold', String(threshold));
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
        shortMessage: 'Coverage complete.',
      });

      if (result.exitCode !== 0) {
        const cmdStr = formatCommand(command, args);
        const output = [
          `Coverage failed (exit code ${result.exitCode}):`,
          '',
          `> ${cmdStr}`,
          '',
          result.stdout || result.stderr,
          '',
          threshold !== undefined
            ? `Recovery: Increase test coverage to meet ${threshold}% threshold.`
            : 'Recovery: Fix failing tests and run again.',
        ].join('\n');

        return terseToMcpToolResult(TerseOutput.failure(output));
      }

      // Extract coverage percentage from output if possible
      const coverageMatch = result.stdout.match(/(\d+(?:\.\d+)?)\s*%/);
      const coveragePercent = coverageMatch ? coverageMatch[1] : null;

      const successMessage = coveragePercent
        ? `Coverage: ${coveragePercent}%`
        : 'Coverage complete.';

      return terseToMcpToolResult(TerseOutput.success(successMessage));
    },
  };
}
