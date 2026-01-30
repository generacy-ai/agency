/**
 * Configuration schema and defaults for @generacy-ai/agency-plugin-spec-kit
 */

/**
 * Configuration options for the SpecKit plugin
 */
export interface SpecKitPluginConfig {
  /** Directory where specs are stored. Default: 'specs' */
  specDirectory: string;

  /** Directory containing spec templates. Default: '.spec-templates' */
  templateDirectory: string;
}

/**
 * Default configuration values
 */
export const DEFAULT_CONFIG: SpecKitPluginConfig = {
  specDirectory: 'specs',
  templateDirectory: '.spec-templates',
};

/**
 * Merge user config with defaults
 */
export function resolveConfig(
  userConfig?: Partial<SpecKitPluginConfig>
): SpecKitPluginConfig {
  return {
    ...DEFAULT_CONFIG,
    ...userConfig,
  };
}
