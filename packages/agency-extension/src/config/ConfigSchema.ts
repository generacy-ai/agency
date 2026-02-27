import { z } from 'zod';

/**
 * Schema for individual plugin configuration.
 * Each plugin has an ID, enabled state, and arbitrary settings.
 */
export const PluginConfigSchema = z.object({
  id: z.string().min(1, 'Plugin ID is required'),
  enabled: z.boolean().default(true),
  settings: z.record(z.unknown()).default({}),
});

export type PluginConfig = z.infer<typeof PluginConfigSchema>;

/**
 * Schema for mode configuration.
 * Modes define which tools are available and can inherit from other modes.
 * Aligned with core server's ModeDefinition (packages/agency/src/modes/types.ts).
 */
export const ModeConfigSchema = z.object({
  id: z.string().min(1, 'Mode ID is required'),
  name: z.string().min(1, 'Mode name is required'),
  description: z.string().optional(),
  parentId: z.string().optional(),
  includedTools: z.array(z.string()).default([]),
  excludedTools: z.array(z.string()).default([]),
  isDefault: z.boolean().optional(),
});

export type ModeConfig = z.infer<typeof ModeConfigSchema>;

/**
 * Schema for MCP connection configuration within a container.
 * Groups command, args, and environment for connecting to an MCP server.
 */
export const ConnectionConfigSchema = z.object({
  command: z.string().min(1, 'Connection command is required'),
  args: z.array(z.string()).optional(),
  env: z.record(z.string()).optional(),
});

export type ConnectionConfig = z.infer<typeof ConnectionConfigSchema>;

/**
 * Schema for container configuration.
 * Containers represent dev containers that the extension can manage.
 */
export const ContainerConfigSchema = z.object({
  id: z.string().min(1, 'Container ID is required'),
  name: z.string().min(1, 'Container name is required'),
  workspacePath: z.string().min(1, 'Workspace path is required'),
  devcontainerPath: z.string().optional(),
  connection: ConnectionConfigSchema.optional(),
});

export type ContainerConfig = z.infer<typeof ContainerConfigSchema>;

/**
 * Schema for the root Agency configuration.
 * Contains version and arrays of plugins, modes, and containers.
 */
export const AgencyConfigSchema = z.object({
  version: z.string().default('1.0.0'),
  plugins: z.array(PluginConfigSchema).default([]),
  modes: z.array(ModeConfigSchema).default([]),
  containers: z.array(ContainerConfigSchema).default([]),
});

export type AgencyConfig = z.infer<typeof AgencyConfigSchema>;

/**
 * Validate and parse a plugin configuration.
 * @param data Unknown data to validate
 * @returns Parsed PluginConfig or null if invalid
 */
export function parsePluginConfig(data: unknown): PluginConfig | null {
  const result = PluginConfigSchema.safeParse(data);
  return result.success ? result.data : null;
}

/**
 * Validate and parse a mode configuration.
 * @param data Unknown data to validate
 * @returns Parsed ModeConfig or null if invalid
 */
export function parseModeConfig(data: unknown): ModeConfig | null {
  const result = ModeConfigSchema.safeParse(data);
  return result.success ? result.data : null;
}

/**
 * Validate and parse a container configuration.
 * @param data Unknown data to validate
 * @returns Parsed ContainerConfig or null if invalid
 */
export function parseContainerConfig(data: unknown): ContainerConfig | null {
  const result = ContainerConfigSchema.safeParse(data);
  return result.success ? result.data : null;
}

/**
 * Validate and parse the full Agency configuration.
 * @param data Unknown data to validate
 * @returns Parsed AgencyConfig or null if invalid
 */
export function parseAgencyConfig(data: unknown): AgencyConfig | null {
  const result = AgencyConfigSchema.safeParse(data);
  return result.success ? result.data : null;
}

/**
 * Get validation errors for an Agency configuration.
 * @param data Unknown data to validate
 * @returns Array of error messages, empty if valid
 */
export function getValidationErrors(data: unknown): string[] {
  const result = AgencyConfigSchema.safeParse(data);
  if (result.success) {
    return [];
  }
  return result.error.errors.map(
    (err) => `${err.path.join('.')}: ${err.message}`
  );
}
