/**
 * build.format tool implementation
 */

import type { AgencyTool, ToolResult } from '@generacy-ai/agency';
import { TerseOutput, terseToMcpToolResult } from '@generacy-ai/agency';
import { FormatSchema, zodToJsonSchema, type FormatParams } from '../schemas.js';
import { detectPackageManager, isDetectionSuccess, buildCommand } from '../../pm/index.js';
import { validateScript, formatScriptNotFoundError } from '../../scripts/index.js';
import { exec, formatCommand } from '../../exec/index.js';
import type { NpmPluginConfig } from '../../config.js';

/**
 * Create the build.format tool
 */
export function createFormatTool(config: NpmPluginConfig): AgencyTool {
  return {
    name: 'build.format',
    description: 'Run the code formatter using the detected package manager',
    inputSchema: zodToJsonSchema(FormatSchema),
    namespace: 'build',
    outputPattern: 'terse',
    modes: ['default', 'coding'],

    async execute(params: unknown): Promise<ToolResult> {
      const parsed = FormatSchema.safeParse(params);
      if (!parsed.success) {
        return terseToMcpToolResult(
          TerseOutput.failure(`Invalid parameters: ${parsed.error.message}`)
        );
      }

      const { cwd = process.cwd(), workspace, check } = parsed.data;
      const scriptName = parsed.data.script ?? config.scripts.format ?? 'format';

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
      if (check) {
        additionalArgs.push('--check');
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
        shortMessage: check ? 'Format check passed.' : 'Formatting complete.',
      });

      if (result.exitCode !== 0) {
        const cmdStr = formatCommand(command, args);
        const output = [
          `Format ${check ? 'check ' : ''}failed (exit code ${result.exitCode}):`,
          '',
          `> ${cmdStr}`,
          '',
          result.stderr || result.stdout,
          '',
          check
            ? 'Recovery: Run without check=true to apply formatting.'
            : 'Recovery: Check formatter configuration.',
        ].join('\n');

        return terseToMcpToolResult(TerseOutput.failure(output));
      }

      return terseToMcpToolResult(TerseOutput.fromExec(result));
    },
  };
}
