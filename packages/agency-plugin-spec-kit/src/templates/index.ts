/**
 * Template management for spec-kit
 *
 * This module provides:
 * - Type definitions for templates (TemplateType, TemplateDefinition)
 * - Registry of all template definitions (TEMPLATES)
 * - Template resolution with custom/default fallback (resolveTemplate)
 * - Variable substitution (substituteVariables)
 * - Destination path calculation (getDestinationPath)
 */

import { join } from 'node:path';
import type { SpecKitConfig } from '../config.js';
import { exists, readFile } from '../utils/index.js';
import type { TemplateType, TemplateDefinition, TemplateVariables } from './types.js';
import { TEMPLATE_TYPES, isTemplateType } from './types.js';

// Import default template content
import { SPEC_TEMPLATE_CONTENT } from './defaults/spec.js';
import { PLAN_TEMPLATE_CONTENT } from './defaults/plan.js';
import { TASKS_TEMPLATE_CONTENT } from './defaults/tasks.js';
import { CHECKLIST_TEMPLATE_CONTENT } from './defaults/checklist.js';
import { AGENT_FILE_TEMPLATE_CONTENT } from './defaults/agent-file.js';

// Re-export types and utilities
export { TEMPLATE_TYPES, isTemplateType } from './types.js';
export type { TemplateType, TemplateDefinition, TemplateVariables } from './types.js';
export { substituteVariables, createTemplateVariables } from './variables.js';

/**
 * Registry of all template definitions
 *
 * Each template type has:
 * - type: The template type identifier
 * - defaultFilename: Filename when copied to destination
 * - sourceFile: Filename to look for in custom templates directory
 * - defaultContent: Embedded default content (fallback)
 * - destSubdir: Optional subdirectory (e.g., 'checklists')
 */
export const TEMPLATES: Record<TemplateType, TemplateDefinition> = {
  spec: {
    type: 'spec',
    defaultFilename: 'spec.md',
    sourceFile: 'spec-template.md',
    defaultContent: SPEC_TEMPLATE_CONTENT,
  },
  plan: {
    type: 'plan',
    defaultFilename: 'plan.md',
    sourceFile: 'plan-template.md',
    defaultContent: PLAN_TEMPLATE_CONTENT,
  },
  tasks: {
    type: 'tasks',
    defaultFilename: 'tasks.md',
    sourceFile: 'tasks-template.md',
    defaultContent: TASKS_TEMPLATE_CONTENT,
  },
  checklist: {
    type: 'checklist',
    defaultFilename: 'checklist.md',
    sourceFile: 'checklist-template.md',
    defaultContent: CHECKLIST_TEMPLATE_CONTENT,
    destSubdir: 'checklists',
  },
  'agent-file': {
    type: 'agent-file',
    defaultFilename: 'CLAUDE.md',
    sourceFile: 'agent-file-template.md',
    defaultContent: AGENT_FILE_TEMPLATE_CONTENT,
  },
};

/**
 * Resolve template content with fallback to defaults
 *
 * Resolution order:
 * 1. Check for custom template at config.paths.templates + sourceFile
 * 2. Fall back to embedded defaultContent
 *
 * @param type - Template type to resolve
 * @param config - SpecKit configuration
 * @param repoRoot - Repository root path
 * @returns Template content string
 *
 * @example
 * ```typescript
 * const content = await resolveTemplate('spec', config, repoRoot);
 * // Returns custom .specify/templates/spec-template.md if exists
 * // Otherwise returns embedded default content
 * ```
 */
export async function resolveTemplate(
  type: TemplateType,
  config: SpecKitConfig,
  repoRoot: string
): Promise<string> {
  const definition = TEMPLATES[type];

  // Check for custom template
  const customPath = join(repoRoot, config.paths.templates, definition.sourceFile);
  if (await exists(customPath)) {
    return readFile(customPath);
  }

  // Fall back to embedded default
  return definition.defaultContent;
}

/**
 * Get destination path for a template
 *
 * Handles special cases:
 * - agent-file: Always placed at repo root
 * - checklist: Placed in checklists/ subdirectory
 * - others: Placed directly in feature directory
 *
 * @param type - Template type
 * @param featureDir - Feature directory path
 * @param repoRoot - Repository root path
 * @param customFilename - Optional custom filename override
 * @returns Full destination path
 *
 * @example
 * ```typescript
 * // Standard template
 * getDestinationPath('spec', '/repo/specs/123-feature', '/repo')
 * // Returns: '/repo/specs/123-feature/spec.md'
 *
 * // Checklist (subdirectory)
 * getDestinationPath('checklist', '/repo/specs/123-feature', '/repo')
 * // Returns: '/repo/specs/123-feature/checklists/checklist.md'
 *
 * // Agent file (repo root)
 * getDestinationPath('agent-file', '/repo/specs/123-feature', '/repo')
 * // Returns: '/repo/CLAUDE.md'
 * ```
 */
export function getDestinationPath(
  type: TemplateType,
  featureDir: string,
  repoRoot: string,
  customFilename?: string
): string {
  const definition = TEMPLATES[type];

  // Normalize filename - ensure it ends with .md if provided
  let filename = customFilename || definition.defaultFilename;
  if (customFilename && !customFilename.endsWith('.md')) {
    filename = `${customFilename}.md`;
  }

  // Agent file goes to repo root
  if (type === 'agent-file') {
    return join(repoRoot, filename);
  }

  // Templates with destSubdir (like checklist)
  if (definition.destSubdir) {
    return join(featureDir, definition.destSubdir, filename);
  }

  // Standard templates go to feature directory
  return join(featureDir, filename);
}

/**
 * Get the template definition for a given type
 *
 * @param type - Template type
 * @returns Template definition or undefined if not found
 */
export function getTemplateDefinition(type: string): TemplateDefinition | undefined {
  if (isTemplateType(type)) {
    return TEMPLATES[type];
  }
  return undefined;
}
