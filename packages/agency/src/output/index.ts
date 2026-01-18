/**
 * Terse Output Pattern Utilities
 *
 * Provides utilities for the terse output pattern - minimal output on success,
 * detailed output on failure. Optimized for agent efficiency.
 *
 * @example
 * ```typescript
 * import { TerseOutput, Verbosity, toMcpToolResult } from '@generacy-ai/agency';
 *
 * // Quick static usage
 * return TerseOutput.success('Done.');
 * return TerseOutput.failure(error, { context: data });
 *
 * // Configured instance
 * const output = new TerseOutput({ verbosity: Verbosity.VERBOSE });
 * return output.success('Done.');
 *
 * // Convert to MCP format at server boundary
 * const mcpResult = toMcpToolResult(terseResult);
 * ```
 */

// Types
export {
  Verbosity,
  type TerseToolResult,
  type ExecResult,
  type TerseOutputConfig,
  DEFAULT_TERSE_CONFIG,
} from './types.js';

// Core
export { TerseOutput, toMcpToolResult } from './terse-output.js';

// Utilities
export { formatError } from './format-error.js';
export {
  SUCCESS_MESSAGES,
  type SuccessMessageKey,
  getSuccessMessage,
} from './success-messages.js';
