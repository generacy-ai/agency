/**
 * Mode System Type Definitions
 *
 * Defines types and Zod schemas for the mode system that controls
 * which tools are active at any given time.
 */

import { z } from 'zod';

/**
 * Mode definition as specified in configuration
 *
 * Modes control which tools are visible to agents using include/exclude patterns.
 * Supports inheritance via the `extends` property.
 */
export interface ModeDefinition {
  /** Mode name (unique identifier) */
  name: string;

  /** Human-readable description */
  description?: string;

  /** Parent mode to inherit from */
  extends?: string;

  /** Tool patterns to include (glob syntax) */
  includes: string[];

  /** Tool patterns to exclude (always win over includes) */
  excludes?: string[];
}

/**
 * Resolved mode with inheritance flattened
 *
 * Internal representation after processing inheritance chain.
 * All includes/excludes from ancestors are merged.
 */
export interface ResolvedMode {
  /** Mode name */
  name: string;

  /** Human-readable description */
  description?: string;

  /** Flattened includes from self + all ancestors */
  includes: string[];

  /** Flattened excludes from self + all ancestors */
  excludes: string[];

  /** Inheritance chain for debugging: [self, parent, grandparent, ...] */
  inheritanceChain: string[];
}

/**
 * Mode configuration
 *
 * Contains all mode definitions and the default mode setting.
 */
export interface ModeConfig {
  /** Mode definitions keyed by name */
  modes: Record<string, ModeDefinition>;

  /** Default mode on startup (defaults to 'coding') */
  defaultMode?: string;
}

/**
 * Zod schema for ModeDefinition
 *
 * Validates:
 * - name: minimum 1 character
 * - includes: minimum 1 element
 * - excludes: defaults to empty array
 */
export const ModeDefinitionSchema = z.object({
  /** Mode name (unique identifier) */
  name: z.string().min(1, 'Mode name is required'),

  /** Human-readable description */
  description: z.string().optional(),

  /** Parent mode to inherit from */
  extends: z.string().optional(),

  /** Tool patterns to include (glob syntax) */
  includes: z.array(z.string()).min(1, 'At least one include pattern is required'),

  /** Tool patterns to exclude (always win over includes) */
  excludes: z.array(z.string()).default([]),
});

/**
 * Zod schema for ModeConfig
 *
 * Validates:
 * - modes: record of mode definitions
 * - defaultMode: defaults to 'coding'
 */
export const ModeConfigSchema = z.object({
  /** Mode definitions keyed by name */
  modes: z.record(ModeDefinitionSchema),

  /** Default mode on startup (defaults to 'coding') */
  defaultMode: z.string().default('coding'),
});

/**
 * Inferred ModeDefinition type from schema (includes defaults)
 */
export type ModeDefinitionInput = z.input<typeof ModeDefinitionSchema>;

/**
 * Inferred ModeConfig type from schema (includes defaults)
 */
export type ModeConfigInput = z.input<typeof ModeConfigSchema>;
