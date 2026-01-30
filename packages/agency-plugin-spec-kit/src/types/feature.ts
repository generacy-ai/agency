/**
 * Feature-related type definitions for spec-kit
 *
 * These types represent the core concept of a "feature" - a numbered development
 * unit with associated specification artifacts and file paths.
 */

/**
 * A numbered development unit with specification artifacts.
 *
 * Features are the primary organizational unit in spec-kit, representing
 * a coherent piece of functionality being developed.
 *
 * @example
 * ```typescript
 * const feature: Feature = {
 *   name: '042-user-auth',
 *   number: '042',
 *   shortName: 'user-auth',
 *   directory: '/workspace/specs/042-user-auth',
 *   hasGit: true,
 * };
 * ```
 */
export interface Feature {
  /** Branch/directory name following ###-short-name pattern */
  name: string;

  /** Three-digit feature number (e.g., "001", "042") */
  number: string;

  /** Short name extracted from branch (e.g., "user-auth") */
  shortName: string;

  /** Absolute path to feature directory under specs/ */
  directory: string;

  /** Whether repository has git initialized */
  hasGit: boolean;
}

/**
 * All file paths associated with a feature.
 *
 * Provides access to all specification artifacts for a feature,
 * including spec, plan, tasks, and supporting documentation files.
 *
 * @example
 * ```typescript
 * const paths: FeaturePaths = {
 *   repoRoot: '/workspace',
 *   branch: '042-user-auth',
 *   hasGit: true,
 *   featureDir: '/workspace/specs/042-user-auth',
 *   specFile: '/workspace/specs/042-user-auth/spec.md',
 *   planFile: '/workspace/specs/042-user-auth/plan.md',
 *   tasksFile: '/workspace/specs/042-user-auth/tasks.md',
 *   researchFile: '/workspace/specs/042-user-auth/research.md',
 *   dataModelFile: '/workspace/specs/042-user-auth/data-model.md',
 *   quickstartFile: '/workspace/specs/042-user-auth/quickstart.md',
 *   contractsDir: '/workspace/specs/042-user-auth/contracts',
 *   checklistsDir: '/workspace/specs/042-user-auth/checklists',
 *   clarificationsFile: '/workspace/specs/042-user-auth/clarifications.md',
 * };
 * ```
 */
export interface FeaturePaths {
  /** Repository root directory */
  repoRoot: string;

  /** Current branch name or feature name */
  branch: string;

  /** Whether git is available */
  hasGit: boolean;

  /** Feature directory under specs/ */
  featureDir: string;

  /** Path to spec file (configurable, default: spec.md) */
  specFile: string;

  /** Path to plan file (configurable, default: plan.md) */
  planFile: string;

  /** Path to tasks file (configurable, default: tasks.md) */
  tasksFile: string;

  /** Path to research file */
  researchFile: string;

  /** Path to data model file */
  dataModelFile: string;

  /** Path to quickstart file */
  quickstartFile: string;

  /** Path to contracts directory */
  contractsDir: string;

  /** Path to checklists directory */
  checklistsDir: string;

  /** Path to clarifications file */
  clarificationsFile: string;
}

/**
 * Git branch metadata.
 *
 * Contains information about a branch including extracted feature
 * information from the branch name.
 *
 * @example
 * ```typescript
 * const branch: BranchInfo = {
 *   name: '042-user-auth',
 *   issueNumber: '42',
 *   shortName: 'user-auth',
 *   isRemote: false,
 *   lastCommitDate: '2024-01-15T10:30:00Z',
 * };
 * ```
 */
export interface BranchInfo {
  /** Branch name */
  name: string;

  /** Issue number extracted from branch name */
  issueNumber: string;

  /** Short name portion of branch */
  shortName: string;

  /** Whether this is a remote branch */
  isRemote: boolean;

  /** Last commit date (ISO string) */
  lastCommitDate: string;
}

/**
 * Result of checking command prerequisites.
 *
 * Indicates whether required files exist and lists available
 * optional documentation files.
 *
 * @example
 * ```typescript
 * const result: PrerequisiteResult = {
 *   valid: true,
 *   featureDir: '/workspace/specs/042-user-auth',
 *   availableDocs: ['research.md', 'data-model.md'],
 * };
 * ```
 */
export interface PrerequisiteResult {
  /** Whether all required prerequisites are met */
  valid: boolean;

  /** Feature directory path (if found) */
  featureDir: string;

  /** List of available optional documentation files */
  availableDocs: string[];

  /** Error message if valid is false */
  error?: string;
}
