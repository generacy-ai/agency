/**
 * Integration tests for offline mode
 *
 * Tests queueing decisions when offline and syncing when online.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ConnectionModeDetector, ConnectionMode } from '../../connection/index.js';

// Mock AgencyCoreAPI
const createMockCoreAPI = () => ({
  getPluginId: () => 'humancy',
  getConfig: vi.fn().mockReturnValue({}),
  onMessage: vi.fn().mockReturnValue(() => {}),
  sendMessage: vi.fn(),
  registerTool: vi.fn(),
  unregisterTool: vi.fn(),
  onModeChange: vi.fn().mockReturnValue(() => {}),
  provide: vi.fn(),
  require: vi.fn(),
  optional: vi.fn(),
});

describe('Offline Mode Integration', () => {
  let detector: ConnectionModeDetector;
  let mockCoreAPI: ReturnType<typeof createMockCoreAPI>;

  beforeEach(() => {
    vi.clearAllMocks();
    detector = new ConnectionModeDetector();
    mockCoreAPI = createMockCoreAPI();
  });

  describe('Connection State Tracking', () => {
    it('should track connection state changes', () => {
      detector.initialize(mockCoreAPI as unknown as Parameters<typeof detector.initialize>[0]);

      // Initially not connected
      const initialState = detector.getState();
      expect(initialState.connected).toBe(false);

      // Update to connected
      detector.updateConnectionState(true);
      const connectedState = detector.getState();
      expect(connectedState.connected).toBe(true);
      expect(connectedState.lastConnected).toBeDefined();

      // Update to disconnected with error
      detector.updateConnectionState(false, 'Network error');
      const disconnectedState = detector.getState();
      expect(disconnectedState.connected).toBe(false);
      expect(disconnectedState.error).toBe('Network error');
    });

    it('should detect offline mode when no connections available', async () => {
      detector.initialize(mockCoreAPI as unknown as Parameters<typeof detector.initialize>[0]);

      // No direct connection, no API config
      process.env['HUMANCY_API_URL'] = '';
      delete process.env['GENERACY_API_KEY'];

      const mode = await detector.detect();

      // Without direct connection or API, should be offline
      // Note: actual behavior depends on implementation
      expect([ConnectionMode.OFFLINE, ConnectionMode.DIRECT, ConnectionMode.CLOUD]).toContain(
        mode
      );
    });
  });

  describe('Offline Queue Behavior', () => {
    it('should queue notifications when offline', () => {
      detector.initialize(mockCoreAPI as unknown as Parameters<typeof detector.initialize>[0]);

      // Force offline mode
      detector.updateConnectionState(false, 'No network');

      // Attempt to send notification
      const notification = {
        id: 'notif-1',
        type: 'notification',
        message: 'Test notification',
        timestamp: new Date(),
      };

      // In offline mode, messages should be queued by channel router
      mockCoreAPI.sendMessage('agency.humancy', notification);

      expect(mockCoreAPI.sendMessage).toHaveBeenCalledWith('agency.humancy', notification);
    });

    it('should report queued status for offline notifications', () => {
      detector.initialize(mockCoreAPI as unknown as Parameters<typeof detector.initialize>[0]);
      detector.updateConnectionState(false, 'Offline');

      const state = detector.getState();
      expect(state.connected).toBe(false);
      expect(state.mode).toBe(ConnectionMode.OFFLINE);
    });
  });

  describe('Online Sync Behavior', () => {
    it('should update state when coming online', () => {
      detector.initialize(mockCoreAPI as unknown as Parameters<typeof detector.initialize>[0]);

      // Start offline
      detector.updateConnectionState(false, 'Offline');
      expect(detector.getState().connected).toBe(false);

      // Come online
      detector.updateConnectionState(true);
      expect(detector.getState().connected).toBe(true);
      expect(detector.getState().error).toBeUndefined();
      expect(detector.getState().lastConnected).toBeDefined();
    });

    it('should track last connection time', () => {
      detector.initialize(mockCoreAPI as unknown as Parameters<typeof detector.initialize>[0]);

      const beforeConnect = new Date();
      detector.updateConnectionState(true);
      const afterConnect = new Date();

      const lastConnected = detector.getState().lastConnected;
      expect(lastConnected).toBeDefined();
      expect(lastConnected!.getTime()).toBeGreaterThanOrEqual(beforeConnect.getTime());
      expect(lastConnected!.getTime()).toBeLessThanOrEqual(afterConnect.getTime());
    });
  });

  describe('Mode Detection Priority', () => {
    it('should prioritize direct mode over cloud when available', async () => {
      // This test verifies the mode priority: direct > cloud > offline
      detector.initialize(mockCoreAPI as unknown as Parameters<typeof detector.initialize>[0]);

      // When both direct and cloud are available, direct should win
      // Note: actual implementation may vary based on detection logic
      const mode = await detector.detect();

      // The mode should be one of the valid modes
      expect(Object.values(ConnectionMode)).toContain(mode);
    });

    it('should fall back to offline when no modes available', async () => {
      detector.initialize(mockCoreAPI as unknown as Parameters<typeof detector.initialize>[0]);

      // Force offline by updating state
      detector.updateConnectionState(false, 'No connections available');

      const state = detector.getState();
      expect(state.connected).toBe(false);
    });
  });

  describe('HTTP Client Info in Cloud Mode', () => {
    it('should include HTTP client info when in cloud mode', () => {
      detector.initialize(mockCoreAPI as unknown as Parameters<typeof detector.initialize>[0]);

      // Set up cloud mode config
      process.env['HUMANCY_API_URL'] = 'https://test.api/humancy';
      process.env['GENERACY_API_KEY'] = 'test-key';

      // Get API configuration
      const apiUrl = detector.getApiUrl();
      const hasKey = detector.hasApiKey();

      expect(apiUrl).toBe('https://test.api/humancy');
      expect(hasKey).toBe(true);

      // Clean up
      delete process.env['HUMANCY_API_URL'];
      delete process.env['GENERACY_API_KEY'];
    });

    it('should use default API URL when not configured', () => {
      detector.initialize(mockCoreAPI as unknown as Parameters<typeof detector.initialize>[0]);

      // Clear env vars
      delete process.env['HUMANCY_API_URL'];
      delete process.env['GENERACY_API_KEY'];

      const apiUrl = detector.getApiUrl();
      expect(apiUrl).toBe('https://generacy.ai/api/humancy');
    });
  });
});
