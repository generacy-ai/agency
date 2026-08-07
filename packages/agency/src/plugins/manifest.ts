/**
 * Plugin Manifest Validation for Agency
 *
 * Provides Zod-based schema validation for plugin manifests.
 * Validates manifest structure, field formats, and semantic constraints.
 */

import { z } from 'zod';
import type { PluginManifest, ValidationResult } from './types.js';

/**
 * Semver version pattern (simplified)
 * Matches: 1.0.0, 1.2.3-alpha, 1.0.0-beta.1, 1.0.0+build.123,
 * 0.0.0-preview-20260722182217
 *
 * Prerelease and build identifiers may contain hyphens (semver 2.0.0 §9-10),
 * so the character classes must include `-` and not just `\w`. The published
 * preview channel uses `0.0.0-preview-<timestamp>`; rejecting it here made
 * every preview-channel plugin silently undiscoverable.
 */
const SEMVER_PATTERN = /^\d+\.\d+\.\d+(-[\w.-]+)?(\+[\w.-]+)?$/;

/**
 * Plugin ID pattern (npm package format)
 * Matches: @scope/name, @generacy-ai/agency-plugin-foo
 */
const PLUGIN_ID_PATTERN = /^@[\w-]+\/[\w-]+$/;

/**
 * Zod schema for plugin manifest validation
 */
export const PluginManifestSchema = z.object({
  /** Unique identifier (npm package name format: @scope/name) */
  id: z
    .string()
    .min(1, 'Plugin ID is required')
    .regex(PLUGIN_ID_PATTERN, 'Plugin ID must be in format @scope/name'),

  /** Human-readable name */
  name: z.string().min(1, 'Plugin name is required'),

  /** Semantic version */
  version: z
    .string()
    .regex(SEMVER_PATTERN, 'Version must be valid semver (e.g., 1.0.0)'),

  /** Plugin description */
  description: z.string().optional(),

  /** Entry point relative to package root */
  main: z.string().default('./dist/index.js'),

  /** TypeScript types file */
  types: z.string().optional(),

  /** Plugin dependencies (other plugin IDs) */
  dependencies: z.array(z.string()).default([]),

  /** Peer dependencies with version ranges */
  peerDependencies: z.record(z.string()).optional(),

  /** Tool names this plugin provides */
  tools: z.array(z.string()).optional(),

  /** Mode names this plugin registers */
  modes: z.array(z.string()).optional(),

  /** Channel names this plugin registers */
  channels: z.array(z.string()).optional(),

  /** If true, plugin failure stops the system */
  critical: z.boolean().default(false),
});

/**
 * Type for the parsed schema result
 */
export type ParsedManifest = z.infer<typeof PluginManifestSchema>;

/**
 * Validate a plugin manifest
 *
 * @param manifest The manifest object to validate
 * @returns ValidationResult with valid flag and any errors
 */
export function validateManifest(manifest: unknown): ValidationResult {
  const result = PluginManifestSchema.safeParse(manifest);

  if (result.success) {
    return { valid: true };
  }

  return {
    valid: false,
    errors: result.error.issues.map((issue) => ({
      path: issue.path.join('.'),
      message: issue.message,
    })),
  };
}

/**
 * Parse and validate a manifest, returning typed result
 *
 * @param manifest The manifest object to parse
 * @returns The parsed manifest or throws on validation error
 */
export function parseManifest(manifest: unknown): PluginManifest {
  return PluginManifestSchema.parse(manifest) as PluginManifest;
}

/**
 * Safely parse a manifest, returning null on error
 *
 * @param manifest The manifest object to parse
 * @returns The parsed manifest or null if invalid
 */
export function safeParseManifest(manifest: unknown): PluginManifest | null {
  const result = PluginManifestSchema.safeParse(manifest);
  return result.success ? (result.data as PluginManifest) : null;
}

/**
 * Validate dependency IDs in a manifest
 *
 * Checks that all dependency IDs are valid plugin ID format.
 *
 * @param manifest The manifest to validate dependencies for
 * @returns Array of invalid dependency IDs
 */
export function validateDependencyIds(manifest: PluginManifest): string[] {
  const invalidDeps: string[] = [];

  for (const dep of manifest.dependencies) {
    if (!PLUGIN_ID_PATTERN.test(dep)) {
      invalidDeps.push(dep);
    }
  }

  return invalidDeps;
}

/**
 * Create a minimal valid manifest for testing
 *
 * @param id Plugin ID
 * @param overrides Additional fields to set
 * @returns A valid PluginManifest
 */
export function createTestManifest(
  id: string,
  overrides: Partial<PluginManifest> = {}
): PluginManifest {
  return {
    id,
    name: id.split('/')[1] ?? id,
    version: '1.0.0',
    main: './dist/index.js',
    dependencies: [],
    critical: false,
    ...overrides,
  };
}
