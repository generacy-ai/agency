/**
 * Standard prefixes and length thresholds for tool naming convention
 *
 * This module re-exports from the canonical tool-naming prefix schema
 * for backward compatibility. The source of truth is `./naming/prefix.ts`.
 */

import { ToolPrefixValues } from './naming/prefix.js';

/**
 * Approved prefixes for tool naming convention (10 total).
 *
 * Re-exported from the canonical Zod-based prefix schema for backward
 * compatibility. Prefer importing `ToolPrefixValues` and `ToolPrefixSchema`
 * from `./naming/prefix.js` for new code.
 */
export { ToolPrefixValues as STANDARD_PREFIXES } from './naming/prefix.js';

/**
 * Type representing a standard prefix
 */
export type StandardPrefix = (typeof ToolPrefixValues)[number];

/**
 * Recommended length limits (warnings only, not hard limits)
 */
export const LENGTH_THRESHOLDS = {
  prefix: 20,
  action: 30,
  total: 50,
} as const;
