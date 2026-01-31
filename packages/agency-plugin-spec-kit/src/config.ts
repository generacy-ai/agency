/**
 * Configuration schema and defaults for @generacy-ai/agency-plugin-spec-kit
 *
 * Uses Zod for runtime validation with TypeScript type inference.
 */

import { z } from 'zod';

/**
 * Zod schema for path configuration
 */
export const PathsConfigSchema = z.object({
  /** Directory for spec artifacts (default: 'specs') */
  specs: z.string().default('specs'),
  /** Directory for templates (default: '.specify/templates') */
  templates: z.string().default('.specify/templates'),
});

/**
 * Zod schema for branch naming configuration
 */
export const BranchesConfigSchema = z.object({
  /** Branch name pattern (default: '{paddedNumber}-{slug}') */
  pattern: z.string().default('{paddedNumber}-{slug}'),
  /** Zero-padding for issue numbers (default: 3) */
  numberPadding: z.number().min(1).max(10).default(3),
  /** Maximum words in slug (default: 4) */
  maxSlugWords: z.number().min(1).max(10).default(4),
});

/**
 * Zod schema for Jira provider configuration
 */
export const JiraConfigSchema = z.object({
  /** Jira base URL (e.g., https://company.atlassian.net) */
  baseUrl: z.string(),
  /** Jira project key (e.g., PROJ) */
  projectKey: z.string(),
  /** Jira user email for authentication (optional, can use JIRA_EMAIL env var) */
  email: z.string().optional(),
  /** Jira API token for authentication (optional, can use JIRA_API_TOKEN env var) */
  apiToken: z.string().optional(),
});

/**
 * Zod schema for Shortcut provider configuration
 */
export const ShortcutConfigSchema = z.object({
  /** Shortcut workspace slug */
  workspaceSlug: z.string(),
});

/**
 * Zod schema for backlog provider configuration
 */
export const BacklogConfigSchema = z.object({
  /** Backlog provider type (default: 'github') */
  provider: z.enum(['github', 'jira', 'shortcut', 'local']).default('github'),
  /** GitHub-specific configuration (empty for now) */
  github: z.object({}).optional(),
  /** Jira-specific configuration */
  jira: JiraConfigSchema.optional(),
  /** Shortcut-specific configuration */
  shortcut: ShortcutConfigSchema.optional(),
});

/**
 * Complete SpecKit plugin configuration schema
 *
 * Provides sensible defaults for all settings while allowing full customization.
 *
 * @example
 * ```typescript
 * const config = SpecKitConfigSchema.parse({
 *   paths: { specs: 'features' },
 *   backlog: { provider: 'jira', jira: { baseUrl: 'https://jira.example.com', projectKey: 'PROJ' } },
 * });
 * ```
 */
export const SpecKitConfigSchema = z.object({
  /** Path configuration */
  paths: PathsConfigSchema.default({}),
  /** Branch naming configuration */
  branches: BranchesConfigSchema.default({}),
  /** Backlog provider configuration */
  backlog: BacklogConfigSchema.default({}),
});

/**
 * SpecKit plugin configuration type inferred from Zod schema
 */
export type SpecKitConfig = z.infer<typeof SpecKitConfigSchema>;

/**
 * Default configuration with all defaults applied
 */
export const DEFAULT_CONFIG: SpecKitConfig = SpecKitConfigSchema.parse({});

/**
 * Parse and validate configuration from raw input
 *
 * @param raw - Raw configuration object (or undefined for defaults)
 * @returns Validated configuration with defaults applied
 * @throws ZodError if configuration is invalid
 */
export function parseConfig(raw?: unknown): SpecKitConfig {
  return SpecKitConfigSchema.parse(raw ?? {});
}

/**
 * Legacy interface for backwards compatibility
 */
export interface SpecKitPluginConfig {
  /** Directory where specs are stored */
  specDirectory: string;
  /** Directory containing spec templates */
  templateDirectory: string;
}

/**
 * Resolve legacy config format to new format
 *
 * @deprecated Use parseConfig instead
 */
export function resolveConfig(
  userConfig?: Partial<SpecKitPluginConfig>
): SpecKitPluginConfig {
  const parsed = parseConfig({
    paths: {
      specs: userConfig?.specDirectory,
      templates: userConfig?.templateDirectory,
    },
  });
  return {
    specDirectory: parsed.paths.specs,
    templateDirectory: parsed.paths.templates,
  };
}
