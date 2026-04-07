/**
 * Configuration types and defaults for npm plugin
 */

import type { PackageManager } from './pm/types.js';

/** Script name mappings */
export interface ScriptConfig {
  /** Build script name */
  build?: string;

  /** Test script name */
  test?: string;

  /** Lint script name */
  lint?: string;

  /** Format script name */
  format?: string;

  /** Validate short-circuit script name */
  validate?: string;

  /** Integration test script name */
  'test:integration'?: string;

  /** E2E test script name */
  'test:e2e'?: string;

  /** Coverage script name */
  'test:coverage'?: string;
}

/** npm plugin configuration */
export interface NpmPluginConfig {
  /** Package manager to use. 'auto' for lockfile detection. */
  packageManager: 'auto' | PackageManager;

  /** Script name mappings */
  scripts: ScriptConfig;
}

/** Default configuration values */
export const DEFAULT_CONFIG: NpmPluginConfig = {
  packageManager: 'auto',
  scripts: {
    build: 'build',
    test: 'test',
    lint: 'lint',
    format: 'format',
    validate: 'validate',
    'test:integration': 'test:integration',
    'test:e2e': 'test:e2e',
    'test:coverage': 'test:coverage',
  },
};

/** Merge user config with defaults */
export function mergeConfig(userConfig?: Partial<NpmPluginConfig>): NpmPluginConfig {
  if (!userConfig) {
    return DEFAULT_CONFIG;
  }

  return {
    packageManager: userConfig.packageManager ?? DEFAULT_CONFIG.packageManager,
    scripts: {
      ...DEFAULT_CONFIG.scripts,
      ...userConfig.scripts,
    },
  };
}
