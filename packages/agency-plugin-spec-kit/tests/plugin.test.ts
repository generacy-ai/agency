/**
 * Tests for SpecKitPlugin lifecycle
 */

import { describe, it, expect, vi } from 'vitest';
import { SpecKitPlugin, createSpecKitPlugin } from '../src/plugin.js';
import { manifest, PLUGIN_MANIFEST } from '../src/manifest.js';
import { DEFAULT_CONFIG, resolveConfig, parseConfig, SpecKitConfigSchema } from '../src/config.js';
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

    it('should have correct name', () => {
      const plugin = new SpecKitPlugin();
      expect(plugin.manifest.name).toBe('Spec Kit');
    });

    it('should have correct version', () => {
      const plugin = new SpecKitPlugin();
      expect(plugin.manifest.version).toBe('0.0.1');
    });

    it('should have declared tools list', () => {
      const plugin = new SpecKitPlugin();
      expect(plugin.manifest.tools).toContain('spec_kit.git_ops');
      expect(plugin.manifest.tools).toContain('spec_kit.create_feature');
      expect(plugin.manifest.tools).toContain('spec_kit.manage_clarifications');
      expect(plugin.manifest.tools).toHaveLength(11);
    });

    it('should depend on humancy plugin', () => {
      const plugin = new SpecKitPlugin();
      expect(plugin.manifest.dependencies).toContain('@generacy-ai/agency-plugin-humancy');
    });

    it('should declare correct modes', () => {
      const plugin = new SpecKitPlugin();
      expect(plugin.manifest.modes).toContain('research');
      expect(plugin.manifest.modes).toContain('coding');
    });

    it('should match manifest constant', () => {
      const plugin = new SpecKitPlugin();
      expect(plugin.manifest).toEqual(manifest);
    });

    it('should match PLUGIN_MANIFEST constant (legacy)', () => {
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

    it('should register tools on initialize', async () => {
      const plugin = new SpecKitPlugin();
      const core = createMockCoreAPI();

      await plugin.initialize(core);

// Nine tools registered: spec_kit.get_paths, spec_kit.get_ticket, spec_kit.create_ticket, spec_kit.update_ticket, spec_kit.check_prereqs, spec_kit.manage_clarifications, spec_kit.copy_template, spec_kit.git_ops, and spec_kit.create_feature
      expect(core.registerTool).toHaveBeenCalledTimes(9);
      expect(core.registeredTools).toHaveLength(9);
      const toolNames = core.registeredTools.map((t) => t.name);
      expect(toolNames).toContain('spec_kit.get_paths');
      expect(toolNames).toContain('spec_kit.get_ticket');
      expect(toolNames).toContain('spec_kit.create_ticket');
      expect(toolNames).toContain('spec_kit.update_ticket');
      expect(toolNames).toContain('spec_kit.check_prereqs');
      expect(toolNames).toContain('spec_kit.manage_clarifications');
      expect(toolNames).toContain('spec_kit.copy_template');
      expect(toolNames).toContain('spec_kit.git_ops');
      expect(toolNames).toContain('spec_kit.create_feature');
    });

    it('should use config from core.getConfig', async () => {
      const plugin = new SpecKitPlugin();
      const core = createMockCoreAPI();
      core.getConfig = vi.fn(() => ({
        paths: { specs: 'custom-specs' },
      }));

      await plugin.initialize(core);

      expect(core.getConfig).toHaveBeenCalledWith('plugins.speckit');
    });

    it('should expose parsed config via getConfig', async () => {
      const plugin = new SpecKitPlugin();
      const core = createMockCoreAPI();
      core.getConfig = vi.fn(() => ({
        paths: { specs: 'custom-specs' },
      }));

      await plugin.initialize(core);
      const config = plugin.getConfig();

      expect(config).toBeDefined();
      expect(config!.paths.specs).toBe('custom-specs');
      expect(config!.paths.templates).toBe('.specify/templates'); // default
    });
  });

  describe('shutdown', () => {
    it('should shutdown without errors', async () => {
      const plugin = new SpecKitPlugin();
      const core = createMockCoreAPI();

      await plugin.initialize(core);
      await expect(plugin.shutdown()).resolves.toBeUndefined();
    });

    it('should attempt to unregister declared tools', async () => {
      const plugin = new SpecKitPlugin();
      const core = createMockCoreAPI();

      await plugin.initialize(core);
      await plugin.shutdown();

      // Should attempt to unregister all 11 declared tools
      expect(core.unregisterTool).toHaveBeenCalledTimes(11);
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
  describe('DEFAULT_CONFIG (Zod schema)', () => {
    it('should have paths.specs default', () => {
      expect(DEFAULT_CONFIG.paths.specs).toBe('specs');
    });

    it('should have paths.templates default', () => {
      expect(DEFAULT_CONFIG.paths.templates).toBe('.specify/templates');
    });

    it('should have branches defaults', () => {
      expect(DEFAULT_CONFIG.branches.pattern).toBe('{paddedNumber}-{slug}');
      expect(DEFAULT_CONFIG.branches.numberPadding).toBe(3);
      expect(DEFAULT_CONFIG.branches.maxSlugWords).toBe(4);
    });

    it('should have backlog.provider default', () => {
      expect(DEFAULT_CONFIG.backlog.provider).toBe('github');
    });
  });

  describe('parseConfig', () => {
    it('should return defaults when no config provided', () => {
      const config = parseConfig();
      expect(config).toEqual(DEFAULT_CONFIG);
    });

    it('should merge partial config with defaults', () => {
      const config = parseConfig({
        paths: { specs: 'features' },
      });
      expect(config.paths.specs).toBe('features');
      expect(config.paths.templates).toBe('.specify/templates'); // default
    });

    it('should parse backlog provider config', () => {
      const config = parseConfig({
        backlog: {
          provider: 'jira',
          jira: {
            baseUrl: 'https://jira.example.com',
            projectKey: 'PROJ',
          },
        },
      });
      expect(config.backlog.provider).toBe('jira');
      expect(config.backlog.jira).toEqual({
        baseUrl: 'https://jira.example.com',
        projectKey: 'PROJ',
      });
    });
  });

  describe('resolveConfig (legacy)', () => {
    it('should return legacy format with defaults', () => {
      const config = resolveConfig();
      expect(config.specDirectory).toBe('specs');
      expect(config.templateDirectory).toBe('.specify/templates');
    });

    it('should merge user config', () => {
      const config = resolveConfig({ specDirectory: 'custom-specs' });
      expect(config.specDirectory).toBe('custom-specs');
      expect(config.templateDirectory).toBe('.specify/templates');
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
