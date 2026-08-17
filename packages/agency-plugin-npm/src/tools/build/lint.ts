/**
 * build.lint tool implementation
 */

import type { AgencyTool, ToolResult } from '@generacy-ai/agency';
import { TerseOutput, terseToMcpToolResult } from '@generacy-ai/agency';
import { LintSchema, zodToJsonSchema } from '../schemas.js';
import { detectPackageManager, isDetectionSuccess, buildCommand } from '../../pm/index.js';
import { validateScript, formatScriptNotFoundError } from '../../scripts/index.js';
import { exec, formatCommand, formatFailureOutput } from '../../exec/index.js';
import type { NpmPluginConfig } from '../../config.js';

/**
 * Create the build.lint tool
 */
export function createLintTool(config: NpmPluginConfig): AgencyTool {
  return {
    name: 'build.lint',
    description: 'Run the linter using the detected package manager. Available in coding and review modes.',
    inputSchema: zodToJsonSchema(LintSchema),
    namespace: 'build',
    outputPattern: 'terse',
    modes: ['default', 'coding', 'review'],

    async execute(params: unknown): Promise<ToolResult> {
      const parsed = LintSchema.safeParse(params);
      if (!parsed.success) {
        return terseToMcpToolResult(
          TerseOutput.failure(`Invalid parameters: ${parsed.error.message}`)
        );
      }

      const { cwd = process.cwd(), workspace, fix } = parsed.data;
      const scriptName = parsed.data.script ?? config.scripts.lint ?? 'lint';

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
      if (fix) {
        additionalArgs.push('--fix');
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
        shortMessage: fix ? 'Lint passed (with fixes applied).' : 'Lint passed.',
      });

      if (result.exitCode !== 0) {
        const cmdStr = formatCommand(command, args);
        const output = [
          `Lint failed (exit code ${result.exitCode}):`,
          '',
          `> ${cmdStr}`,
          '',
          formatFailureOutput(result),
          '',
          fix
            ? 'Recovery: Some issues could not be auto-fixed. Fix them manually.'
            : 'Recovery: Run with fix=true to auto-fix issues, or fix manually.',
        ].join('\n');

        return terseToMcpToolResult(TerseOutput.failure(output));
      }

      return terseToMcpToolResult(TerseOutput.fromExec(result));
    },
  };
}
