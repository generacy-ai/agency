/**
 * build.validate tool implementation
 *
 * Discovery-based meta-tool that auto-detects and runs validation scripts
 * from package.json (lint, format:check, typecheck, etc.)
 */

import type { AgencyTool, ToolResult } from '@generacy-ai/agency';
import { TerseOutput, terseToMcpToolResult } from '@generacy-ai/agency';
import { ValidateSchema, zodToJsonSchema } from '../schemas.js';
import { detectPackageManager, isDetectionSuccess, buildCommand } from '../../pm/index.js';
import { getAvailableScripts } from '../../scripts/index.js';
import { exec, formatFailureOutput } from '../../exec/index.js';
import type { NpmPluginConfig } from '../../config.js';

/** A script candidate resolved for execution */
interface ValidationCandidate {
  /** Display name (e.g., 'lint', 'format:check') */
  name: string;

  /** Actual script to run in package.json */
  script: string;

  /** Additional args to append (e.g., ['--check'] for format fallback) */
  additionalArgs?: string[];
}

/** Result of running a single validation script */
interface ValidationResult {
  /** Script name that was run */
  name: string;

  /** Whether it passed */
  passed: boolean;

  /** Stdout from execution */
  stdout: string;

  /** Stderr from execution */
  stderr: string;
}

const DEFAULT_CANDIDATES: ValidationCandidate[] = [
  { name: 'lint', script: 'lint' },
  { name: 'format:check', script: 'format:check' },
  { name: 'typecheck', script: 'typecheck' },
];

/** Fallback: if format:check missing, use format with --check */
const FORMAT_FALLBACK: ValidationCandidate = {
  name: 'format',
  script: 'format',
  additionalArgs: ['--check'],
};

/**
 * Discover which validation scripts to run
 */
function discoverScripts(
  availableScripts: Record<string, string>,
  validateScriptName: string,
  explicitScripts?: string[],
): ValidationCandidate[] {
  // Explicit scripts param takes precedence (DD-2)
  if (explicitScripts && explicitScripts.length > 0) {
    return explicitScripts.map((s) => ({
      name: s,
      script: s,
      ...(s === 'format' ? { additionalArgs: ['--check'] } : {}),
    }));
  }

  // Short-circuit: if 'validate' script exists, use only that
  if (availableScripts[validateScriptName]) {
    return [{ name: validateScriptName, script: validateScriptName }];
  }

  // Auto-discover from candidates
  const discovered: ValidationCandidate[] = [];
  let hasFormatCheck = false;

  for (const candidate of DEFAULT_CANDIDATES) {
    if (availableScripts[candidate.script]) {
      discovered.push(candidate);
      if (candidate.script === 'format:check') {
        hasFormatCheck = true;
      }
    }
  }

  // Format fallback: if no format:check, try format with --check (DD-4)
  if (!hasFormatCheck && availableScripts[FORMAT_FALLBACK.script]) {
    discovered.push(FORMAT_FALLBACK);
  }

  return discovered;
}

/**
 * Create the build.validate tool
 */
export function createValidateTool(config: NpmPluginConfig): AgencyTool {
  return {
    name: 'build.validate',
    description:
      'Discover and run validation scripts (lint, format:check, typecheck) from package.json. ' +
      'Auto-detects available scripts or accepts explicit overrides.',
    inputSchema: zodToJsonSchema(ValidateSchema),
    namespace: 'build',
    outputPattern: 'terse',
    modes: ['default', 'coding', 'review', 'speckit'],

    async execute(params: unknown): Promise<ToolResult> {
      const parsed = ValidateSchema.safeParse(params);
      if (!parsed.success) {
        return terseToMcpToolResult(
          TerseOutput.failure(`Invalid parameters: ${parsed.error.message}`),
        );
      }

      const { cwd = process.cwd(), workspace } = parsed.data;
      const validateScriptName = config.scripts.validate ?? 'validate';

      // Get available scripts from package.json
      const availableScripts = getAvailableScripts(cwd);
      if (Object.keys(availableScripts).length === 0) {
        return terseToMcpToolResult(
          TerseOutput.failure(`No package.json found or no scripts defined in ${cwd}`),
        );
      }

      // Discover which scripts to run
      const candidates = discoverScripts(availableScripts, validateScriptName, parsed.data.scripts);

      // Empty discovery → success (DD-5)
      if (candidates.length === 0) {
        const searched = ['validate', 'lint', 'format:check', 'format', 'typecheck'];
        return terseToMcpToolResult(
          TerseOutput.fromExec({
            exitCode: 0,
            stdout: '',
            stderr: '',
            shortMessage: `No validation scripts discovered in package.json.\nSearched for: ${searched.join(', ')}`,
          }),
        );
      }

      // Detect package manager
      let pm = config.packageManager;
      if (pm === 'auto') {
        const detection = detectPackageManager(cwd);
        if (!isDetectionSuccess(detection)) {
          return terseToMcpToolResult(TerseOutput.failure(detection.error));
        }
        pm = detection.packageManager;
      }

      // Run each discovered script sequentially (DD-1)
      const results: ValidationResult[] = [];

      for (const candidate of candidates) {
        // Skip scripts not found in package.json (for explicit overrides)
        if (!availableScripts[candidate.script]) {
          continue;
        }

        const { command, args } = buildCommand(pm, 'run', {
          workspace,
          script: candidate.script,
          args: candidate.additionalArgs,
        });

        const result = await exec(command, args, { cwd });

        results.push({
          name: candidate.name,
          passed: result.exitCode === 0,
          stdout: result.stdout,
          stderr: result.stderr,
        });
      }

      // If all candidates were skipped (none found in package.json)
      if (results.length === 0) {
        const searched = candidates.map((c) => c.script);
        return terseToMcpToolResult(
          TerseOutput.fromExec({
            exitCode: 0,
            stdout: '',
            stderr: '',
            shortMessage: `No validation scripts discovered in package.json.\nSearched for: ${searched.join(', ')}`,
          }),
        );
      }

      // Aggregate results
      const failed = results.filter((r) => !r.passed);
      const total = results.length;

      if (failed.length === 0) {
        const summary = results.map((r) => `  ✓ ${r.name}`).join('\n');
        return terseToMcpToolResult(
          TerseOutput.fromExec({
            exitCode: 0,
            stdout: '',
            stderr: '',
            shortMessage: `Validation passed (${total}/${total}):\n${summary}`,
          }),
        );
      }

      // Some failed — build detailed output
      const lines: string[] = [
        `Validation failed (${failed.length}/${total} failed):`,
        '',
      ];

      for (const r of results) {
        lines.push(`  ${r.passed ? '✓' : '✗'} ${r.name}`);
      }

      for (const r of failed) {
        lines.push('');
        lines.push(`--- ${r.name} ---`);
        lines.push(formatFailureOutput(r));
      }

      lines.push('');
      lines.push('Recovery: Fix the failing validations above, then re-run.');

      return terseToMcpToolResult(TerseOutput.failure(lines.join('\n')));
    },
  };
}
