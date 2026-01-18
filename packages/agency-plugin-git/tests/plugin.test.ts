/**
 * Tests for GitPlugin lifecycle
 */

import { describe, it, expect, vi } from 'vitest';
import { GitPlugin, createGitPlugin } from '../src/plugin.js';
import type { AgencyCoreAPI, AgencyTool } from '@generacy-ai/agency';

describe('GitPlugin', () => {
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
      getPluginId: vi.fn(() => '@generacy-ai/agency-plugin-git'),
    };
  };

  describe('manifest', () => {
    it('should have correct id', () => {
      const plugin = new GitPlugin();
      expect(plugin.manifest.id).toBe('@generacy-ai/agency-plugin-git');
    });

    it('should list all 12 tools', () => {
      const plugin = new GitPlugin();
      expect(plugin.manifest.tools).toHaveLength(12);
      expect(plugin.manifest.tools).toContain('source_control.status');
      expect(plugin.manifest.tools).toContain('source_control.commit');
      expect(plugin.manifest.tools).toContain('source_control.push');
    });

    it('should declare correct modes', () => {
      const plugin = new GitPlugin();
      expect(plugin.manifest.modes).toContain('research');
      expect(plugin.manifest.modes).toContain('coding');
      expect(plugin.manifest.modes).toContain('review');
    });
  });

  describe('initialize', () => {
    it('should register all tools', async () => {
      const plugin = new GitPlugin();
      const core = createMockCoreAPI();

      await plugin.initialize(core);

      expect(core.registerTool).toHaveBeenCalledTimes(12);
      expect(core.registeredTools).toHaveLength(12);
    });

    it('should register tools with correct names', async () => {
      const plugin = new GitPlugin();
      const core = createMockCoreAPI();

      await plugin.initialize(core);

      const toolNames = core.registeredTools.map((t) => t.name);
      expect(toolNames).toContain('source_control.status');
      expect(toolNames).toContain('source_control.diff');
      expect(toolNames).toContain('source_control.log');
      expect(toolNames).toContain('source_control.blame');
      expect(toolNames).toContain('source_control.commit');
      expect(toolNames).toContain('source_control.push');
      expect(toolNames).toContain('source_control.pull');
      expect(toolNames).toContain('source_control.checkout');
      expect(toolNames).toContain('source_control.branch');
      expect(toolNames).toContain('source_control.stash');
      expect(toolNames).toContain('source_control.merge');
      expect(toolNames).toContain('source_control.rebase');
    });

    it('should use config from core.getConfig', async () => {
      const plugin = new GitPlugin();
      const core = createMockCoreAPI();
      core.getConfig = vi.fn(() => ({
        defaultRemote: 'upstream',
        signCommits: true,
      }));

      await plugin.initialize(core);

      expect(core.getConfig).toHaveBeenCalledWith('plugins.git');
    });
  });

  describe('shutdown', () => {
    it('should unregister all tools', async () => {
      const plugin = new GitPlugin();
      const core = createMockCoreAPI();

      await plugin.initialize(core);
      await plugin.shutdown();

      expect(core.unregisterTool).toHaveBeenCalledTimes(12);
      expect(core.registeredTools).toHaveLength(0);
    });
  });

  describe('createGitPlugin factory', () => {
    it('should create a GitPlugin instance', () => {
      const plugin = createGitPlugin();
      expect(plugin).toBeInstanceOf(GitPlugin);
    });
  });
});
