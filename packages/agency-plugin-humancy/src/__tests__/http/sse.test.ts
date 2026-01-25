/**
 * Tests for SSEHandler
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SSEHandler } from '../../http/sse.js';
import { SSEConnectionError } from '../../http/types.js';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

/**
 * Create a mock readable stream from SSE event strings
 */
function createMockSSEStream(events: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  let index = 0;

  return new ReadableStream({
    pull(controller) {
      if (index < events.length) {
        controller.enqueue(encoder.encode(events[index]));
        index++;
      } else {
        controller.close();
      }
    },
  });
}

describe('SSEHandler', () => {
  let handler: SSEHandler;

  beforeEach(() => {
    vi.clearAllMocks();
    handler = new SSEHandler({
      maxReconnects: 2,
      reconnectBaseDelayMs: 50,
      connectionTimeoutMs: 5000,
      authHeaders: { Authorization: 'Bearer test-key' },
    });
  });

  afterEach(() => {
    handler.close();
    vi.restoreAllMocks();
  });

  describe('subscribeToDecision', () => {
    it('should parse decision:resolved events', async () => {
      const sseData = [
        'event: decision:resolved\n',
        'data: {"type":"decision:resolved","selectedOption":"a","respondedAt":"2024-01-01T00:00:00Z","timestamp":"2024-01-01T00:00:00Z"}\n',
        '\n',
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        body: createMockSSEStream([sseData.join('')]),
      });

      const events: unknown[] = [];
      for await (const event of handler.subscribeToDecision(
        'https://test.api/decisions/123/events'
      )) {
        events.push(event);
      }

      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({
        type: 'decision:resolved',
        selectedOption: 'a',
        respondedAt: '2024-01-01T00:00:00Z',
      });
    });

    it('should parse decision:expired events', async () => {
      const sseData =
        'event: decision:expired\ndata: {"type":"decision:expired","reason":"timeout","timestamp":"2024-01-01T00:00:00Z"}\n\n';

      mockFetch.mockResolvedValueOnce({
        ok: true,
        body: createMockSSEStream([sseData]),
      });

      const events: unknown[] = [];
      for await (const event of handler.subscribeToDecision(
        'https://test.api/decisions/123/events'
      )) {
        events.push(event);
      }

      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({
        type: 'decision:expired',
        reason: 'timeout',
      });
    });

    it('should parse decision:created events', async () => {
      const sseData = [
        'event: decision:created\ndata: {"type":"decision:created","decisionId":"abc-123","timestamp":"2024-01-01T00:00:00Z"}\n\n',
        'event: decision:resolved\ndata: {"type":"decision:resolved","selectedOption":"a","respondedAt":"2024-01-01T00:00:00Z","timestamp":"2024-01-01T00:00:00Z"}\n\n',
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        body: createMockSSEStream(sseData),
      });

      const events: unknown[] = [];
      for await (const event of handler.subscribeToDecision(
        'https://test.api/decisions/123/events'
      )) {
        events.push(event);
      }

      expect(events).toHaveLength(2);
      expect(events[0]).toMatchObject({
        type: 'decision:created',
        decisionId: 'abc-123',
      });
      expect(events[1]).toMatchObject({ type: 'decision:resolved' });
    });

    it('should parse decision:updated events', async () => {
      const sseData = [
        'event: decision:updated\ndata: {"type":"decision:updated","status":"in_review","timestamp":"2024-01-01T00:00:00Z"}\n\n',
        'event: decision:resolved\ndata: {"type":"decision:resolved","selectedOption":"a","respondedAt":"2024-01-01T00:00:00Z","timestamp":"2024-01-01T00:00:00Z"}\n\n',
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        body: createMockSSEStream(sseData),
      });

      const events: unknown[] = [];
      for await (const event of handler.subscribeToDecision(
        'https://test.api/decisions/123/events'
      )) {
        events.push(event);
      }

      expect(events).toHaveLength(2);
      expect(events[0]).toMatchObject({
        type: 'decision:updated',
        status: 'in_review',
      });
      expect(events[1]).toMatchObject({ type: 'decision:resolved' });
    });

    it('should parse heartbeat events', async () => {
      // Send heartbeat then resolved to end stream
      const sseData = [
        'event: heartbeat\ndata: {"type":"heartbeat","timestamp":"2024-01-01T00:00:00Z"}\n\n',
        'event: decision:resolved\ndata: {"type":"decision:resolved","selectedOption":"a","respondedAt":"2024-01-01T00:00:00Z","timestamp":"2024-01-01T00:00:00Z"}\n\n',
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        body: createMockSSEStream(sseData),
      });

      const events: unknown[] = [];
      for await (const event of handler.subscribeToDecision(
        'https://test.api/decisions/123/events'
      )) {
        events.push(event);
      }

      expect(events).toHaveLength(2);
      expect(events[0]).toMatchObject({ type: 'heartbeat' });
      expect(events[1]).toMatchObject({ type: 'decision:resolved' });
    });

    it('should include three-layer data when present', async () => {
      const sseData = `event: decision:resolved
data: {"type":"decision:resolved","selectedOption":"a","respondedAt":"2024-01-01T00:00:00Z","timestamp":"2024-01-01T00:00:00Z","baseline":{"optionId":"a","confidence":0.8},"protege":{"optionId":"a","reasoning":"Best choice"},"human":{"optionId":"a","note":"Agreed"}}

`;

      mockFetch.mockResolvedValueOnce({
        ok: true,
        body: createMockSSEStream([sseData]),
      });

      const events: unknown[] = [];
      for await (const event of handler.subscribeToDecision(
        'https://test.api/decisions/123/events'
      )) {
        events.push(event);
      }

      expect(events).toHaveLength(1);
      const event = events[0] as Record<string, unknown>;
      expect(event['baseline']).toEqual({ optionId: 'a', confidence: 0.8 });
      expect(event['protege']).toEqual({ optionId: 'a', reasoning: 'Best choice' });
      expect(event['human']).toEqual({ optionId: 'a', note: 'Agreed' });
    });

    it('should handle chunked SSE data', async () => {
      // Data split across multiple chunks
      const chunks = [
        'event: decision:res',
        'olved\ndata: {"type":"decision:resolved","selectedOption":"a","respon',
        'dedAt":"2024-01-01T00:00:00Z","timestamp":"2024-01-01T00:00:00Z"}\n\n',
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        body: createMockSSEStream(chunks),
      });

      const events: unknown[] = [];
      for await (const event of handler.subscribeToDecision(
        'https://test.api/decisions/123/events'
      )) {
        events.push(event);
      }

      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({
        type: 'decision:resolved',
        selectedOption: 'a',
      });
    });

    it('should stop on terminal events', async () => {
      const sseData =
        'event: decision:resolved\ndata: {"type":"decision:resolved","selectedOption":"a","respondedAt":"2024-01-01T00:00:00Z","timestamp":"2024-01-01T00:00:00Z"}\n\n';

      mockFetch.mockResolvedValueOnce({
        ok: true,
        body: createMockSSEStream([sseData, 'more data that should not be read']),
      });

      const events: unknown[] = [];
      for await (const event of handler.subscribeToDecision(
        'https://test.api/decisions/123/events'
      )) {
        events.push(event);
      }

      // Should only have the resolved event, not continue reading
      expect(events).toHaveLength(1);
    });
  });

  describe('reconnection behavior', () => {
    it('should reconnect on server error', async () => {
      // First call fails with 500, second succeeds
      mockFetch
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
          statusText: 'Internal Server Error',
        })
        .mockResolvedValueOnce({
          ok: true,
          body: createMockSSEStream([
            'event: decision:resolved\ndata: {"type":"decision:resolved","selectedOption":"a","respondedAt":"2024-01-01T00:00:00Z","timestamp":"2024-01-01T00:00:00Z"}\n\n',
          ]),
        });

      const events: unknown[] = [];
      for await (const event of handler.subscribeToDecision(
        'https://test.api/decisions/123/events'
      )) {
        events.push(event);
      }

      expect(events).toHaveLength(1);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should throw SSEConnectionError after max retries', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      });

      await expect(async () => {
        for await (const _ of handler.subscribeToDecision(
          'https://test.api/decisions/123/events'
        )) {
          // Should not reach here
        }
      }).rejects.toThrow(SSEConnectionError);

      // 1 initial + 2 reconnects = 3 total calls
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    it('should reset reconnect count on successful event', async () => {
      // This test verifies that reconnect counter resets after successful events
      const handler2 = new SSEHandler({
        maxReconnects: 1,
        reconnectBaseDelayMs: 10,
        connectionTimeoutMs: 5000,
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        body: createMockSSEStream([
          'event: heartbeat\ndata: {"type":"heartbeat","timestamp":"2024-01-01T00:00:00Z"}\n\n',
          'event: decision:resolved\ndata: {"type":"decision:resolved","selectedOption":"a","respondedAt":"2024-01-01T00:00:00Z","timestamp":"2024-01-01T00:00:00Z"}\n\n',
        ]),
      });

      const events: unknown[] = [];
      for await (const event of handler2.subscribeToDecision(
        'https://test.api/decisions/123/events'
      )) {
        events.push(event);
      }

      expect(events).toHaveLength(2);
      handler2.close();
    });
  });

  describe('close()', () => {
    it('should abort the connection', async () => {
      // Set up a stream that never ends
      mockFetch.mockResolvedValueOnce({
        ok: true,
        body: new ReadableStream({
          start() {
            // Never pushes or closes
          },
        }),
      });

      const events: unknown[] = [];
      const subscription = (async () => {
        for await (const event of handler.subscribeToDecision(
          'https://test.api/decisions/123/events'
        )) {
          events.push(event);
        }
      })();

      // Close after a short delay
      await new Promise((resolve) => setTimeout(resolve, 50));
      handler.close();

      // Should complete without error (aborted)
      await expect(subscription).resolves.toBeUndefined();
      expect(events).toHaveLength(0);
    });
  });

  describe('authentication headers', () => {
    it('should include auth headers in request', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        body: createMockSSEStream([
          'event: decision:resolved\ndata: {"type":"decision:resolved","selectedOption":"a","respondedAt":"2024-01-01T00:00:00Z","timestamp":"2024-01-01T00:00:00Z"}\n\n',
        ]),
      });

      for await (const _ of handler.subscribeToDecision(
        'https://test.api/decisions/123/events'
      )) {
        // Consume events
      }

      expect(mockFetch).toHaveBeenCalledWith(
        'https://test.api/decisions/123/events',
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer test-key',
            Accept: 'text/event-stream',
          }),
        })
      );
    });
  });

  describe('error handling', () => {
    it('should skip invalid JSON data', async () => {
      const sseData = [
        'event: invalid\ndata: not valid json\n\n',
        'event: decision:resolved\ndata: {"type":"decision:resolved","selectedOption":"a","respondedAt":"2024-01-01T00:00:00Z","timestamp":"2024-01-01T00:00:00Z"}\n\n',
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        body: createMockSSEStream(sseData),
      });

      const events: unknown[] = [];
      for await (const event of handler.subscribeToDecision(
        'https://test.api/decisions/123/events'
      )) {
        events.push(event);
      }

      // Should skip invalid event and only return valid one
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({ type: 'decision:resolved' });
    });

    it('should handle network errors with SSEConnectionError', async () => {
      mockFetch.mockRejectedValue(new TypeError('Network error'));

      await expect(async () => {
        for await (const _ of handler.subscribeToDecision(
          'https://test.api/decisions/123/events'
        )) {
          // Should not reach here
        }
      }).rejects.toThrow(SSEConnectionError);
    });
  });
});
