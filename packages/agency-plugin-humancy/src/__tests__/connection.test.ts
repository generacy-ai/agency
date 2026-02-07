/**
 * Tests for ConnectionModeDetector
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ConnectionModeDetector, ConnectionMode } from '../connection/index.js';
import type { AgencyCoreAPI } from '@generacy-ai/agency';

describe('ConnectionModeDetector', () => {
  let detector: ConnectionModeDetector;
  let mockCoreAPI: AgencyCoreAPI;
  const originalEnv = process.env;

  beforeEach(() => {
    // Reset environment
    process.env = { ...originalEnv };
    delete process.env['HUMANCY_API_URL'];
    delete process.env['GENERACY_API_KEY'];
    delete process.env['VSCODE_PID'];
    delete process.env['HUMANCY_SOCKET_PATH'];

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
      provide: vi.fn(),
      require: vi.fn(),
      optional: vi.fn(),
    };
  });

  afterEach(() => {
    process.env = originalEnv;
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

    it('should use configured mode when set to cloud', async () => {
      vi.mocked(mockCoreAPI.getConfig).mockImplementation((key: string) => {
        if (key === 'humancy.mode') return 'cloud';
        return undefined;
      });

      detector.initialize(mockCoreAPI);
      const mode = await detector.detect();

      expect(mode).toBe(ConnectionMode.CLOUD);
      expect(detector.getState().httpClientInfo).toBeDefined();
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

    it('should detect CLOUD when HUMANCY_API_URL env is set', async () => {
      process.env['HUMANCY_API_URL'] = 'https://custom.api/humancy';
      vi.mocked(mockCoreAPI.getConfig).mockReturnValue(undefined);

      detector.initialize(mockCoreAPI);
      const mode = await detector.detect();

      expect(mode).toBe(ConnectionMode.CLOUD);
      expect(detector.getApiUrl()).toBe('https://custom.api/humancy');
    });

    it('should detect CLOUD when humancy.apiUrl config is set', async () => {
      vi.mocked(mockCoreAPI.getConfig).mockImplementation((key: string) => {
        if (key === 'humancy.apiUrl') return 'https://config.api/humancy';
        return undefined;
      });

      detector.initialize(mockCoreAPI);
      const mode = await detector.detect();

      expect(mode).toBe(ConnectionMode.CLOUD);
    });

    it('should fallback to OFFLINE when no configuration available', async () => {
      vi.mocked(mockCoreAPI.getConfig).mockReturnValue(undefined);

      detector.initialize(mockCoreAPI);
      const mode = await detector.detect();

      expect(mode).toBe(ConnectionMode.OFFLINE);
    });

    it('should prioritize explicit config over env vars', async () => {
      process.env['HUMANCY_API_URL'] = 'https://env.api/humancy';
      vi.mocked(mockCoreAPI.getConfig).mockImplementation((key: string) => {
        if (key === 'humancy.mode') return 'offline';
        return undefined;
      });

      detector.initialize(mockCoreAPI);
      const mode = await detector.detect();

      expect(mode).toBe(ConnectionMode.OFFLINE);
    });
  });

  describe('hasApiConfig', () => {
    it('should return true when HUMANCY_API_URL env is set', async () => {
      process.env['HUMANCY_API_URL'] = 'https://test.api/humancy';
      vi.mocked(mockCoreAPI.getConfig).mockReturnValue(undefined);

      detector.initialize(mockCoreAPI);
      const mode = await detector.detect();

      expect(mode).toBe(ConnectionMode.CLOUD);
    });

    it('should return true when humancy.apiUrl config is set', async () => {
      vi.mocked(mockCoreAPI.getConfig).mockImplementation((key: string) => {
        if (key === 'humancy.apiUrl') return 'https://test.api/humancy';
        return undefined;
      });

      detector.initialize(mockCoreAPI);
      const mode = await detector.detect();

      expect(mode).toBe(ConnectionMode.CLOUD);
    });
  });

  describe('getApiUrl', () => {
    it('should return env var when set', () => {
      process.env['HUMANCY_API_URL'] = 'https://env.api/humancy';
      vi.mocked(mockCoreAPI.getConfig).mockImplementation((key: string) => {
        if (key === 'humancy.apiUrl') return 'https://config.api/humancy';
        return undefined;
      });

      detector.initialize(mockCoreAPI);

      expect(detector.getApiUrl()).toBe('https://env.api/humancy');
    });

    it('should return config when env var not set', () => {
      vi.mocked(mockCoreAPI.getConfig).mockImplementation((key: string) => {
        if (key === 'humancy.apiUrl') return 'https://config.api/humancy';
        return undefined;
      });

      detector.initialize(mockCoreAPI);

      expect(detector.getApiUrl()).toBe('https://config.api/humancy');
    });

    it('should return default when nothing configured', () => {
      vi.mocked(mockCoreAPI.getConfig).mockReturnValue(undefined);

      detector.initialize(mockCoreAPI);

      expect(detector.getApiUrl()).toBe('https://generacy.ai/api/humancy');
    });
  });

  describe('getApiKey', () => {
    it('should return env var when set', () => {
      process.env['GENERACY_API_KEY'] = 'env-key';
      vi.mocked(mockCoreAPI.getConfig).mockImplementation((key: string) => {
        if (key === 'humancy.apiKey') return 'config-key';
        return undefined;
      });

      detector.initialize(mockCoreAPI);

      expect(detector.getApiKey()).toBe('env-key');
    });

    it('should return config when env var not set', () => {
      vi.mocked(mockCoreAPI.getConfig).mockImplementation((key: string) => {
        if (key === 'humancy.apiKey') return 'config-key';
        return undefined;
      });

      detector.initialize(mockCoreAPI);

      expect(detector.getApiKey()).toBe('config-key');
    });

    it('should return undefined when nothing configured', () => {
      vi.mocked(mockCoreAPI.getConfig).mockReturnValue(undefined);

      detector.initialize(mockCoreAPI);

      expect(detector.getApiKey()).toBeUndefined();
    });
  });

  describe('hasApiKey', () => {
    it('should return true when API key is configured', () => {
      process.env['GENERACY_API_KEY'] = 'test-key';
      detector.initialize(mockCoreAPI);

      expect(detector.hasApiKey()).toBe(true);
    });

    it('should return false when API key is not configured', () => {
      vi.mocked(mockCoreAPI.getConfig).mockReturnValue(undefined);
      detector.initialize(mockCoreAPI);

      expect(detector.hasApiKey()).toBe(false);
    });

    it('should return false for empty string', () => {
      process.env['GENERACY_API_KEY'] = '';
      detector.initialize(mockCoreAPI);

      expect(detector.hasApiKey()).toBe(false);
    });
  });

  describe('getTimeout', () => {
    it('should return config timeout when set', () => {
      vi.mocked(mockCoreAPI.getConfig).mockImplementation((key: string) => {
        if (key === 'humancy.timeout') return 30000;
        return undefined;
      });

      detector.initialize(mockCoreAPI);

      expect(detector.getTimeout()).toBe(30000);
    });

    it('should return default timeout when not configured', () => {
      vi.mocked(mockCoreAPI.getConfig).mockReturnValue(undefined);
      detector.initialize(mockCoreAPI);

      expect(detector.getTimeout()).toBe(60000);
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
    it('should allow forcing DIRECT mode', () => {
      detector.setMode(ConnectionMode.DIRECT);

      expect(detector.getMode()).toBe(ConnectionMode.DIRECT);
      expect(detector.getState().httpClientInfo).toBeUndefined();
    });

    it('should set httpClientInfo when forcing CLOUD mode', () => {
      vi.mocked(mockCoreAPI.getConfig).mockReturnValue(undefined);
      detector.initialize(mockCoreAPI);
      detector.setMode(ConnectionMode.CLOUD);

      expect(detector.getMode()).toBe(ConnectionMode.CLOUD);
      expect(detector.getState().httpClientInfo).toBeDefined();
      expect(detector.getState().httpClientInfo?.baseUrl).toBe(
        'https://generacy.ai/api/humancy'
      );
    });

    it('should clear httpClientInfo when forcing non-CLOUD mode', () => {
      vi.mocked(mockCoreAPI.getConfig).mockReturnValue(undefined);
      detector.initialize(mockCoreAPI);
      detector.setMode(ConnectionMode.CLOUD);
      detector.setMode(ConnectionMode.OFFLINE);

      expect(detector.getMode()).toBe(ConnectionMode.OFFLINE);
      expect(detector.getState().httpClientInfo).toBeUndefined();
    });
  });

  describe('getState', () => {
    it('should return a copy of the state', () => {
      const state1 = detector.getState();
      const state2 = detector.getState();

      expect(state1).toEqual(state2);
      expect(state1).not.toBe(state2); // Different object reference
    });

    it('should include httpClientInfo for CLOUD mode', async () => {
      process.env['HUMANCY_API_URL'] = 'https://test.api/humancy';
      process.env['GENERACY_API_KEY'] = 'test-key';
      vi.mocked(mockCoreAPI.getConfig).mockReturnValue(undefined);

      detector.initialize(mockCoreAPI);
      await detector.detect();

      const state = detector.getState();
      expect(state.httpClientInfo).toEqual({
        baseUrl: 'https://test.api/humancy',
        authenticated: true,
      });
    });
  });
});
