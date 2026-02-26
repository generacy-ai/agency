import { z } from 'zod';

/**
 * The 10 tool prefixes that categorize tools by their primary function.
 *
 * These prefixes form the first segment of a tool's fully qualified name
 * and help organize tools into logical categories.
 *
 * @example
 * - source_control: Tools for version control (e.g., git operations)
 * - build: Tools for compiling/bundling code
 * - run: Tools for executing applications
 * - test: Tools for running tests
 * - debug: Tools for debugging and diagnostics
 * - deploy: Tools for deployment operations
 * - humancy: Tools for human interaction
 * - file: Tools for file system operations
 * - database: Tools for database operations
 * - docs: Tools for documentation operations
 */
export const ToolPrefixValues = [
  'source_control',
  'build',
  'run',
  'test',
  'debug',
  'deploy',
  'humancy',
  'file',
  'database',
  'docs',
] as const;

/**
 * Zod schema for validating tool prefix strings.
 *
 * Validates that a string is one of the 10 allowed tool prefixes.
 *
 * @example
 * ```typescript
 * const result = ToolPrefixSchema.safeParse('build');
 * if (result.success) {
 *   console.log('Valid prefix:', result.data);
 * }
 * ```
 */
export const ToolPrefixSchema = z.enum(ToolPrefixValues);

/**
 * Type representing one of the 10 tool prefixes.
 *
 * This type is inferred from the Zod schema to ensure type safety
 * and consistency between runtime validation and compile-time types.
 */
export type ToolPrefix = z.infer<typeof ToolPrefixSchema>;
