/**
 * Zod schemas for tool parameters
 */

import { z } from 'zod';
import type { JsonSchema } from '@generacy-ai/agency';

/** Base parameters shared by all tools */
export const BaseParamsSchema = z.object({
  /** Working directory (defaults to process.cwd()) */
  cwd: z.string().optional(),

  /** Target specific workspace in monorepo */
  workspace: z.string().optional(),
});

export type BaseParams = z.infer<typeof BaseParamsSchema>;

/** build.install_dependencies parameters */
export const InstallDependenciesSchema = BaseParamsSchema.extend({
  /** Install only production dependencies */
  production: z.boolean().optional(),

  /** Use lockfile without updating */
  frozen: z.boolean().optional(),
});

export type InstallDependenciesParams = z.infer<typeof InstallDependenciesSchema>;

/** build.compile parameters */
export const CompileSchema = BaseParamsSchema.extend({
  /** Build script name (default: configured value) */
  script: z.string().optional(),
});

export type CompileParams = z.infer<typeof CompileSchema>;

/** build.lint parameters */
export const LintSchema = BaseParamsSchema.extend({
  /** Auto-fix linting issues */
  fix: z.boolean().optional(),

  /** Lint script name (default: configured value) */
  script: z.string().optional(),
});

export type LintParams = z.infer<typeof LintSchema>;

/** build.format parameters */
export const FormatSchema = BaseParamsSchema.extend({
  /** Check formatting only, don't write */
  check: z.boolean().optional(),

  /** Format script name (default: configured value) */
  script: z.string().optional(),
});

export type FormatParams = z.infer<typeof FormatSchema>;

/** Common test parameters */
const BaseTestSchema = BaseParamsSchema.extend({
  /** Test file pattern to run */
  pattern: z.string().optional(),

  /** Run in watch mode */
  watch: z.boolean().optional(),

  /** Test script name */
  script: z.string().optional(),
});

/** test.run_unit parameters */
export const RunUnitSchema = BaseTestSchema;
export type RunUnitParams = z.infer<typeof RunUnitSchema>;

/** test.run_integration parameters */
export const RunIntegrationSchema = BaseTestSchema;
export type RunIntegrationParams = z.infer<typeof RunIntegrationSchema>;

/** test.run_e2e parameters */
export const RunE2ESchema = BaseTestSchema;
export type RunE2EParams = z.infer<typeof RunE2ESchema>;

/** test.run_coverage parameters */
export const RunCoverageSchema = BaseParamsSchema.extend({
  /** Test file pattern to run */
  pattern: z.string().optional(),

  /** Minimum coverage percentage */
  threshold: z.number().min(0).max(100).optional(),

  /** Coverage script name */
  script: z.string().optional(),
});

export type RunCoverageParams = z.infer<typeof RunCoverageSchema>;

/** Convert Zod schema to JSON Schema for MCP */
export function zodToJsonSchema(schema: z.ZodObject<z.ZodRawShape>): JsonSchema {
  const shape = schema.shape;
  const properties: Record<string, JsonSchema> = {};
  const required: string[] = [];

  for (const [key, value] of Object.entries(shape)) {
    const zodType = value as z.ZodTypeAny;
    const isOptional = zodType.isOptional();

    // Unwrap optional
    const innerType = isOptional ? (zodType as z.ZodOptional<z.ZodTypeAny>).unwrap() : zodType;

    properties[key] = getJsonSchemaType(innerType);

    if (!isOptional) {
      required.push(key);
    }
  }

  return {
    type: 'object',
    properties,
    ...(required.length > 0 ? { required } : {}),
  };
}

function getJsonSchemaType(zodType: z.ZodTypeAny): JsonSchema {
  if (zodType instanceof z.ZodString) {
    return { type: 'string', description: zodType.description };
  }
  if (zodType instanceof z.ZodNumber) {
    const result: JsonSchema = { type: 'number', description: zodType.description };
    return result;
  }
  if (zodType instanceof z.ZodBoolean) {
    return { type: 'boolean', description: zodType.description };
  }
  return { type: 'string' }; // fallback
}
