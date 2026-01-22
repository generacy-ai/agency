import type { AgencyConfig } from './ConfigSchema';

/**
 * Current configuration schema version.
 * Increment when making breaking changes to the schema.
 */
export const DEFAULT_CONFIG_VERSION = '1.0.0';

/**
 * Default configuration file name.
 */
export const DEFAULT_CONFIG_FILENAME = 'agency.config.json';

/**
 * Default configuration directory relative to workspace root.
 */
export const DEFAULT_CONFIG_DIR = '.agency';

/**
 * Full relative path to the configuration file.
 */
export const DEFAULT_CONFIG_PATH = `${DEFAULT_CONFIG_DIR}/${DEFAULT_CONFIG_FILENAME}`;

/**
 * Create a new default configuration.
 * This is used when no configuration file exists.
 * @returns A valid AgencyConfig with default values
 */
export function createDefaultConfig(): AgencyConfig {
  return {
    version: DEFAULT_CONFIG_VERSION,
    plugins: [],
    modes: [
      {
        id: 'default',
        name: 'Default',
<<<<<<< HEAD
        includedTools: [],
        excludedTools: [],
        isDefault: true,
=======
        tools: [],
>>>>>>> origin/038-epic-agency-vs-code
      },
    ],
    containers: [],
  };
}

/**
 * Check if a configuration version is compatible with the current version.
 * @param version The version string to check
 * @returns true if compatible, false otherwise
 */
export function isCompatibleVersion(version: string): boolean {
  // For now, only exact matches are compatible
  // Future: implement semver compatibility checking
  const [major] = version.split('.');
  const [currentMajor] = DEFAULT_CONFIG_VERSION.split('.');
  return major === currentMajor;
}
