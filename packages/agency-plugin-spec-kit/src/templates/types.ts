/**
 * Type definitions for spec-kit templates
 *
 * Defines the template type system including:
 * - Valid template type names (const array for runtime validation)
 * - TemplateDefinition interface for template metadata
 * - TemplateVariables interface for variable substitution
 */

/**
 * Valid template type names
 *
 * Defined as a const array for:
 * - Runtime validation (TEMPLATE_TYPES.includes())
 * - TypeScript type inference (TemplateType union)
 */
export const TEMPLATE_TYPES = [
  'spec',
  'plan',
  'tasks',
  'checklist',
  'agent-file',
] as const;

/**
 * Template type - union of valid template names
 *
 * @example
 * ```typescript
 * const type: TemplateType = 'spec'; // valid
 * const type: TemplateType = 'invalid'; // TypeScript error
 * ```
 */
export type TemplateType = (typeof TEMPLATE_TYPES)[number];

/**
 * Type guard for template type validation
 *
 * @param value - String value to check
 * @returns True if value is a valid TemplateType
 *
 * @example
 * ```typescript
 * if (isTemplateType(userInput)) {
 *   // userInput is now typed as TemplateType
 * }
 * ```
 */
export function isTemplateType(value: string): value is TemplateType {
  return TEMPLATE_TYPES.includes(value as TemplateType);
}

/**
 * Definition of a template with its metadata and default content
 *
 * Each template type has a corresponding definition that includes:
 * - Where to find custom templates (sourceFile)
 * - Where to place the copied template (defaultFilename, destSubdir)
 * - Fallback content when no custom template exists (defaultContent)
 */
export interface TemplateDefinition {
  /** Template type identifier */
  type: TemplateType;

  /** Default filename when copied to destination */
  defaultFilename: string;

  /** Source filename in templates directory (for custom templates) */
  sourceFile: string;

  /** Embedded default content (used when no custom template exists) */
  defaultContent: string;

  /** Optional subdirectory within feature dir (e.g., 'checklists') */
  destSubdir?: string;
}

/**
 * Variables that can be substituted in templates
 *
 * These use mustache-style {{variable}} syntax and are
 * substituted during the copy_template operation.
 */
export interface TemplateVariables {
  /** Feature name extracted from branch (e.g., 'template-file-definitions') */
  feature_name: string;

  /** Feature description provided during creation */
  description: string;

  /** Current date in ISO format (YYYY-MM-DD) */
  date: string;

  /** Full branch name (e.g., '159-c5-template-file-definitions') */
  branch: string;
}
