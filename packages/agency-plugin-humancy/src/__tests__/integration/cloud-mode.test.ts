/**
 * Integration tests for cloud mode (humancy-cloud API)
 *
 * Tests full decision creation → SSE response cycle with mock server.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { HumancyHttpClient } from '../../http/client.js';
import { SSEHandler } from '../../http/sse.js';
import type {
  CreateDecisionApiRequest,
  DecisionCreatedResponse,
  DecisionApiResponse,
} from '../../http/types.js';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('Cloud Mode Integration', () => {
  let client: HumancyHttpClient;

  beforeEach(() => {
    vi.clearAllMocks();
    client = new HumancyHttpClient({
      baseUrl: 'https://test.api/humancy',
      apiKey: 'test-api-key',
      timeout: 5000,
      maxRetries: 2,
      retryBaseDelayMs: 100,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Full Decision Lifecycle', () => {
    it('should create decision and poll for resolution', async () => {
      const decisionId = 'test-decision-123';
      const request: CreateDecisionApiRequest = {
        question: 'Which option?',
        options: [
          { id: 'a', label: 'Option A' },
          { id: 'b', label: 'Option B' },
        ],
        urgency: 'blocking_soon',
      };

      // Mock createDecision response
      const createdResponse: DecisionCreatedResponse = {
        id: decisionId,
        status: 'pending',
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 60000).toISOString(),
      };

      // Mock getDecision responses (pending, then resolved)
      const pendingResponse: DecisionApiResponse = {
        id: decisionId,
        status: 'pending',
        question: request.question,
        options: request.options,
      };

      const resolvedResponse: DecisionApiResponse = {
        id: decisionId,
        status: 'resolved',
        question: request.question,
        options: request.options,
        selectedOption: 'a',
        respondedAt: new Date().toISOString(),
        human: { optionId: 'a', note: 'Good choice' },
      };

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => createdResponse,
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => pendingResponse,
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => resolvedResponse,
        });

      // Create decision
      const created = await client.createDecision(request);
      expect(created.id).toBe(decisionId);
      expect(created.status).toBe('pending');

      // Poll for resolution
      let decision = await client.getDecision(decisionId);
      expect(decision.status).toBe('pending');

      decision = await client.getDecision(decisionId);
      expect(decision.status).toBe('resolved');
      expect(decision.selectedOption).toBe('a');
    });

    it('should handle decision expiration', async () => {
      const decisionId = 'test-decision-456';

      const expiredResponse: DecisionApiResponse = {
        id: decisionId,
        status: 'expired',
        question: 'Too late?',
        options: [{ id: 'a', label: 'Yes' }],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => expiredResponse,
      });

      const decision = await client.getDecision(decisionId);
      expect(decision.status).toBe('expired');
      expect(decision.selectedOption).toBeUndefined();
    });
  });

  describe('Error Scenarios', () => {
    it('should handle 401 unauthorized', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        json: async () => ({ error: 'unauthorized', message: 'Invalid API key' }),
      });

      await expect(
        client.createDecision({
          question: 'Test?',
          options: [
            { id: 'a', label: 'A' },
            { id: 'b', label: 'B' },
          ],
          urgency: 'blocking_soon',
        })
      ).rejects.toThrow('HTTP 401: Unauthorized');
    });

    it('should handle 404 not found', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        json: async () => ({ error: 'not_found', message: 'Decision not found' }),
      });

      await expect(client.getDecision('nonexistent-id')).rejects.toThrow(
        'HTTP 404: Not Found'
      );
    });

    it('should handle 429 rate limited with retry', async () => {
      // First call returns 429, second succeeds
      mockFetch
        .mockResolvedValueOnce({
          ok: false,
          status: 429,
          statusText: 'Too Many Requests',
          headers: new Headers({ 'Retry-After': '1' }),
          json: async () => ({
            error: 'rate_limited',
            message: 'Too many requests',
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            id: 'test-id',
            status: 'pending',
            createdAt: new Date().toISOString(),
            expiresAt: new Date(Date.now() + 60000).toISOString(),
          }),
        });

      // Client should retry after 429
      const result = await client.createDecision({
        question: 'Test?',
        options: [
          { id: 'a', label: 'A' },
          { id: 'b', label: 'B' },
        ],
        urgency: 'blocking_soon',
      });

      expect(result.id).toBe('test-id');
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should retry on 5xx server errors with exponential backoff', async () => {
      // First two calls return 500, third succeeds
      mockFetch
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
          statusText: 'Internal Server Error',
          json: async () => ({ error: 'server_error', message: 'Server error' }),
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 503,
          statusText: 'Service Unavailable',
          json: async () => ({
            error: 'service_unavailable',
            message: 'Try again',
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            id: 'test-id',
            status: 'pending',
            createdAt: new Date().toISOString(),
            expiresAt: new Date(Date.now() + 60000).toISOString(),
          }),
        });

      const result = await client.createDecision({
        question: 'Test?',
        options: [
          { id: 'a', label: 'A' },
          { id: 'b', label: 'B' },
        ],
        urgency: 'blocking_soon',
      });

      expect(result.id).toBe('test-id');
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    it('should handle network errors', async () => {
      mockFetch.mockRejectedValueOnce(new TypeError('Failed to fetch'));

      await expect(
        client.createDecision({
          question: 'Test?',
          options: [
            { id: 'a', label: 'A' },
            { id: 'b', label: 'B' },
          ],
          urgency: 'blocking_soon',
        })
      ).rejects.toThrow('Failed to fetch');
    });

    it('should handle timeout', async () => {
      // Create client with very short timeout
      const shortTimeoutClient = new HumancyHttpClient({
        baseUrl: 'https://test.api/humancy',
        timeout: 10,
        maxRetries: 0,
      });

      mockFetch.mockImplementationOnce(
        () =>
          new Promise((_, reject) => {
            setTimeout(() => reject(new Error('The operation was aborted')), 50);
          })
      );

      await expect(
        shortTimeoutClient.createDecision({
          question: 'Test?',
          options: [
            { id: 'a', label: 'A' },
            { id: 'b', label: 'B' },
          ],
          urgency: 'blocking_soon',
        })
      ).rejects.toThrow();
    });
  });

  describe('SSE Event Handling', () => {
    it('should receive decision:resolved event', async () => {
      const sseData =
        'event: decision:resolved\n' +
        'data: {"type":"decision:resolved","selectedOption":"a","respondedAt":"2024-01-01T00:00:00Z","timestamp":"2024-01-01T00:00:00Z"}\n\n';

      mockFetch.mockResolvedValueOnce({
        ok: true,
        body: createReadableStream([sseData]),
      });

      const sseHandler = new SSEHandler({
        maxReconnects: 0,
        reconnectBaseDelayMs: 100,
        connectionTimeoutMs: 5000,
      });

      const events: unknown[] = [];
      for await (const event of sseHandler.subscribeToDecision(
        'https://test.api/humancy/decisions/123/events'
      )) {
        events.push(event);
      }

      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({
        type: 'decision:resolved',
        selectedOption: 'a',
      });
    });

    it('should receive decision:expired event', async () => {
      const sseData =
        'event: decision:expired\n' +
        'data: {"type":"decision:expired","reason":"timeout","timestamp":"2024-01-01T00:00:00Z"}\n\n';

      mockFetch.mockResolvedValueOnce({
        ok: true,
        body: createReadableStream([sseData]),
      });

      const sseHandler = new SSEHandler({
        maxReconnects: 0,
        reconnectBaseDelayMs: 100,
        connectionTimeoutMs: 5000,
      });

      const events: unknown[] = [];
      for await (const event of sseHandler.subscribeToDecision(
        'https://test.api/humancy/decisions/123/events'
      )) {
        events.push(event);
      }

      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({
        type: 'decision:expired',
        reason: 'timeout',
      });
    });

    it('should handle heartbeat events', async () => {
      const sseData =
        'event: heartbeat\n' +
        'data: {"type":"heartbeat","timestamp":"2024-01-01T00:00:00Z"}\n\n' +
        'event: decision:resolved\n' +
        'data: {"type":"decision:resolved","selectedOption":"b","respondedAt":"2024-01-01T00:00:01Z","timestamp":"2024-01-01T00:00:01Z"}\n\n';

      mockFetch.mockResolvedValueOnce({
        ok: true,
        body: createReadableStream([sseData]),
      });

      const sseHandler = new SSEHandler({
        maxReconnects: 0,
        reconnectBaseDelayMs: 100,
        connectionTimeoutMs: 5000,
      });

      const events: unknown[] = [];
      for await (const event of sseHandler.subscribeToDecision(
        'https://test.api/humancy/decisions/123/events'
      )) {
        events.push(event);
        if ((event as { type: string }).type === 'decision:resolved') break;
      }

      // Should receive both heartbeat and resolved
      expect(events).toHaveLength(2);
      expect((events[0] as { type: string }).type).toBe('heartbeat');
      expect((events[1] as { type: string }).type).toBe('decision:resolved');
    });
  });

  describe('Mode Fallback', () => {
    it('should use polling when SSE fails', async () => {
      // SSE connection fails
      mockFetch.mockRejectedValueOnce(new TypeError('SSE connection failed'));

      // Polling succeeds
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 'test-id',
          status: 'resolved',
          question: 'Test?',
          options: [{ id: 'a', label: 'A' }],
          selectedOption: 'a',
          respondedAt: new Date().toISOString(),
        }),
      });

      // Try SSE first, then fall back to polling
      const sseHandler = new SSEHandler({
        maxReconnects: 0,
        reconnectBaseDelayMs: 100,
        connectionTimeoutMs: 1000,
      });

      let sseError: Error | null = null;
      try {
        for await (const _ of sseHandler.subscribeToDecision(
          'https://test.api/humancy/decisions/test-id/events'
        )) {
          // Should not reach here
        }
      } catch (e) {
        sseError = e as Error;
      }

      expect(sseError).toBeTruthy();

      // Fall back to polling
      const decision = await client.getDecision('test-id');
      expect(decision.status).toBe('resolved');
    });
  });
});

/**
 * Helper to create a readable stream from chunks
 */
function createReadableStream(chunks: string[]): ReadableStream<Uint8Array> {
  let index = 0;
  const encoder = new TextEncoder();

  return new ReadableStream({
    pull(controller) {
      if (index < chunks.length) {
        controller.enqueue(encoder.encode(chunks[index]));
        index++;
      } else {
        controller.close();
      }
    },
  });
}
