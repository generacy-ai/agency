import { z } from 'zod';
import { ToolPrefixValues } from './prefix.js';

/**
 * Error codes for tool name validation failures.
 */
export const ToolValidationErrorCode = {
  /** The prefix is not one of the 10 allowed prefixes */
  INVALID_PREFIX: 'INVALID_PREFIX',
  /** The action name does not follow snake_case convention */
  INVALID_ACTION_NAME: 'INVALID_ACTION_NAME',
  /** The tool name is missing a prefix (no dot separator) */
  MISSING_PREFIX: 'MISSING_PREFIX',
  /** The tool name format is malformed (e.g., multiple dots) */
  MALFORMED_NAME: 'MALFORMED_NAME',
} as const;

export type ToolValidationErrorCode =
  (typeof ToolValidationErrorCode)[keyof typeof ToolValidationErrorCode];

/**
 * Zod schema for validation error codes.
 */
export const ToolValidationErrorCodeSchema = z.enum([
  'INVALID_PREFIX',
  'INVALID_ACTION_NAME',
  'MISSING_PREFIX',
  'MALFORMED_NAME',
]);

/**
 * Structured validation error for tool names.
 *
 * Provides agent-friendly error information with:
 * - A specific error code for programmatic handling
 * - A human-readable message
 * - Optional suggestions for fixing the error
 */
export interface ToolValidationError {
  /** Specific error code for programmatic handling */
  code: ToolValidationErrorCode;
  /** Human-readable error message */
  message: string;
  /** Suggestions for fixing the error */
  suggestions?: string[];
}

/**
 * Zod schema for ToolValidationError.
 */
export const ToolValidationErrorSchema = z.object({
  code: ToolValidationErrorCodeSchema,
  message: z.string(),
  suggestions: z.array(z.string()).optional(),
});

/**
 * Creates a validation error for an invalid prefix.
 *
 * @param prefix - The invalid prefix that was provided
 * @returns A structured validation error with suggestions
 */
export function createInvalidPrefixError(prefix: string): ToolValidationError {
  return {
    code: ToolValidationErrorCode.INVALID_PREFIX,
    message: `Invalid prefix "${prefix}". Tool prefixes must be one of the predefined categories.`,
    suggestions: [
      `Use one of the valid prefixes: ${ToolPrefixValues.join(', ')}`,
      `Example: "source_control.${prefix}" instead of "${prefix}"`,
    ],
  };
}

/**
 * Creates a validation error for an invalid action name.
 *
 * @param action - The invalid action name that was provided
 * @returns A structured validation error with suggestions
 */
export function createInvalidActionNameError(action: string): ToolValidationError {
  // Detect common issues and provide specific suggestions
  const suggestions: string[] = [];

  if (/[A-Z]/.test(action)) {
    // Contains uppercase letters
    const snakeCased = action.replace(/([a-z])([A-Z])/g, '$1_$2').toLowerCase();
    suggestions.push(`Convert to snake_case: "${snakeCased}" instead of "${action}"`);
  }

  if (/-/.test(action)) {
    // Contains hyphens
    const snakeCased = action.replace(/-/g, '_');
    suggestions.push(`Use underscores instead of hyphens: "${snakeCased}" instead of "${action}"`);
  }

  if (/^[0-9]/.test(action)) {
    // Starts with a number
    suggestions.push('Action names must start with a lowercase letter');
  }

  if (suggestions.length === 0) {
    suggestions.push('Action names must be snake_case (lowercase letters, numbers, underscores)');
    suggestions.push('Examples: "commit", "run_tests", "install_deps"');
  }

  return {
    code: ToolValidationErrorCode.INVALID_ACTION_NAME,
    message: `Invalid action name "${action}". Action names must be snake_case starting with a lowercase letter.`,
    suggestions,
  };
}

/**
 * Creates a validation error for a missing prefix.
 *
 * @param name - The tool name that's missing a prefix
 * @returns A structured validation error with suggestions
 */
export function createMissingPrefixError(name: string): ToolValidationError {
  return {
    code: ToolValidationErrorCode.MISSING_PREFIX,
    message: `Tool name "${name}" is missing a prefix. Tool names must be in "{prefix}.{action}" format.`,
    suggestions: [
      `Add a prefix: "source_control.${name}" or "build.${name}"`,
      `Valid prefixes: ${ToolPrefixValues.join(', ')}`,
    ],
  };
}

/**
 * Creates a validation error for a malformed tool name.
 *
 * @param name - The malformed tool name
 * @returns A structured validation error with suggestions
 */
export function createMalformedNameError(name: string): ToolValidationError {
  const suggestions: string[] = [];
  const dotCount = (name.match(/\./g) ?? []).length;

  if (dotCount > 1) {
    suggestions.push('Tool names must contain exactly one dot separator');
    suggestions.push('Format: "{prefix}.{action}"');
  } else if (dotCount === 0) {
    suggestions.push('Tool names must include a prefix separated by a dot');
    suggestions.push(`Example: "source_control.${name}"`);
  } else {
    suggestions.push('Check that both prefix and action are valid');
    suggestions.push('Format: "{prefix}.{action}"');
  }

  return {
    code: ToolValidationErrorCode.MALFORMED_NAME,
    message: `Malformed tool name "${name}". Tool names must be in "{prefix}.{action}" format.`,
    suggestions,
  };
}

/**
 * Validates a tool name and returns a structured error if invalid.
 *
 * This is the structured validation function from contracts. Agency's
 * primary `validateToolName` (in `tools/validation.ts`) uses a different
 * signature returning `{ valid, errors, warnings }`. This function is
 * re-exported as `validateToolNameStructured` from the naming barrel.
 *
 * @param name - The tool name to validate
 * @returns A ToolValidationError if invalid, undefined if valid
 */
export function validateToolNameStructured(name: string): ToolValidationError | undefined {
  // Check for empty string
  if (!name || name.trim() === '') {
    return createMalformedNameError(name);
  }

  const dotCount = (name.match(/\./g) ?? []).length;

  // Check for missing prefix (no dots)
  if (dotCount === 0) {
    return createMissingPrefixError(name);
  }

  // Check for malformed name (multiple dots)
  if (dotCount > 1) {
    return createMalformedNameError(name);
  }

  // Split and validate parts
  const [prefix, action] = name.split('.');

  // Validate prefix
  if (!prefix || !ToolPrefixValues.includes(prefix as (typeof ToolPrefixValues)[number])) {
    return createInvalidPrefixError(prefix ?? '');
  }

  // Validate action
  if (!action || !/^[a-z][a-z0-9_]*$/.test(action)) {
    return createInvalidActionNameError(action ?? '');
  }

  return undefined; // Valid
}

/**
 * Result of a validation operation.
 * Either success with the validated value, or failure with an error.
 */
export type ValidationResult<T> =
  | { success: true; value: T }
  | { success: false; error: ToolValidationError };

/**
 * Validates a tool name and returns a result with either the validated name or an error.
 *
 * This is a more ergonomic API than validateToolNameStructured for cases where
 * you want to work with the validated value directly.
 *
 * @param name - The tool name to validate
 * @returns A ValidationResult with either the validated name or a structured error
 */
export function validateToolNameWithResult(name: string): ValidationResult<string> {
  const error = validateToolNameStructured(name);
  if (error) {
    return { success: false, error };
  }
  return { success: true, value: name };
}
