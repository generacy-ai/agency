/**
 * check_prereqs tool implementation for spec-kit
 *
 * Validates required files exist before operations and returns
 * a list of available optional documents.
 */

import { join } from 'node:path';
import type { AgencyTool, ToolResult, AgencyCoreAPI } from '@generacy-ai/agency';
import type { PrerequisiteResult } from '../types/feature.js';
import type { SpecKitConfig } from '../config.js';
import { FEATURE_NAME_PATTERN } from '../types/patterns.js';
import {
  exists,
  readDir,
  findRepoRoot,
  isGitRepo,
  getCurrentBranch,
  RepoNotFoundError,
} from '../utils/index.js';

/**
 * Parameters for the check_prereqs tool
 */
interface CheckPrereqsParams {
  /** Whether spec.md is required (default: true) */
  require_spec?: boolean;
  /** Whether plan.md is required (default: false) */
  require_plan?: boolean;
  /** Whether tasks.md is required (default: false) */
  require_tasks?: boolean;
  /** Include tasks.md in available_docs if it exists */
  include_tasks?: boolean;
  /** Optional branch/feature name override */
  branch?: string;
  /** Working directory (defaults to process.cwd()) */
  cwd?: string;
}

/**
 * File names for spec artifacts
 */
const FILE_NAMES = {
  spec: 'spec.md',
  plan: 'plan.md',
  tasks: 'tasks.md',
  research: 'research.md',
  dataModel: 'data-model.md',
  quickstart: 'quickstart.md',
} as const;

/**
 * Directory names for spec artifacts
 */
const DIR_NAMES = {
  contracts: 'contracts',
  checklists: 'checklists',
} as const;

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
 * Check if a path is a file (not a directory)
 */
async function isFile(path: string): Promise<boolean> {
  try {
    const { stat } = await import('node:fs/promises');
    const stats = await stat(path);
    return stats.isFile();
  } catch {
    return false;
  }
}

/**
 * Check if a path is a directory
 */
async function isDirectory(path: string): Promise<boolean> {
  try {
    const { stat } = await import('node:fs/promises');
    const stats = await stat(path);
    return stats.isDirectory();
  } catch {
    return false;
  }
}

/**
 * Get list of available optional documents in feature directory.
 *
 * @param featureDir - Feature directory path
 * @returns List of available optional document names
 */
async function getAvailableDocs(featureDir: string): Promise<string[]> {
  const optionalDocs = [
    FILE_NAMES.research,
    FILE_NAMES.dataModel,
    FILE_NAMES.quickstart,
  ];

  const available: string[] = [];

  // Check for optional markdown files
  for (const doc of optionalDocs) {
    if (await isFile(join(featureDir, doc))) {
      available.push(doc);
    }
  }

  // Check for contracts directory with content
  const contractsDir = join(featureDir, DIR_NAMES.contracts);
  if (await isDirectory(contractsDir)) {
    const contracts = await readDir(contractsDir);
    if (contracts.length > 0) {
      available.push('contracts/');
    }
  }

  // Check for checklists directory with content
  const checklistsDir = join(featureDir, DIR_NAMES.checklists);
  if (await isDirectory(checklistsDir)) {
    const checklists = await readDir(checklistsDir);
    if (checklists.length > 0) {
      available.push('checklists/');
    }
  }

  return available;
}

/**
 * Create the spec_kit.check_prereqs tool.
 *
 * This tool validates required files exist before operations and
 * returns a list of available optional documents.
 *
 * @param config - Plugin configuration
 * @param _core - Agency core API (unused)
 * @returns AgencyTool instance
 */
export function createCheckPrereqsTool(
  config: SpecKitConfig,
  _core: AgencyCoreAPI
): AgencyTool {
  return {
    name: 'spec_kit.check_prereqs',
    description:
      'Check prerequisites for a command. Validates required files exist and returns list of available optional documents.',
    namespace: 'spec_kit',
    outputPattern: 'terse',
    modes: ['coding', 'research'],
    inputSchema: {
      type: 'object',
      properties: {
        require_spec: {
          type: 'boolean',
          default: true,
          description: 'Whether spec.md is required (default: true)',
        },
        require_plan: {
          type: 'boolean',
          default: false,
          description: 'Whether plan.md is required (default: false)',
        },
        require_tasks: {
          type: 'boolean',
          default: false,
          description: 'Whether tasks.md is required (default: false)',
        },
        include_tasks: {
          type: 'boolean',
          default: false,
          description: 'Include tasks.md in available_docs if it exists',
        },
        branch: {
          type: 'string',
          description:
            'Optional branch/feature name. If not provided, uses current.',
        },
        cwd: {
          type: 'string',
          description: 'Working directory (defaults to process.cwd())',
        },
      },
    },
    async execute(params: unknown): Promise<ToolResult> {
      const {
        require_spec = true,
        require_plan = false,
        require_tasks = false,
        include_tasks = false,
        branch,
        cwd,
      } = (params || {}) as CheckPrereqsParams;
      const workDir = cwd || process.cwd();

      // Find repo root
      let repoRoot: string;
      try {
        repoRoot = await findRepoRoot(workDir);
      } catch (error) {
        if (error instanceof RepoNotFoundError) {
          const result: PrerequisiteResult = {
            valid: false,
            featureDir: '',
            availableDocs: [],
            error: 'Could not find repository root',
          };
          return {
            content: [{ type: 'text', text: JSON.stringify(result) }],
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
        const result: PrerequisiteResult = {
          valid: false,
          featureDir: '',
          availableDocs: [],
          error:
            'Could not determine feature name. Use a feature branch (###-name) or set SPECIFY_FEATURE env var.',
        };
        return {
          content: [{ type: 'text', text: JSON.stringify(result) }],
        };
      }

      // Validate feature name pattern
      if (!FEATURE_NAME_PATTERN.test(featureName)) {
        const result: PrerequisiteResult = {
          valid: false,
          featureDir: '',
          availableDocs: [],
          error: `Branch name '${featureName}' does not match required pattern ###-name`,
        };
        return {
          content: [{ type: 'text', text: JSON.stringify(result) }],
        };
      }

      const featureDir = join(specsDir, featureName);

      // Check if feature directory exists
      if (!(await exists(featureDir))) {
        const result: PrerequisiteResult & { missingRequired?: string[] } = {
          valid: false,
          featureDir,
          availableDocs: [],
          missingRequired: ['feature directory'],
          error: `Feature directory does not exist: ${featureDir}`,
        };
        return {
          content: [{ type: 'text', text: JSON.stringify(result) }],
        };
      }

      // Check required files
      const missingRequired: string[] = [];

      if (require_spec) {
        const specFile = join(featureDir, FILE_NAMES.spec);
        if (!(await isFile(specFile))) {
          missingRequired.push(FILE_NAMES.spec);
        }
      }

      if (require_plan) {
        const planFile = join(featureDir, FILE_NAMES.plan);
        if (!(await isFile(planFile))) {
          missingRequired.push(FILE_NAMES.plan);
        }
      }

      if (require_tasks) {
        const tasksFile = join(featureDir, FILE_NAMES.tasks);
        if (!(await isFile(tasksFile))) {
          missingRequired.push(FILE_NAMES.tasks);
        }
      }

      // Get available optional docs
      const availableDocs = await getAvailableDocs(featureDir);

      // Include tasks.md if requested and exists
      if (include_tasks) {
        const tasksFile = join(featureDir, FILE_NAMES.tasks);
        if (await isFile(tasksFile)) {
          availableDocs.push(FILE_NAMES.tasks);
        }
      }

      if (missingRequired.length > 0) {
        const result: PrerequisiteResult & { missingRequired: string[] } = {
          valid: false,
          featureDir,
          availableDocs,
          missingRequired,
          error: `Missing required files: ${missingRequired.join(', ')}`,
        };
        return {
          content: [{ type: 'text', text: JSON.stringify(result) }],
        };
      }

      const result: PrerequisiteResult = {
        valid: true,
        featureDir,
        availableDocs,
      };

      return {
        content: [{ type: 'text', text: JSON.stringify(result) }],
      };
    },
  };
}
