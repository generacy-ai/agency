/**
 * Type definitions for the terse output pattern utilities.
 *
 * These types are platform-agnostic. Convert to MCP format at the server boundary.
 */

/**
 * Output verbosity levels for terse output pattern.
 */
export enum Verbosity {
  /** Minimal success output, full failure output (default) */
  TERSE = 'terse',

  /** Success with summary, full failure output */
  NORMAL = 'normal',

  /** Full output always (debugging mode) */
  VERBOSE = 'verbose',
}

/**
 * Platform-agnostic tool result type.
 * Convert to MCP CallToolResult at the MCP server boundary.
 */
export interface TerseToolResult {
  /** Whether the operation succeeded */
  success: boolean;

  /** Human-readable output message */
  output: string;
}

/**
 * Minimal interface for process execution results.
 * Callers map from execa/child_process to this interface.
 */
export interface ExecResult {
  /** Process exit code (0 = success) */
  exitCode: number;

  /** Standard output content */
  stdout: string;

  /** Standard error content */
  stderr: string;

  /** Optional short summary for success case (NORMAL verbosity) */
  shortMessage?: string;
}

/**
 * Configuration for TerseOutput instance.
 * Passed via constructor, not read from files.
 */
export interface TerseOutputConfig {
  /** Output verbosity level (default: TERSE) */
  verbosity?: Verbosity;

  /** Maximum length for success messages (default: 100) */
  maxSuccessLength?: number;

  /** Include timing information in output (default: false) */
  includeTimings?: boolean;
}

/**
 * Default configuration values for TerseOutput.
 */
export const DEFAULT_TERSE_CONFIG: Required<TerseOutputConfig> = {
  verbosity: Verbosity.TERSE,
  maxSuccessLength: 100,
  includeTimings: false,
};
