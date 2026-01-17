/**
 * Telemetry Storage Provider Interface Contract
 *
 * This file defines the interface that all telemetry storage providers must implement.
 * It serves as the contract between the telemetry system and storage backends.
 */

import type { ToolCallEvent, TelemetryFilter, StatsFilter, ToolStats } from '../data-model';

/**
 * Storage provider interface for telemetry events.
 *
 * Providers receive tool call events from the telemetry system and store them
 * for later retrieval or analysis. The `record()` method must be fast and
 * should not throw errors (log and continue on failure).
 *
 * @example
 * ```typescript
 * class FileStorageProvider implements TelemetryStorageProvider {
 *   readonly name = 'file';
 *
 *   async initialize() {
 *     // Open file handle
 *   }
 *
 *   async shutdown() {
 *     // Close file handle
 *   }
 *
 *   async record(event: ToolCallEvent) {
 *     // Append to file
 *   }
 * }
 * ```
 */
export interface TelemetryStorageProvider {
  /**
   * Unique provider name used for registration and identification.
   * Must be unique across all registered providers.
   */
  readonly name: string;

  /**
   * Initialize the provider.
   *
   * Called once when the provider is registered with the telemetry manager.
   * Use this to establish connections, open files, etc.
   *
   * @throws May throw if initialization fails (provider won't be registered)
   */
  initialize(): Promise<void>;

  /**
   * Shutdown the provider gracefully.
   *
   * Called when the provider is unregistered or the system shuts down.
   * Use this to close connections, flush buffers, etc.
   *
   * @throws May throw, but shutdown continues regardless
   */
  shutdown(): Promise<void>;

  /**
   * Record a telemetry event.
   *
   * Called for each tool call event. This method is invoked asynchronously
   * (fire-and-forget) to avoid blocking tool execution. Implementations
   * should handle errors gracefully and not throw.
   *
   * Performance requirement: Should complete in <5ms for fire-and-forget
   * to be effective.
   *
   * @param event - The telemetry event to record
   * @throws Should not throw; log errors internally instead
   */
  record(event: ToolCallEvent): Promise<void>;

  /**
   * Query stored events (optional capability).
   *
   * Not all providers need to support querying. This is useful for
   * providers that support indexed storage or search capabilities.
   *
   * @param filter - Filter criteria for events
   * @returns Matching events, ordered by timestamp descending
   */
  query?(filter: TelemetryFilter): Promise<ToolCallEvent[]>;

  /**
   * Get aggregated statistics (optional capability).
   *
   * Calculate statistics over stored events. Useful for dashboards
   * and monitoring.
   *
   * @param filter - Filter criteria for stats calculation
   * @returns Aggregated statistics
   */
  getStats?(filter: StatsFilter): Promise<ToolStats>;
}
