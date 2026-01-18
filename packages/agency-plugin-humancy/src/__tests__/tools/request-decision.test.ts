/**
 * Tests for humancy.request_decision tool
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createRequestDecisionTool } from '../../tools/request-decision.js';
import { ConnectionModeDetector, ConnectionMode } from '../../connection/index.js';
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
});
