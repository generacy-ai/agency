/**
 * Tests for humancy.request_decision tool
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createRequestDecisionTool } from '../../tools/request-decision.js';
import { ConnectionModeDetector, ConnectionMode } from '../../connection/index.js';
import { DecisionStore } from '../../storage/index.js';
import { HumancyHttpClient } from '../../http/client.js';
import { SSEHandler } from '../../http/sse.js';
import type { AgencyCoreAPI } from '@generacy-ai/agency';

// Mock the SSE handler module
vi.mock('../../http/sse.js', () => {
  const MockSSEHandler = vi.fn();
  MockSSEHandler.prototype.close = vi.fn();
  MockSSEHandler.prototype.subscribeToDecision = vi.fn();
  return { SSEHandler: MockSSEHandler };
});

describe('humancy.request_decision', () => {
  let mockCoreAPI: AgencyCoreAPI;
  let detector: ConnectionModeDetector;
  let messageHandler: ((msg: unknown) => void) | null = null;

  const validOptions = [
    { id: 'opt1', label: 'Option 1', description: 'First option' },
    { id: 'opt2', label: 'Option 2', description: 'Second option' },
  ];

  beforeEach(() => {
    messageHandler = null;
    mockCoreAPI = {
      getConfig: vi.fn().mockReturnValue(undefined),
      registerTool: vi.fn(),
      unregisterTool: vi.fn(),
      getCurrentMode: vi.fn().mockReturnValue('default'),
      registerMode: vi.fn(),
      onModeChange: vi.fn().mockReturnValue(() => {}),
      registerChannel: vi.fn(),
      sendMessage: vi.fn(),
      onMessage: vi.fn((channel: string, handler: (msg: unknown) => void) => {
        messageHandler = handler;
        return () => {
          messageHandler = null;
        };
      }),
      recordEvent: vi.fn(),
      getPluginId: vi.fn().mockReturnValue('@generacy-ai/agency-plugin-humancy'),
      provide: vi.fn(),
      require: vi.fn(),
      optional: vi.fn(),
    };

    detector = new ConnectionModeDetector();
    detector.initialize(mockCoreAPI);
  });

  describe('tool definition', () => {
    it('should have correct name', () => {
      const tool = createRequestDecisionTool(mockCoreAPI, detector);
      expect(tool.name).toBe('humancy.request_decision');
    });

    it('should require question and options parameters', () => {
      const tool = createRequestDecisionTool(mockCoreAPI, detector);
      expect(tool.inputSchema.required).toContain('question');
      expect(tool.inputSchema.required).toContain('options');
    });
  });

  describe('execute', () => {
    it('should reject when options are missing', async () => {
      const tool = createRequestDecisionTool(mockCoreAPI, detector);

      const result = await tool.execute({ question: 'Which option?' });

      expect(result.isError).toBe(true);
    });

    it('should reject when options has less than 2 items', async () => {
      const tool = createRequestDecisionTool(mockCoreAPI, detector);

      const result = await tool.execute({
        question: 'Which option?',
        options: [{ id: 'only', label: 'Only Option' }],
      });

      expect(result.isError).toBe(true);
    });

    it('should fail when offline', async () => {
      detector.setMode(ConnectionMode.OFFLINE);
      const tool = createRequestDecisionTool(mockCoreAPI, detector);

      const result = await tool.execute({
        question: 'Which option?',
        options: validOptions,
      });

      expect(result.isError).toBe(true);
      expect((result.content[0] as { text: string }).text).toContain('offline');
    });

    it('should return selected option on valid response', async () => {
      detector.setMode(ConnectionMode.DIRECT);
      const tool = createRequestDecisionTool(mockCoreAPI, detector);

      const resultPromise = tool.execute({
        question: 'Which option?',
        options: validOptions,
      });

      await new Promise((resolve) => setTimeout(resolve, 10));

      const sendCall = vi.mocked(mockCoreAPI.sendMessage).mock.calls[0]!;
      if (messageHandler) {
        messageHandler({
          id: 'response-id',
          channel: 'agency.humancy',
          sender: 'humancy',
          timestamp: new Date(),
          payload: {
            requestId: (sendCall[1] as { payload: { id: string } }).payload.id,
            type: 'selection',
            selectedOption: 'opt2',
            respondedAt: new Date(),
          },
        });
      }

      const result = await resultPromise;
      expect(result.isError).toBeFalsy();
      expect((result.content[0] as { text: string }).text).toBe('Selected: opt2');
    });

    it('should include all options in request', async () => {
      detector.setMode(ConnectionMode.DIRECT);
      const tool = createRequestDecisionTool(mockCoreAPI, detector);

      tool.execute({
        question: 'Which option?',
        options: validOptions,
        timeout: 100,
      });

      await new Promise((resolve) => setTimeout(resolve, 10));

      const sendCall = vi.mocked(mockCoreAPI.sendMessage).mock.calls[0]!;
      const message = sendCall[1] as { payload: { options: unknown[] } };
      expect(message.payload.options).toHaveLength(2);
      expect(message.payload.options[0]).toMatchObject({ id: 'opt1', label: 'Option 1' });
    });

    it('should reject invalid selection from response', async () => {
      detector.setMode(ConnectionMode.DIRECT);
      const tool = createRequestDecisionTool(mockCoreAPI, detector);

      const resultPromise = tool.execute({
        question: 'Which option?',
        options: validOptions,
      });

      await new Promise((resolve) => setTimeout(resolve, 10));

      const sendCall = vi.mocked(mockCoreAPI.sendMessage).mock.calls[0]!;
      if (messageHandler) {
        messageHandler({
          id: 'response-id',
          channel: 'agency.humancy',
          sender: 'humancy',
          timestamp: new Date(),
          payload: {
            requestId: (sendCall[1] as { payload: { id: string } }).payload.id,
            type: 'selection',
            selectedOption: 'invalid_option',
            respondedAt: new Date(),
          },
        });
      }

      const result = await resultPromise;
      expect(result.isError).toBe(true);
      expect((result.content[0] as { text: string }).text).toContain('Invalid selection');
    });
  });

  describe('three-layer model support', () => {
    let store: DecisionStore;

    const enhancedOptions = [
      {
        id: 'redis',
        label: 'Redis',
        tradeoffs: {
          pros: ['Fast', 'Built-in TTL'],
          cons: ['Another service to manage'],
        },
      },
      {
        id: 'postgres',
        label: 'Postgres',
        tradeoffs: {
          pros: ['Already have it', 'Queryable'],
          cons: ['Slower for sessions'],
        },
      },
    ];

    beforeEach(() => {
      store = new DecisionStore();
      // Clear sendMessage mock calls for clean state
      vi.mocked(mockCoreAPI.sendMessage).mockClear();
    });

    afterEach(() => {
      store.shutdown();
    });

    it('should accept enhanced options with tradeoffs', async () => {
      detector.setMode(ConnectionMode.DIRECT);
      const tool = createRequestDecisionTool(mockCoreAPI, detector, store);

      const resultPromise = tool.execute({
        question: 'Redis or Postgres?',
        options: enhancedOptions,
        domain: ['backend', 'architecture'],
        decisionContext: {
          projectConstraints: ['prefer-fewer-services'],
          relatedIssue: '#142',
        },
        includeRecommendations: true,
      });

      await new Promise((resolve) => setTimeout(resolve, 10));

      const sendCall = vi.mocked(mockCoreAPI.sendMessage).mock.calls[0]!;
      if (messageHandler) {
        messageHandler({
          id: 'response-id',
          channel: 'agency.humancy',
          sender: 'humancy',
          timestamp: new Date(),
          payload: {
            requestId: (sendCall[1] as { payload: { id: string } }).payload.id,
            type: 'selection',
            selectedOption: 'postgres',
            respondedAt: new Date(),
            decisionId: '550e8400-e29b-41d4-a716-446655440000',
            baseline: {
              optionId: 'redis',
              confidence: 72,
              reasoning: ['Faster for sessions'],
            },
            protege: {
              optionId: 'postgres',
              confidence: 85,
              reasoning: ['Matches constraint'],
              appliedPrinciples: ['prefer-fewer-services'],
            },
            human: {
              optionId: 'postgres',
              matchedProtege: true,
              coaching: null,
            },
          },
        });
      }

      const result = await resultPromise;
      expect(result.isError).toBeFalsy();
      expect((result.content[0] as { text: string }).text).toContain('postgres');
      expect((result.content[0] as { text: string }).text).toContain('decisionId');
    });

    it('should include domain in request payload', async () => {
      detector.setMode(ConnectionMode.DIRECT);
      const tool = createRequestDecisionTool(mockCoreAPI, detector, store);

      tool.execute({
        question: 'Which option?',
        options: validOptions,
        domain: ['backend'],
        timeout: 100,
      });

      await new Promise((resolve) => setTimeout(resolve, 10));

      const sendCall = vi.mocked(mockCoreAPI.sendMessage).mock.calls[0]!;
      const message = sendCall[1] as { payload: { domain?: string[] } };
      expect(message.payload.domain).toEqual(['backend']);
    });

    it('should include decisionContext in request payload', async () => {
      detector.setMode(ConnectionMode.DIRECT);
      const tool = createRequestDecisionTool(mockCoreAPI, detector, store);

      tool.execute({
        question: 'Which option?',
        options: validOptions,
        decisionContext: {
          projectConstraints: ['prefer-fewer-services'],
          relatedIssue: '#142',
        },
        timeout: 100,
      });

      await new Promise((resolve) => setTimeout(resolve, 10));

      const sendCall = vi.mocked(mockCoreAPI.sendMessage).mock.calls[0]!;
      const message = sendCall[1] as { payload: { decisionContext?: object } };
      expect(message.payload.decisionContext).toMatchObject({
        projectConstraints: ['prefer-fewer-services'],
        relatedIssue: '#142',
      });
    });

    it('should include includeRecommendations in request payload', async () => {
      detector.setMode(ConnectionMode.DIRECT);
      const tool = createRequestDecisionTool(mockCoreAPI, detector, store);

      tool.execute({
        question: 'Which option?',
        options: validOptions,
        includeRecommendations: true,
        timeout: 100,
      });

      await new Promise((resolve) => setTimeout(resolve, 10));

      const sendCall = vi.mocked(mockCoreAPI.sendMessage).mock.calls[0]!;
      const message = sendCall[1] as { payload: { includeRecommendations?: boolean } };
      expect(message.payload.includeRecommendations).toBe(true);
    });

    it('should store decision record when store is provided', async () => {
      detector.setMode(ConnectionMode.DIRECT);
      const tool = createRequestDecisionTool(mockCoreAPI, detector, store);

      const resultPromise = tool.execute({
        question: 'Redis or Postgres?',
        options: enhancedOptions,
        domain: ['backend'],
      });

      await new Promise((resolve) => setTimeout(resolve, 10));

      const decisionId = '550e8400-e29b-41d4-a716-446655440001';
      const sendCall = vi.mocked(mockCoreAPI.sendMessage).mock.calls[0]!;
      if (messageHandler) {
        messageHandler({
          id: 'response-id',
          channel: 'agency.humancy',
          sender: 'humancy',
          timestamp: new Date(),
          payload: {
            requestId: (sendCall[1] as { payload: { id: string } }).payload.id,
            type: 'selection',
            selectedOption: 'postgres',
            respondedAt: new Date(),
            decisionId,
          },
        });
      }

      await resultPromise;

      // Verify decision was stored
      const storedRecord = store.get(decisionId);
      expect(storedRecord).toBeDefined();
      expect(storedRecord?.selectedOption).toBe('postgres');
      expect(storedRecord?.request.domain).toEqual(['backend']);
    });

    it('should work without store (backward compatible)', async () => {
      detector.setMode(ConnectionMode.DIRECT);
      // No store provided
      const tool = createRequestDecisionTool(mockCoreAPI, detector);

      const resultPromise = tool.execute({
        question: 'Which option?',
        options: validOptions,
      });

      await new Promise((resolve) => setTimeout(resolve, 10));

      const sendCall = vi.mocked(mockCoreAPI.sendMessage).mock.calls[0]!;
      expect(sendCall).toBeDefined();
      expect(messageHandler).not.toBeNull();

      messageHandler!({
        id: 'response-id',
        channel: 'agency.humancy',
        sender: 'humancy',
        timestamp: new Date(),
        payload: {
          requestId: (sendCall[1] as { payload: { id: string } }).payload.id,
          type: 'selection',
          selectedOption: 'opt1',
          respondedAt: new Date(),
        },
      });

      const result = await resultPromise;
      expect(result.isError).toBeFalsy();
      expect((result.content[0] as { text: string }).text).toBe('Selected: opt1');
    });

    it('should accept options without tradeoffs (backward compatible)', async () => {
      detector.setMode(ConnectionMode.DIRECT);
      const tool = createRequestDecisionTool(mockCoreAPI, detector);

      const resultPromise = tool.execute({
        question: 'Which option?',
        options: validOptions, // Basic options without tradeoffs
      });

      await new Promise((resolve) => setTimeout(resolve, 10));

      const sendCalls = vi.mocked(mockCoreAPI.sendMessage).mock.calls;
      expect(sendCalls.length).toBe(1);
      const sendCall = sendCalls[0]!;

      // Get the handler from the onMessage call and use it directly
      const onMessageCalls = vi.mocked(mockCoreAPI.onMessage).mock.calls;
      expect(onMessageCalls.length).toBeGreaterThan(0);
      const lastCall = onMessageCalls[onMessageCalls.length - 1]!;
      const handler = lastCall[1] as (msg: unknown) => void;
      expect(handler).toBeDefined();

      // Call the handler directly instead of using messageHandler
      handler({
        id: 'response-id',
        channel: 'agency.humancy',
        sender: 'humancy',
        timestamp: new Date(),
        payload: {
          requestId: (sendCall[1] as { payload: { id: string } }).payload.id,
          type: 'selection',
          selectedOption: 'opt1',
          respondedAt: new Date(),
        },
      });

      const result = await resultPromise;
      expect(result.isError).toBeFalsy();
    });
  });

  describe('cloud mode (SSE)', () => {
    let mockHttpClient: HumancyHttpClient;
    let store: DecisionStore;

    beforeEach(() => {
      store = new DecisionStore();
      mockHttpClient = {
        createDecision: vi.fn().mockResolvedValue({
          id: 'decision-123',
          status: 'pending',
          createdAt: '2024-01-01T00:00:00Z',
          expiresAt: '2024-01-01T01:00:00Z',
        }),
        getDecision: vi.fn(),
        getEventsUrl: vi.fn().mockReturnValue('https://test.api/decisions/decision-123/events'),
        getBaseUrl: vi.fn().mockReturnValue('https://test.api'),
        isAuthenticated: vi.fn().mockReturnValue(true),
        getAuthHeaders: vi.fn().mockReturnValue({ Authorization: 'Bearer test-key' }),
      } as unknown as HumancyHttpClient;

      detector.setMode(ConnectionMode.CLOUD);
    });

    afterEach(() => {
      store.shutdown();
      vi.mocked(SSEHandler).mockClear();
    });

    it('should return selected option on decision:resolved', async () => {
      // Mock SSE stream yielding a resolved event
      const mockSubscribe = vi.fn().mockImplementation(async function* () {
        yield {
          type: 'decision:resolved' as const,
          selectedOption: 'opt1',
          respondedAt: '2024-01-01T00:00:00Z',
          timestamp: '2024-01-01T00:00:00Z',
        };
      });
      vi.mocked(SSEHandler).prototype.subscribeToDecision = mockSubscribe;

      const tool = createRequestDecisionTool(mockCoreAPI, detector, store, mockHttpClient);
      const result = await tool.execute({
        question: 'Which option?',
        options: validOptions,
      });

      expect(result.isError).toBeFalsy();
      expect((result.content[0] as { text: string }).text).toContain('Selected: opt1');
      expect((result.content[0] as { text: string }).text).toContain('decision-123');
    });

    it('should handle decision:expired event', async () => {
      const mockSubscribe = vi.fn().mockImplementation(async function* () {
        yield {
          type: 'decision:expired' as const,
          reason: 'timeout',
          timestamp: '2024-01-01T00:00:00Z',
        };
      });
      vi.mocked(SSEHandler).prototype.subscribeToDecision = mockSubscribe;

      const tool = createRequestDecisionTool(mockCoreAPI, detector, store, mockHttpClient);
      const result = await tool.execute({
        question: 'Which option?',
        options: validOptions,
      });

      expect(result.isError).toBe(true);
      expect((result.content[0] as { text: string }).text).toContain('expired');
    });

    it('should skip non-terminal events and wait for resolution', async () => {
      const mockSubscribe = vi.fn().mockImplementation(async function* () {
        yield {
          type: 'decision:created' as const,
          decisionId: 'decision-123',
          timestamp: '2024-01-01T00:00:00Z',
        };
        yield {
          type: 'heartbeat' as const,
          timestamp: '2024-01-01T00:00:01Z',
        };
        yield {
          type: 'decision:updated' as const,
          status: 'in_review',
          timestamp: '2024-01-01T00:00:02Z',
        };
        yield {
          type: 'decision:resolved' as const,
          selectedOption: 'opt2',
          respondedAt: '2024-01-01T00:00:03Z',
          timestamp: '2024-01-01T00:00:03Z',
        };
      });
      vi.mocked(SSEHandler).prototype.subscribeToDecision = mockSubscribe;

      const tool = createRequestDecisionTool(mockCoreAPI, detector, store, mockHttpClient);
      const result = await tool.execute({
        question: 'Which option?',
        options: validOptions,
      });

      expect(result.isError).toBeFalsy();
      expect((result.content[0] as { text: string }).text).toContain('Selected: opt2');
    });

    it('should handle SSE stream ending without terminal event', async () => {
      const mockSubscribe = vi.fn().mockImplementation(async function* () {
        yield {
          type: 'heartbeat' as const,
          timestamp: '2024-01-01T00:00:00Z',
        };
        // Stream ends without resolved/expired
      });
      vi.mocked(SSEHandler).prototype.subscribeToDecision = mockSubscribe;

      const tool = createRequestDecisionTool(mockCoreAPI, detector, store, mockHttpClient);
      const result = await tool.execute({
        question: 'Which option?',
        options: validOptions,
      });

      expect(result.isError).toBe(true);
      expect((result.content[0] as { text: string }).text).toContain('expired');
    });

    it('should store decision record when store is provided', async () => {
      const mockSubscribe = vi.fn().mockImplementation(async function* () {
        yield {
          type: 'decision:resolved' as const,
          selectedOption: 'opt1',
          respondedAt: '2024-01-01T00:00:00Z',
          timestamp: '2024-01-01T00:00:00Z',
        };
      });
      vi.mocked(SSEHandler).prototype.subscribeToDecision = mockSubscribe;

      const tool = createRequestDecisionTool(mockCoreAPI, detector, store, mockHttpClient);
      await tool.execute({
        question: 'Which option?',
        options: validOptions,
        domain: ['backend'],
      });

      const storedRecord = store.get('decision-123');
      expect(storedRecord).toBeDefined();
      expect(storedRecord?.selectedOption).toBe('opt1');
      expect(storedRecord?.request.domain).toEqual(['backend']);
    });

    it('should pass auth headers to SSEHandler', async () => {
      const mockSubscribe = vi.fn().mockImplementation(async function* () {
        yield {
          type: 'decision:resolved' as const,
          selectedOption: 'opt1',
          respondedAt: '2024-01-01T00:00:00Z',
          timestamp: '2024-01-01T00:00:00Z',
        };
      });
      vi.mocked(SSEHandler).prototype.subscribeToDecision = mockSubscribe;

      const tool = createRequestDecisionTool(mockCoreAPI, detector, store, mockHttpClient);
      await tool.execute({
        question: 'Which option?',
        options: validOptions,
      });

      expect(vi.mocked(SSEHandler)).toHaveBeenCalledWith(
        expect.objectContaining({
          authHeaders: { Authorization: 'Bearer test-key' },
        })
      );
    });

    it('should reject invalid selection from SSE event', async () => {
      const mockSubscribe = vi.fn().mockImplementation(async function* () {
        yield {
          type: 'decision:resolved' as const,
          selectedOption: 'invalid_option',
          respondedAt: '2024-01-01T00:00:00Z',
          timestamp: '2024-01-01T00:00:00Z',
        };
      });
      vi.mocked(SSEHandler).prototype.subscribeToDecision = mockSubscribe;

      const tool = createRequestDecisionTool(mockCoreAPI, detector, store, mockHttpClient);
      const result = await tool.execute({
        question: 'Which option?',
        options: validOptions,
      });

      expect(result.isError).toBe(true);
      expect((result.content[0] as { text: string }).text).toContain('Invalid selection');
    });

    it('should handle SSE connection errors gracefully', async () => {
      const mockSubscribe = vi.fn().mockImplementation(async function* () {
        throw new Error('SSE connection failed');
      });
      vi.mocked(SSEHandler).prototype.subscribeToDecision = mockSubscribe;

      const tool = createRequestDecisionTool(mockCoreAPI, detector, store, mockHttpClient);
      const result = await tool.execute({
        question: 'Which option?',
        options: validOptions,
      });

      expect(result.isError).toBe(true);
      expect((result.content[0] as { text: string }).text).toContain('SSE connection failed');
    });

    it('should include three-layer data when requested', async () => {
      const mockSubscribe = vi.fn().mockImplementation(async function* () {
        yield {
          type: 'decision:resolved' as const,
          selectedOption: 'opt1',
          respondedAt: '2024-01-01T00:00:00Z',
          timestamp: '2024-01-01T00:00:00Z',
          baseline: { optionId: 'opt1', confidence: 0.9 },
          protege: { optionId: 'opt1', reasoning: 'Best choice' },
          human: { optionId: 'opt1', note: 'Agreed' },
        };
      });
      vi.mocked(SSEHandler).prototype.subscribeToDecision = mockSubscribe;

      const tool = createRequestDecisionTool(mockCoreAPI, detector, store, mockHttpClient);
      const result = await tool.execute({
        question: 'Which option?',
        options: validOptions,
        includeRecommendations: true,
      });

      expect(result.isError).toBeFalsy();
      const text = (result.content[0] as { text: string }).text;
      expect(text).toContain('Selected: opt1');
      expect(text).toContain('baseline');
    });
  });
});
