/**
 * Firebase Plugin Zod Validation Schemas
 */

import { z } from 'zod';
import type {
  EmulatorType,
  DeployTarget,
  CleanupMode,
  FirebasePluginConfig,
} from './types.js';

/**
 * Schema for Firebase emulator types
 */
export const EmulatorTypeSchema = z.enum([
  'auth',
  'firestore',
  'database',
  'functions',
  'hosting',
  'pubsub',
  'storage',
]) satisfies z.ZodType<EmulatorType>;

/**
 * Schema for Firebase deploy targets
 */
export const DeployTargetSchema = z.enum([
  'functions',
  'rules',
  'hosting',
  'storage',
  'firestore',
  'database',
]) satisfies z.ZodType<DeployTarget>;

/**
 * Schema for cleanup modes
 */
export const CleanupModeSchema = z.enum([
  'session',
  'persist',
  'explicit',
]) satisfies z.ZodType<CleanupMode>;

/**
 * Schema for Firebase plugin configuration
 */
export const FirebasePluginConfigSchema = z.object({
  /** Firebase project ID */
  project: z.string().optional(),

  /** Resource cleanup mode (default: 'session') */
  cleanup: CleanupModeSchema.default('session'),

  /** Emulator configuration */
  emulators: z
    .object({
      only: z.array(EmulatorTypeSchema).optional(),
    })
    .optional(),

  /** Deploy configuration */
  deploy: z
    .object({
      targets: z.array(DeployTargetSchema).default(['functions']),
    })
    .optional(),
}) satisfies z.ZodType<FirebasePluginConfig, z.ZodTypeDef, unknown>;

/**
 * Schema for emulators:start command parameters
 */
export const EmulatorsStartParamsSchema = z.object({
  /** Specific emulators to start */
  only: z.array(EmulatorTypeSchema).optional(),

  /** Path to import emulator data from */
  import: z.string().optional(),

  /** Path to export emulator data to on shutdown */
  export: z.string().optional(),

  /** Firebase project ID */
  project: z.string().optional(),
});

/**
 * Schema for emulators:stop command parameters
 */
export const EmulatorsStopParamsSchema = z.object({
  /** Force stop without graceful shutdown */
  force: z.boolean().optional(),
});

/**
 * Schema for deploy command parameters
 */
export const DeployParamsSchema = z.object({
  /** Specific targets to deploy */
  only: z.array(DeployTargetSchema).optional(),

  /** Firebase project ID */
  project: z.string().optional(),

  /** Deploy message */
  message: z.string().optional(),
});

/**
 * Schema for functions log retrieval parameters
 */
export const FunctionsLogParamsSchema = z.object({
  /** Filter by specific function names */
  only: z.array(z.string()).optional(),

  /** Number of log lines to retrieve (max 1000) */
  lines: z.number().int().positive().max(1000).optional(),
});
