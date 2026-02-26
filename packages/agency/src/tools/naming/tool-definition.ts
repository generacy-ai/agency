import { z, type ZodTypeAny } from 'zod';
import { ToolPrefixSchema } from './prefix.js';
import { ActionNameSchema } from './action.js';
import { ToolNameSchema } from './tool-name.js';

/**
 * Schema for validating tool definitions.
 *
 * A tool definition describes a complete tool with:
 * - Naming: Full name, prefix, and action
 * - Documentation: Description and parameter/return schemas
 * - Metadata: Aliases, deprecation info, and mode restrictions
 *
 * @example
 * ```typescript
 * const commitTool: ToolDefinition = {
 *   name: 'source_control.commit',
 *   prefix: 'source_control',
 *   action: 'commit',
 *   description: 'Commit staged changes to the repository',
 *   parameters: z.object({ message: z.string() }),
 *   returns: z.object({ hash: z.string() }),
 *   aliases: ['git.commit'],
 * };
 * ```
 */
export const ToolDefinitionSchema = z.object({
  /** Full tool name in `{prefix}.{action}` format */
  name: ToolNameSchema,

  /** The tool's logical category prefix */
  prefix: ToolPrefixSchema,

  /** The action name (snake_case) */
  action: ActionNameSchema,

  /** Human-readable description of what the tool does */
  description: z.string().min(1),

  /** Zod schema for validating input parameters */
  parameters: z.custom<ZodTypeAny>(
    (val) => val !== null && typeof val === 'object' && '_def' in val,
    { message: 'Parameters must be a Zod schema' }
  ),

  /** Zod schema for validating return values */
  returns: z.custom<ZodTypeAny>(
    (val) => val !== null && typeof val === 'object' && '_def' in val,
    { message: 'Returns must be a Zod schema' }
  ),

  /** Optional list of full name aliases (e.g., 'git.commit' for 'source_control.commit') */
  aliases: z.array(ToolNameSchema).optional(),

  /** Whether this tool is deprecated */
  deprecated: z.boolean().optional(),

  /** Message explaining deprecation and suggesting alternatives */
  deprecatedMessage: z.string().optional(),

  /** Optional list of modes this tool is available in */
  modes: z.array(z.string()).optional(),
});

/**
 * Type representing a complete tool definition.
 */
export type ToolDefinition = z.infer<typeof ToolDefinitionSchema>;
