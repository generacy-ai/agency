import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PluginLoader } from './loader.js';
import { ToolRegistry } from '../tools/index.js';
import type { AgencyPlugin } from './types.js';
import type { AgencyTool, ToolResult } from '../tools/types.js';
import { AgencyError, ErrorCodes } from '../errors/index.js';

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

// Helper to create a test plugin
function createTestPlugin(overrides: Partial<AgencyPlugin> = {}): AgencyPlugin {
  return {
    name: 'test-plugin',
    version: '1.0.0',
    tools: [createTestTool('test.tool')],
    ...overrides,
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
