/**
 * Error formatting utilities for terse output pattern.
 *
 * Formats errors with full context for agent debugging.
 */

/**
 * Serialize context to JSON string with circular reference handling.
 */
function serializeContext(context: unknown): string {
  if (context === undefined) {
    return '';
  }

  try {
    return JSON.stringify(context, null, 2);
  } catch {
    // Handle circular references or other serialization errors
    return String(context);
  }
}

/**
 * Format an error with full context for debugging.
 *
 * Includes:
 * - Error message
 * - Stack trace (if Error object)
 * - Context serialized as JSON
 *
 * @param error - The error to format (Error object or string)
 * @param context - Optional additional context
 * @returns Formatted error string
 */
export function formatError(error: Error | string, context?: unknown): string {
  const parts: string[] = [];

  // Error message
  if (error instanceof Error) {
    parts.push(`Error: ${error.message}`);

    // Stack trace
    if (error.stack) {
      parts.push('');
      parts.push('Stack trace:');
      parts.push(error.stack);
    }
  } else {
    parts.push(`Error: ${error}`);
  }

  // Context
  if (context !== undefined) {
    const serialized = serializeContext(context);
    if (serialized) {
      parts.push('');
      parts.push('Context:');
      parts.push(serialized);
    }
  }

  return parts.join('\n');
}
