/**
 * Configuration schema and defaults for @generacy-ai/agency-plugin-git
 */

/**
 * Git plugin configuration options
 */
export interface GitPluginConfig {
  /** Default remote for push/pull operations. Default: 'origin' */
  defaultRemote: string;

  /** Whether to sign commits with GPG. Default: false */
  signCommits: boolean;

  /** Whether force push is allowed. Default: false (requires escalation) */
  allowForcePush: boolean;

  /** Default timeout for git operations in milliseconds. Default: 30000 */
  timeout: number;
}

/**
 * Default configuration values
 */
export const DEFAULT_CONFIG: GitPluginConfig = {
  defaultRemote: 'origin',
  signCommits: false,
  allowForcePush: false,
  timeout: 30000,
};

/**
 * Merge user config with defaults
 */
export function resolveConfig(
  userConfig?: Partial<GitPluginConfig>
): GitPluginConfig {
  return {
    ...DEFAULT_CONFIG,
    ...userConfig,
  };
}
