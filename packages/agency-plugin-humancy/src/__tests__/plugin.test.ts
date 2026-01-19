/**
 * Tests for HumancyPlugin lifecycle
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { HumancyPlugin, createHumancyPlugin, manifest } from '../index.js';
import { ConnectionMode } from '../connection/index.js';
import type { AgencyCoreAPI, AgencyTool } from '@generacy-ai/agency';

describe('HumancyPlugin', () => {
  let plugin: HumancyPlugin;
  let mockCoreAPI: AgencyCoreAPI;
  let registeredTools: AgencyTool[];

  beforeEach(() => {
    registeredTools = [];
    mockCoreAPI = {
      getConfig: vi.fn().mockReturnValue(undefined),
      registerTool: vi.fn((tool: AgencyTool) => {
        registeredTools.push(tool);
      }),
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

    plugin = new HumancyPlugin();
  });

  describe('createHumancyPlugin', () => {
    it('should create a new plugin instance', () => {
      const instance = createHumancyPlugin();
      expect(instance).toBeInstanceOf(HumancyPlugin);
    });
  });

  describe('manifest', () => {
    it('should have correct plugin id', () => {
      expect(plugin.manifest.id).toBe('@generacy-ai/agency-plugin-humancy');
    });

    it('should list all 6 tools', () => {
      expect(plugin.manifest.tools).toHaveLength(6);
      expect(plugin.manifest.tools).toContain('humancy.ask_question');
      expect(plugin.manifest.tools).toContain('humancy.request_review');
      expect(plugin.manifest.tools).toContain('humancy.request_decision');
      expect(plugin.manifest.tools).toContain('humancy.notify');
      expect(plugin.manifest.tools).toContain('humancy.get_decision_outcome');
      expect(plugin.manifest.tools).toContain('humancy.report_decision_result');
    });

    it('should list the humancy channel', () => {
      expect(plugin.manifest.channels).toContain('agency.humancy');
    });

    it('should not be marked as critical', () => {
      expect(plugin.manifest.critical).toBe(false);
    });
  });

  describe('initialize', () => {
    it('should register all 6 tools', async () => {
      await plugin.initialize(mockCoreAPI);

      expect(registeredTools).toHaveLength(6);
      expect(registeredTools.map((t) => t.name)).toEqual([
        'humancy.ask_question',
        'humancy.request_review',
        'humancy.request_decision',
        'humancy.notify',
        'humancy.get_decision_outcome',
        'humancy.report_decision_result',
      ]);
    });

    it('should initialize connection detector', async () => {
      await plugin.initialize(mockCoreAPI);

      const detector = plugin.getDetector();
      expect(detector).toBeDefined();
      // Default mode should be OFFLINE when no config
      expect(detector.getMode()).toBe(ConnectionMode.OFFLINE);
    });

    it('should subscribe to mode changes', async () => {
      await plugin.initialize(mockCoreAPI);

      expect(mockCoreAPI.onModeChange).toHaveBeenCalled();
    });
  });

  describe('shutdown', () => {
    it('should unregister all tools', async () => {
      await plugin.initialize(mockCoreAPI);
      await plugin.shutdown();

      expect(mockCoreAPI.unregisterTool).toHaveBeenCalledTimes(6);
      expect(mockCoreAPI.unregisterTool).toHaveBeenCalledWith('humancy.ask_question');
      expect(mockCoreAPI.unregisterTool).toHaveBeenCalledWith('humancy.request_review');
      expect(mockCoreAPI.unregisterTool).toHaveBeenCalledWith('humancy.request_decision');
      expect(mockCoreAPI.unregisterTool).toHaveBeenCalledWith('humancy.notify');
      expect(mockCoreAPI.unregisterTool).toHaveBeenCalledWith('humancy.get_decision_outcome');
      expect(mockCoreAPI.unregisterTool).toHaveBeenCalledWith('humancy.report_decision_result');
    });

    it('should handle errors during shutdown gracefully', async () => {
      vi.mocked(mockCoreAPI.unregisterTool).mockImplementation(() => {
        throw new Error('Unregister failed');
      });

      await plugin.initialize(mockCoreAPI);

      // Should not throw
      await expect(plugin.shutdown()).resolves.not.toThrow();
    });
  });

  describe('tool registration', () => {
    it('should register tools with correct namespace', async () => {
      await plugin.initialize(mockCoreAPI);

      for (const tool of registeredTools) {
        expect(tool.namespace).toBe('humancy');
      }
    });

    it('should register tools with terse output pattern', async () => {
      await plugin.initialize(mockCoreAPI);

      for (const tool of registeredTools) {
        expect(tool.outputPattern).toBe('terse');
      }
    });
  });
});
