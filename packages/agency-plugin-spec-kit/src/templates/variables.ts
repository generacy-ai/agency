/**
 * Variable substitution utilities for spec-kit templates
 *
 * Provides functions for substituting {{variable}} placeholders
 * in template content with actual values.
 */

import type { TemplateVariables } from './types.js';

/**
 * Substitute variables in template content
 *
 * Uses mustache-style {{variable}} syntax. Only known variables
 * from TemplateVariables are substituted; unknown variables are
 * left unchanged in the content.
 *
 * @param content - Template content with {{variable}} placeholders
 * @param variables - Variables to substitute (partial - missing values are skipped)
 * @returns Content with variables substituted
 *
 * @example
 * ```typescript
 * const result = substituteVariables(
 *   'Feature: {{feature_name}} ({{date}})',
 *   { feature_name: 'my-feature', date: '2026-02-01' }
 * );
 * // Result: 'Feature: my-feature (2026-02-01)'
 * ```
 *
 * @example
 * ```typescript
 * // Unknown variables are preserved
 * const result = substituteVariables(
 *   'Name: {{feature_name}}, Unknown: {{unknown}}',
 *   { feature_name: 'test' }
 * );
 * // Result: 'Name: test, Unknown: {{unknown}}'
 * ```
 */
export function substituteVariables(
  content: string,
  variables: Partial<TemplateVariables>
): string {
  // Match {{variable_name}} patterns where variable_name is word characters
  return content.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    // Check if the key exists in variables and has a defined value
    if (key in variables && variables[key as keyof TemplateVariables] !== undefined) {
      return String(variables[key as keyof TemplateVariables]);
    }
    // Leave unknown variables unchanged
    return match;
  });
}

/**
 * Create a TemplateVariables object from available context
 *
 * Convenience function to construct TemplateVariables from
 * commonly available values.
 *
 * @param options - Options for creating variables
 * @returns TemplateVariables object
 *
 * @example
 * ```typescript
 * const vars = createTemplateVariables({
 *   branch: '159-c5-template-file-definitions',
 *   description: 'Add template file definitions'
 * });
 * // vars.feature_name will be 'c5-template-file-definitions'
 * // vars.date will be today's date
 * ```
 */
export function createTemplateVariables(options: {
  /** Full branch name */
  branch?: string;
  /** Feature description */
  description?: string;
  /** Feature name (if not derived from branch) */
  featureName?: string;
  /** Date (defaults to today in ISO format) */
  date?: string;
}): Partial<TemplateVariables> {
  const {
    branch = '',
    description = '',
    featureName,
    date = new Date().toISOString().split('T')[0],
  } = options;

  // Extract feature name from branch if not provided
  // Branch format is typically: 159-feature-name or 159-c5-feature-name
  let derivedFeatureName = featureName || '';
  if (!derivedFeatureName && branch) {
    // Remove leading issue number and optional prefix (like 'c5-')
    const match = branch.match(/^\d+(?:-[a-z]\d+)?-(.+)$/i);
    if (match && match[1]) {
      derivedFeatureName = match[1];
    } else {
      derivedFeatureName = branch;
    }
  }

  return {
    feature_name: derivedFeatureName,
    description,
    date,
    branch,
  };
}
