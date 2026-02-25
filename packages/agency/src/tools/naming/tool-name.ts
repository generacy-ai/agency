import { z } from 'zod';
import { ToolPrefixSchema, ToolPrefixValues, type ToolPrefix } from './prefix.js';
import { ActionNameSchema } from './action.js';

/**
 * Regex pattern for validating full tool names.
 * Format: {prefix}.{action}
 * - Must contain exactly one dot separator
 * - Prefix must be one of the valid prefixes
 * - Action must follow snake_case convention
 */
const TOOL_NAME_REGEX = /^([a-z_]+)\.([a-z][a-z0-9_]*)$/;

/**
 * Validates a full tool name in the format `{prefix}.{action}`.
 *
 * This schema performs comprehensive validation:
 * 1. Ensures the name contains exactly one dot separator
 * 2. Validates the prefix is one of the 10 allowed prefixes
 * 3. Validates the action follows snake_case convention
 *
 * @example
 * ```typescript
 * // Valid tool names
 * ToolNameSchema.parse('source_control.commit');
 * ToolNameSchema.parse('test.run_unit_tests');
 * ToolNameSchema.parse('build.install_dependencies');
 *
 * // Invalid tool names (will throw)
 * ToolNameSchema.parse('commit');                    // Missing prefix
 * ToolNameSchema.parse('invalid.commit');            // Unknown prefix
 * ToolNameSchema.parse('source_control.commitCode'); // camelCase action
 * ```
 */
export const ToolNameSchema = z
  .string()
  .regex(TOOL_NAME_REGEX, 'Invalid tool name format: must be "{prefix}.{action}" (e.g., "source_control.commit")')
  .superRefine((val, ctx) => {
    const match = val.match(TOOL_NAME_REGEX);
    if (!match) {
      return; // Already caught by regex validation
    }

    const [, prefix, action] = match;

    // Validate prefix
    const prefixResult = ToolPrefixSchema.safeParse(prefix);
    if (!prefixResult.success) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Invalid prefix "${prefix}". Valid prefixes: ${ToolPrefixValues.join(', ')}`,
      });
    }

    // Validate action
    const actionResult = ActionNameSchema.safeParse(action);
    if (!actionResult.success) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Invalid action "${action}": must be snake_case starting with a lowercase letter`,
      });
    }
  });

/**
 * Type representing a valid tool name in `{prefix}.{action}` format.
 */
export type ToolName = z.infer<typeof ToolNameSchema>;

/**
 * Parses a tool name string and extracts its components.
 *
 * @param name - The full tool name string
 * @returns An object with prefix and action if valid, undefined otherwise
 */
export function parseToolName(name: string): { prefix: ToolPrefix; action: string } | undefined {
  const match = name.match(TOOL_NAME_REGEX);
  if (!match) {
    return undefined;
  }

  const [, prefix, action] = match;
  const prefixResult = ToolPrefixSchema.safeParse(prefix);
  const actionResult = ActionNameSchema.safeParse(action);

  if (!prefixResult.success || !actionResult.success) {
    return undefined;
  }

  return { prefix: prefixResult.data, action: actionResult.data };
}

/**
 * Creates a tool name from prefix and action components.
 *
 * @param prefix - The tool prefix
 * @param action - The action name
 * @returns The full tool name in `{prefix}.{action}` format
 */
export function createToolName(prefix: ToolPrefix, action: string): ToolName {
  // Validate the action
  ActionNameSchema.parse(action);
  return `${prefix}.${action}` as ToolName;
}
