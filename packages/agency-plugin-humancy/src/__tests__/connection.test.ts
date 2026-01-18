/**
 * Tests for ConnectionModeDetector
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ConnectionModeDetector, ConnectionMode } from '../connection/index.js';
import type { AgencyCoreAPI } from '@generacy-ai/agency';

describe('ConnectionModeDetector', () => {
  let detector: ConnectionModeDetector;
  let mockCoreAPI: AgencyCoreAPI;

  beforeEach(() => {
    detector = new ConnectionModeDetector();
    mockCoreAPI = {
      getConfig: vi.fn(),
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
  });

  describe('initial state', () => {
    it('should start in OFFLINE mode', () => {
      expect(detector.getMode()).toBe(ConnectionMode.OFFLINE);
    });

    it('should start disconnected', () => {
      expect(detector.isConnected()).toBe(false);
    });
  });

  describe('detect', () => {
    it('should use configured mode when set to direct', async () => {
      vi.mocked(mockCoreAPI.getConfig).mockImplementation((key: string) => {
        if (key === 'humancy.mode') return 'direct';
        return undefined;
      });

      detector.initialize(mockCoreAPI);
      const mode = await detector.detect();

      expect(mode).toBe(ConnectionMode.DIRECT);
      expect(detector.getMode()).toBe(ConnectionMode.DIRECT);
    });

    it('should use configured mode when set to generacy', async () => {
      vi.mocked(mockCoreAPI.getConfig).mockImplementation((key: string) => {
        if (key === 'humancy.mode') return 'generacy';
        return undefined;
      });

      detector.initialize(mockCoreAPI);
      const mode = await detector.detect();

      expect(mode).toBe(ConnectionMode.VIA_GENERACY);
    });

    it('should use configured mode when set to offline', async () => {
      vi.mocked(mockCoreAPI.getConfig).mockImplementation((key: string) => {
        if (key === 'humancy.mode') return 'offline';
        return undefined;
      });

      detector.initialize(mockCoreAPI);
      const mode = await detector.detect();

      expect(mode).toBe(ConnectionMode.OFFLINE);
    });

    it('should fallback to VIA_GENERACY when generacy endpoint is configured', async () => {
      vi.mocked(mockCoreAPI.getConfig).mockImplementation((key: string) => {
        if (key === 'generacy.endpoint') return 'http://localhost:3000';
        return undefined;
      });

      detector.initialize(mockCoreAPI);
      const mode = await detector.detect();

      expect(mode).toBe(ConnectionMode.VIA_GENERACY);
    });

    it('should fallback to OFFLINE when no configuration available', async () => {
      vi.mocked(mockCoreAPI.getConfig).mockReturnValue(undefined);

      detector.initialize(mockCoreAPI);
      const mode = await detector.detect();

      expect(mode).toBe(ConnectionMode.OFFLINE);
    });
  });

  describe('updateConnectionState', () => {
    it('should update connected state on success', () => {
      detector.updateConnectionState(true);

      expect(detector.isConnected()).toBe(true);
      const state = detector.getState();
      expect(state.connected).toBe(true);
      expect(state.lastConnected).toBeInstanceOf(Date);
      expect(state.error).toBeUndefined();
    });

    it('should update error state on failure', () => {
      detector.updateConnectionState(false, 'Connection refused');

      expect(detector.isConnected()).toBe(false);
      const state = detector.getState();
      expect(state.connected).toBe(false);
      expect(state.error).toBe('Connection refused');
    });
  });

  describe('setMode', () => {
    it('should allow forcing a specific mode', () => {
      detector.setMode(ConnectionMode.DIRECT);

      expect(detector.getMode()).toBe(ConnectionMode.DIRECT);
    });
  });

  describe('getState', () => {
    it('should return a copy of the state', () => {
      const state1 = detector.getState();
      const state2 = detector.getState();

      expect(state1).toEqual(state2);
      expect(state1).not.toBe(state2); // Different object reference
    });
  });
});
