/**
 * Mode Configuration Loader
 *
 * Loads mode configuration from YAML or JSON files, falling back to
 * built-in default modes when no configuration is present.
 */

import fs from 'node:fs';
import path from 'node:path';
import { parse } from 'yaml';
import type { ModeConfig, ModeDefinition } from './types.js';
import { ModeConfigSchema } from './types.js';
import { resolveInheritance } from './inheritance-resolver.js';
import { AgencyError, ErrorCodes } from '../errors/index.js';

/**
 * Built-in default modes
 *
 * These modes are used when no configuration file is present.
 * They provide a sensible starting point for common development workflows.
 */
export const DEFAULT_MODES: Record<string, ModeDefinition> = {
  research: {
    name: 'research',
    description: 'Information gathering and exploration',
    includes: ['humancy.*', 'source_control.status', 'source_control.log'],
  },
  coding: {
    name: 'coding',
    description: 'Active development',
    extends: 'research',
    includes: ['source_control.*', 'build.*', 'test.*'],
  },
  review: {
    name: 'review',
    description: 'Code review and feedback',
    extends: 'research',
    includes: ['source_control.diff', 'source_control.blame'],
  },
  debug: {
    name: 'debug',
    description: 'Debugging and troubleshooting',
    extends: 'coding',
    includes: ['run.*'],
  },
};

/**
 * Loads mode configuration from project configuration files.
 *
 * Configuration is loaded from (in order of precedence):
 * 1. `.agency/modes.yaml` - Primary YAML configuration
 * 2. `.agency/config.json` - Fallback JSON configuration (modes section)
 * 3. Built-in default modes - If no configuration file exists
 *
 * @param projectRoot - Root directory of the project
 * @returns Validated ModeConfig with resolved inheritance
 * @throws {AgencyError} MODE_CONFIG_INVALID if configuration validation fails
 *
 * @example
 * ```typescript
 * const config = loadModeConfig('/path/to/project');
 * console.log(config.defaultMode); // 'coding'
 * console.log(config.modes.coding.includes); // ['humancy.*', ...]
 * ```
 */
export function loadModeConfig(projectRoot: string): ModeConfig {
  const yamlPath = path.join(projectRoot, '.agency', 'modes.yaml');
  const jsonPath = path.join(projectRoot, '.agency', 'config.json');

  let rawConfig: unknown;

  // Try YAML configuration first
  if (fs.existsSync(yamlPath)) {
    try {
      const content = fs.readFileSync(yamlPath, 'utf-8');
      rawConfig = parse(content);
    } catch (error) {
      throw new AgencyError(
        ErrorCodes.MODE_CONFIG_INVALID,
        `Failed to parse modes.yaml: ${error instanceof Error ? error.message : String(error)}`,
        { path: yamlPath }
      );
    }
  }
  // Try JSON configuration as fallback
  else if (fs.existsSync(jsonPath)) {
    try {
      const content = fs.readFileSync(jsonPath, 'utf-8');
      const jsonConfig = JSON.parse(content) as Record<string, unknown>;
      // Extract modes section from config.json
      if (jsonConfig['modes']) {
        rawConfig = {
          modes: jsonConfig['modes'],
          defaultMode: jsonConfig['defaultMode'],
        };
      }
    } catch (error) {
      throw new AgencyError(
        ErrorCodes.MODE_CONFIG_INVALID,
        `Failed to parse config.json: ${error instanceof Error ? error.message : String(error)}`,
        { path: jsonPath }
      );
    }
  }

  // Use default modes if no configuration found
  if (!rawConfig) {
    rawConfig = {
      modes: DEFAULT_MODES,
      defaultMode: 'coding',
    };
  }

  // Validate configuration with Zod schema
  const parseResult = ModeConfigSchema.safeParse(rawConfig);

  if (!parseResult.success) {
    const errors = parseResult.error.errors
      .map((e) => `${e.path.join('.')}: ${e.message}`)
      .join('; ');
    throw new AgencyError(
      ErrorCodes.MODE_CONFIG_INVALID,
      `Invalid mode configuration: ${errors}`,
      { errors: parseResult.error.errors }
    );
  }

  const config = parseResult.data;

  // Add names to mode definitions (they're used as keys in the record)
  const modesWithNames: Record<string, ModeDefinition> = {};
  for (const [name, mode] of Object.entries(config.modes)) {
    modesWithNames[name] = {
      ...mode,
      name,
    };
  }

  // Resolve inheritance to validate the inheritance chain
  // This will throw if there are circular dependencies or invalid extends
  resolveInheritance(modesWithNames);

  // Validate that defaultMode exists in modes
  if (!modesWithNames[config.defaultMode]) {
    throw new AgencyError(
      ErrorCodes.MODE_CONFIG_INVALID,
      `Default mode '${config.defaultMode}' is not defined in modes`,
      { defaultMode: config.defaultMode, availableModes: Object.keys(modesWithNames) }
    );
  }

  return {
    modes: modesWithNames,
    defaultMode: config.defaultMode,
  };
}
