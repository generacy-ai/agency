/**
 * copy_template tool implementation for spec-kit
 *
 * Copies template files from the templates directory to feature directories.
 * Supports multiple templates, custom filenames, and special handling for
 * checklists (subdirectory) and agent files (repo root).
 *
 * Uses the templates module for:
 * - Template definitions (TEMPLATES registry)
 * - Template resolution (custom path first, embedded default fallback)
 * - Variable substitution ({{variable}} placeholders)
 * - Destination path calculation
 */

import type { AgencyTool, ToolResult, AgencyCoreAPI } from '@generacy-ai/agency';
import type { SpecKitConfig } from '../config.js';
import {
  exists,
  writeFile,
  findRepoRoot,
  RepoNotFoundError,
} from '../utils/index.js';
import {
  TEMPLATE_TYPES,
  isTemplateType,
  resolveTemplate,
  getDestinationPath,
  substituteVariables,
  createTemplateVariables,
} from '../templates/index.js';
import type { TemplateType, TemplateVariables } from '../templates/index.js';

/**
 * Parameters for the copy_template tool
 */
interface CopyTemplateParams {
  /** List of template names to copy */
  templates: TemplateType[];
  /** Optional custom destination filename (single template only) */
  dest_filename?: string;
  /** Target feature directory */
  feature_dir?: string;
  /** Working directory (defaults to process.cwd()) */
  cwd?: string;
  /** Optional variables for substitution */
  variables?: Partial<TemplateVariables>;
}

/**
 * Result for a copied template
 */
interface CopiedTemplate {
  template: TemplateType;
  destination: string;
}

/**
 * Result for a skipped template
 */
interface SkippedTemplate {
  template: TemplateType;
  destination: string;
  reason: 'exists' | 'source_not_found';
}

/**
 * Result of the copy_template operation
 */
interface CopyTemplateResult {
  success: boolean;
  copied: CopiedTemplate[];
  skipped: SkippedTemplate[];
  error?: string;
}

/**
 * Create the spec_kit.copy_template tool.
 *
 * This tool copies template files from the templates directory to feature
 * directories. It supports copying multiple templates in a single call,
 * custom destination filenames for single-template copies, and special
 * handling for checklists (placed in checklists/ subdirectory) and agent
 * files (placed at repo root).
 *
 * Template content is resolved from:
 * 1. Custom template in config.paths.templates (if exists)
 * 2. Built-in embedded default content
 *
 * Variable substitution is applied using {{variable}} placeholders.
 *
 * @param config - Plugin configuration
 * @param _core - Agency core API (unused)
 * @returns AgencyTool instance
 */
export function createCopyTemplateTool(
  config: SpecKitConfig,
  _core: AgencyCoreAPI
): AgencyTool {
  return {
    name: 'spec_kit.copy_template',
    description: 'Copy one or more templates to the feature directory',
    namespace: 'spec_kit',
    outputPattern: 'terse',
    modes: ['coding'],
    inputSchema: {
      type: 'object',
      properties: {
        templates: {
          type: 'array',
          items: {
            type: 'string',
            enum: [...TEMPLATE_TYPES],
          },
          description: 'List of template names to copy',
        },
        dest_filename: {
          type: 'string',
          description: 'Optional custom destination filename (only valid when copying single template)',
        },
        feature_dir: {
          type: 'string',
          description: 'Target feature directory. If not provided, must specify cwd.',
        },
        cwd: {
          type: 'string',
          description: 'Working directory (defaults to process.cwd())',
        },
        variables: {
          type: 'object',
          description: 'Optional variables for template substitution',
          properties: {
            feature_name: { type: 'string', description: 'Feature name' },
            description: { type: 'string', description: 'Feature description' },
            date: { type: 'string', description: 'Date in ISO format' },
            branch: { type: 'string', description: 'Branch name' },
          },
        },
      },
      required: ['templates'],
    },
    async execute(params: unknown): Promise<ToolResult> {
      const {
        templates,
        dest_filename,
        feature_dir,
        cwd,
        variables,
      } = (params || {}) as CopyTemplateParams;
      const workDir = cwd || process.cwd();

      // Validate templates array
      if (!templates || !Array.isArray(templates) || templates.length === 0) {
        const result: CopyTemplateResult = {
          success: false,
          copied: [],
          skipped: [],
          error: 'templates array is required and must not be empty',
        };
        return {
          content: [{ type: 'text', text: JSON.stringify(result) }],
        };
      }

      // Validate all template names
      const invalidTemplates = templates.filter((t) => !isTemplateType(t));
      if (invalidTemplates.length > 0) {
        const result: CopyTemplateResult = {
          success: false,
          copied: [],
          skipped: [],
          error: `Invalid template name(s): ${invalidTemplates.join(', ')}. Valid templates: ${TEMPLATE_TYPES.join(', ')}`,
        };
        return {
          content: [{ type: 'text', text: JSON.stringify(result) }],
        };
      }

      // Validate dest_filename usage
      if (dest_filename && templates.length > 1) {
        const result: CopyTemplateResult = {
          success: false,
          copied: [],
          skipped: [],
          error: 'dest_filename can only be used when copying a single template',
        };
        return {
          content: [{ type: 'text', text: JSON.stringify(result) }],
        };
      }

      // Find repo root
      let repoRoot: string;
      try {
        repoRoot = await findRepoRoot(workDir);
      } catch (error) {
        if (error instanceof RepoNotFoundError) {
          const result: CopyTemplateResult = {
            success: false,
            copied: [],
            skipped: [],
            error: 'Could not find repository root',
          };
          return {
            content: [{ type: 'text', text: JSON.stringify(result) }],
          };
        }
        throw error;
      }

      // Validate feature_dir or determine from cwd
      const featureDir = feature_dir || workDir;

      // Deduplicate templates
      const uniqueTemplates = [...new Set(templates)] as TemplateType[];

      // Create default variables if not provided
      const templateVariables = variables || createTemplateVariables({
        date: new Date().toISOString().split('T')[0],
      });

      const copied: CopiedTemplate[] = [];
      const skipped: SkippedTemplate[] = [];

      // Process each template
      for (const templateName of uniqueTemplates) {
        const destPath = getDestinationPath(
          templateName,
          featureDir,
          repoRoot,
          dest_filename
        );

        // Check if destination already exists
        if (await exists(destPath)) {
          skipped.push({
            template: templateName,
            destination: destPath,
            reason: 'exists',
          });
          continue;
        }

        // Resolve and copy the template
        try {
          // Get template content (custom or default)
          let content = await resolveTemplate(templateName, config, repoRoot);

          // Apply variable substitution
          content = substituteVariables(content, templateVariables);

          // Write to destination
          await writeFile(destPath, content);
          copied.push({
            template: templateName,
            destination: destPath,
          });
        } catch (error) {
          const result: CopyTemplateResult = {
            success: false,
            copied,
            skipped,
            error: `Failed to copy template ${templateName}: ${error instanceof Error ? error.message : String(error)}`,
          };
          return {
            content: [{ type: 'text', text: JSON.stringify(result) }],
          };
        }
      }

      const result: CopyTemplateResult = {
        success: true,
        copied,
        skipped,
      };

      return {
        content: [{ type: 'text', text: JSON.stringify(result) }],
      };
    },
  };
}
