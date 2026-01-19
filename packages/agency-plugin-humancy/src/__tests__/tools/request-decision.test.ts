/**
 * Tests for humancy.request_decision tool
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createRequestDecisionTool } from '../../tools/request-decision.js';
import { ConnectionModeDetector, ConnectionMode } from '../../connection/index.js';
import { DecisionStore } from '../../storage/index.js';
import type { AgencyCoreAPI } from '@generacy-ai/agency';

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
});
