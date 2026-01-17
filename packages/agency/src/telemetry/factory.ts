import { TelemetryManager } from './manager.js';
import { MemoryStorageProvider } from './providers/memory.js';
import type { TelemetryStorageProvider } from './types.js';
import type { TelemetryConfig } from './config.js';

/**
 * Options for creating a TelemetryManager with a built-in provider.
 */
export interface CreateTelemetryManagerOptions extends Partial<TelemetryConfig> {
  /** Storage provider: 'memory' (default) or a custom TelemetryStorageProvider */
  storage?: 'memory' | TelemetryStorageProvider;

  /** Maximum events to store (only applies when storage='memory') */
  maxEvents?: number;
}

/**
 * Create a TelemetryManager with a pre-configured storage provider.
 * This is the recommended way to set up telemetry for most use cases.
 *
 * @param options Configuration options
 * @returns An initialized TelemetryManager with the specified provider registered
 *
 * @example
 * // Create with default in-memory storage
 * const manager = await createTelemetryManager();
 *
 * @example
 * // Create with custom buffer size
 * const manager = await createTelemetryManager({ maxEvents: 5000 });
 *
 * @example
 * // Create with a custom storage provider
 * const manager = await createTelemetryManager({
 *   storage: myCustomProvider,
 *   enabled: true,
 * });
 */
export async function createTelemetryManager(
  options: CreateTelemetryManagerOptions = {}
): Promise<TelemetryManager> {
  const { storage = 'memory', maxEvents, ...telemetryConfig } = options;

  const manager = new TelemetryManager(telemetryConfig);

  // Only register provider if telemetry is enabled (or default)
  if (options.enabled !== false) {
    if (storage === 'memory') {
      const provider = new MemoryStorageProvider({ maxEvents });
      await manager.registerProvider(provider);
    } else {
      await manager.registerProvider(storage);
    }
  }

  return manager;
}
