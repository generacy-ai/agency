/**
 * Tool name validation for Agency
 *
 * Validates tool names follow the naming convention: prefix.action_name
 * - Prefix: snake_case, from STANDARD_PREFIXES or custom (with warning/error)
 * - Action: snake_case only
 */

import { STANDARD_PREFIXES, LENGTH_THRESHOLDS } from './prefixes.js';
import type { ValidationOptions, ValidationResult } from './types.js';

/**
 * Pattern for valid snake_case identifiers
 * - Starts with lowercase letter
 * - Contains lowercase letters, numbers
 * - Underscores separate words
 */
const SNAKE_CASE_PATTERN = /^[a-z][a-z0-9]*(_[a-z0-9]+)*$/;

/**
 * Validate a tool name against the naming convention
 *
 * Format: prefix.action_name
 * - Exactly one dot separator
 * - Prefix must be snake_case (from standard list or custom with warning/error)
 * - Action must be snake_case
 *
 * @param name - The tool name to validate
 * @param options - Validation options (strict mode rejects custom prefixes)
 * @returns ValidationResult with valid flag, errors, and warnings
 */
export function validateToolName(
  name: string,
  options: ValidationOptions = {}
): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const { strict = false } = options;

  // Check for dot separator
  const dotCount = (name.match(/\./g) || []).length;
  if (dotCount !== 1) {
    errors.push('Tool name must contain exactly one dot separator');
    return { valid: false, errors, warnings };
  }

  const [prefix, action] = name.split('.');

  // Check for empty parts
  if (!prefix) {
    errors.push('Prefix cannot be empty');
  }
  if (!action) {
    errors.push('Action name cannot be empty');
  }

  if (!prefix || !action) {
    return { valid: false, errors, warnings };
  }

  // Validate prefix format (snake_case)
  if (!SNAKE_CASE_PATTERN.test(prefix)) {
    errors.push(`Prefix must be snake_case: ${prefix}`);
  }

  // Validate action format (snake_case)
  if (!SNAKE_CASE_PATTERN.test(action)) {
    errors.push(`Action must be snake_case: ${action}`);
  }

  // If we have format errors, return early
  if (errors.length > 0) {
    return { valid: false, errors, warnings };
  }

  // Check if prefix is standard or custom
  const isStandardPrefix = (STANDARD_PREFIXES as readonly string[]).includes(
    prefix
  );
  if (!isStandardPrefix) {
    if (strict) {
      errors.push(`Custom prefix not allowed in strict mode: ${prefix}`);
    } else {
      warnings.push(
        `Using custom prefix: ${prefix}. Standard prefixes: ${STANDARD_PREFIXES.join(', ')}`
      );
    }
  }

  // Length threshold warnings
  if (prefix.length > LENGTH_THRESHOLDS.prefix) {
    warnings.push(
      `Prefix exceeds recommended length (${prefix.length} > ${LENGTH_THRESHOLDS.prefix})`
    );
  }
  if (action.length > LENGTH_THRESHOLDS.action) {
    warnings.push(
      `Action name exceeds recommended length (${action.length} > ${LENGTH_THRESHOLDS.action})`
    );
  }
  if (name.length > LENGTH_THRESHOLDS.total) {
    warnings.push(
      `Tool name exceeds recommended length (${name.length} > ${LENGTH_THRESHOLDS.total})`
    );
  }

  return { valid: errors.length === 0, errors, warnings };
}
