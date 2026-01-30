/**
 * Configuration schema and types for spec-kit using Zod
 *
 * Provides runtime validation of configuration with TypeScript
 * type inference from Zod schemas.
 */

import { z } from 'zod';

/**
 * Zod schema for task ID configuration.
 *
 * Validates and provides defaults for task ID format settings.
 */
export const TaskIdConfigSchema = z.object({
  /** Prefix for task IDs (default: "T") */
  idPrefix: z.string().default('T'),

  /** Number padding (default: 3, range: 1-6) */
  idPadding: z.number().min(1).max(6).default(3),

  /** Separator after prefix (default: "") */
  idSeparator: z.string().default(''),

  /** Prefix for group IDs (default: "TG") */
  groupPrefix: z.string().default('TG'),

  /** Separator for groups (default: "-") */
  groupSeparator: z.string().default('-'),

  /** Group number padding (default: 3, range: 1-6) */
  groupPadding: z.number().min(1).max(6).default(3),
});

/**
 * Task ID configuration type inferred from schema.
 */
export type TaskIdConfigType = z.infer<typeof TaskIdConfigSchema>;

/**
 * Zod schema for customizable file names.
 *
 * Allows overriding default file names for spec artifacts.
 */
export const FileNamesSchema = z.object({
  /** Specification file name (default: "spec.md") */
  spec: z.string().default('spec.md'),

  /** Plan file name (default: "plan.md") */
  plan: z.string().default('plan.md'),

  /** Tasks file name (default: "tasks.md") */
  tasks: z.string().default('tasks.md'),

  /** Research file name (default: "research.md") */
  research: z.string().default('research.md'),

  /** Data model file name (default: "data-model.md") */
  dataModel: z.string().default('data-model.md'),

  /** Quickstart file name (default: "quickstart.md") */
  quickstart: z.string().default('quickstart.md'),

  /** Clarifications file name (default: "clarifications.md") */
  clarifications: z.string().default('clarifications.md'),
});

/**
 * File names configuration type inferred from schema.
 */
export type FileNamesType = z.infer<typeof FileNamesSchema>;

/**
 * Zod schema for directory names.
 *
 * Allows overriding default directory names.
 */
export const DirectoryNamesSchema = z.object({
  /** Contracts directory name (default: "contracts") */
  contracts: z.string().default('contracts'),

  /** Checklists directory name (default: "checklists") */
  checklists: z.string().default('checklists'),
});

/**
 * Directory names configuration type inferred from schema.
 */
export type DirectoryNamesType = z.infer<typeof DirectoryNamesSchema>;

/**
 * Zod schema for the complete SpecKit configuration.
 *
 * Provides core configuration with extensibility hooks for plugins.
 *
 * @example
 * ```typescript
 * const config = SpecKitConfigSchema.parse({
 *   specDirectory: 'specs',
 *   taskIdConfig: {
 *     idPrefix: 'TASK',
 *     idPadding: 4,
 *   },
 * });
 * ```
 */
export const SpecKitConfigSchema = z.object({
  /** Directory for spec artifacts (default: "specs") */
  specDirectory: z.string().default('specs'),

  /** Directory containing spec templates (default: ".spec-templates") */
  templateDirectory: z.string().default('.spec-templates'),

  /** Custom file names */
  fileNames: FileNamesSchema.default({}),

  /** Custom directory names */
  directoryNames: DirectoryNamesSchema.default({}),

  /** Task ID format configuration */
  taskIdConfig: TaskIdConfigSchema.default({}),

  /** Extension point for plugins */
  extensions: z.record(z.unknown()).default({}),
});

/**
 * Complete SpecKit configuration type inferred from schema.
 */
export type SpecKitConfig = z.infer<typeof SpecKitConfigSchema>;

/**
 * Default SpecKit configuration.
 *
 * Created by parsing an empty object through the schema,
 * which applies all defaults.
 */
export const DEFAULT_SPECKIT_CONFIG: SpecKitConfig =
  SpecKitConfigSchema.parse({});

/**
 * Parse and validate a configuration object.
 *
 * @param config - Partial configuration to validate
 * @returns Validated and complete configuration with defaults applied
 * @throws ZodError if configuration is invalid
 *
 * @example
 * ```typescript
 * const config = parseConfig({
 *   specDirectory: 'features',
 *   taskIdConfig: { idPrefix: 'F' },
 * });
 * // config.fileNames.spec === 'spec.md' (default applied)
 * ```
 */
export function parseConfig(config: unknown): SpecKitConfig {
  return SpecKitConfigSchema.parse(config);
}

/**
 * Safely parse a configuration object without throwing.
 *
 * @param config - Partial configuration to validate
 * @returns Parse result with success flag and either data or error
 *
 * @example
 * ```typescript
 * const result = safeParseConfig(userInput);
 * if (result.success) {
 *   console.log(result.data.specDirectory);
 * } else {
 *   console.error(result.error.issues);
 * }
 * ```
 */
export function safeParseConfig(
  config: unknown
): z.SafeParseReturnType<unknown, SpecKitConfig> {
  return SpecKitConfigSchema.safeParse(config);
}

/**
 * Merge partial configuration with defaults.
 *
 * @param partial - Partial configuration to merge
 * @returns Complete configuration with defaults for missing values
 *
 * @example
 * ```typescript
 * const config = mergeConfig({ specDirectory: 'features' });
 * // All other values use defaults
 * ```
 */
export function mergeConfig(
  partial?: Partial<SpecKitConfig>
): SpecKitConfig {
  return SpecKitConfigSchema.parse(partial ?? {});
}
