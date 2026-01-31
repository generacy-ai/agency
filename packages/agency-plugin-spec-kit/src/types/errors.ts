/**
 * Error type definitions for spec-kit
 *
 * These types provide structured error handling with typed error codes
 * and a factory function for creating errors.
 */

/**
 * Error codes for spec-kit operations.
 *
 * Each code represents a specific error condition that can occur
 * during spec-kit operations.
 */
export type ErrorCode =
  // Branch errors
  | 'BRANCH_EXISTS'
  | 'BRANCH_EXISTS_FOR_ISSUE'
  | 'BRANCH_NOT_FOUND'
  | 'INVALID_BRANCH_NAME'

  // File not found errors
  | 'SPEC_NOT_FOUND'
  | 'PLAN_NOT_FOUND'
  | 'TASKS_NOT_FOUND'
  | 'FEATURE_DIR_NOT_FOUND'
  | 'TEMPLATE_NOT_FOUND'
  | 'AGENT_FILE_NOT_FOUND'
  | 'CLARIFICATIONS_NOT_FOUND'

  // File operation errors
  | 'FILE_WRITE_FAILED'
  | 'FILE_READ_FAILED'

  // Git errors
  | 'GIT_NOT_INITIALIZED'
  | 'GIT_OPERATION_FAILED'

  // Validation errors
  | 'INVALID_FEATURE_NUMBER'
  | 'INVALID_TASK_ID'
  | 'INVALID_CONFIG'

  // Dependency errors
  | 'CIRCULAR_DEPENDENCY'
  | 'MISSING_DEPENDENCY'

  // Issue errors
  | 'ISSUE_CREATION_FAILED'
  | 'ISSUE_NOT_FOUND'

  // General errors
  | 'OPERATION_FAILED'
  | 'PREREQUISITE_NOT_MET'

  // Clarification errors
  | 'CLARIFICATION_NOT_FOUND'
  | 'CLARIFICATION_INVALID_OPERATION'
  | 'CLARIFICATION_APPEND_FAILED'
  | 'CLARIFICATION_UPDATE_FAILED'
  | 'HUMANCY_NOT_AVAILABLE';

/**
 * Structured error format for MCP tools.
 *
 * Provides consistent error information including a typed code,
 * human-readable message, and optional context.
 *
 * @example
 * ```typescript
 * const error: McpError = {
 *   code: 'SPEC_NOT_FOUND',
 *   message: 'Specification file not found at /workspace/specs/042-user-auth/spec.md',
 *   context: {
 *     path: '/workspace/specs/042-user-auth/spec.md',
 *     feature: '042-user-auth',
 *   },
 * };
 * ```
 */
export interface McpError {
  /** Error code */
  code: ErrorCode;

  /** Human-readable message */
  message: string;

  /** Additional context */
  context?: Record<string, unknown>;
}

/**
 * Factory function for creating structured errors.
 *
 * Creates an McpError with the given code, message, and optional context.
 *
 * @param code - Error code from ErrorCode type
 * @param message - Human-readable error message
 * @param context - Optional additional context
 * @returns McpError object
 *
 * @example
 * ```typescript
 * const error = createError(
 *   'SPEC_NOT_FOUND',
 *   'Specification file not found',
 *   { path: '/workspace/specs/042-user-auth/spec.md' }
 * );
 * ```
 */
export function createError(
  code: ErrorCode,
  message: string,
  context?: Record<string, unknown>
): McpError {
  return {
    code,
    message,
    ...(context ? { context } : {}),
  };
}

/**
 * Type guard to check if a value is an McpError.
 *
 * @param value - Value to check
 * @returns True if value is an McpError
 *
 * @example
 * ```typescript
 * if (isMcpError(result)) {
 *   console.error(`Error ${result.code}: ${result.message}`);
 * }
 * ```
 */
export function isMcpError(value: unknown): value is McpError {
  return (
    typeof value === 'object' &&
    value !== null &&
    'code' in value &&
    'message' in value &&
    typeof (value as McpError).code === 'string' &&
    typeof (value as McpError).message === 'string'
  );
}

/**
 * Result type that may contain an error.
 *
 * Used for operations that may fail, providing either a success
 * result or an error.
 *
 * @example
 * ```typescript
 * type ReadFileResult = ErrorResult<{ content: string }>;
 *
 * function readFile(path: string): ReadFileResult {
 *   try {
 *     return { success: true, content: fs.readFileSync(path, 'utf-8') };
 *   } catch {
 *     return { success: false, error: createError('FILE_READ_FAILED', `Failed to read ${path}`) };
 *   }
 * }
 * ```
 */
export type ErrorResult<T> =
  | (T & { success: true; error?: never })
  | { success: false; error: McpError };
