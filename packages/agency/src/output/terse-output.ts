/**
 * TerseOutput class for the terse output pattern.
 *
 * Provides both static methods for convenience and instance methods
 * for configured behavior.
 */

import type { ToolResult, ToolContent } from '../tools/types.js';
import {
  type TerseToolResult,
  type ExecResult,
  type TerseOutputConfig,
  Verbosity,
  DEFAULT_TERSE_CONFIG,
} from './types.js';
import { formatError } from './format-error.js';
import { SUCCESS_MESSAGES } from './success-messages.js';

/**
 * TerseOutput class for creating tool results following the terse output pattern.
 *
 * Static methods provide convenient, unconfigured access.
 * Instance methods respect verbosity and other configuration settings.
 *
 * @example
 * ```typescript
 * // Static usage - quick one-off
 * return TerseOutput.success('Done.');
 *
 * // Instance usage - configured
 * const output = new TerseOutput({ verbosity: Verbosity.VERBOSE });
 * return output.success('Done.');
 * ```
 */
export class TerseOutput {
  private readonly config: Required<TerseOutputConfig>;

  /**
   * Create a configured TerseOutput instance.
   *
   * @param config - Configuration options
   */
  constructor(config: TerseOutputConfig = {}) {
    this.config = {
      ...DEFAULT_TERSE_CONFIG,
      ...config,
    };
  }

  /**
   * Create a success result with a short message.
   *
   * @param message - The success message
   * @returns TerseToolResult with success=true
   */
  static success(message: string): TerseToolResult {
    return {
      success: true,
      output: message,
    };
  }

  /**
   * Create a failure result with full error details.
   *
   * @param error - The error (Error object or string)
   * @param context - Optional additional context for debugging
   * @returns TerseToolResult with success=false
   */
  static failure(error: Error | string, context?: unknown): TerseToolResult {
    return {
      success: false,
      output: formatError(error, context),
    };
  }

  /**
   * Create a result from process execution output.
   *
   * @param result - The execution result
   * @returns TerseToolResult based on exit code
   */
  static fromExec(result: ExecResult): TerseToolResult {
    if (result.exitCode === 0) {
      return TerseOutput.success(
        result.shortMessage ?? SUCCESS_MESSAGES.completed
      );
    }

    // Build failure output with stderr and stdout
    const parts: string[] = [];

    if (result.stderr) {
      parts.push(result.stderr);
    }
    if (result.stdout) {
      if (parts.length > 0) {
        parts.push('');
      }
      parts.push(result.stdout);
    }

    return TerseOutput.failure(
      parts.join('\n') || `Process exited with code ${result.exitCode}`
    );
  }

  /**
   * Create a success result (instance method respecting config).
   *
   * @param message - The success message
   * @returns TerseToolResult with success=true
   */
  success(message: string): TerseToolResult {
    const truncated = this.truncateMessage(message);
    return {
      success: true,
      output: truncated,
    };
  }

  /**
   * Create a success result with additional summary (for NORMAL verbosity).
   *
   * @param message - The primary success message
   * @param summary - Additional summary information
   * @returns TerseToolResult with success=true
   */
  successWithSummary(message: string, summary: string): TerseToolResult {
    let output: string;

    switch (this.config.verbosity) {
      case Verbosity.TERSE:
        // TERSE mode: message only
        output = message;
        break;
      case Verbosity.NORMAL:
        // NORMAL mode: message + summary
        output = `${message} (${summary})`;
        break;
      case Verbosity.VERBOSE:
        // VERBOSE mode: full output
        output = `${message}\n\nSummary:\n${summary}`;
        break;
      default:
        output = message;
    }

    return {
      success: true,
      output: this.truncateMessage(output),
    };
  }

  /**
   * Create a failure result (instance method).
   *
   * @param error - The error
   * @param context - Optional context
   * @returns TerseToolResult with success=false
   */
  failure(error: Error | string, context?: unknown): TerseToolResult {
    // Failure always shows full details regardless of verbosity
    return TerseOutput.failure(error, context);
  }

  /**
   * Create a result from process execution (instance method respecting config).
   *
   * @param result - The execution result
   * @returns TerseToolResult based on exit code and verbosity
   */
  fromExec(result: ExecResult): TerseToolResult {
    if (result.exitCode === 0) {
      switch (this.config.verbosity) {
        case Verbosity.TERSE:
          return this.success(
            result.shortMessage ?? SUCCESS_MESSAGES.completed
          );
        case Verbosity.NORMAL:
          if (result.shortMessage) {
            // Include a brief summary in NORMAL mode
            const summary = result.stdout.split('\n')[0] || '';
            return this.successWithSummary(result.shortMessage, summary);
          }
          return this.success(SUCCESS_MESSAGES.completed);
        case Verbosity.VERBOSE:
          // Full output in VERBOSE mode
          const parts = [result.shortMessage ?? SUCCESS_MESSAGES.completed];
          if (result.stdout) {
            parts.push('', 'stdout:', result.stdout);
          }
          if (result.stderr) {
            parts.push('', 'stderr:', result.stderr);
          }
          return {
            success: true,
            output: parts.join('\n'),
          };
        default:
          return this.success(
            result.shortMessage ?? SUCCESS_MESSAGES.completed
          );
      }
    }

    // Failure always shows full output
    return TerseOutput.fromExec(result);
  }

  /**
   * Truncate message to maxSuccessLength if needed.
   */
  private truncateMessage(message: string): string {
    if (message.length <= this.config.maxSuccessLength) {
      return message;
    }
    return message.slice(0, this.config.maxSuccessLength - 3) + '...';
  }
}

/**
 * Convert a TerseToolResult to MCP-compatible ToolResult format.
 *
 * This conversion happens at the MCP server boundary.
 *
 * @param result - The terse tool result
 * @returns MCP-compatible ToolResult
 */
export function toMcpToolResult(result: TerseToolResult): ToolResult {
  const content: ToolContent[] = [{ type: 'text', text: result.output }];

  return {
    content,
    isError: !result.success,
  };
}
