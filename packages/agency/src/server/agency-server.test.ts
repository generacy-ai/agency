import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { AgencyServer } from './agency-server.js';
import type { AgencyConfig } from '../config/index.js';
import type { AgencyTool, ToolResult } from '../tools/types.js';
import type { AgencyPlugin } from '../plugins/types.js';
import { AgencyError, ErrorCodes } from '../errors/index.js';

// Test configuration
const testConfig: AgencyConfig = {
  name: 'test-agency',
  plugins: [],
  modes: {
    default: ['*'],
    dev: ['dev.*'],
  },
  defaultMode: 'default',
};

// Helper to create a test tool
function createTestTool(overrides: Partial<AgencyTool> = {}): AgencyTool {
  return {
    name: 'test.tool',
    description: 'A test tool',
    inputSchema: { type: 'object' },
    namespace: 'test',
    outputPattern: 'terse',
    execute: async (): Promise<ToolResult> => ({
      content: [{ type: 'text', text: 'executed' }],
    }),
    ...overrides,
  };
}

// Helper to create a test plugin
function createTestPlugin(overrides: Partial<AgencyPlugin> = {}): AgencyPlugin {
  return {
    name: 'test-plugin',
    version: '1.0.0',
    tools: [],
    ...overrides,
  };
}

describe('AgencyServer', () => {
  let server: AgencyServer;

  beforeEach(async () => {
    server = await AgencyServer.create({ config: testConfig });
  });

  afterEach(async () => {
    if (server.isRunning()) {
      await server.stop();
    }
  });

  describe('create', () => {
    it('should create a server with provided config', async () => {
      const config = server.getConfig();

      expect(config.name).toBe('test-agency');
      expect(config.modes).toEqual({ default: ['*'], dev: ['dev.*'] });
    });

    it('should use default mode from config', async () => {
      expect(server.getMode()).toBe('default');
    });

    it('should start in the mode given by modeOverride', async () => {
      const overridden = await AgencyServer.create({
        config: testConfig,
        modeOverride: 'dev',
      });
      expect(overridden.getMode()).toBe('dev');
    });

    it('should ignore an unknown modeOverride with a warning', async () => {
      const stderrSpy = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
      try {
        const overridden = await AgencyServer.create({
          config: testConfig,
          modeOverride: 'no-such-mode',
        });
        expect(overridden.getMode()).toBe('default');
        expect(stderrSpy).toHaveBeenCalledWith(
          expect.stringContaining("unknown mode 'no-such-mode'")
        );
      } finally {
        stderrSpy.mockRestore();
      }
    });
  });

  describe('registerTool/unregisterTool', () => {
    it('should register a tool', () => {
      const tool = createTestTool();

      server.registerTool(tool);

      // Tool should be registered (verified indirectly via server state)
      expect(server.getConfig()).toBeDefined();
    });

    it('should unregister a tool', () => {
      const tool = createTestTool();

      server.registerTool(tool);
      const result = server.unregisterTool('test.tool');

      expect(result).toBe(true);
    });

    it('should return false when unregistering non-existent tool', () => {
      const result = server.unregisterTool('nonexistent');

      expect(result).toBe(false);
    });
  });

  describe('loadPlugin/unloadPlugin', () => {
    it('should load a plugin', async () => {
      const plugin = createTestPlugin({
        tools: [createTestTool({ name: 'plugin.tool' })],
      });

      await server.loadPlugin(plugin);

      // Plugin loaded (no error thrown)
      expect(server.getConfig()).toBeDefined();
    });

    it('should call plugin initialize', async () => {
      const initialize = vi.fn();
      const plugin = createTestPlugin({ initialize });

      await server.loadPlugin(plugin);

      expect(initialize).toHaveBeenCalledOnce();
    });

    it('should unload a plugin', async () => {
      const plugin = createTestPlugin();

      await server.loadPlugin(plugin);
      const result = await server.unloadPlugin('test-plugin');

      expect(result).toBe(true);
    });

    it('should return false when unloading non-existent plugin', async () => {
      const result = await server.unloadPlugin('nonexistent');

      expect(result).toBe(false);
    });
  });

  describe('setMode/getMode', () => {
    it('should get the current mode', () => {
      expect(server.getMode()).toBe('default');
    });

    it('should set a valid mode', () => {
      server.setMode('dev');

      expect(server.getMode()).toBe('dev');
    });

    it('should throw when setting invalid mode', () => {
      expect(() => server.setMode('invalid')).toThrow(AgencyError);
    });
  });

  describe('isRunning', () => {
    it('should return false before start', () => {
      expect(server.isRunning()).toBe(false);
    });
  });

  describe('getConfig', () => {
    it('should return the server configuration', () => {
      const config = server.getConfig();

      expect(config.name).toBe('test-agency');
      expect(config.plugins).toEqual([]);
      expect(config.modes).toEqual({ default: ['*'], dev: ['dev.*'] });
    });
  });
});

describe('AgencyServer lifecycle', () => {
  // Note: Full start/stop tests require mocking stdio transport
  // which is complex. These tests verify the error handling paths.

  it('should throw if start is called twice', async () => {
    const server = await AgencyServer.create({ config: testConfig });

    // Mock the internal state to simulate running
    // @ts-expect-error - accessing private property for testing
    server['state'] = 'running';

    await expect(server.start()).rejects.toThrow(AgencyError);
    await expect(server.start()).rejects.toThrow('already running');
  });

  it('should handle stop when not running', async () => {
    const server = await AgencyServer.create({ config: testConfig });

    // Should not throw
    await server.stop();
    expect(server.isRunning()).toBe(false);
  });
});

describe('AgencyServer plugin integration', () => {
  let server: AgencyServer;

  beforeEach(async () => {
    server = await AgencyServer.create({ config: testConfig });
  });

  afterEach(async () => {
    if (server.isRunning()) {
      await server.stop();
    }
  });

  describe('ChannelManager integration', () => {
    it('should expose channel manager', () => {
      const channelManager = server.getChannelManager();
      expect(channelManager).toBeDefined();
    });

    it('should allow channel registration', () => {
      const channelManager = server.getChannelManager();

      channelManager.registerChannel({
        name: 'test-channel',
        description: 'Test channel',
        owner: 'test',
      });

      expect(channelManager.hasChannel('test-channel')).toBe(true);
    });
  });

  describe('ModeManager integration', () => {
    it('should expose mode manager', () => {
      const modeManager = server.getModeManager();
      expect(modeManager).toBeDefined();
    });

    it('should support mode change subscriptions', () => {
      const modeManager = server.getModeManager();
      const callback = vi.fn();

      const unsubscribe = modeManager.onModeChange(callback);
      server.setMode('dev');

      expect(callback).toHaveBeenCalledWith('dev');
      unsubscribe();
    });
  });

  describe('PluginLoader integration', () => {
    it('should expose plugin loader', () => {
      const pluginLoader = server.getPluginLoader();
      expect(pluginLoader).toBeDefined();
    });

    it('should notify plugins of mode changes', async () => {
      const onModeChange = vi.fn();
      const plugin = createTestPlugin({
        onModeChange,
      });

      await server.loadPlugin(plugin);
      server.setMode('dev');

      expect(onModeChange).toHaveBeenCalledWith('dev');
    });
  });

  describe('enhanced plugin support', () => {
    it('should load enhanced plugins with manifest', async () => {
      const initialize = vi.fn();
      const enhancedPlugin = {
        manifest: {
          id: '@test/enhanced-plugin',
          name: 'Enhanced Plugin',
          version: '1.0.0',
          description: 'Test enhanced plugin',
          author: 'Test',
          license: 'MIT',
        },
        initialize,
        shutdown: vi.fn(),
      };

      await server.loadPlugin(enhancedPlugin);

      expect(initialize).toHaveBeenCalled();
    });

    it('should shutdown enhanced plugins on server stop', async () => {
      const shutdown = vi.fn();
      const enhancedPlugin = {
        manifest: {
          id: '@test/shutdown-plugin',
          name: 'Shutdown Plugin',
          version: '1.0.0',
          description: 'Test shutdown',
          author: 'Test',
          license: 'MIT',
        },
        initialize: vi.fn(),
        shutdown,
      };

      await server.loadPlugin(enhancedPlugin);

      // Mock running state and stop
      // @ts-expect-error - accessing private property for testing
      server['state'] = 'running';
      await server.stop();

      expect(shutdown).toHaveBeenCalled();
    });
  });

  describe('autoLoadPlugins option', () => {
    it('should accept autoLoadPlugins option', async () => {
      const serverWithAutoLoad = await AgencyServer.create({
        config: testConfig,
        autoLoadPlugins: true,
      });

      // Should not throw
      expect(serverWithAutoLoad.getConfig()).toBeDefined();
    });
  });
});
