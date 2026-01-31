/**
 * create_feature tool implementation for spec-kit
 *
 * Creates a new feature branch and spec directory from a description.
 * Auto-generates feature number and short name from the description.
 */

import { join } from 'node:path';
import type { AgencyTool, ToolResult, AgencyCoreAPI } from '@generacy-ai/agency';
import type { SpecKitConfig } from '../config.js';
import { createError } from '../types/errors.js';
import {
  exists,
  mkdir,
  readDir,
  readFile,
  writeFile,
  findRepoRoot,
  RepoNotFoundError,
} from '../utils/index.js';

/**
 * Parameters for the create_feature tool
 */
export interface CreateFeatureParams {
  /** Feature description - used to generate spec content and short name */
  description: string;
  /** Optional explicit feature number (1-999). If not provided, auto-generated. */
  number?: number;
  /** Optional explicit short name. If not provided, generated from description. */
  short_name?: string;
  /** Parent epic branch to branch from (for epic children) */
  parent_epic_branch?: string;
  /** Working directory (defaults to process.cwd()) */
  cwd?: string;
}

/**
 * Result of the create_feature operation
 */
export interface CreateFeatureResult {
  /** Whether the operation succeeded */
  success: boolean;
  /** Feature number as string (e.g., "168") */
  feature_number: string;
  /** Full branch name (e.g., "168-e4-claude-code-plugin") */
  branch: string;
  /** Absolute path to feature directory */
  feature_dir: string;
  /** Absolute path to created spec.md file */
  spec_file: string;
  /** Git status - whether a new branch was created */
  branch_created: boolean;
  /** Error message if success is false */
  error?: string;
}

/**
 * Error codes specific to create_feature
 */
export type CreateFeatureErrorCode =
  | 'INVALID_DESCRIPTION'
  | 'INVALID_FEATURE_NUMBER'
  | 'INVALID_SHORT_NAME'
  | 'FEATURE_NUMBER_EXISTS'
  | 'GIT_NOT_INITIALIZED'
  | 'GIT_OPERATION_FAILED'
  | 'DIRECTORY_CREATE_FAILED'
  | 'TEMPLATE_NOT_FOUND'
  | 'WRITE_FAILED';

/**
 * Stop words to filter out when generating short names
 */
const STOP_WORDS = new Set([
  'a', 'an', 'the', 'is', 'are', 'for', 'to', 'and', 'or', 'with',
  'of', 'in', 'on', 'at', 'by', 'from', 'as', 'be', 'was', 'were',
  'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will',
  'would', 'could', 'should', 'may', 'might', 'must', 'can', 'this',
  'that', 'these', 'those', 'it', 'its',
]);

/**
 * Validate description
 */
function isValidDescription(desc: string): boolean {
  return typeof desc === 'string' && desc.trim().length > 0 && desc.length <= 1000;
}

/**
 * Validate feature number
 */
function isValidFeatureNumber(n: number): boolean {
  return Number.isInteger(n) && n >= 1 && n <= 999;
}

/**
 * Validate short name
 */
function isValidShortName(name: string): boolean {
  return /^[a-z0-9][a-z0-9-]{0,48}[a-z0-9]$|^[a-z0-9]$/.test(name);
}

/**
 * Generate short name from description
 */
function generateShortName(description: string, maxWords: number = 4): string {
  const words = description
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2 && !STOP_WORDS.has(w))
    .slice(0, maxWords);

  return words.join('-') || 'feature';
}

/**
 * Extract feature numbers from branch names and directory names
 */
function extractFeatureNumbers(names: string[]): number[] {
  const numbers: number[] = [];
  for (const name of names) {
    // Match patterns like "123-..." or "042-..."
    const match = name.match(/^(\d+)-/);
    if (match && match[1]) {
      const num = parseInt(match[1], 10);
      if (!isNaN(num)) {
        numbers.push(num);
      }
    }
  }
  return numbers;
}

/**
 * Find the next available feature number
 */
async function findNextFeatureNumber(
  repoRoot: string,
  specsDir: string
): Promise<number> {
  const existingNumbers: number[] = [];

  // Scan branches
  try {
    const { simpleGit } = await import('simple-git');
    const git = simpleGit(repoRoot);
    const branches = await git.branch();
    existingNumbers.push(...extractFeatureNumbers(branches.all));
  } catch {
    // Git operations may fail, continue with directory scan
  }

  // Scan specs directory
  const specsPath = join(repoRoot, specsDir);
  if (await exists(specsPath)) {
    try {
      const dirs = await readDir(specsPath);
      existingNumbers.push(...extractFeatureNumbers(dirs));
    } catch {
      // Directory read may fail, continue
    }
  }

  // Find max and increment
  const maxNumber = existingNumbers.length > 0 ? Math.max(...existingNumbers) : 0;
  return maxNumber + 1;
}

/**
 * Check if feature number already exists
 */
async function featureNumberExists(
  num: number,
  repoRoot: string,
  specsDir: string
): Promise<boolean> {
  const paddedNum = String(num).padStart(3, '0');
  const numStr = String(num);

  // Check branches
  try {
    const { simpleGit } = await import('simple-git');
    const git = simpleGit(repoRoot);
    const branches = await git.branch();
    for (const branchName of branches.all) {
      if (branchName.startsWith(`${paddedNum}-`) || branchName.startsWith(`${numStr}-`)) {
        return true;
      }
    }
  } catch {
    // Git operations may fail
  }

  // Check specs directory
  const specsPath = join(repoRoot, specsDir);
  if (await exists(specsPath)) {
    try {
      const dirs = await readDir(specsPath);
      for (const dir of dirs) {
        if (dir.startsWith(`${paddedNum}-`) || dir.startsWith(`${numStr}-`)) {
          return true;
        }
      }
    } catch {
      // Directory read may fail
    }
  }

  return false;
}

/**
 * Apply template variable substitution
 */
function applyTemplateVars(
  template: string,
  vars: { feature_name: string; branch_name: string; date: string; status: string }
): string {
  return template
    .replace(/\{feature_name\}/g, vars.feature_name)
    .replace(/\{branch_name\}/g, vars.branch_name)
    .replace(/\{date\}/g, vars.date)
    .replace(/\{status\}/g, vars.status);
}

/**
 * Create the spec_kit.create_feature tool.
 *
 * This tool creates a new feature from a description:
 * - Auto-generates next feature number (or uses provided number)
 * - Generates short name from description (or uses provided short_name)
 * - Creates git branch: {number}-{short-name}
 * - Creates feature directory: specs/{number}-{short-name}/
 * - Initializes spec.md with description and template
 * - Creates checklists/ and contracts/ subdirectories
 *
 * @param config - Plugin configuration
 * @param _core - Agency core API (unused)
 * @returns AgencyTool instance
 */
export function createCreateFeatureTool(
  config: SpecKitConfig,
  _core: AgencyCoreAPI
): AgencyTool {
  return {
    name: 'spec_kit.create_feature',
    description: 'Create a new feature branch and initialize the spec directory with template files',
    namespace: 'spec_kit',
    outputPattern: 'terse',
    modes: ['coding'],
    inputSchema: {
      type: 'object',
      properties: {
        description: {
          type: 'string',
          description: 'Feature description used to generate spec content',
        },
        number: {
          type: 'number',
          description: 'Optional explicit branch number (1-999)',
        },
        short_name: {
          type: 'string',
          description: 'Optional 2-4 word short name for the branch',
        },
        parent_epic_branch: {
          type: 'string',
          description: 'Parent epic branch to branch from (for epic children). If provided, the new branch will be created from this branch instead of the current branch.',
        },
        cwd: {
          type: 'string',
          description: 'Working directory (defaults to process.cwd())',
        },
      },
      required: ['description'],
    },
    async execute(params: unknown): Promise<ToolResult> {
      const {
        description,
        number,
        short_name,
        parent_epic_branch,
        cwd,
      } = (params || {}) as CreateFeatureParams;

      const workDir = cwd || process.cwd();

      // Validate description
      if (!isValidDescription(description)) {
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              success: false,
              error: createError(
                'INVALID_CONFIG',
                description
                  ? 'Description is too long (max 1000 characters)'
                  : 'Description is required and cannot be empty'
              ),
            }),
          }],
        };
      }

      // Find repo root
      let repoRoot: string;
      try {
        repoRoot = await findRepoRoot(workDir);
      } catch (error) {
        if (error instanceof RepoNotFoundError) {
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                success: false,
                error: createError('GIT_NOT_INITIALIZED', 'Could not find git repository root'),
              }),
            }],
          };
        }
        throw error;
      }

      // Validate or generate feature number
      let featureNumber: number;
      if (number !== undefined) {
        if (!isValidFeatureNumber(number)) {
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                success: false,
                error: createError(
                  'INVALID_FEATURE_NUMBER',
                  'Feature number must be an integer between 1 and 999'
                ),
              }),
            }],
          };
        }
        // Check if number already exists
        if (await featureNumberExists(number, repoRoot, config.paths.specs)) {
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                success: false,
                error: createError(
                  'BRANCH_EXISTS',
                  `Feature number ${number} already exists as a branch or directory`
                ),
              }),
            }],
          };
        }
        featureNumber = number;
      } else {
        featureNumber = await findNextFeatureNumber(repoRoot, config.paths.specs);
        if (featureNumber > 999) {
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                success: false,
                error: createError(
                  'INVALID_FEATURE_NUMBER',
                  'No available feature numbers (max 999)'
                ),
              }),
            }],
          };
        }
      }

      // Validate or generate short name
      let shortName: string;
      if (short_name !== undefined) {
        if (!isValidShortName(short_name)) {
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                success: false,
                error: createError(
                  'INVALID_BRANCH_NAME',
                  'Short name must be lowercase, use hyphens as separators, and be 1-50 characters'
                ),
              }),
            }],
          };
        }
        shortName = short_name;
      } else {
        shortName = generateShortName(description, config.branches.maxSlugWords);
      }

      // Build branch name
      const branchName = `${featureNumber}-${shortName}`;

      // Create git branch
      let branchCreated = false;
      try {
        const { simpleGit } = await import('simple-git');
        const git = simpleGit(repoRoot);

        // If parent_epic_branch is provided, checkout that branch first
        if (parent_epic_branch) {
          try {
            await git.checkout(parent_epic_branch);
          } catch (checkoutError) {
            return {
              content: [{
                type: 'text',
                text: JSON.stringify({
                  success: false,
                  error: createError(
                    'GIT_OPERATION_FAILED',
                    `Could not checkout parent epic branch: ${parent_epic_branch}`,
                    { parent_epic_branch }
                  ),
                }),
              }],
            };
          }
        }

        await git.checkoutLocalBranch(branchName);
        branchCreated = true;
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              success: false,
              error: createError(
                'GIT_OPERATION_FAILED',
                `Failed to create branch: ${message}`,
                { branch: branchName }
              ),
            }),
          }],
        };
      }

      // Create feature directory structure
      const featureDir = join(repoRoot, config.paths.specs, branchName);
      try {
        await mkdir(featureDir);
        await mkdir(join(featureDir, 'checklists'));
        await mkdir(join(featureDir, 'contracts'));
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              success: false,
              error: createError(
                'FILE_WRITE_FAILED',
                `Failed to create directory structure: ${message}`,
                { feature_dir: featureDir }
              ),
            }),
          }],
        };
      }

      // Initialize spec.md
      const specFile = join(featureDir, 'spec.md');
      const templatePath = join(repoRoot, config.paths.templates, 'spec-template.md');

      let specContent: string;
      if (await exists(templatePath)) {
        try {
          const template = await readFile(templatePath);
          const featureName = (description.split('\n')[0] ?? '').slice(0, 100);
          specContent = applyTemplateVars(template, {
            feature_name: featureName,
            branch_name: branchName,
            date: new Date().toISOString().split('T')[0] ?? '',
            status: 'Draft',
          });
        } catch (error) {
          // Fall back to basic spec
          specContent = createBasicSpec(description, branchName);
        }
      } else {
        specContent = createBasicSpec(description, branchName);
      }

      try {
        await writeFile(specFile, specContent);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              success: false,
              error: createError(
                'FILE_WRITE_FAILED',
                `Failed to write spec.md: ${message}`,
                { spec_file: specFile }
              ),
            }),
          }],
        };
      }

      const result: CreateFeatureResult = {
        success: true,
        feature_number: String(featureNumber),
        branch: branchName,
        feature_dir: featureDir,
        spec_file: specFile,
        branch_created: branchCreated,
      };

      return {
        content: [{
          type: 'text',
          text: JSON.stringify(result),
        }],
      };
    },
  };
}

/**
 * Create a basic spec.md content when no template is available
 */
function createBasicSpec(description: string, branchName: string): string {
  const date = new Date().toISOString().split('T')[0] ?? '';
  const featureName = (description.split('\n')[0] ?? '').slice(0, 100);

  return `# Feature Specification: ${featureName}

**Branch**: \`${branchName}\` | **Date**: ${date} | **Status**: Draft

## Summary

${description}

## User Stories

### US1: [Primary User Story]

**As a** [user type],
**I want** [capability],
**So that** [benefit].

**Acceptance Criteria**:
- [ ] [Criterion 1]
- [ ] [Criterion 2]

## Functional Requirements

| ID | Requirement | Priority | Notes |
|----|-------------|----------|-------|
| FR-001 | [Description] | P1 | |

## Success Criteria

| ID | Metric | Target | Measurement |
|----|--------|--------|-------------|
| SC-001 | [Metric] | [Target] | [How to measure] |

## Assumptions

- [Assumption 1]

## Out of Scope

- [Exclusion 1]

---

*Generated by speckit*
`;
}
