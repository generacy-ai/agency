/**
 * build.install_dependencies tool implementation
 */

import type { AgencyTool, ToolResult } from '@generacy-ai/agency';
import { TerseOutput, terseToMcpToolResult } from '@generacy-ai/agency';
import { InstallDependenciesSchema, zodToJsonSchema, type InstallDependenciesParams } from '../schemas.js';
import { detectPackageManager, isDetectionSuccess, buildCommand } from '../../pm/index.js';
import { exec, formatCommand } from '../../exec/index.js';
import type { NpmPluginConfig } from '../../config.js';

/**
 * Create the build.install_dependencies tool
 */
export function createInstallDependenciesTool(config: NpmPluginConfig): AgencyTool {
  return {
    name: 'build.install_dependencies',
    description: 'Install project dependencies using the detected package manager (npm, yarn, or pnpm)',
    inputSchema: zodToJsonSchema(InstallDependenciesSchema),
    namespace: 'build',
    outputPattern: 'terse',
    modes: ['default', 'coding'],

    async execute(params: unknown): Promise<ToolResult> {
      const parsed = InstallDependenciesSchema.safeParse(params);
      if (!parsed.success) {
        return terseToMcpToolResult(
          TerseOutput.failure(`Invalid parameters: ${parsed.error.message}`)
        );
      }

      const { cwd = process.cwd(), workspace, production, frozen } = parsed.data;

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
      const { command, args } = buildCommand(pm, 'install', {
        workspace,
        production,
        frozen,
      });

      // Execute
      const result = await exec(command, args, {
        cwd,
        shortMessage: 'Dependencies installed.',
      });

      if (result.exitCode !== 0) {
        const cmdStr = formatCommand(command, args);
        const output = [
          `Install failed (exit code ${result.exitCode}):`,
          '',
          `> ${cmdStr}`,
          '',
          result.stderr || result.stdout,
          '',
          'Recovery: Check network connectivity and package availability.',
        ].join('\n');

        return terseToMcpToolResult(TerseOutput.failure(output));
      }

      return terseToMcpToolResult(TerseOutput.fromExec(result));
    },
  };
}
