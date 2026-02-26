/**
 * Tool name validation for Agency
 *
 * Validates tool names follow the naming convention: prefix.action_name
 * - Prefix: snake_case, from STANDARD_PREFIXES or custom (with warning/error)
 * - Action: snake_case only
 *
 * Uses Zod schemas from `./naming/` internally while preserving the original
 * function signature for backward compatibility.
 */

import { STANDARD_PREFIXES, LENGTH_THRESHOLDS } from './prefixes.js';
import { ToolPrefixSchema } from './naming/prefix.js';
import { ActionNameSchema } from './naming/action.js';
import type { ValidationOptions, ValidationResult } from './types.js';

/**
 * Pattern for valid snake_case identifiers.
 * Used as a quick structural check before delegating to Zod schemas.
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
 * Internally delegates to Zod schemas (ToolPrefixSchema, ActionNameSchema)
 * for validation while mapping results to the existing error/warning format.
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

  // Validate prefix format (snake_case) before checking Zod enum.
  // The Zod enum only contains known prefixes, so a custom snake_case prefix
  // would fail the enum check. We need to distinguish format errors from
  // "valid format but unknown prefix" — hence the regex pre-check.
  if (!SNAKE_CASE_PATTERN.test(prefix)) {
    errors.push(`Prefix must be snake_case: ${prefix}`);
  }

  // Validate action format using Zod ActionNameSchema
  const actionResult = ActionNameSchema.safeParse(action);
  if (!actionResult.success) {
    errors.push(`Action must be snake_case: ${action}`);
  }

  // If we have format errors, return early
  if (errors.length > 0) {
    return { valid: false, errors, warnings };
  }

  // Check prefix against Zod enum for standard prefix validation
  const prefixResult = ToolPrefixSchema.safeParse(prefix);
  if (!prefixResult.success) {
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
