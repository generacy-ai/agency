/**
 * copy_template tool implementation for spec-kit
 *
 * Copies template files from the templates directory to feature directories.
 * Supports multiple templates, custom filenames, and special handling for
 * checklists (subdirectory) and agent files (repo root).
 */

import { join } from 'node:path';
import type { AgencyTool, ToolResult, AgencyCoreAPI } from '@generacy-ai/agency';
import type { SpecKitConfig } from '../config.js';
import {
  exists,
  readFile,
  writeFile,
  findRepoRoot,
  RepoNotFoundError,
} from '../utils/index.js';

/**
 * Valid template names
 */
type TemplateName = 'spec' | 'plan' | 'tasks' | 'checklist' | 'agent-file';

/**
 * List of valid template names
 */
const VALID_TEMPLATES: TemplateName[] = ['spec', 'plan', 'tasks', 'checklist', 'agent-file'];

/**
 * Template mapping configuration
 */
interface TemplateMapping {
  /** Template name (used in API) */
  name: TemplateName;
  /** Source filename (without path) */
  sourceFile: string;
  /** Destination resolver */
  getDestination: (
    featureDir: string,
    repoRoot: string,
    destFilename?: string
  ) => string;
}

/**
 * Template mappings defining source files and destination logic
 */
const TEMPLATE_MAPPINGS: TemplateMapping[] = [
  {
    name: 'spec',
    sourceFile: 'spec-template.md',
    getDestination: (featureDir, _repoRoot, destFilename) =>
      join(featureDir, destFilename || 'spec.md'),
  },
  {
    name: 'plan',
    sourceFile: 'plan-template.md',
    getDestination: (featureDir, _repoRoot, destFilename) =>
      join(featureDir, destFilename || 'plan.md'),
  },
  {
    name: 'tasks',
    sourceFile: 'tasks-template.md',
    getDestination: (featureDir, _repoRoot, destFilename) =>
      join(featureDir, destFilename || 'tasks.md'),
  },
  {
    name: 'checklist',
    sourceFile: 'checklist-template.md',
    getDestination: (featureDir, _repoRoot, destFilename) =>
      join(featureDir, 'checklists', destFilename || 'checklist.md'),
  },
  {
    name: 'agent-file',
    sourceFile: 'agent-file-template.md',
    getDestination: (_featureDir, repoRoot, destFilename) =>
      join(repoRoot, destFilename || 'CLAUDE.md'),
  },
];

/**
 * Parameters for the copy_template tool
 */
interface CopyTemplateParams {
  /** List of template names to copy */
  templates: TemplateName[];
  /** Optional custom destination filename (single template only) */
  dest_filename?: string;
  /** Target feature directory */
  feature_dir?: string;
  /** Working directory (defaults to process.cwd()) */
  cwd?: string;
}

/**
 * Result for a copied template
 */
interface CopiedTemplate {
  template: TemplateName;
  destination: string;
}

/**
 * Result for a skipped template
 */
interface SkippedTemplate {
  template: TemplateName;
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
 * Resolve the source path for a template
 *
 * @param templateName - Name of the template
 * @param templatesDir - Path to templates directory
 * @returns Full path to template source file, or null if not found
 */
function resolveTemplatePath(templateName: TemplateName, templatesDir: string): string | null {
  const mapping = TEMPLATE_MAPPINGS.find((m) => m.name === templateName);
  if (!mapping) {
    return null;
  }
  return join(templatesDir, mapping.sourceFile);
}

/**
 * Resolve the destination path for a template
 *
 * @param templateName - Name of the template
 * @param featureDir - Feature directory path
 * @param repoRoot - Repository root path
 * @param destFilename - Optional custom destination filename
 * @returns Full path to destination file
 */
function resolveDestinationPath(
  templateName: TemplateName,
  featureDir: string,
  repoRoot: string,
  destFilename?: string
): string {
  const mapping = TEMPLATE_MAPPINGS.find((m) => m.name === templateName);
  if (!mapping) {
    // Should not happen if validation is done first
    return join(featureDir, `${templateName}.md`);
  }

  // Normalize destFilename - ensure it ends with .md
  let normalizedFilename = destFilename;
  if (normalizedFilename && !normalizedFilename.endsWith('.md')) {
    normalizedFilename = `${normalizedFilename}.md`;
  }

  return mapping.getDestination(featureDir, repoRoot, normalizedFilename);
}

/**
 * Validate template name
 */
function isValidTemplate(name: string): name is TemplateName {
  return VALID_TEMPLATES.includes(name as TemplateName);
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
            enum: ['spec', 'plan', 'tasks', 'checklist', 'agent-file'],
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
      },
      required: ['templates'],
    },
    async execute(params: unknown): Promise<ToolResult> {
      const {
        templates,
        dest_filename,
        feature_dir,
        cwd,
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
      const invalidTemplates = templates.filter((t) => !isValidTemplate(t));
      if (invalidTemplates.length > 0) {
        const result: CopyTemplateResult = {
          success: false,
          copied: [],
          skipped: [],
          error: `Invalid template name(s): ${invalidTemplates.join(', ')}. Valid templates: ${VALID_TEMPLATES.join(', ')}`,
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

      // Determine templates directory path
      const templatesDir = join(repoRoot, config.paths.templates);

      // Deduplicate templates
      const uniqueTemplates = [...new Set(templates)] as TemplateName[];

      const copied: CopiedTemplate[] = [];
      const skipped: SkippedTemplate[] = [];

      // Process each template
      for (const templateName of uniqueTemplates) {
        const sourcePath = resolveTemplatePath(templateName, templatesDir);
        if (!sourcePath) {
          // Should not happen due to validation, but handle gracefully
          skipped.push({
            template: templateName,
            destination: '',
            reason: 'source_not_found',
          });
          continue;
        }

        const destPath = resolveDestinationPath(
          templateName,
          featureDir,
          repoRoot,
          dest_filename
        );

        // Check if source exists
        if (!(await exists(sourcePath))) {
          skipped.push({
            template: templateName,
            destination: destPath,
            reason: 'source_not_found',
          });
          continue;
        }

        // Check if destination already exists
        if (await exists(destPath)) {
          skipped.push({
            template: templateName,
            destination: destPath,
            reason: 'exists',
          });
          continue;
        }

        // Copy the template
        try {
          const content = await readFile(sourcePath);
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
