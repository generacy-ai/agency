/**
 * @generacy-ai/agency-plugin-spec-kit
 *
 * Specification management plugin providing structured feature development tools for agents.
 *
 * Tools (to be added):
 * - spec.create - Create new feature spec
 * - spec.validate - Validate spec structure
 * - spec.list - List feature specs
 */

// Plugin
export { SpecKitPlugin, createSpecKitPlugin } from './plugin.js';

// Configuration
export { DEFAULT_CONFIG, resolveConfig } from './config.js';

// Manifest
export { PLUGIN_MANIFEST } from './manifest.js';

// ============================================================================
// Types - Re-export all types from types module
// ============================================================================

// Base types
export type {
  BaseToolParams,
  SpecKitPluginConfig,
  // Re-exported Agency types
  AgencyPlugin,
  AgencyCoreAPI,
  AgencyTool,
  PluginManifest,
} from './types/index.js';

// Feature types
export type {
  Feature,
  FeaturePaths,
  BranchInfo,
  PrerequisiteResult,
} from './types/index.js';

// Ticket types
export {
  KNOWN_PROVIDERS,
  isKnownProvider,
} from './types/index.js';

export type {
  KnownTicketProvider,
  TicketProvider,
  TicketRef,
  TicketParams,
  TicketUpdates,
} from './types/index.js';

// Task types
export {
  DEFAULT_TASK_ID_CONFIG,
} from './types/index.js';

export type {
  Task,
  GroupingStrategy,
  TaskGroup,
  SubTask,
  TaskGroupEntry,
  TaskIdConfig,
} from './types/index.js';

// Clarification types
export type {
  ClarificationOption,
  ClarificationQuestion,
  ClarificationBatch,
  ClarificationsFile,
  ClarificationAppendResult,
  ClarificationQuestionInput,
} from './types/index.js';

// Dependency types
export type {
  TaskDependency,
  DependencyGraph,
  DependencyErrorType,
  DependencyValidationError,
  DependencyValidationResult,
  CircularDependency,
  DependencyAnalysisOptions,
} from './types/index.js';

// Issue types
export type {
  IssuePlan,
  CreatedIssue,
  TasksToIssuesResult,
  TasksToIssuesOptions,
  IssueCreationStats,
} from './types/index.js';

// Error types
export {
  createError,
  isMcpError,
} from './types/index.js';

export type {
  ErrorCode,
  McpError,
  ErrorResult,
} from './types/index.js';

// Configuration types (Zod-based)
export {
  TaskIdConfigSchema,
  FileNamesSchema,
  DirectoryNamesSchema,
  SpecKitConfigSchema,
  DEFAULT_SPECKIT_CONFIG,
  parseConfig,
  safeParseConfig,
  mergeConfig,
} from './types/index.js';

export type {
  TaskIdConfigType,
  FileNamesType,
  DirectoryNamesType,
  SpecKitConfig,
} from './types/index.js';

// Validation patterns
export {
  FEATURE_NAME_PATTERN,
  MAX_BRANCH_LENGTH,
  TASK_ID_PATTERN,
  USER_STORY_PATTERN,
  USER_STORY_EXTRACT_PATTERN,
  EXISTING_ISSUE_PATTERN,
  EXISTING_ISSUE_EXTRACT_PATTERN,
  TASK_GROUP_ID_PATTERN,
  TASK_GROUP_HEADER_PATTERN,
  PARALLEL_MARKER_PATTERN,
  PHASE_HEADER_PATTERN,
  CHECKBOX_PATTERN,
  SCOPE_PATTERN,
  SCOPE_EXTRACT_PATTERN,
  DEPENDENCY_PATTERN,
  VALID_SCOPES,
} from './types/index.js';

export type {
  ScopeEstimate,
} from './types/index.js';

// ============================================================================
// Utilities - Re-export all utilities from utils module
// ============================================================================

export {
  buildTaskId,
  buildTaskGroupId,
  buildTaskIdPattern,
  buildTaskGroupIdPattern,
  buildTaskIdSearchPattern,
  buildTaskGroupIdSearchPattern,
  escapeRegex,
  parseTaskIdNumber,
  parseTaskGroupIdNumber,
  isValidTaskId,
  isValidTaskGroupId,
} from './utils/index.js';

// Default export for plugin
import { SpecKitPlugin } from './plugin.js';
export default SpecKitPlugin;
