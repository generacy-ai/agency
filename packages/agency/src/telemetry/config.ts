import { z } from 'zod';

/**
 * Configuration schema for the telemetry system.
 */
export const TelemetryConfigSchema = z.object({
  /** Enable or disable telemetry globally */
  enabled: z.boolean().default(true),

  /** Capture tool input arguments */
  captureInputs: z.boolean().default(true),

  /** Capture tool output results */
  captureOutputs: z.boolean().default(true),

  /** List of provider names to auto-initialize */
  providers: z.array(z.string()).default(['memory']),
});

export type TelemetryConfig = z.infer<typeof TelemetryConfigSchema>;

/**
 * Default configuration for telemetry.
 * Telemetry is enabled by default with full data capture.
 */
export const DEFAULT_TELEMETRY_CONFIG: TelemetryConfig = {
  enabled: true,
  captureInputs: true,
  captureOutputs: true,
  providers: ['memory'],
};

/**
 * Memory provider configuration schema.
 */
export const MemoryProviderOptionsSchema = z.object({
  /** Maximum number of events to store (0 = unlimited) */
  maxEvents: z.number().int().nonnegative().default(10000),
});

export type MemoryProviderOptionsConfig = z.infer<typeof MemoryProviderOptionsSchema>;
