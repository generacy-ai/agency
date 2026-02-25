import { generateEventId, type ToolCallEvent } from './schemas.js';
import type { ToolCallHandler, WrapHandlerOptions } from './types.js';
import type { TelemetryBus } from './bus.js';

/**
 * Wraps a tool call handler with telemetry instrumentation.
 * Captures timing, inputs, outputs, and errors for each call.
 * Uses fire-and-forget event emission for minimal overhead.
 *
 * @param handler The original tool handler function
 * @param bus The telemetry bus to emit events to
 * @param options Configuration for the wrapper
 * @returns A wrapped handler that emits telemetry events
 */
export function wrapToolHandler<TParams, TResult>(
  handler: ToolCallHandler<TParams, TResult>,
  bus: TelemetryBus,
  options: WrapHandlerOptions
): ToolCallHandler<TParams, TResult> {
  const {
    toolName,
    serverName,
    captureInputs = true,
    captureOutputs = true,
    sessionId,
  } = options;

  return async (params: TParams): Promise<TResult> => {
    const startTime = globalThis.performance.now();
    const eventId = generateEventId();
    const timestamp = new Date().toISOString();

    let result: TResult | undefined;
    let error: Error | undefined;

    try {
      result = await handler(params);
      return result;
    } catch (err) {
      error = err instanceof Error ? err : new Error(String(err));
      throw error;
    } finally {
      const endTime = globalThis.performance.now();
      const durationMs = endTime - startTime;

      const event: ToolCallEvent = {
        id: eventId,
        timestamp,
        toolName,
        serverName,
        durationMs,
        success: !error,
      };

      // Add optional fields based on privacy settings
      if (sessionId) {
        event.sessionId = sessionId;
      }

      if (captureInputs && params !== undefined) {
        event.inputs = params as Record<string, unknown>;
      }

      if (error) {
        event.error = error.message;
      } else if (captureOutputs && result !== undefined) {
        event.outputs = result;
      }

      // Fire-and-forget: emit to bus without awaiting
      bus.emit(event);
    }
  };
}

/**
 * Create a wrapped handler factory for a specific server.
 * Useful when wrapping multiple handlers from the same server.
 *
 * @param bus The telemetry bus to emit events to
 * @param serverName The name of the MCP server
 * @param defaultOptions Default options applied to all wrapped handlers
 * @returns A factory function for wrapping handlers
 */
export function createHandlerWrapper(
  bus: TelemetryBus,
  serverName: string,
  defaultOptions: Partial<Omit<WrapHandlerOptions, 'toolName' | 'serverName'>> = {}
): <TParams, TResult>(
  handler: ToolCallHandler<TParams, TResult>,
  toolName: string,
  options?: Partial<Omit<WrapHandlerOptions, 'toolName' | 'serverName'>>
) => ToolCallHandler<TParams, TResult> {
  return <TParams, TResult>(
    handler: ToolCallHandler<TParams, TResult>,
    toolName: string,
    options: Partial<Omit<WrapHandlerOptions, 'toolName' | 'serverName'>> = {}
  ): ToolCallHandler<TParams, TResult> => {
    return wrapToolHandler(handler, bus, {
      toolName,
      serverName,
      ...defaultOptions,
      ...options,
    });
  };
}
