/**
 * create_feature tool implementation for spec-kit
 *
 * Creates a new feature branch and initializes the spec directory
 * with template files.
 */

import type { AgencyTool, AgencyCoreAPI, ToolResult } from '@generacy-ai/agency';
import type { SpecKitConfig } from '../config.js';
import * as path from 'node:path';
import { createError } from '../types/errors.js';
import {
  findRepoRoot,
  exists,
  mkdir,
  writeFile,
  readFile,
  RepoNotFoundError,
  isGitRepo,
} from '../utils/index.js';
import { generateSlug } from '../utils/slug.js';
import { findNextFeatureNumber, padFeatureNumber } from '../utils/numbering.js';

/** Pattern to match valid feature branch names */
const FEATURE_NAME_PATTERN = /^(?:[a-z][a-z0-9-]*\/)?(\d+)[-_]([a-z0-9]+(?:-[a-z0-9]+)*)$/;

/** Pattern to match typed branch names for issue number extraction */
const TYPED_BRANCH_PATTERN =
  /^(?:([a-z][a-z0-9-]*)\/)?(\d+)[_-]([a-z0-9]+(?:-[a-z0-9]+)*)$/;

/**
 * Parameters for the create_feature tool
 */
interface CreateFeatureParams {
  /** Feature description used to generate spec content */
  description: string;
  /** Optional 2-4 word short name for the branch */
  short_name?: string;
  /** Optional explicit branch number */
  number?: number;
  /** Parent epic branch to branch from (for epic children) */
  parent_epic_branch?: string;
  /** Working directory (defaults to process.cwd()) */
  cwd?: string;
}

/**
 * Result of a successful create_feature operation
 */
interface CreateFeatureResult {
  success: true;
  /** Full branch name (e.g., "153-implement-create-feature") */
  branch_name: string;
  /** Feature number as padded string (e.g., "153") */
  feature_num: string;
  /** Full path to the spec.md file */
  spec_file: string;
  /** Full path to the feature directory */
  feature_dir: string;
  /** Whether a git branch was created */
  git_branch_created: boolean;
  /** Whether the branch was created from an epic branch */
  branched_from_epic: boolean;
  /** Parent epic branch name (if branched from epic) */
  parent_epic_branch?: string;
}

/**
 * Build branch name from pattern and parameters.
 *
 * Pattern variables:
 * - {paddedNumber}: Zero-padded issue number (e.g., "042")
 * - {number}: Raw issue number (e.g., "42")
 * - {slug}: Generated slug from description
 * - {type}: Branch type (e.g., "feature")
 */
function buildBranchName(
  pattern: string,
  issueNumber: number,
  slug: string,
  numberPadding: number
): string {
  const paddedNumber = padFeatureNumber(issueNumber, numberPadding);
  let branchName = pattern;
  branchName = branchName.replace('{paddedNumber}', paddedNumber);
  branchName = branchName.replace('{number}', String(issueNumber));
  branchName = branchName.replace('{slug}', slug);
  branchName = branchName.replace('{type}', 'feature');
  return branchName;
}

/**
 * Check if a branch name matches an issue number.
 */
function branchMatchesIssueNumber(
  branchName: string,
  issueNumber: number
): boolean {
  const match = branchName.match(TYPED_BRANCH_PATTERN);
  if (match && match[2]) {
    const num = parseInt(match[2], 10);
    return num === issueNumber;
  }
  return false;
}

/**
 * Find any existing branches for the given issue number.
 * Defense-in-depth: catches cases where workflow-level detection fails.
 */
async function findExistingBranchesForNumber(
  issueNumber: number,
  repoRoot: string
): Promise<string[]> {
  if (!(await isGitRepo(repoRoot))) {
    return [];
  }

  const matchingBranches: string[] = [];

  try {
    const { simpleGit } = await import('simple-git');
    const git = simpleGit(repoRoot);

    // Fetch remote branches to ensure we have latest info
    try {
      await git.fetch(['--all', '--prune']);
    } catch {
      // Continue even if fetch fails (might be offline)
    }

    // Check local branches
    const localBranches = await git.branchLocal();
    for (const branch of localBranches.all) {
      if (branchMatchesIssueNumber(branch, issueNumber)) {
        matchingBranches.push(branch);
      }
    }

    // Check remote branches
    try {
      const remoteBranches = await git.branch(['-r']);
      for (const remoteBranch of remoteBranches.all) {
        if (
          !remoteBranch.startsWith('origin/') ||
          remoteBranch.includes('HEAD')
        ) {
          continue;
        }
        const branchName = remoteBranch.replace('origin/', '');
        // Skip if already found locally
        if (matchingBranches.includes(branchName)) {
          continue;
        }
        if (branchMatchesIssueNumber(branchName, issueNumber)) {
          matchingBranches.push(branchName);
        }
      }
    } catch {
      // Continue with local branches only
    }
  } catch {
    // Git operations failed, return empty
  }

  return matchingBranches;
}

/**
 * Create initial spec content from description.
 */
function createInitialSpecContent(
  description: string,
  branchName: string,
  parentEpicBranch?: string
): string {
  // Extract a title from the description
  const firstSentence = description.split(/[.!?]/)[0] || description;
  const title = firstSentence
    .trim()
    .replace(/^(add|create|implement|build)\s+/i, '')
    .replace(/^\w/, (c) => c.toUpperCase());

  const dateStr = new Date().toISOString().split('T')[0];

  let epicSection = '';
  if (parentEpicBranch) {
    epicSection = `
## Parent Epic
Part of branch: \`${parentEpicBranch}\`
`;
  }

  return `# Feature Specification: ${title}

**Branch**: \`${branchName}\` | **Date**: ${dateStr} | **Status**: Draft

## Summary
${epicSection}
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

/**
 * Load spec template from custom path or use default content.
 */
async function loadSpecTemplate(
  templatesPath: string | undefined,
  repoRoot: string
): Promise<string | null> {
  // Try custom template path from config
  if (templatesPath) {
    const customTemplatePath = path.join(repoRoot, templatesPath, 'spec.md');
    if (await exists(customTemplatePath)) {
      try {
        return await readFile(customTemplatePath);
      } catch {
        // Fall through to default
      }
    }
  }

  // Try default location
  const defaultTemplatePath = path.join(
    repoRoot,
    '.specify',
    'templates',
    'spec.md'
  );
  if (await exists(defaultTemplatePath)) {
    try {
      return await readFile(defaultTemplatePath);
    } catch {
      // Fall through to null
    }
  }

  return null;
}

/**
 * Populate template with feature values.
 */
function populateTemplate(
  template: string,
  branchName: string,
  description: string,
  parentEpicBranch?: string
): string {
  const firstSentence = description.split(/[.!?]/)[0] || description;
  const title = firstSentence
    .trim()
    .replace(/^(add|create|implement|build)\s+/i, '')
    .replace(/^\w/, (c) => c.toUpperCase());

  const dateStr = new Date().toISOString().split('T')[0] || '';

  let content = template;
  content = content.replace(/\{\{title\}\}/g, title);
  content = content.replace(/\{\{branch\}\}/g, branchName);
  content = content.replace(/\{\{date\}\}/g, dateStr);
  content = content.replace(/\{\{description\}\}/g, description);

  // Handle optional epic section
  if (parentEpicBranch) {
    content = content.replace(
      /\{\{epic_section\}\}/g,
      `\n## Parent Epic\nPart of branch: \`${parentEpicBranch}\`\n`
    );
  } else {
    content = content.replace(/\{\{epic_section\}\}/g, '');
  }

  return content;
}

/**
 * Create the spec_kit.create_feature tool.
 *
 * This tool creates a new feature branch and initializes the spec directory:
 * - Generates branch name from description (slug generation)
 * - Auto-numbers features (finds next available number)
 * - Creates feature directory structure
 * - Initializes spec.md from template
 * - Supports parent epic branches for hierarchical features
 *
 * @param config - SpecKit configuration
 * @param core - Agency core API
 * @returns AgencyTool instance
 */
export function createCreateFeatureTool(
  config: SpecKitConfig,
  _core: AgencyCoreAPI
): AgencyTool {
  return {
    name: 'spec_kit.create_feature',
    description:
      'Create a new feature branch and initialize the spec directory with template files',
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
        short_name: {
          type: 'string',
          description: 'Optional 2-4 word short name for the branch (lowercase, hyphens only)',
        },
        number: {
          type: 'number',
          description: 'Optional explicit branch number (1-999)',
        },
        parent_epic_branch: {
          type: 'string',
          description:
            'Parent epic branch to branch from (for epic children). If provided, the new branch will be created from this branch instead of the current branch.',
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
        short_name,
        number,
        parent_epic_branch,
        cwd,
      } = (params || {}) as CreateFeatureParams;

      const workDir = cwd || process.cwd();

      // Find repository root
      let repoRoot: string;
      try {
        repoRoot = await findRepoRoot(workDir);
      } catch (error) {
        if (error instanceof RepoNotFoundError) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  success: false,
                  error: createError(
                    'FEATURE_DIR_NOT_FOUND',
                    'Could not find repository root (no .git directory found)'
                  ),
                }),
              },
            ],
          };
        }
        throw error;
      }

      const specsDir = config.paths.specs;
      const specsDirPath = path.join(repoRoot, specsDir);

      // Determine feature number
      const featureNumInt = number
        ? number
        : await findNextFeatureNumber(repoRoot, specsDir);

      // Validate number range
      if (featureNumInt > 999) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: false,
                error: createError(
                  'INVALID_FEATURE_NUMBER',
                  'Feature number must be between 1 and 999'
                ),
              }),
            },
          ],
        };
      }

      // Defense-in-depth: Check if any branch already exists for this issue number
      const existingBranches = await findExistingBranchesForNumber(
        featureNumInt,
        repoRoot
      );
      if (existingBranches.length > 0) {
        const branchList = existingBranches.join(', ');
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: false,
                error: createError(
                  'BRANCH_EXISTS_FOR_ISSUE',
                  `A branch already exists for issue #${featureNumInt}: ${branchList}. ` +
                    `Please use the existing branch instead of creating a new one.`,
                  { existing_branches: existingBranches }
                ),
              }),
            },
          ],
        };
      }

      // Generate slug from description or use provided short_name
      const slug = short_name
        ? short_name
        : generateSlug(description, {
            maxWords: config.branches.maxSlugWords,
          });

      // Build branch name using configured pattern
      const branchName = buildBranchName(
        config.branches.pattern,
        featureNumInt,
        slug,
        config.branches.numberPadding
      );

      // Validate branch name
      if (!FEATURE_NAME_PATTERN.test(branchName)) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: false,
                error: createError(
                  'INVALID_BRANCH_NAME',
                  `Invalid branch name format: ${branchName}`,
                  { pattern: FEATURE_NAME_PATTERN.source }
                ),
              }),
            },
          ],
        };
      }

      // Create feature directory
      const featureDir = path.join(specsDirPath, branchName);
      if (await exists(featureDir)) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: false,
                error: createError(
                  'BRANCH_EXISTS',
                  `Feature directory already exists: ${featureDir}`
                ),
              }),
            },
          ],
        };
      }

      try {
        // Create feature directory (spec.md only, no empty subdirectories per Q3 decision)
        await mkdir(featureDir);

        // Create git branch if in a git repo
        let gitBranchCreated = false;
        let branchedFromEpic = false;

        if (await isGitRepo(repoRoot)) {
          const { simpleGit } = await import('simple-git');
          const git = simpleGit(repoRoot);
          const branches = await git.branchLocal();

          if (!branches.all.includes(branchName)) {
            // If parent_epic_branch is provided, branch from it
            if (parent_epic_branch) {
              // Fetch first to ensure we have the latest
              try {
                await git.fetch(['--all', '--prune']);
              } catch {
                // Continue even if fetch fails
              }

              // Check if the epic branch exists locally or on remote
              const allBranches = await git.branch(['-a']);
              const epicBranchExists = allBranches.all.some(
                (b) =>
                  b === parent_epic_branch ||
                  b === `remotes/origin/${parent_epic_branch}` ||
                  b === `origin/${parent_epic_branch}`
              );

              if (epicBranchExists) {
                // If on remote only, checkout tracking branch first
                const localBranches = await git.branchLocal();
                if (!localBranches.all.includes(parent_epic_branch)) {
                  // Checkout remote tracking branch
                  await git.checkout([
                    '-b',
                    parent_epic_branch,
                    `origin/${parent_epic_branch}`,
                  ]);
                } else {
                  await git.checkout(parent_epic_branch);
                }
                // Pull latest from remote
                try {
                  await git.pull('origin', parent_epic_branch);
                } catch {
                  // Continue even if pull fails
                }
                // Create new branch from epic branch
                await git.checkoutLocalBranch(branchName);
                branchedFromEpic = true;
              } else {
                // Epic branch not found, fall back to creating from current
                await git.checkoutLocalBranch(branchName);
              }
            } else {
              await git.checkoutLocalBranch(branchName);
            }
            gitBranchCreated = true;
          } else {
            // Branch exists, just checkout
            await git.checkout(branchName);
          }
        }

        // Create spec.md - try template first, then generate default
        const specFile = path.join(featureDir, 'spec.md');
        const template = await loadSpecTemplate(
          config.paths.templates,
          repoRoot
        );

        let specContent: string;
        if (template) {
          specContent = populateTemplate(
            template,
            branchName,
            description,
            parent_epic_branch
          );
        } else {
          specContent = createInitialSpecContent(
            description,
            branchName,
            parent_epic_branch
          );
        }

        await writeFile(specFile, specContent);

        const result: CreateFeatureResult = {
          success: true,
          branch_name: branchName,
          feature_num: padFeatureNumber(featureNumInt, config.branches.numberPadding),
          spec_file: specFile,
          feature_dir: featureDir,
          git_branch_created: gitBranchCreated,
          branched_from_epic: branchedFromEpic,
          ...(branchedFromEpic && { parent_epic_branch }),
        };

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result),
            },
          ],
        };
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Unknown error occurred';
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: false,
                error: createError('GIT_OPERATION_FAILED', message, {
                  description,
                  ...(short_name ? { short_name } : {}),
                  ...(number ? { number } : {}),
                  ...(parent_epic_branch ? { parent_epic_branch } : {}),
                }),
              }),
            },
          ],
        };
      }
    },
  };
}
