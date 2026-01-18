/**
 * Script validation - check package.json for script existence
 */

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

/** Result of script validation */
export interface ScriptValidationResult {
  /** Whether the script exists */
  exists: boolean;

  /** Script command if it exists */
  command?: string;

  /** Available scripts if the target doesn't exist */
  availableScripts?: string[];

  /** Error message if validation failed */
  error?: string;
}

/** Cached package.json data */
interface PackageJson {
  scripts?: Record<string, string>;
}

/**
 * Validate that a script exists in package.json
 *
 * @param cwd - Directory containing package.json
 * @param scriptName - Name of the script to validate
 * @returns Validation result
 */
export function validateScript(cwd: string, scriptName: string): ScriptValidationResult {
  const packageJsonPath = join(cwd, 'package.json');

  if (!existsSync(packageJsonPath)) {
    return {
      exists: false,
      error: `No package.json found in ${cwd}`,
    };
  }

  let packageJson: PackageJson;
  try {
    const content = readFileSync(packageJsonPath, 'utf-8');
    packageJson = JSON.parse(content) as PackageJson;
  } catch (err) {
    return {
      exists: false,
      error: `Failed to read package.json: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  const scripts = packageJson.scripts ?? {};
  const command = scripts[scriptName];

  if (command) {
    return {
      exists: true,
      command,
    };
  }

  const availableScripts = Object.keys(scripts);

  return {
    exists: false,
    availableScripts,
    error: `Script not found: '${scriptName}'`,
  };
}

/**
 * Get all available scripts from package.json
 *
 * @param cwd - Directory containing package.json
 * @returns Record of script names to commands
 */
export function getAvailableScripts(cwd: string): Record<string, string> {
  const packageJsonPath = join(cwd, 'package.json');

  if (!existsSync(packageJsonPath)) {
    return {};
  }

  try {
    const content = readFileSync(packageJsonPath, 'utf-8');
    const packageJson = JSON.parse(content) as PackageJson;
    return packageJson.scripts ?? {};
  } catch {
    return {};
  }
}

/**
 * Format script not found error with recovery suggestion
 */
export function formatScriptNotFoundError(
  scriptName: string,
  availableScripts: string[]
): string {
  const parts = [`Script not found: '${scriptName}'`];

  if (availableScripts.length > 0) {
    parts.push('');
    parts.push('Available scripts in package.json:');
    for (const script of availableScripts.slice(0, 10)) {
      parts.push(`  - ${script}`);
    }
    if (availableScripts.length > 10) {
      parts.push(`  ... and ${availableScripts.length - 10} more`);
    }
  }

  parts.push('');
  parts.push('Recovery: Update configuration to use an existing script name.');

  return parts.join('\n');
}
