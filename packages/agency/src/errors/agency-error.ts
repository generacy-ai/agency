/**
 * Agency error types for consistent error handling
 *
 * All Agency errors extend AgencyError with a code for programmatic handling
 * and optional context for debugging.
 */

/**
 * Error codes for Agency errors
 */
export const ErrorCodes = {
  /** No configuration file found */
  CONFIG_NOT_FOUND: 'CONFIG_NOT_FOUND',
  /** Configuration validation failed */
  CONFIG_INVALID: 'CONFIG_INVALID',
  /** Plugin package not found */
  PLUGIN_NOT_FOUND: 'PLUGIN_NOT_FOUND',
  /** Plugin initialization error */
  PLUGIN_INIT_FAILED: 'PLUGIN_INIT_FAILED',
  /** Tool not found in registry */
  TOOL_NOT_FOUND: 'TOOL_NOT_FOUND',
  /** Tool execution error */
  TOOL_EXEC_FAILED: 'TOOL_EXEC_FAILED',
  /** Mode not defined in config */
  MODE_NOT_FOUND: 'MODE_NOT_FOUND',
  /** Server not running */
  SERVER_NOT_RUNNING: 'SERVER_NOT_RUNNING',
  /** Server already running */
  SERVER_ALREADY_RUNNING: 'SERVER_ALREADY_RUNNING',
} as const;

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];

/**
 * Base error class for all Agency errors
 */
export class AgencyError extends Error {
  /** Error code for programmatic handling */
  readonly code: ErrorCode;

  /** Additional context data */
  readonly context?: Record<string, unknown>;

  constructor(
    code: ErrorCode,
    message: string,
    context?: Record<string, unknown>
  ) {
    super(message);
    this.code = code;
    this.context = context;
    this.name = 'AgencyError';

    // Maintains proper stack trace for where error was thrown
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, AgencyError);
    }
  }

  /**
   * Create a JSON representation of the error
   */
  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      context: this.context,
    };
  }
}
