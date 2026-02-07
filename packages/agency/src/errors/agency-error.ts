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
  /** Critical plugin initialization error */
  CRITICAL_PLUGIN_INIT_FAILED: 'CRITICAL_PLUGIN_INIT_FAILED',
  /** Plugin has missing dependencies */
  PLUGIN_MISSING_DEPS: 'PLUGIN_MISSING_DEPS',
  /** Plugin manifest validation failed */
  PLUGIN_MANIFEST_INVALID: 'PLUGIN_MANIFEST_INVALID',
  /** Plugin dependency cycle detected */
  PLUGIN_DEPENDENCY_CYCLE: 'PLUGIN_DEPENDENCY_CYCLE',
  /** Tool not found in registry */
  TOOL_NOT_FOUND: 'TOOL_NOT_FOUND',
  /** Tool execution error */
  TOOL_EXEC_FAILED: 'TOOL_EXEC_FAILED',
  /** Mode not defined in config */
  MODE_NOT_FOUND: 'MODE_NOT_FOUND',
  /** Mode already registered */
  MODE_ALREADY_REGISTERED: 'MODE_ALREADY_REGISTERED',
  /** Circular extension detected in mode inheritance */
  MODE_CIRCULAR_INHERITANCE: 'MODE_CIRCULAR_INHERITANCE',
  /** Mode configuration validation failed */
  MODE_CONFIG_INVALID: 'MODE_CONFIG_INVALID',
  /** Server not running */
  SERVER_NOT_RUNNING: 'SERVER_NOT_RUNNING',
  /** Server already running */
  SERVER_ALREADY_RUNNING: 'SERVER_ALREADY_RUNNING',
  /** Channel not found */
  CHANNEL_NOT_FOUND: 'CHANNEL_NOT_FOUND',
  /** Channel already registered */
  CHANNEL_ALREADY_REGISTERED: 'CHANNEL_ALREADY_REGISTERED',
  /** Cannot send to channel without subscribers */
  CHANNEL_NO_SUBSCRIBERS: 'CHANNEL_NO_SUBSCRIBERS',
  /** Channel version is not compatible */
  CHANNEL_VERSION_MISMATCH: 'CHANNEL_VERSION_MISMATCH',
  /** sendAndWait timed out waiting for response */
  CHANNEL_TIMEOUT: 'CHANNEL_TIMEOUT',
  /** One or more message handlers failed during delivery */
  CHANNEL_DELIVERY_FAILED: 'CHANNEL_DELIVERY_FAILED',
  /** Facet binding validation failed (required facets not satisfied) */
  FACET_BINDING_FAILED: 'FACET_BINDING_FAILED',
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
