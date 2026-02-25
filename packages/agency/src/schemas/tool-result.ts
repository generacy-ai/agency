import { z } from 'zod';

/**
 * Schema for agent-ergonomic tool responses following the terse output pattern.
 *
 * Design principle: "Terse success, detailed failure"
 * - Success: minimal confirmation (save agent context tokens)
 * - Failure: maximum detail for debugging
 *
 * Uses .passthrough() for forward compatibility - allows plugins to extend
 * with additional fields without breaking validation.
 *
 * Note: This is distinct from agency-humancy's ToolResultSchema which includes
 * additional tracking fields (invocationId, error, durationMs). This schema
 * is specifically for the terse output pattern used in MCP tool responses.
 */
export const TerseToolResultSchema = z
  .object({
    /** Whether the operation succeeded */
    success: z.boolean(),
    /** Human-readable message for agent context */
    output: z.string(),
    /** Structured data for programmatic use (optional) */
    data: z.unknown().optional(),
  })
  .passthrough();

/**
 * TypeScript type inferred from TerseToolResultSchema.
 *
 * @example
 * ```typescript
 * const result: TerseToolResult = {
 *   success: true,
 *   output: 'Committed: abc1234',
 * };
 *
 * const resultWithData: TerseToolResult = {
 *   success: true,
 *   output: 'Found 3 issues.',
 *   data: { issues: [...] },
 * };
 * ```
 */
export type TerseToolResult = z.infer<typeof TerseToolResultSchema>;

/**
 * Configuration interface for controlling output verbosity.
 *
 * Used by TerseOutput implementations to customize behavior.
 */
export interface TerseToolOptions {
  /**
   * Include extra detail in success output.
   * @default false
   */
  verbose?: boolean;

  /**
   * Include stack traces in error output.
   * Set to false in production for cleaner error messages.
   * @default true
   */
  includeStackTrace?: boolean;
}

/** Parse unknown data as a TerseToolResult, throwing on invalid input. */
export const parseTerseToolResult = (data: unknown): TerseToolResult =>
  TerseToolResultSchema.parse(data);

/** Safely parse unknown data as a TerseToolResult without throwing. */
export const safeParseTerseToolResult = (data: unknown) =>
  TerseToolResultSchema.safeParse(data);
