import { TelemetryBus } from './bus.js';
import type { TelemetryStorageProvider } from './types.js';
import type { TelemetryConfig } from './config.js';
import { DEFAULT_TELEMETRY_CONFIG } from './config.js';
import { wrapToolHandler, createHandlerWrapper } from './interceptor.js';
import type { ToolCallHandler } from './types.js';

/**
 * Main entry point for the telemetry system.
 * Manages provider registration, configuration, and MCP server instrumentation.
 */
export class TelemetryManager {
  private bus: TelemetryBus;
  private config: TelemetryConfig;
  private providerLifecycle = new Map<string, Promise<void>>();

  constructor(config: Partial<TelemetryConfig> = {}) {
    this.bus = new TelemetryBus();
    this.config = { ...DEFAULT_TELEMETRY_CONFIG, ...config };
  }

  /**
   * Register a storage provider to receive telemetry events.
   * The provider will be initialized before receiving events.
   * @param provider The storage provider to register
   */
  async registerProvider(provider: TelemetryStorageProvider): Promise<void> {
    if (!this.config.enabled) {
      console.warn('[telemetry] Telemetry is disabled, provider not registered');
      return;
    }

    if (this.bus.hasProvider(provider.name)) {
      console.warn(`[telemetry] Provider "${provider.name}" is already registered`);
      return;
    }

    // Initialize provider
    const initPromise = provider.initialize();
    this.providerLifecycle.set(provider.name, initPromise);

    try {
      await initPromise;
      this.bus.subscribe(provider);
    } catch (error) {
      console.warn(
        `[telemetry] Failed to initialize provider "${provider.name}":`,
        error instanceof Error ? error.message : String(error)
      );
      this.providerLifecycle.delete(provider.name);
    }
  }

  /**
   * Unregister a storage provider.
   * The provider will be shut down gracefully.
   * @param name The name of the provider to unregister
   */
  async unregisterProvider(name: string): Promise<void> {
    const provider = this.bus.getProvider(name);
    if (!provider) {
      console.warn(`[telemetry] Provider "${name}" is not registered`);
      return;
    }

    this.bus.unsubscribe(name);

    try {
      await provider.shutdown();
    } catch (error) {
      console.warn(
        `[telemetry] Error shutting down provider "${name}":`,
        error instanceof Error ? error.message : String(error)
      );
    }

    this.providerLifecycle.delete(name);
  }

  /**
   * Get a registered provider by name.
   * @param name The provider name
   * @returns The provider or undefined if not found
   */
  getProvider(name: string): TelemetryStorageProvider | undefined {
    return this.bus.getProvider(name);
  }

  /**
   * Get all registered provider names.
   * @returns Array of provider names
   */
  getProviderNames(): string[] {
    return this.bus.getProviderNames();
  }

  /**
   * Check if telemetry is enabled.
   */
  isEnabled(): boolean {
    return this.config.enabled;
  }

  /**
   * Get the current configuration.
   */
  getConfig(): TelemetryConfig {
    return { ...this.config };
  }

  /**
   * Update the configuration.
   * Note: Changes only affect future operations.
   * @param config Partial configuration to merge
   */
  updateConfig(config: Partial<TelemetryConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Wrap a single tool handler with telemetry instrumentation.
   * @param handler The original handler function
   * @param toolName The name of the tool
   * @param serverName The name of the MCP server
   * @param sessionId Optional session identifier
   * @returns A wrapped handler that emits telemetry events
   */
  wrapHandler<TParams, TResult>(
    handler: ToolCallHandler<TParams, TResult>,
    toolName: string,
    serverName: string,
    sessionId?: string
  ): ToolCallHandler<TParams, TResult> {
    if (!this.config.enabled) {
      return handler;
    }

    return wrapToolHandler(handler, this.bus, {
      toolName,
      serverName,
      captureInputs: this.config.captureInputs,
      captureOutputs: this.config.captureOutputs,
      sessionId,
    });
  }

  /**
   * Create a handler wrapper factory for a specific server.
   * @param serverName The name of the MCP server
   * @param sessionId Optional default session identifier
   * @returns A factory function for wrapping handlers
   */
  createWrapper(
    serverName: string,
    sessionId?: string
  ): <TParams, TResult>(
    handler: ToolCallHandler<TParams, TResult>,
    toolName: string
  ) => ToolCallHandler<TParams, TResult> {
    if (!this.config.enabled) {
      return <TParams, TResult>(handler: ToolCallHandler<TParams, TResult>) => handler;
    }

    return createHandlerWrapper(this.bus, serverName, {
      captureInputs: this.config.captureInputs,
      captureOutputs: this.config.captureOutputs,
      sessionId,
    });
  }

  /**
   * Instrument an MCP server with telemetry.
   * This wraps the server's tool call handler to emit telemetry events.
   *
   * Note: Due to MCP SDK design, this returns a factory function that should
   * be used when setting up the tool call handler.
   *
   * @param serverName The name of the MCP server
   * @param sessionId Optional session identifier
   * @returns An instrumented handler wrapper
   */
  instrumentServer(
    serverName: string,
    sessionId?: string
  ): <TParams, TResult>(
    handler: ToolCallHandler<TParams, TResult>,
    toolName: string
  ) => ToolCallHandler<TParams, TResult> {
    return this.createWrapper(serverName, sessionId);
  }

  /**
   * Shutdown all registered providers and clean up resources.
   */
  async shutdown(): Promise<void> {
    const providerNames = this.bus.getProviderNames();
    await Promise.all(providerNames.map((name) => this.unregisterProvider(name)));
  }

  /**
   * Get the internal event bus.
   * Primarily for testing and advanced use cases.
   */
  getBus(): TelemetryBus {
    return this.bus;
  }
}
