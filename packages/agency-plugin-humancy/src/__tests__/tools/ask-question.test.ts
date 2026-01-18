/**
 * Tests for humancy.ask_question tool
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createAskQuestionTool } from '../../tools/ask-question.js';
import { ConnectionModeDetector, ConnectionMode } from '../../connection/index.js';
import type { AgencyCoreAPI } from '@generacy-ai/agency';

describe('humancy.ask_question', () => {
  let mockCoreAPI: AgencyCoreAPI;
  let detector: ConnectionModeDetector;
  let messageHandler: ((msg: unknown) => void) | null = null;

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
      const tool = createAskQuestionTool(mockCoreAPI, detector);
      expect(tool.name).toBe('humancy.ask_question');
    });

    it('should have correct namespace', () => {
      const tool = createAskQuestionTool(mockCoreAPI, detector);
      expect(tool.namespace).toBe('humancy');
    });

    it('should use terse output pattern', () => {
      const tool = createAskQuestionTool(mockCoreAPI, detector);
      expect(tool.outputPattern).toBe('terse');
    });

    it('should require question parameter', () => {
      const tool = createAskQuestionTool(mockCoreAPI, detector);
      expect(tool.inputSchema.required).toContain('question');
    });
  });

  describe('execute', () => {
    it('should reject invalid parameters', async () => {
      const tool = createAskQuestionTool(mockCoreAPI, detector);

      const result = await tool.execute({});

      expect(result.isError).toBe(true);
      expect(result.content[0]).toHaveProperty('text');
      expect((result.content[0] as { text: string }).text).toContain('Invalid parameters');
    });

    it('should fail when offline', async () => {
      detector.setMode(ConnectionMode.OFFLINE);
      const tool = createAskQuestionTool(mockCoreAPI, detector);

      const result = await tool.execute({ question: 'What is your name?' });

      expect(result.isError).toBe(true);
      expect((result.content[0] as { text: string }).text).toContain('offline');
    });

    it('should send message via channel when connected', async () => {
      detector.setMode(ConnectionMode.DIRECT);
      const tool = createAskQuestionTool(mockCoreAPI, detector);

      // Start execution but don't await
      const resultPromise = tool.execute({ question: 'What is your name?' });

      // Wait a tick for the message to be sent
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(mockCoreAPI.sendMessage).toHaveBeenCalled();
      const sendCall = vi.mocked(mockCoreAPI.sendMessage).mock.calls[0]!;
      expect(sendCall[0]).toBe('agency.humancy');

      // Simulate response
      if (messageHandler) {
        const sentMessage = sendCall[1] as { payload: { id: string } };
        messageHandler({
          id: 'response-id',
          channel: 'agency.humancy',
          sender: 'humancy',
          timestamp: new Date(),
          payload: {
            requestId: sentMessage.payload.id,
            type: 'text',
            response: 'My name is Claude',
            respondedAt: new Date(),
          },
        });
      }

      const result = await resultPromise;
      expect(result.isError).toBeFalsy();
      expect((result.content[0] as { text: string }).text).toBe('My name is Claude');
    });

    it('should timeout when no response received', async () => {
      detector.setMode(ConnectionMode.DIRECT);
      const tool = createAskQuestionTool(mockCoreAPI, detector);

      const result = await tool.execute({
        question: 'What is your name?',
        timeout: 100, // Very short timeout
      });

      expect(result.isError).toBe(true);
      expect((result.content[0] as { text: string }).text).toContain('Timeout');
    });

    it('should include urgency in request', async () => {
      detector.setMode(ConnectionMode.DIRECT);
      const tool = createAskQuestionTool(mockCoreAPI, detector);

      // Start execution
      tool.execute({
        question: 'Urgent question?',
        urgency: 'blocking_now',
        timeout: 100,
      });

      // Wait for message to be sent
      await new Promise((resolve) => setTimeout(resolve, 10));

      const sendCall = vi.mocked(mockCoreAPI.sendMessage).mock.calls[0]!;
      const message = sendCall[1] as { payload: { urgency: string } };
      expect(message.payload.urgency).toBe('blocking_now');
    });

    it('should include context in request when provided', async () => {
      detector.setMode(ConnectionMode.DIRECT);
      const tool = createAskQuestionTool(mockCoreAPI, detector);

      tool.execute({
        question: 'What color?',
        context: 'We are painting a house',
        timeout: 100,
      });

      await new Promise((resolve) => setTimeout(resolve, 10));

      const sendCall = vi.mocked(mockCoreAPI.sendMessage).mock.calls[0]!;
      const message = sendCall[1] as { payload: { context: string } };
      expect(message.payload.context).toBe('We are painting a house');
    });
  });
});
