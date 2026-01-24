/**
 * SSE Handler for humancy-cloud real-time events
 *
 * Handles Server-Sent Events for decision updates.
 */

import {
  type SSEEvent,
  SSEConnectionError,
  sseEventSchema,
} from './types.js';

/**
 * Configuration for SSE handler
 */
export interface SSEHandlerConfig {
  /** Maximum reconnection attempts */
  maxReconnects: number;
  /** Base delay for reconnection in ms */
  reconnectBaseDelayMs: number;
  /** Connection timeout in ms */
  connectionTimeoutMs: number;
  /** Authorization headers */
  authHeaders?: Record<string, string>;
}

/**
 * Default SSE handler configuration
 */
const DEFAULT_SSE_CONFIG: SSEHandlerConfig = {
  maxReconnects: 5,
  reconnectBaseDelayMs: 1000,
  connectionTimeoutMs: 30000,
};

/**
 * Parsed SSE message
 */
interface ParsedSSEMessage {
  event?: string;
  data: string;
}

/**
 * SSE Handler for subscribing to decision events
 */
export class SSEHandler {
  private readonly config: SSEHandlerConfig;
  private abortController?: AbortController;
  private reconnectAttempts = 0;

  constructor(config: Partial<SSEHandlerConfig> = {}) {
    this.config = {
      ...DEFAULT_SSE_CONFIG,
      ...config,
    };
  }

  /**
   * Subscribe to decision events as an async generator
   *
   * Yields SSE events as they arrive. Handles reconnection automatically.
   */
  async *subscribeToDecision(url: string): AsyncGenerator<SSEEvent> {
    this.abortController = new AbortController();
    this.reconnectAttempts = 0;

    while (true) {
      try {
        yield* this.streamEvents(url);
        // Stream ended normally, stop iterating
        break;
      } catch (error) {
        if (this.abortController.signal.aborted) {
          // Cleanup was requested
          break;
        }

        if (this.reconnectAttempts >= this.config.maxReconnects) {
          throw new SSEConnectionError(
            'max_retries',
            `Failed to connect after ${this.config.maxReconnects} attempts`
          );
        }

        this.reconnectAttempts++;
        const delay =
          this.config.reconnectBaseDelayMs *
          Math.pow(2, this.reconnectAttempts - 1);
        await this.sleep(delay);
      }
    }
  }

  /**
   * Stream events from the SSE endpoint
   */
  private async *streamEvents(url: string): AsyncGenerator<SSEEvent> {
    const response = await this.connect(url);

    if (!response.body) {
      throw new SSEConnectionError('network', 'Response body is null');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const messages = this.parseSSEBuffer(buffer);
        buffer = messages.remaining;

        for (const msg of messages.events) {
          const event = this.parseEventData(msg);
          if (event) {
            // Reset reconnect counter on successful event
            this.reconnectAttempts = 0;
            yield event;

            // If this is a terminal event, stop streaming
            if (
              event.type === 'decision_resolved' ||
              event.type === 'decision_expired'
            ) {
              return;
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  /**
   * Connect to the SSE endpoint
   */
  private async connect(url: string): Promise<Response> {
    const timeoutId = setTimeout(() => {
      this.abortController?.abort();
    }, this.config.connectionTimeoutMs);

    try {
      const response = await fetch(url, {
        headers: {
          Accept: 'text/event-stream',
          'Cache-Control': 'no-cache',
          ...this.config.authHeaders,
        },
        signal: this.abortController?.signal,
      });

      if (!response.ok) {
        if (response.status >= 500) {
          throw new SSEConnectionError(
            'server_error',
            `Server error: ${response.status} ${response.statusText}`
          );
        }
        throw new Error(
          `SSE connection failed: ${response.status} ${response.statusText}`
        );
      }

      return response;
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new SSEConnectionError(
          'timeout',
          `Connection timeout after ${this.config.connectionTimeoutMs}ms`
        );
      }
      if (error instanceof TypeError) {
        throw new SSEConnectionError('network', `Network error: ${error.message}`);
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Parse SSE buffer into events
   *
   * SSE format:
   * event: event_name
   * data: json_data
   *
   * Events are separated by double newlines
   */
  private parseSSEBuffer(buffer: string): {
    events: ParsedSSEMessage[];
    remaining: string;
  } {
    const events: ParsedSSEMessage[] = [];
    const lines = buffer.split('\n');
    let currentEvent: string | undefined;
    let currentData: string[] = [];
    let remaining = '';

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i] ?? '';

      // Check if this might be an incomplete line at the end
      if (i === lines.length - 1 && line !== '') {
        // This line might be incomplete, save it for next iteration
        remaining = line;
        continue;
      }

      if (line.startsWith('event:')) {
        currentEvent = line.slice(6).trim();
      } else if (line.startsWith('data:')) {
        currentData.push(line.slice(5).trim());
      } else if (line === '') {
        // Empty line marks end of event
        if (currentData.length > 0) {
          events.push({
            event: currentEvent,
            data: currentData.join('\n'),
          });
        }
        currentEvent = undefined;
        currentData = [];
      }
    }

    // If we have accumulated data but no terminating empty line,
    // keep it in the remaining buffer
    if (currentData.length > 0 || currentEvent !== undefined) {
      // Reconstruct the partial event
      const partialLines: string[] = [];
      if (currentEvent !== undefined) {
        partialLines.push(`event:${currentEvent}`);
      }
      for (const data of currentData) {
        partialLines.push(`data:${data}`);
      }
      remaining = partialLines.join('\n') + (remaining ? '\n' + remaining : '');
    }

    return { events, remaining };
  }

  /**
   * Parse event data into typed SSE event
   */
  private parseEventData(message: ParsedSSEMessage): SSEEvent | null {
    try {
      const data = JSON.parse(message.data);

      // Use event type from SSE if present, otherwise from data
      if (message.event && !data.type) {
        data.type = message.event;
      }

      // Add timestamp if not present
      if (!data.timestamp) {
        data.timestamp = new Date().toISOString();
      }

      const parsed = sseEventSchema.safeParse(data);
      if (!parsed.success) {
        // Log parse error but don't throw - might be an unknown event type
        console.warn('SSE event parse warning:', parsed.error.message);
        return null;
      }

      return parsed.data;
    } catch {
      // Invalid JSON - skip this event
      return null;
    }
  }

  /**
   * Close the SSE connection
   */
  close(): void {
    this.abortController?.abort();
  }

  /**
   * Sleep for specified milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
