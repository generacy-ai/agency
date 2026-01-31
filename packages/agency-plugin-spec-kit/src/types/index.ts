/**
 * Type definitions for @generacy-ai/agency-plugin-spec-kit
 *
 * This module re-exports all types from the spec-kit package,
 * providing a single entry point for type imports.
 */

// Re-export Agency types for convenience
export type {
  AgencyPlugin,
  AgencyCoreAPI,
  AgencyTool,
  PluginManifest,
} from '@generacy-ai/agency';

// Re-export config type from existing config module
export type { SpecKitPluginConfig } from '../config.js';

// ============================================================================
// Feature Types
// ============================================================================

export type {
  Feature,
  FeaturePaths,
  BranchInfo,
  PrerequisiteResult,
} from './feature.js';

// ============================================================================
// Ticket Types
// ============================================================================

export {
  KNOWN_PROVIDERS,
  isKnownProvider,
} from './ticket.js';

export type {
  KnownTicketProvider,
  TicketProvider,
  TicketRef,
  TicketParams,
  TicketUpdates,
} from './ticket.js';

// ============================================================================
// Task Types
// ============================================================================

export {
  DEFAULT_TASK_ID_CONFIG,
} from './task.js';

export type {
  Task,
  GroupingStrategy,
  TaskGroup,
  SubTask,
  TaskGroupEntry,
  TaskIdConfig,
} from './task.js';

// ============================================================================
// Clarification Types
// ============================================================================

export { ClarificationStatus } from './clarification.js';

export type {
  ClarificationOption,
  ClarificationQuestion,
  ClarificationBatch,
  ClarificationsFile,
  ClarificationAppendResult,
  ClarificationQuestionInput,
  HumancyRequestStatus,
  ReadClarificationsOutput,
  AppendClarificationsOutput,
  UpdateAnswerOutput,
} from './clarification.js';

// ============================================================================
// Dependency Types
// ============================================================================

export type {
  TaskDependency,
  DependencyGraph,
  DependencyErrorType,
  DependencyValidationError,
  DependencyValidationResult,
  CircularDependency,
  DependencyAnalysisOptions,
} from './dependency.js';

// ============================================================================
// Issue Types
// ============================================================================

export type {
  IssuePlan,
  CreatedIssue,
  TasksToIssuesResult,
  TasksToIssuesOptions,
  IssueCreationStats,
} from './issue.js';

// ============================================================================
// Error Types
// ============================================================================

export {
  createError,
  isMcpError,
} from './errors.js';

export type {
  ErrorCode,
  McpError,
  ErrorResult,
} from './errors.js';

// ============================================================================
// Configuration Types (Zod-based)
// ============================================================================

export {
  TaskIdConfigSchema,
  FileNamesSchema,
  DirectoryNamesSchema,
  SpecKitConfigSchema,
  DEFAULT_SPECKIT_CONFIG,
  parseConfig,
  safeParseConfig,
  mergeConfig,
} from './config.js';

export type {
  TaskIdConfigType,
  FileNamesType,
  DirectoryNamesType,
  SpecKitConfig,
} from './config.js';

// ============================================================================
// Validation Patterns
// ============================================================================

export {
  // Feature patterns
  FEATURE_NAME_PATTERN,
  MAX_BRANCH_LENGTH,

  // Task patterns
  TASK_ID_PATTERN,
  USER_STORY_PATTERN,
  USER_STORY_EXTRACT_PATTERN,
  EXISTING_ISSUE_PATTERN,
  EXISTING_ISSUE_EXTRACT_PATTERN,

  // Task group patterns
  TASK_GROUP_ID_PATTERN,
  TASK_GROUP_HEADER_PATTERN,

  // Task description patterns
  PARALLEL_MARKER_PATTERN,
  PHASE_HEADER_PATTERN,
  CHECKBOX_PATTERN,
  SCOPE_PATTERN,
  SCOPE_EXTRACT_PATTERN,
  DEPENDENCY_PATTERN,

  // Scope values
  VALID_SCOPES,
} from './patterns.js';

export type {
  ScopeEstimate,
} from './patterns.js';

// ============================================================================
// Agent Types
// ============================================================================

export {
  AGENT_TYPES,
  AGENT_CONFIGS,
  isAgentType,
} from './agent.js';

export type {
  AgentType,
  AgentConfig,
} from './agent.js';

// ============================================================================
// Base Types
// ============================================================================

/**
 * Base parameters shared by all spec tools
 */
export interface BaseToolParams {
  /** Working directory. Defaults to process.cwd() */
  cwd?: string;
}
