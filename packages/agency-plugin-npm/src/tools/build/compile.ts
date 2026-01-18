/**
 * build.compile tool implementation
 */

import type { AgencyTool, ToolResult } from '@generacy-ai/agency';
import { TerseOutput, terseToMcpToolResult } from '@generacy-ai/agency';
import { CompileSchema, zodToJsonSchema, type CompileParams } from '../schemas.js';
import { detectPackageManager, isDetectionSuccess, buildCommand } from '../../pm/index.js';
import { validateScript, formatScriptNotFoundError } from '../../scripts/index.js';
import { exec, formatCommand } from '../../exec/index.js';
import type { NpmPluginConfig } from '../../config.js';

/**
 * Create the build.compile tool
 */
export function createCompileTool(config: NpmPluginConfig): AgencyTool {
  return {
    name: 'build.compile',
    description: 'Run the build/compile script using the detected package manager',
    inputSchema: zodToJsonSchema(CompileSchema),
    namespace: 'build',
    outputPattern: 'terse',
    modes: ['coding'],

    async execute(params: unknown): Promise<ToolResult> {
      const parsed = CompileSchema.safeParse(params);
      if (!parsed.success) {
        return terseToMcpToolResult(
          TerseOutput.failure(`Invalid parameters: ${parsed.error.message}`)
        );
      }

      const { cwd = process.cwd(), workspace } = parsed.data;
      const scriptName = parsed.data.script ?? config.scripts.build ?? 'build';

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

      // Build the command
      const { command, args } = buildCommand(pm, 'run', {
        workspace,
        script: scriptName,
      });

      // Execute
      const result = await exec(command, args, {
        cwd,
        shortMessage: 'Build completed.',
      });

      if (result.exitCode !== 0) {
        const cmdStr = formatCommand(command, args);
        const output = [
          `Build failed (exit code ${result.exitCode}):`,
          '',
          `> ${cmdStr}`,
          '',
          result.stderr || result.stdout,
          '',
          'Recovery: Fix the build errors and run again.',
        ].join('\n');

        return terseToMcpToolResult(TerseOutput.failure(output));
      }

      return terseToMcpToolResult(TerseOutput.fromExec(result));
    },
  };
}
