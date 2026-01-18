/**
 * Tests for humancy.notify tool
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createNotifyTool } from '../../tools/notify.js';
import { ConnectionModeDetector, ConnectionMode } from '../../connection/index.js';
import type { AgencyCoreAPI } from '@generacy-ai/agency';

describe('humancy.notify', () => {
  let mockCoreAPI: AgencyCoreAPI;
  let detector: ConnectionModeDetector;

  beforeEach(() => {
    mockCoreAPI = {
      getConfig: vi.fn().mockReturnValue(undefined),
      registerTool: vi.fn(),
      unregisterTool: vi.fn(),
      getCurrentMode: vi.fn().mockReturnValue('default'),
      registerMode: vi.fn(),
      onModeChange: vi.fn().mockReturnValue(() => {}),
      registerChannel: vi.fn(),
      sendMessage: vi.fn(),
      onMessage: vi.fn().mockReturnValue(() => {}),
      recordEvent: vi.fn(),
      getPluginId: vi.fn().mockReturnValue('@generacy-ai/agency-plugin-humancy'),
    };

    detector = new ConnectionModeDetector();
    detector.initialize(mockCoreAPI);
  });

  describe('tool definition', () => {
    it('should have correct name', () => {
      const tool = createNotifyTool(mockCoreAPI, detector);
      expect(tool.name).toBe('humancy.notify');
    });

    it('should require message parameter', () => {
      const tool = createNotifyTool(mockCoreAPI, detector);
      expect(tool.inputSchema.required).toContain('message');
    });
  });

  describe('execute', () => {
    it('should reject invalid parameters', async () => {
      const tool = createNotifyTool(mockCoreAPI, detector);

      const result = await tool.execute({});

      expect(result.isError).toBe(true);
      expect((result.content[0] as { text: string }).text).toContain('Invalid parameters');
    });

    it('should return sent on success when connected', async () => {
      detector.setMode(ConnectionMode.DIRECT);
      const tool = createNotifyTool(mockCoreAPI, detector);

      const result = await tool.execute({ message: 'Task completed successfully' });

      expect(result.isError).toBeFalsy();
      expect((result.content[0] as { text: string }).text).toBe('sent');
    });

    it('should return queued when offline', async () => {
      detector.setMode(ConnectionMode.OFFLINE);
      const tool = createNotifyTool(mockCoreAPI, detector);

      const result = await tool.execute({ message: 'Task completed' });

      // Notifications are queued in offline mode, not rejected
      expect(result.isError).toBeFalsy();
      expect((result.content[0] as { text: string }).text).toBe('queued (offline)');
    });

    it('should send message via channel', async () => {
      detector.setMode(ConnectionMode.DIRECT);
      const tool = createNotifyTool(mockCoreAPI, detector);

      await tool.execute({ message: 'Task completed' });

      expect(mockCoreAPI.sendMessage).toHaveBeenCalledWith(
        'agency.humancy',
        expect.objectContaining({
          channel: 'agency.humancy',
          sender: '@generacy-ai/agency-plugin-humancy',
        })
      );
    });

    it('should include message in payload', async () => {
      detector.setMode(ConnectionMode.DIRECT);
      const tool = createNotifyTool(mockCoreAPI, detector);

      await tool.execute({ message: 'Build complete' });

      const sendCall = vi.mocked(mockCoreAPI.sendMessage).mock.calls[0]!;
      const envelope = sendCall[1] as { payload: { message: string; type: string } };
      expect(envelope.payload.message).toBe('Build complete');
      expect(envelope.payload.type).toBe('notification');
    });

    it('should include context when provided', async () => {
      detector.setMode(ConnectionMode.DIRECT);
      const tool = createNotifyTool(mockCoreAPI, detector);

      await tool.execute({
        message: 'Build complete',
        context: 'All tests passed',
      });

      const sendCall = vi.mocked(mockCoreAPI.sendMessage).mock.calls[0]!;
      const envelope = sendCall[1] as { payload: { context: string } };
      expect(envelope.payload.context).toBe('All tests passed');
    });

    it('should use when_available as default urgency', async () => {
      detector.setMode(ConnectionMode.DIRECT);
      const tool = createNotifyTool(mockCoreAPI, detector);

      await tool.execute({ message: 'Info notification' });

      const sendCall = vi.mocked(mockCoreAPI.sendMessage).mock.calls[0]!;
      const envelope = sendCall[1] as { payload: { urgency: string } };
      expect(envelope.payload.urgency).toBe('when_available');
    });

    it('should not wait for response', async () => {
      detector.setMode(ConnectionMode.DIRECT);
      const tool = createNotifyTool(mockCoreAPI, detector);

      // Execute should complete immediately without waiting
      const startTime = Date.now();
      await tool.execute({ message: 'Quick notification' });
      const elapsed = Date.now() - startTime;

      // Should complete in less than 100ms (no waiting)
      expect(elapsed).toBeLessThan(100);
    });

    it('should handle send error gracefully', async () => {
      vi.mocked(mockCoreAPI.sendMessage).mockImplementation(() => {
        throw new Error('Channel unavailable');
      });

      detector.setMode(ConnectionMode.DIRECT);
      const tool = createNotifyTool(mockCoreAPI, detector);

      const result = await tool.execute({ message: 'Test' });

      expect(result.isError).toBe(true);
      expect((result.content[0] as { text: string }).text).toContain('Channel unavailable');
    });
  });
});
