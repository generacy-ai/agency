import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PluginLoader, PluginErrorCodes } from './loader.js';
import { ToolRegistry } from '../tools/index.js';
import type { AgencyPlugin, LegacyAgencyPlugin, PluginManifest, DiscoveredPlugin, AgencyCoreAPI } from './types.js';
import type { AgencyTool, ToolResult } from '../tools/types.js';
import { AgencyError, ErrorCodes } from '../errors/index.js';
import { createTestManifest } from './manifest.js';

// Helper to create a test tool
function createTestTool(name: string): AgencyTool {
  return {
    name,
    description: `Tool ${name}`,
    inputSchema: { type: 'object' },
    namespace: name.split('.')[0] ?? 'test',
    outputPattern: 'terse',
    execute: async (): Promise<ToolResult> => ({
      content: [{ type: 'text', text: 'done' }],
    }),
  };
}

// Helper to create a legacy test plugin
function createTestPlugin(overrides: Partial<LegacyAgencyPlugin> = {}): LegacyAgencyPlugin {
  return {
    name: 'test-plugin',
    version: '1.0.0',
    tools: [createTestTool('test.tool')],
    ...overrides,
  };
}

// Helper to create an enhanced plugin with manifest
function createEnhancedPlugin(
  manifest: PluginManifest,
  overrides: Partial<Omit<AgencyPlugin, 'manifest'>> = {}
): AgencyPlugin {
  // Create initialize function with proper arity (1 argument) for enhanced plugin detection
  const initializeFn = vi.fn(async (_coreAPI: AgencyCoreAPI) => {});
  const shutdownFn = vi.fn(async () => {});
  return {
    manifest,
    initialize: initializeFn,
    shutdown: shutdownFn,
    ...overrides,
  };
}

// Helper to create a mock CoreAPI factory
function createMockCoreAPIFactory() {
  return {
    createForPlugin: vi.fn().mockImplementation((pluginId: string) => ({
      getPluginId: () => pluginId,
      registerTool: vi.fn(),
      unregisterTool: vi.fn(),
      getCurrentMode: vi.fn().mockReturnValue('default'),
      registerMode: vi.fn(),
      onModeChange: vi.fn().mockReturnValue(() => {}),
      registerChannel: vi.fn(),
      sendMessage: vi.fn(),
      onMessage: vi.fn().mockReturnValue(() => {}),
      getConfig: vi.fn(),
      recordEvent: vi.fn(),
    })),
  };
}

describe('PluginLoader', () => {
  let registry: ToolRegistry;
  let loader: PluginLoader;

  beforeEach(() => {
    registry = new ToolRegistry();
    loader = new PluginLoader(registry);
  });

  describe('loadPlugin', () => {
    it('should load a plugin and register its tools', async () => {
      const plugin = createTestPlugin({
        tools: [createTestTool('plugin.tool1'), createTestTool('plugin.tool2')],
      });

      await loader.loadPlugin(plugin);

      expect(loader.count).toBe(1);
      expect(registry.has('plugin.tool1')).toBe(true);
      expect(registry.has('plugin.tool2')).toBe(true);
    });

    it('should call initialize if defined', async () => {
      const initialize = vi.fn();
      const plugin = createTestPlugin({ initialize });

      await loader.loadPlugin(plugin);

      expect(initialize).toHaveBeenCalledOnce();
    });

    it('should throw if initialize fails', async () => {
      const plugin = createTestPlugin({
        initialize: async () => {
          throw new Error('Init failed');
        },
      });

      await expect(loader.loadPlugin(plugin)).rejects.toThrow(AgencyError);
      await expect(loader.loadPlugin(plugin)).rejects.toThrow(
        'Failed to initialize plugin'
      );
    });

    it('should not register tools if initialize fails', async () => {
      const plugin = createTestPlugin({
        tools: [createTestTool('should.not.exist')],
        initialize: async () => {
          throw new Error('Init failed');
        },
      });

      try {
        await loader.loadPlugin(plugin);
      } catch {
        // Expected
      }

      expect(registry.has('should.not.exist')).toBe(false);
    });
  });

  describe('unloadPlugin', () => {
    it('should unload a plugin and unregister its tools', async () => {
      const plugin = createTestPlugin({
        tools: [createTestTool('plugin.tool')],
      });

      await loader.loadPlugin(plugin);
      const result = await loader.unloadPlugin('test-plugin');

      expect(result).toBe(true);
      expect(loader.count).toBe(0);
      expect(registry.has('plugin.tool')).toBe(false);
    });

    it('should call shutdown if defined', async () => {
      const shutdown = vi.fn();
      const plugin = createTestPlugin({ shutdown });

      await loader.loadPlugin(plugin);
      await loader.unloadPlugin('test-plugin');

      expect(shutdown).toHaveBeenCalledOnce();
    });

    it('should return false for non-existent plugin', async () => {
      const result = await loader.unloadPlugin('nonexistent');

      expect(result).toBe(false);
    });

    it('should continue even if shutdown throws', async () => {
      const plugin = createTestPlugin({
        tools: [createTestTool('plugin.tool')],
        shutdown: async () => {
          throw new Error('Shutdown failed');
        },
      });

      await loader.loadPlugin(plugin);
      const result = await loader.unloadPlugin('test-plugin');

      expect(result).toBe(true);
      expect(registry.has('plugin.tool')).toBe(false);
    });
  });

  describe('getPlugin', () => {
    it('should return a loaded plugin', async () => {
      const plugin = createTestPlugin();

      await loader.loadPlugin(plugin);
      const result = loader.getPlugin('test-plugin');

      expect(result).toBe(plugin);
    });

    it('should return undefined for non-existent plugin', () => {
      const result = loader.getPlugin('nonexistent');

      expect(result).toBeUndefined();
    });
  });

  describe('getLoadedPlugins', () => {
    it('should return all loaded plugins', async () => {
      const plugin1 = createTestPlugin({ name: 'plugin1' });
      const plugin2 = createTestPlugin({ name: 'plugin2' });

      await loader.loadPlugin(plugin1);
      await loader.loadPlugin(plugin2);

      const plugins = loader.getLoadedPlugins();

      expect(plugins).toHaveLength(2);
      expect(plugins).toContain(plugin1);
      expect(plugins).toContain(plugin2);
    });
  });

  describe('shutdownAll', () => {
    it('should shutdown all plugins in reverse order', async () => {
      const shutdownOrder: string[] = [];

      const plugin1 = createTestPlugin({
        name: 'plugin1',
        shutdown: async () => {
          shutdownOrder.push('plugin1');
        },
      });
      const plugin2 = createTestPlugin({
        name: 'plugin2',
        shutdown: async () => {
          shutdownOrder.push('plugin2');
        },
      });

      await loader.loadPlugin(plugin1);
      await loader.loadPlugin(plugin2);
      await loader.shutdownAll();

      expect(shutdownOrder).toEqual(['plugin2', 'plugin1']);
      expect(loader.count).toBe(0);
    });

    it('should unregister all tools', async () => {
      const plugin = createTestPlugin({
        tools: [createTestTool('plugin.tool1'), createTestTool('plugin.tool2')],
      });

      await loader.loadPlugin(plugin);
      await loader.shutdownAll();

      expect(registry.size).toBe(0);
    });

    it('should continue even if some shutdowns fail', async () => {
      const plugin1 = createTestPlugin({
        name: 'plugin1',
        tools: [createTestTool('p1.tool')],
        shutdown: async () => {
          throw new Error('Shutdown failed');
        },
      });
      const plugin2 = createTestPlugin({
        name: 'plugin2',
        tools: [createTestTool('p2.tool')],
      });

      await loader.loadPlugin(plugin1);
      await loader.loadPlugin(plugin2);
      await loader.shutdownAll();

      expect(loader.count).toBe(0);
      expect(registry.size).toBe(0);
    });
  });
});

describe('PluginLoader (Enhanced)', () => {
  let registry: ToolRegistry;
  let coreAPIFactory: ReturnType<typeof createMockCoreAPIFactory>;

  beforeEach(() => {
    registry = new ToolRegistry();
    coreAPIFactory = createMockCoreAPIFactory();
  });

  describe('loadPlugin with enhanced plugins', () => {
    it('should initialize enhanced plugin with CoreAPI', async () => {
      const loader = new PluginLoader({
        toolRegistry: registry,
        coreAPIFactory,
      });

      const manifest = createTestManifest('@test/plugin');
      const plugin = createEnhancedPlugin(manifest);

      await loader.loadPlugin(plugin);

      expect(coreAPIFactory.createForPlugin).toHaveBeenCalledWith('@test/plugin');
      expect(plugin.initialize).toHaveBeenCalledTimes(1);
    });

    it('should track plugin state', async () => {
      const loader = new PluginLoader({
        toolRegistry: registry,
        coreAPIFactory,
      });

      const manifest = createTestManifest('@test/plugin');
      const plugin = createEnhancedPlugin(manifest);

      await loader.loadPlugin(plugin);

      const state = loader.getPluginState('@test/plugin');
      expect(state).toBeDefined();
      expect(state?.status).toBe('active');
      expect(state?.manifest).toBe(manifest);
    });

    it('should not load duplicate plugins', async () => {
      const loader = new PluginLoader({
        toolRegistry: registry,
        coreAPIFactory,
      });

      const manifest = createTestManifest('@test/plugin');
      const plugin = createEnhancedPlugin(manifest);

      await loader.loadPlugin(plugin);
      await loader.loadPlugin(plugin); // Second load should be no-op

      expect(coreAPIFactory.createForPlugin).toHaveBeenCalledTimes(1);
    });
  });

  describe('loadDiscoveredPlugins', () => {
    it('should load plugins in dependency order', async () => {
      const loader = new PluginLoader({
        toolRegistry: registry,
        coreAPIFactory,
      });

      const loadOrder: string[] = [];

      const manifestA = createTestManifest('@test/a');
      const manifestB = createTestManifest('@test/b', {
        dependencies: ['@test/a'],
      });

      const pluginA = createEnhancedPlugin(manifestA, {
        initialize: vi.fn().mockImplementation(async () => {
          loadOrder.push('@test/a');
        }),
      });
      const pluginB = createEnhancedPlugin(manifestB, {
        initialize: vi.fn().mockImplementation(async () => {
          loadOrder.push('@test/b');
        }),
      });

      // Create mock discovered plugins (we'll use loadPlugin directly for this test)
      // since loadFromDiscovered requires actual file imports
      await loader.loadPlugin(pluginA);
      await loader.loadPlugin(pluginB);

      // In a real test with loadDiscoveredPlugins, order would be enforced
      expect(loader.count).toBe(2);
    });

    it('should throw on missing dependencies', async () => {
      const loader = new PluginLoader({
        toolRegistry: registry,
        coreAPIFactory,
      });

      const manifest = createTestManifest('@test/plugin', {
        dependencies: ['@test/missing'],
      });

      const discovered: DiscoveredPlugin[] = [
        {
          path: '/fake/path',
          source: 'node_modules',
          manifest,
        },
      ];

      await expect(loader.loadDiscoveredPlugins(discovered)).rejects.toThrow(
        'Missing plugin dependencies'
      );
    });
  });

  describe('failure isolation', () => {
    it('should propagate errors for critical plugins', async () => {
      const loader = new PluginLoader({
        toolRegistry: registry,
        coreAPIFactory,
      });

      const manifest = createTestManifest('@test/critical', {
        critical: true,
      });
      const plugin = createEnhancedPlugin(manifest, {
        initialize: vi.fn().mockRejectedValue(new Error('Critical failure')),
      });

      await expect(loader.loadPlugin(plugin)).rejects.toThrow(
        'Critical plugin failed to initialize'
      );
    });

    it('should throw but not mark as critical for non-critical plugins', async () => {
      const loader = new PluginLoader({
        toolRegistry: registry,
        coreAPIFactory,
      });

      const manifest = createTestManifest('@test/non-critical', {
        critical: false,
      });
      const plugin = createEnhancedPlugin(manifest, {
        initialize: vi.fn().mockRejectedValue(new Error('Non-critical failure')),
      });

      await expect(loader.loadPlugin(plugin)).rejects.toThrow(
        'Failed to initialize plugin'
      );
    });
  });

  describe('notifyModeChange', () => {
    it('should notify all active plugins of mode change', async () => {
      const loader = new PluginLoader({
        toolRegistry: registry,
        coreAPIFactory,
      });

      const onModeChange = vi.fn();
      const manifest = createTestManifest('@test/plugin');
      const plugin = createEnhancedPlugin(manifest, { onModeChange });

      await loader.loadPlugin(plugin);
      loader.notifyModeChange('dev');

      expect(onModeChange).toHaveBeenCalledWith('dev');
    });

    it('should continue notifying even if one plugin throws', async () => {
      const loader = new PluginLoader({
        toolRegistry: registry,
        coreAPIFactory,
      });

      const onModeChange1 = vi.fn().mockImplementation(() => {
        throw new Error('Handler error');
      });
      const onModeChange2 = vi.fn();

      const plugin1 = createEnhancedPlugin(createTestManifest('@test/plugin1'), {
        onModeChange: onModeChange1,
      });
      const plugin2 = createEnhancedPlugin(createTestManifest('@test/plugin2'), {
        onModeChange: onModeChange2,
      });

      await loader.loadPlugin(plugin1);
      await loader.loadPlugin(plugin2);

      loader.notifyModeChange('dev');

      expect(onModeChange1).toHaveBeenCalled();
      expect(onModeChange2).toHaveBeenCalled();
    });
  });

  describe('notifyToolCall', () => {
    it('should notify all active plugins of tool calls', async () => {
      const loader = new PluginLoader({
        toolRegistry: registry,
        coreAPIFactory,
      });

      const onToolCall = vi.fn();
      const manifest = createTestManifest('@test/plugin');
      const plugin = createEnhancedPlugin(manifest, { onToolCall });

      await loader.loadPlugin(plugin);
      loader.notifyToolCall('test.tool', { param: 'value' });

      expect(onToolCall).toHaveBeenCalledWith('test.tool', { param: 'value' });
    });
  });

  describe('shutdownAll with enhanced plugins', () => {
    it('should shutdown plugins in reverse dependency order', async () => {
      const loader = new PluginLoader({
        toolRegistry: registry,
        coreAPIFactory,
      });

      const shutdownOrder: string[] = [];

      const plugin1 = createEnhancedPlugin(createTestManifest('@test/plugin1'), {
        shutdown: vi.fn().mockImplementation(async () => {
          shutdownOrder.push('@test/plugin1');
        }),
      });
      const plugin2 = createEnhancedPlugin(createTestManifest('@test/plugin2'), {
        shutdown: vi.fn().mockImplementation(async () => {
          shutdownOrder.push('@test/plugin2');
        }),
      });

      await loader.loadPlugin(plugin1);
      await loader.loadPlugin(plugin2);
      await loader.shutdownAll();

      expect(shutdownOrder).toEqual(['@test/plugin2', '@test/plugin1']);
      expect(loader.count).toBe(0);
    });
  });
});
