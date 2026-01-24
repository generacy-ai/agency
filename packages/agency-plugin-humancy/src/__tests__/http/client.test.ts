/**
 * Tests for HumancyHttpClient
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { HumancyHttpClient } from '../../http/client.js';
import { HttpError } from '../../http/types.js';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('HumancyHttpClient', () => {
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

  describe('createDecision', () => {
    it('should create a decision successfully', async () => {
      const mockResponse = {
        id: 'decision-123',
        status: 'pending',
        createdAt: '2024-01-01T00:00:00Z',
        expiresAt: '2024-01-01T01:00:00Z',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const result = await client.createDecision({
        question: 'Test question?',
        options: [
          { id: 'a', label: 'Option A' },
          { id: 'b', label: 'Option B' },
        ],
        urgency: 'blocking_soon',
      });

      expect(result).toEqual(mockResponse);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://test.api/humancy/decisions',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            Authorization: 'Bearer test-api-key',
          }),
        })
      );
    });

    it('should throw HttpError on 400 response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        json: () => Promise.resolve({ error: 'Invalid request' }),
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
      ).rejects.toThrow(HttpError);
    });

    it('should throw HttpError on 401 response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        json: () => Promise.resolve({ error: 'Invalid API key' }),
      });

      try {
        await client.createDecision({
          question: 'Test?',
          options: [
            { id: 'a', label: 'A' },
            { id: 'b', label: 'B' },
          ],
          urgency: 'blocking_soon',
        });
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(HttpError);
        expect((error as HttpError).isAuthError).toBe(true);
      }
    });

    it('should retry on 5xx errors', async () => {
      // First two calls fail with 500, third succeeds
      mockFetch
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
          statusText: 'Internal Server Error',
          json: () => Promise.resolve({}),
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 503,
          statusText: 'Service Unavailable',
          json: () => Promise.resolve({}),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              id: 'decision-123',
              status: 'pending',
              createdAt: '2024-01-01T00:00:00Z',
              expiresAt: '2024-01-01T01:00:00Z',
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

      expect(result.id).toBe('decision-123');
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    it('should fail after max retries on persistent 5xx', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        json: () => Promise.resolve({}),
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
      ).rejects.toThrow(HttpError);

      // 1 initial + 2 retries = 3 total calls
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });
  });

  describe('getDecision', () => {
    it('should get a decision successfully', async () => {
      const mockResponse = {
        id: 'decision-123',
        status: 'resolved',
        question: 'Test question?',
        options: [
          { id: 'a', label: 'Option A' },
          { id: 'b', label: 'Option B' },
        ],
        selectedOption: 'a',
        respondedAt: '2024-01-01T00:30:00Z',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const result = await client.getDecision('decision-123');

      expect(result).toEqual(mockResponse);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://test.api/humancy/decisions/decision-123',
        expect.objectContaining({
          method: 'GET',
        })
      );
    });

    it('should throw HttpError on 404', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        json: () => Promise.resolve({ error: 'Decision not found' }),
      });

      try {
        await client.getDecision('nonexistent-id');
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(HttpError);
        expect((error as HttpError).isNotFound).toBe(true);
      }
    });

    it('should include three-layer data when present', async () => {
      const mockResponse = {
        id: 'decision-123',
        status: 'resolved',
        question: 'Test question?',
        options: [
          { id: 'a', label: 'Option A' },
          { id: 'b', label: 'Option B' },
        ],
        selectedOption: 'a',
        respondedAt: '2024-01-01T00:30:00Z',
        baseline: { optionId: 'a', confidence: 0.8 },
        protege: { optionId: 'a', reasoning: 'Best choice' },
        human: { optionId: 'a', note: 'Agreed' },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const result = await client.getDecision('decision-123');

      expect(result.baseline).toEqual({ optionId: 'a', confidence: 0.8 });
      expect(result.protege).toEqual({ optionId: 'a', reasoning: 'Best choice' });
      expect(result.human).toEqual({ optionId: 'a', note: 'Agreed' });
    });
  });

  describe('timeout handling', () => {
    it('should timeout on slow requests', async () => {
      // Create a client with very short timeout
      const shortTimeoutClient = new HumancyHttpClient({
        baseUrl: 'https://test.api/humancy',
        timeout: 50,
        maxRetries: 0,
      });

      mockFetch.mockImplementation(
        () =>
          new Promise((resolve) =>
            setTimeout(
              () =>
                resolve({
                  ok: true,
                  json: () => Promise.resolve({}),
                }),
              200
            )
          )
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
      ).rejects.toThrow(/timeout/i);
    });
  });

  describe('authentication', () => {
    it('should include auth header when apiKey is configured', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            id: 'decision-123',
            status: 'pending',
            createdAt: '2024-01-01T00:00:00Z',
            expiresAt: '2024-01-01T01:00:00Z',
          }),
      });

      await client.createDecision({
        question: 'Test?',
        options: [
          { id: 'a', label: 'A' },
          { id: 'b', label: 'B' },
        ],
        urgency: 'blocking_soon',
      });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer test-api-key',
          }),
        })
      );
    });

    it('should not include auth header when apiKey is not configured', async () => {
      const unauthClient = new HumancyHttpClient({
        baseUrl: 'https://test.api/humancy',
        timeout: 5000,
        maxRetries: 0,
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            id: 'decision-123',
            status: 'pending',
            createdAt: '2024-01-01T00:00:00Z',
            expiresAt: '2024-01-01T01:00:00Z',
          }),
      });

      await unauthClient.createDecision({
        question: 'Test?',
        options: [
          { id: 'a', label: 'A' },
          { id: 'b', label: 'B' },
        ],
        urgency: 'blocking_soon',
      });

      const callArgs = mockFetch.mock.calls[0]?.[1] as RequestInit | undefined;
      const headers = callArgs?.headers as Record<string, string> | undefined;
      expect(headers?.['Authorization']).toBeUndefined();
    });

    it('should report authentication status correctly', () => {
      expect(client.isAuthenticated()).toBe(true);

      const unauthClient = new HumancyHttpClient({
        baseUrl: 'https://test.api/humancy',
      });
      expect(unauthClient.isAuthenticated()).toBe(false);
    });
  });

  describe('getEventsUrl', () => {
    it('should return correct SSE URL', () => {
      const url = client.getEventsUrl('decision-123');
      expect(url).toBe(
        'https://test.api/humancy/decisions/decision-123/events'
      );
    });

    it('should encode special characters in ID', () => {
      const url = client.getEventsUrl('decision/with/slashes');
      expect(url).toBe(
        'https://test.api/humancy/decisions/decision%2Fwith%2Fslashes/events'
      );
    });
  });
});
