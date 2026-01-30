/**
 * Tests for SpecKitPlugin lifecycle
 */

import { describe, it, expect, vi } from 'vitest';
import { SpecKitPlugin, createSpecKitPlugin } from '../src/plugin.js';
import { PLUGIN_MANIFEST } from '../src/manifest.js';
import { DEFAULT_CONFIG, resolveConfig } from '../src/config.js';
import type { AgencyCoreAPI, AgencyTool } from '@generacy-ai/agency';

describe('SpecKitPlugin', () => {
  const createMockCoreAPI = (): AgencyCoreAPI & { registeredTools: AgencyTool[] } => {
    const registeredTools: AgencyTool[] = [];

    return {
      registeredTools,
      registerTool: vi.fn((tool: AgencyTool) => {
        registeredTools.push(tool);
      }),
      unregisterTool: vi.fn((name: string) => {
        const index = registeredTools.findIndex((t) => t.name === name);
        if (index >= 0) {
          registeredTools.splice(index, 1);
        }
      }),
      getCurrentMode: vi.fn(() => 'coding'),
      registerMode: vi.fn(),
      onModeChange: vi.fn(() => () => {}),
      registerChannel: vi.fn(),
      sendMessage: vi.fn(),
      onMessage: vi.fn(() => () => {}),
      getConfig: vi.fn(() => undefined),
      recordEvent: vi.fn(),
      getPluginId: vi.fn(() => '@generacy-ai/agency-plugin-spec-kit'),
    };
  };

  describe('manifest', () => {
    it('should have correct id', () => {
      const plugin = new SpecKitPlugin();
      expect(plugin.manifest.id).toBe('@generacy-ai/agency-plugin-spec-kit');
    });

    it('should have empty tools array (skeleton)', () => {
      const plugin = new SpecKitPlugin();
      expect(plugin.manifest.tools).toHaveLength(0);
    });

    it('should declare correct modes', () => {
      const plugin = new SpecKitPlugin();
      expect(plugin.manifest.modes).toContain('research');
      expect(plugin.manifest.modes).toContain('coding');
    });

    it('should match PLUGIN_MANIFEST constant', () => {
      const plugin = new SpecKitPlugin();
      expect(plugin.manifest).toEqual(PLUGIN_MANIFEST);
    });
  });

  describe('initialize', () => {
    it('should initialize without errors', async () => {
      const plugin = new SpecKitPlugin();
      const core = createMockCoreAPI();

      await expect(plugin.initialize(core)).resolves.toBeUndefined();
    });

    it('should register no tools (skeleton)', async () => {
      const plugin = new SpecKitPlugin();
      const core = createMockCoreAPI();

      await plugin.initialize(core);

      expect(core.registerTool).toHaveBeenCalledTimes(0);
      expect(core.registeredTools).toHaveLength(0);
    });

    it('should use config from core.getConfig', async () => {
      const plugin = new SpecKitPlugin();
      const core = createMockCoreAPI();
      core.getConfig = vi.fn(() => ({
        specDirectory: 'custom-specs',
      }));

      await plugin.initialize(core);

      expect(core.getConfig).toHaveBeenCalledWith('plugins.spec-kit');
    });
  });

  describe('shutdown', () => {
    it('should shutdown without errors', async () => {
      const plugin = new SpecKitPlugin();
      const core = createMockCoreAPI();

      await plugin.initialize(core);
      await expect(plugin.shutdown()).resolves.toBeUndefined();
    });

    it('should unregister all tools (none in skeleton)', async () => {
      const plugin = new SpecKitPlugin();
      const core = createMockCoreAPI();

      await plugin.initialize(core);
      await plugin.shutdown();

      expect(core.unregisterTool).toHaveBeenCalledTimes(0);
    });
  });

  describe('createSpecKitPlugin factory', () => {
    it('should create a SpecKitPlugin instance', () => {
      const plugin = createSpecKitPlugin();
      expect(plugin).toBeInstanceOf(SpecKitPlugin);
    });
  });
});

describe('config', () => {
  describe('DEFAULT_CONFIG', () => {
    it('should have specDirectory', () => {
      expect(DEFAULT_CONFIG.specDirectory).toBe('specs');
    });

    it('should have templateDirectory', () => {
      expect(DEFAULT_CONFIG.templateDirectory).toBe('.spec-templates');
    });
  });

  describe('resolveConfig', () => {
    it('should return defaults when no user config', () => {
      const config = resolveConfig();
      expect(config).toEqual(DEFAULT_CONFIG);
    });

    it('should merge user config with defaults', () => {
      const config = resolveConfig({ specDirectory: 'custom-specs' });
      expect(config.specDirectory).toBe('custom-specs');
      expect(config.templateDirectory).toBe('.spec-templates');
    });

    it('should override all values when provided', () => {
      const config = resolveConfig({
        specDirectory: 'my-specs',
        templateDirectory: 'my-templates',
      });
      expect(config.specDirectory).toBe('my-specs');
      expect(config.templateDirectory).toBe('my-templates');
    });
  });
});
