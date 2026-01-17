/**
 * Standard prefixes and length thresholds for tool naming convention
 */

/**
 * Approved prefixes for tool naming convention
 */
export const STANDARD_PREFIXES = [
  'source_control',
  'build',
  'run',
  'test',
  'humancy',
  'debug',
  'docs',
] as const;

/**
 * Type representing a standard prefix
 */
export type StandardPrefix = typeof STANDARD_PREFIXES[number];

/**
 * Recommended length limits (warnings only, not hard limits)
 */
export const LENGTH_THRESHOLDS = {
  prefix: 20,
  action: 30,
  total: 50,
} as const;
