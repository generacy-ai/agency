import { EventEmitter } from 'events';
import type { ToolCallEvent } from './schemas.js';
import type { TelemetryStorageProvider } from './types.js';

/**
 * Internal event bus for distributing telemetry events to providers.
 * Uses Node.js EventEmitter for simplicity and reliability.
 */
export class TelemetryBus {
  private emitter = new EventEmitter();
  private providers = new Map<string, TelemetryStorageProvider>();

  /**
   * Subscribe a provider to receive telemetry events.
   * @param provider The storage provider to subscribe
   */
  subscribe(provider: TelemetryStorageProvider): void {
    if (this.providers.has(provider.name)) {
      console.warn(`[telemetry] Provider "${provider.name}" is already subscribed`);
      return;
    }

    this.providers.set(provider.name, provider);

    const handler = (event: ToolCallEvent) => {
      this.recordToProvider(provider, event);
    };

    // Store handler reference on provider for later removal
    (provider as TelemetryStorageProviderWithHandler).__telemetryHandler = handler;
    this.emitter.on('tool-call', handler);
  }

  /**
   * Unsubscribe a provider from receiving telemetry events.
   * @param providerName The name of the provider to unsubscribe
   */
  unsubscribe(providerName: string): void {
    const provider = this.providers.get(providerName);
    if (!provider) {
      console.warn(`[telemetry] Provider "${providerName}" is not subscribed`);
      return;
    }

    const handler = (provider as TelemetryStorageProviderWithHandler).__telemetryHandler;
    if (handler) {
      this.emitter.off('tool-call', handler);
    }

    this.providers.delete(providerName);
  }

  /**
   * Emit a telemetry event to all subscribed providers.
   * Uses fire-and-forget pattern - does not await provider recording.
   * Provider errors are caught and logged, never propagated.
   * @param event The telemetry event to emit
   */
  emit(event: ToolCallEvent): void {
    this.emitter.emit('tool-call', event);
  }

  /**
   * Get a provider by name.
   * @param name The provider name
   * @returns The provider or undefined if not found
   */
  getProvider(name: string): TelemetryStorageProvider | undefined {
    return this.providers.get(name);
  }

  /**
   * Get all subscribed provider names.
   * @returns Array of provider names
   */
  getProviderNames(): string[] {
    return Array.from(this.providers.keys());
  }

  /**
   * Check if a provider is subscribed.
   * @param name The provider name
   * @returns True if the provider is subscribed
   */
  hasProvider(name: string): boolean {
    return this.providers.has(name);
  }

  /**
   * Record event to a provider with error isolation.
   * Fire-and-forget: does not await, catches and logs errors.
   */
  private recordToProvider(provider: TelemetryStorageProvider, event: ToolCallEvent): void {
    // Fire-and-forget: do not await the promise
    provider.record(event).catch((error) => {
      console.warn(
        `[telemetry] Provider "${provider.name}" failed to record event:`,
        error instanceof Error ? error.message : String(error)
      );
    });
  }
}

/**
 * Internal type for tracking event handlers on providers.
 */
interface TelemetryStorageProviderWithHandler extends TelemetryStorageProvider {
  __telemetryHandler?: (event: ToolCallEvent) => void;
}
