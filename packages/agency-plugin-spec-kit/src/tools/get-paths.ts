/**
 * get_paths tool implementation for spec-kit
 *
 * Resolves all feature-related file paths based on the current branch,
 * an explicit feature name, or the SPECIFY_FEATURE environment variable.
 */

import { join } from 'node:path';
import type { AgencyTool, ToolResult, AgencyCoreAPI } from '@generacy-ai/agency';
import type { FeaturePaths } from '../types/feature.js';
import type { SpecKitConfig } from '../config.js';
import { FEATURE_NAME_PATTERN } from '../types/patterns.js';
import { createError } from '../types/errors.js';
import {
  exists,
  readDir,
  findRepoRoot,
  isGitRepo,
  getCurrentBranch,
  RepoNotFoundError,
} from '../utils/index.js';

/**
 * Parameters for the get_paths tool
 */
interface GetPathsParams {
  /** Optional branch/feature name override */
  branch?: string;
  /** Working directory (defaults to process.cwd()) */
  cwd?: string;
}

/**
 * Find feature name from current branch or environment.
 *
 * Priority:
 * 1. SPECIFY_FEATURE environment variable
 * 2. Current git branch name (if matches pattern)
 * 3. Most recent feature directory in specs/
 *
 * @param repoRoot - Repository root directory
 * @param specsDir - Path to specs directory
 * @returns Feature name or null if not found
 */
async function getFeatureName(
  repoRoot: string,
  specsDir: string
): Promise<string | null> {
  // Check environment variable first
  const envFeature = process.env['SPECIFY_FEATURE'];
  if (envFeature && FEATURE_NAME_PATTERN.test(envFeature)) {
    return envFeature;
  }

  // Try to get from git branch
  if (await isGitRepo(repoRoot)) {
    const branch = await getCurrentBranch(repoRoot);
    if (branch && FEATURE_NAME_PATTERN.test(branch)) {
      return branch;
    }
  }

  // Try to find the most recent feature directory
  if (await exists(specsDir)) {
    const entries = await readDir(specsDir);
    const features = entries
      .filter((e) => FEATURE_NAME_PATTERN.test(e))
      .sort()
      .reverse();
    if (features.length > 0 && features[0] !== undefined) {
      return features[0];
    }
  }

  return null;
}

/**
 * Build FeaturePaths object from feature name.
 *
 * Uses configured file names and directory names from config,
 * falling back to defaults if not specified.
 *
 * @param repoRoot - Repository root directory
 * @param featureName - Feature name (e.g., "001-my-feature")
 * @param hasGit - Whether git is available
 * @param specsDir - Path to specs directory
 * @param config - Plugin configuration
 * @returns Complete FeaturePaths object
 */
function buildFeaturePaths(
  repoRoot: string,
  featureName: string,
  hasGit: boolean,
  specsDir: string,
  _config: SpecKitConfig
): FeaturePaths {
  const featureDir = join(specsDir, featureName);

  // Get file names from config or use defaults
  const fileNames = {
    spec: 'spec.md',
    plan: 'plan.md',
    tasks: 'tasks.md',
    research: 'research.md',
    dataModel: 'data-model.md',
    quickstart: 'quickstart.md',
    clarifications: 'clarifications.md',
  };

  // Get directory names from config or use defaults
  const dirNames = {
    contracts: 'contracts',
    checklists: 'checklists',
  };

  return {
    repoRoot,
    branch: featureName,
    hasGit,
    featureDir,
    specFile: join(featureDir, fileNames.spec),
    planFile: join(featureDir, fileNames.plan),
    tasksFile: join(featureDir, fileNames.tasks),
    researchFile: join(featureDir, fileNames.research),
    dataModelFile: join(featureDir, fileNames.dataModel),
    quickstartFile: join(featureDir, fileNames.quickstart),
    contractsDir: join(featureDir, dirNames.contracts),
    checklistsDir: join(featureDir, dirNames.checklists),
    clarificationsFile: join(featureDir, fileNames.clarifications),
  };
}

/**
 * Create the spec_kit.get_paths tool.
 *
 * This tool resolves all feature-related file paths based on:
 * 1. An explicit branch parameter
 * 2. The SPECIFY_FEATURE environment variable
 * 3. The current git branch name
 * 4. The most recent feature directory in specs/
 *
 * @param config - Plugin configuration
 * @param _core - Agency core API (unused)
 * @returns AgencyTool instance
 */
export function createGetPathsTool(
  config: SpecKitConfig,
  _core: AgencyCoreAPI
): AgencyTool {
  return {
    name: 'spec_kit.get_paths',
    description: 'Get all feature paths for the current or specified branch',
    namespace: 'spec_kit',
    outputPattern: 'terse',
    modes: ['coding', 'research'],
    inputSchema: {
      type: 'object',
      properties: {
        branch: {
          type: 'string',
          description:
            'Optional branch/feature name. If not provided, uses current branch or SPECIFY_FEATURE env var.',
        },
        cwd: {
          type: 'string',
          description: 'Working directory (defaults to process.cwd())',
        },
      },
    },
    async execute(params: unknown): Promise<ToolResult> {
      const { branch, cwd } = (params || {}) as GetPathsParams;
      const workDir = cwd || process.cwd();

      // Find repo root
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
                    'Could not find repository root'
                  ),
                }),
              },
            ],
          };
        }
        throw error;
      }

      // Determine specs directory path
      const specsDir = join(repoRoot, config.paths.specs);

      // Determine feature name
      let featureName: string | undefined = branch;
      if (!featureName) {
        featureName = (await getFeatureName(repoRoot, specsDir)) ?? undefined;
      }

      if (!featureName) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: false,
                error: createError(
                  'INVALID_BRANCH_NAME',
                  'Could not determine feature name. Use a feature branch (###-name) or set SPECIFY_FEATURE env var.'
                ),
              }),
            },
          ],
        };
      }

      // Validate feature name pattern
      if (!FEATURE_NAME_PATTERN.test(featureName)) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: false,
                error: createError(
                  'INVALID_BRANCH_NAME',
                  `Branch name '${featureName}' does not match required pattern ###-name`,
                  { pattern: FEATURE_NAME_PATTERN.source }
                ),
              }),
            },
          ],
        };
      }

      const hasGit = await isGitRepo(repoRoot);
      const paths = buildFeaturePaths(
        repoRoot,
        featureName,
        hasGit,
        specsDir,
        config
      );

      // Check if feature directory exists
      const featureDirExists = await exists(paths.featureDir);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: true,
              exists: featureDirExists,
              ...paths,
            }),
          },
        ],
      };
    },
  };
}
