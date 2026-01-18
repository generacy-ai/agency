/**
 * Tests for humancy.request_review tool
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createRequestReviewTool } from '../../tools/request-review.js';
import { ConnectionModeDetector, ConnectionMode } from '../../connection/index.js';
import { ReviewStatus } from '../../types/responses.js';
import type { AgencyCoreAPI } from '@generacy-ai/agency';

describe('humancy.request_review', () => {
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
      const tool = createRequestReviewTool(mockCoreAPI, detector);
      expect(tool.name).toBe('humancy.request_review');
    });

    it('should require artifact parameter', () => {
      const tool = createRequestReviewTool(mockCoreAPI, detector);
      expect(tool.inputSchema.required).toContain('artifact');
    });
  });

  describe('execute', () => {
    it('should reject invalid parameters', async () => {
      const tool = createRequestReviewTool(mockCoreAPI, detector);

      const result = await tool.execute({});

      expect(result.isError).toBe(true);
      expect((result.content[0] as { text: string }).text).toContain('Invalid parameters');
    });

    it('should fail when offline', async () => {
      detector.setMode(ConnectionMode.OFFLINE);
      const tool = createRequestReviewTool(mockCoreAPI, detector);

      const result = await tool.execute({ artifact: 'src/main.ts' });

      expect(result.isError).toBe(true);
      expect((result.content[0] as { text: string }).text).toContain('offline');
    });

    it('should return approved on approval response', async () => {
      detector.setMode(ConnectionMode.DIRECT);
      const tool = createRequestReviewTool(mockCoreAPI, detector);

      const resultPromise = tool.execute({ artifact: 'src/main.ts' });

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
            type: 'approval',
            status: ReviewStatus.APPROVED,
            respondedAt: new Date(),
          },
        });
      }

      const result = await resultPromise;
      expect(result.isError).toBeFalsy();
      expect((result.content[0] as { text: string }).text).toBe('approved');
    });

    it('should return error with comments on rejection', async () => {
      detector.setMode(ConnectionMode.DIRECT);
      const tool = createRequestReviewTool(mockCoreAPI, detector);

      const resultPromise = tool.execute({ artifact: 'src/main.ts' });

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
            type: 'approval',
            status: ReviewStatus.REJECTED,
            comments: 'Missing error handling',
            respondedAt: new Date(),
          },
        });
      }

      const result = await resultPromise;
      expect(result.isError).toBe(true);
      expect((result.content[0] as { text: string }).text).toContain('rejected');
      expect((result.content[0] as { text: string }).text).toContain('Missing error handling');
    });

    it('should return error with comments on changes_requested', async () => {
      detector.setMode(ConnectionMode.DIRECT);
      const tool = createRequestReviewTool(mockCoreAPI, detector);

      const resultPromise = tool.execute({ artifact: 'src/main.ts' });

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
            type: 'approval',
            status: ReviewStatus.CHANGES_REQUESTED,
            comments: 'Please add unit tests',
            respondedAt: new Date(),
          },
        });
      }

      const result = await resultPromise;
      expect(result.isError).toBe(true);
      expect((result.content[0] as { text: string }).text).toContain('changes_requested');
      expect((result.content[0] as { text: string }).text).toContain('Please add unit tests');
    });

    it('should use blocking_soon as default urgency', async () => {
      detector.setMode(ConnectionMode.DIRECT);
      const tool = createRequestReviewTool(mockCoreAPI, detector);

      tool.execute({ artifact: 'src/main.ts', timeout: 100 });

      await new Promise((resolve) => setTimeout(resolve, 10));

      const sendCall = vi.mocked(mockCoreAPI.sendMessage).mock.calls[0]!;
      const message = sendCall[1] as { payload: { urgency: string } };
      expect(message.payload.urgency).toBe('blocking_soon');
    });
  });
});
