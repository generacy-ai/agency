import type { ToolCallEvent, TelemetryFilter, StatsFilter, ToolStats } from './schemas.js';

/**
 * Callback function type for real-time event subscriptions.
 * Subscribers receive events as they are recorded.
 */
export type SubscriberCallback = (event: ToolCallEvent) => void;

/**
 * Storage provider interface for telemetry events.
 * Providers receive events and store them for later retrieval or analysis.
 */
export interface TelemetryStorageProvider {
  /** Unique provider name for registration */
  readonly name: string;

  /**
   * Initialize the provider (connect to storage, etc.)
   * Called once when provider is registered.
   */
  initialize(): Promise<void>;

  /**
   * Shutdown the provider gracefully.
   * Called when provider is unregistered or system shuts down.
   */
  shutdown(): Promise<void>;

  /**
   * Record a telemetry event.
   * Called for each tool call event. Should not throw.
   * @param event The telemetry event to record
   */
  record(event: ToolCallEvent): Promise<void>;

  /**
   * Query stored events (optional capability).
   * Not all providers need to support querying.
   * @param filter Filter criteria for events
   */
  query?(filter: TelemetryFilter): Promise<ToolCallEvent[]>;

  /**
   * Get aggregated statistics (optional capability).
   * @param filter Filter criteria for stats calculation
   */
  getStats?(filter: StatsFilter): Promise<ToolStats>;
}

/**
 * Configuration options for the memory storage provider.
 */
export interface MemoryProviderOptions {
  /** Maximum number of events to store (0 = unlimited) */
  maxEvents?: number;
}

/**
 * Internal event used by TelemetryBus for provider notification.
 */
export interface TelemetryBusEvent {
  type: 'tool-call';
  event: ToolCallEvent;
}

/**
 * Handler function type for tool call requests.
 * Based on MCP SDK RequestHandler pattern.
 */
export type ToolCallHandler<TParams = unknown, TResult = unknown> = (
  params: TParams
) => Promise<TResult>;

/**
 * Options for wrapping a tool handler with telemetry.
 */
export interface WrapHandlerOptions {
  /** Name of the tool being wrapped */
  toolName: string;
  /** Name of the MCP server */
  serverName: string;
  /** Whether to capture input arguments */
  captureInputs?: boolean;
  /** Whether to capture output results */
  captureOutputs?: boolean;
  /** Session identifier */
  sessionId?: string;
}
