import { z } from 'zod';

/**
 * Regex pattern for valid action names.
 * Action names must:
 * - Start with a lowercase letter
 * - Contain only lowercase letters, numbers, and underscores
 * - Follow snake_case convention
 */
const ACTION_NAME_REGEX = /^[a-z][a-z0-9_]*$/;

/**
 * Zod schema for validating action names.
 *
 * Action names are the verb/action portion of a tool identifier,
 * following snake_case naming convention.
 *
 * Valid examples:
 * - 'commit'
 * - 'run_unit_tests'
 * - 'install_dependencies'
 *
 * Invalid examples:
 * - 'RunTests' (uppercase not allowed)
 * - '1_test' (must start with letter)
 * - 'test-action' (hyphens not allowed)
 */
export const ActionNameSchema = z
  .string()
  .regex(
    ACTION_NAME_REGEX,
    'Invalid action name: must be snake_case starting with a lowercase letter (e.g., "commit", "run_unit_tests", "install_dependencies")'
  );

/**
 * Type representing a valid action name.
 * Inferred from ActionNameSchema.
 */
export type ActionName = z.infer<typeof ActionNameSchema>;
