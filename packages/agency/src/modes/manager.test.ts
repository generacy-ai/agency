import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ModeManager, ModeErrorCodes } from './manager.js';
import { AgencyError, ErrorCodes } from '../errors/index.js';
import type { ModeConfig } from './types.js';

describe('ModeManager', () => {
  describe('constructor', () => {
    it('should use defaultMode if provided and valid', () => {
      const manager = new ModeManager(
        { dev: ['*'], prod: ['*'] },
        'prod'
      );

      expect(manager.getMode()).toBe('prod');
    });

    it('should fall back to "default" mode if defaultMode is invalid', () => {
      const manager = new ModeManager(
        { default: ['*'], dev: ['*'] },
        'nonexistent'
      );

      expect(manager.getMode()).toBe('default');
    });

    it('should use first available mode if no "default" mode exists', () => {
      const manager = new ModeManager(
        { alpha: ['*'], beta: ['*'] },
        'nonexistent'
      );

      // Should use first available mode
      expect(['alpha', 'beta']).toContain(manager.getMode());
    });
  });

  describe('getMode/setMode', () => {
    it('should get the current mode', () => {
      const manager = new ModeManager({ default: ['*'] });

      expect(manager.getMode()).toBe('default');
    });

    it('should set a valid mode', () => {
      const manager = new ModeManager({ default: ['*'], dev: ['*'] });

      manager.setMode('dev');

      expect(manager.getMode()).toBe('dev');
    });

    it('should throw when setting invalid mode', () => {
      const manager = new ModeManager({ default: ['*'] });

      expect(() => manager.setMode('invalid')).toThrow(AgencyError);
      expect(() => manager.setMode('invalid')).toThrow('Mode not found');
    });

    it('should include available modes in error context', () => {
      const manager = new ModeManager({ dev: ['*'], prod: ['*'] });

      try {
        manager.setMode('invalid');
      } catch (error) {
        expect(error).toBeInstanceOf(AgencyError);
        expect((error as AgencyError).context?.availableModes).toEqual(['dev', 'prod']);
      }
    });
  });

  describe('hasMode', () => {
    it('should return true for existing mode', () => {
      const manager = new ModeManager({ default: ['*'], dev: ['*'] });

      expect(manager.hasMode('default')).toBe(true);
      expect(manager.hasMode('dev')).toBe(true);
    });

    it('should return false for non-existing mode', () => {
      const manager = new ModeManager({ default: ['*'] });

      expect(manager.hasMode('nonexistent')).toBe(false);
    });
  });

  describe('getAvailableModes', () => {
    it('should return all available modes', () => {
      const manager = new ModeManager({
        dev: ['*'],
        staging: ['*'],
        prod: ['*'],
      });

      const modes = manager.getAvailableModes();

      expect(modes.sort()).toEqual(['dev', 'prod', 'staging']);
    });
  });

  describe('registerMode', () => {
    let manager: ModeManager;

    beforeEach(() => {
      manager = new ModeManager({ default: ['*'] });
    });

    it('should register a new mode', () => {
      manager.registerMode('custom');

      expect(manager.hasMode('custom')).toBe(true);
      expect(manager.getAvailableModes()).toContain('custom');
    });

    it('should register mode with custom patterns', () => {
      manager.registerMode('custom', ['namespace.*', 'tool.specific']);

      const patterns = manager.getModePatterns('custom');
      expect(patterns).toEqual(['namespace.*', 'tool.specific']);
    });

    it('should register mode with plugin ID', () => {
      manager.registerMode('plugin-mode', ['*'], '@test/plugin');

      const pluginModes = manager.getModesByPlugin('@test/plugin');
      expect(pluginModes).toContain('plugin-mode');
    });

    it('should throw when registering duplicate mode', () => {
      manager.registerMode('custom');

      expect(() => manager.registerMode('custom')).toThrow(AgencyError);
    });

    it('should allow setting registered mode', () => {
      manager.registerMode('custom');
      manager.setMode('custom');

      expect(manager.getMode()).toBe('custom');
    });
  });

  describe('unregisterMode', () => {
    let manager: ModeManager;

    beforeEach(() => {
      manager = new ModeManager({ default: ['*'], dev: ['*'] });
    });

    it('should unregister a mode', () => {
      manager.registerMode('custom');

      const result = manager.unregisterMode('custom');

      expect(result).toBe(true);
      expect(manager.hasMode('custom')).toBe(false);
    });

    it('should return false for non-existent mode', () => {
      const result = manager.unregisterMode('nonexistent');
      expect(result).toBe(false);
    });

    it('should throw when unregistering current mode', () => {
      manager.setMode('dev');

      expect(() => manager.unregisterMode('dev')).toThrow(AgencyError);
    });
  });

  describe('unregisterModesByPlugin', () => {
    it('should unregister all modes from a plugin', () => {
      const manager = new ModeManager({ default: ['*'] });
      manager.registerMode('mode-a', ['*'], '@test/plugin');
      manager.registerMode('mode-b', ['*'], '@test/plugin');
      manager.registerMode('mode-c', ['*'], '@other/plugin');

      const count = manager.unregisterModesByPlugin('@test/plugin');

      expect(count).toBe(2);
      expect(manager.hasMode('mode-a')).toBe(false);
      expect(manager.hasMode('mode-b')).toBe(false);
      expect(manager.hasMode('mode-c')).toBe(true);
    });

    it('should not unregister current mode', () => {
      const manager = new ModeManager({ default: ['*'] });
      manager.registerMode('current-mode', ['*'], '@test/plugin');
      manager.setMode('current-mode');

      const count = manager.unregisterModesByPlugin('@test/plugin');

      expect(count).toBe(0);
      expect(manager.hasMode('current-mode')).toBe(true);
    });
  });

  describe('getModePatterns', () => {
    it('should return patterns for existing mode', () => {
      const manager = new ModeManager({ dev: ['namespace.*', 'tool.test'] });

      const patterns = manager.getModePatterns('dev');

      expect(patterns).toEqual(['namespace.*', 'tool.test']);
    });

    it('should return undefined for non-existent mode', () => {
      const manager = new ModeManager({ default: ['*'] });

      const patterns = manager.getModePatterns('nonexistent');

      expect(patterns).toBeUndefined();
    });
  });

  describe('onModeChange', () => {
    let manager: ModeManager;

    beforeEach(() => {
      manager = new ModeManager({ default: ['*'], dev: ['*'], prod: ['*'] });
    });

    it('should call callback when mode changes', () => {
      const callback = vi.fn();
      manager.onModeChange(callback);

      manager.setMode('dev');

      expect(callback).toHaveBeenCalledWith('dev');
    });

    it('should not call callback when setting same mode', () => {
      const callback = vi.fn();
      manager.onModeChange(callback);

      manager.setMode('default');

      expect(callback).not.toHaveBeenCalled();
    });

    it('should call multiple callbacks', () => {
      const callback1 = vi.fn();
      const callback2 = vi.fn();
      manager.onModeChange(callback1);
      manager.onModeChange(callback2);

      manager.setMode('dev');

      expect(callback1).toHaveBeenCalledWith('dev');
      expect(callback2).toHaveBeenCalledWith('dev');
    });

    it('should return unsubscribe function', () => {
      const callback = vi.fn();
      const unsubscribe = manager.onModeChange(callback);

      unsubscribe();
      manager.setMode('dev');

      expect(callback).not.toHaveBeenCalled();
    });

    it('should continue calling other callbacks if one throws', () => {
      const errorCallback = vi.fn().mockImplementation(() => {
        throw new Error('Callback error');
      });
      const successCallback = vi.fn();

      manager.onModeChange(errorCallback);
      manager.onModeChange(successCallback);

      manager.setMode('dev');

      expect(errorCallback).toHaveBeenCalled();
      expect(successCallback).toHaveBeenCalled();
    });

    it('should track callback count', () => {
      expect(manager.getCallbackCount()).toBe(0);

      const unsubscribe1 = manager.onModeChange(() => {});
      const unsubscribe2 = manager.onModeChange(() => {});

      expect(manager.getCallbackCount()).toBe(2);

      unsubscribe1();
      expect(manager.getCallbackCount()).toBe(1);

      unsubscribe2();
      expect(manager.getCallbackCount()).toBe(0);
    });
  });

  describe('ModeConfig constructor', () => {
    const baseModeConfig: ModeConfig = {
      modes: {
        research: {
          name: 'research',
          description: 'Research mode',
          includes: ['humancy.*', 'web.*'],
          excludes: [],
        },
        coding: {
          name: 'coding',
          description: 'Coding mode',
          extends: 'research',
          includes: ['source_control.*', 'build.*'],
          excludes: ['build.deploy'],
        },
      },
      defaultMode: 'coding',
    };

    it('should accept ModeConfig and use defaultMode', () => {
      const manager = new ModeManager(baseModeConfig);

      expect(manager.getMode()).toBe('coding');
      expect(manager.hasMode('research')).toBe(true);
      expect(manager.hasMode('coding')).toBe(true);
    });

    it('should fall back to "coding" when defaultMode not specified', () => {
      const config: ModeConfig = {
        modes: {
          coding: { name: 'coding', includes: ['*'] },
        },
      };

      const manager = new ModeManager(config);
      expect(manager.getMode()).toBe('coding');
    });

    it('should fall back to "default" if specified defaultMode not found', () => {
      const config: ModeConfig = {
        modes: {
          default: { name: 'default', includes: ['*'] },
          other: { name: 'other', includes: ['*'] },
        },
        defaultMode: 'nonexistent',
      };

      const manager = new ModeManager(config);
      expect(manager.getMode()).toBe('default');
    });

    it('should use first available mode when neither defaultMode nor "default" exists', () => {
      const config: ModeConfig = {
        modes: {
          alpha: { name: 'alpha', includes: ['*'] },
        },
        defaultMode: 'nonexistent',
      };

      const manager = new ModeManager(config);
      expect(manager.getMode()).toBe('alpha');
    });

    it('should resolve inheritance correctly', () => {
      const manager = new ModeManager(baseModeConfig);
      const resolved = manager.getResolvedMode('coding');

      expect(resolved).toBeDefined();
      expect(resolved!.includes).toContain('humancy.*');
      expect(resolved!.includes).toContain('source_control.*');
      expect(resolved!.excludes).toContain('build.deploy');
      expect(resolved!.inheritanceChain).toEqual(['coding', 'research']);
    });

    it('should make getModePatterns return includes from resolved mode', () => {
      const manager = new ModeManager(baseModeConfig);
      const patterns = manager.getModePatterns('coding');

      // Should include patterns from both coding and research
      expect(patterns).toContain('humancy.*');
      expect(patterns).toContain('source_control.*');
    });
  });

  describe('getResolvedMode', () => {
    it('should return undefined for legacy config', () => {
      const manager = new ModeManager({ default: ['*'] });

      expect(manager.getResolvedMode('default')).toBeUndefined();
    });

    it('should return undefined for non-existent mode', () => {
      const config: ModeConfig = {
        modes: {
          coding: { name: 'coding', includes: ['*'] },
        },
      };
      const manager = new ModeManager(config);

      expect(manager.getResolvedMode('nonexistent')).toBeUndefined();
    });

    it('should return resolved mode with all properties', () => {
      const config: ModeConfig = {
        modes: {
          base: { name: 'base', description: 'Base mode', includes: ['a.*'] },
          derived: { name: 'derived', extends: 'base', includes: ['b.*'], excludes: ['b.internal'] },
        },
      };
      const manager = new ModeManager(config);
      const resolved = manager.getResolvedMode('derived');

      expect(resolved).toEqual({
        name: 'derived',
        description: 'Base mode', // Inherited from parent
        includes: ['a.*', 'b.*'],
        excludes: ['b.internal'],
        inheritanceChain: ['derived', 'base'],
      });
    });
  });

  describe('getToolPatterns', () => {
    it('should return includes and empty excludes for legacy config', () => {
      const manager = new ModeManager({ dev: ['namespace.*', 'tool.*'] });
      const patterns = manager.getToolPatterns('dev');

      expect(patterns).toEqual({
        includes: ['namespace.*', 'tool.*'],
        excludes: [],
      });
    });

    it('should return undefined for non-existent mode', () => {
      const manager = new ModeManager({ default: ['*'] });

      expect(manager.getToolPatterns('nonexistent')).toBeUndefined();
    });

    it('should return includes and excludes for ModeConfig', () => {
      const config: ModeConfig = {
        modes: {
          coding: {
            name: 'coding',
            includes: ['source.*'],
            excludes: ['source.internal'],
          },
        },
      };
      const manager = new ModeManager(config);
      const patterns = manager.getToolPatterns('coding');

      expect(patterns).toEqual({
        includes: ['source.*'],
        excludes: ['source.internal'],
      });
    });

    it('should include inherited patterns', () => {
      const config: ModeConfig = {
        modes: {
          base: { name: 'base', includes: ['base.*'], excludes: ['base.secret'] },
          derived: { name: 'derived', extends: 'base', includes: ['derived.*'] },
        },
      };
      const manager = new ModeManager(config);
      const patterns = manager.getToolPatterns('derived');

      expect(patterns).toEqual({
        includes: ['base.*', 'derived.*'],
        excludes: ['base.secret'],
      });
    });
  });

  describe('isToolVisible', () => {
    it('should return true for matching tool in legacy config', () => {
      const manager = new ModeManager({ dev: ['source.*', 'build.*'] });
      manager.setMode('dev');

      expect(manager.isToolVisible('source.status')).toBe(true);
      expect(manager.isToolVisible('build.compile')).toBe(true);
      expect(manager.isToolVisible('test.run')).toBe(false);
    });

    it('should use current mode by default', () => {
      const manager = new ModeManager({
        dev: ['dev.*'],
        prod: ['prod.*'],
      });
      manager.setMode('dev');

      expect(manager.isToolVisible('dev.tool')).toBe(true);
      expect(manager.isToolVisible('prod.tool')).toBe(false);
    });

    it('should allow specifying a different mode', () => {
      const manager = new ModeManager({
        dev: ['dev.*'],
        prod: ['prod.*'],
      });
      manager.setMode('dev');

      expect(manager.isToolVisible('prod.tool', 'prod')).toBe(true);
      expect(manager.isToolVisible('dev.tool', 'prod')).toBe(false);
    });

    it('should respect excludes in ModeConfig', () => {
      const config: ModeConfig = {
        modes: {
          coding: {
            name: 'coding',
            includes: ['source.*'],
            excludes: ['source.internal'],
          },
        },
      };
      const manager = new ModeManager(config);

      expect(manager.isToolVisible('source.status')).toBe(true);
      expect(manager.isToolVisible('source.internal')).toBe(false);
    });

    it('should return false for non-existent mode', () => {
      const manager = new ModeManager({ default: ['*'] });

      expect(manager.isToolVisible('any.tool', 'nonexistent')).toBe(false);
    });
  });

  describe('setModeConfig', () => {
    it('should replace existing configuration', () => {
      const manager = new ModeManager({ old: ['*'] });

      const newConfig: ModeConfig = {
        modes: {
          new: { name: 'new', includes: ['new.*'] },
        },
      };
      manager.setModeConfig(newConfig);

      expect(manager.hasMode('new')).toBe(true);
      expect(manager.hasMode('old')).toBe(false);
    });

    it('should keep current mode if it exists in new config', () => {
      const config: ModeConfig = {
        modes: {
          shared: { name: 'shared', includes: ['*'] },
          old: { name: 'old', includes: ['*'] },
        },
        defaultMode: 'shared',
      };
      const manager = new ModeManager(config);
      manager.setMode('shared');

      const newConfig: ModeConfig = {
        modes: {
          shared: { name: 'shared', includes: ['shared.*'] },
          different: { name: 'different', includes: ['*'] },
        },
        defaultMode: 'different',
      };
      manager.setModeConfig(newConfig);

      expect(manager.getMode()).toBe('shared');
    });

    it('should switch to defaultMode if current mode not in new config', () => {
      const manager = new ModeManager({ old: ['*'] });

      const newConfig: ModeConfig = {
        modes: {
          new: { name: 'new', includes: ['*'] },
        },
        defaultMode: 'new',
      };
      manager.setModeConfig(newConfig);

      expect(manager.getMode()).toBe('new');
    });

    it('should notify callbacks when mode changes', () => {
      const manager = new ModeManager({ old: ['*'] });
      const callback = vi.fn();
      manager.onModeChange(callback);

      const newConfig: ModeConfig = {
        modes: {
          new: { name: 'new', includes: ['*'] },
        },
      };
      manager.setModeConfig(newConfig);

      expect(callback).toHaveBeenCalledWith('new');
    });

    it('should not notify callbacks when mode stays the same', () => {
      const config: ModeConfig = {
        modes: {
          shared: { name: 'shared', includes: ['*'] },
        },
        defaultMode: 'shared',
      };
      const manager = new ModeManager(config);
      const callback = vi.fn();
      manager.onModeChange(callback);

      const newConfig: ModeConfig = {
        modes: {
          shared: { name: 'shared', includes: ['new.*'] },
        },
        defaultMode: 'shared',
      };
      manager.setModeConfig(newConfig);

      expect(callback).not.toHaveBeenCalled();
    });

    it('should throw for empty config', () => {
      const manager = new ModeManager({ default: ['*'] });

      const emptyConfig: ModeConfig = {
        modes: {},
      };

      expect(() => manager.setModeConfig(emptyConfig)).toThrow(AgencyError);
      expect(() => manager.setModeConfig(emptyConfig)).toThrow(
        'Mode configuration must contain at least one mode'
      );
    });

    it('should resolve inheritance in new config', () => {
      const manager = new ModeManager({ old: ['*'] });

      const newConfig: ModeConfig = {
        modes: {
          base: { name: 'base', includes: ['base.*'] },
          derived: { name: 'derived', extends: 'base', includes: ['derived.*'] },
        },
        defaultMode: 'derived',
      };
      manager.setModeConfig(newConfig);

      const resolved = manager.getResolvedMode('derived');
      expect(resolved?.includes).toContain('base.*');
      expect(resolved?.includes).toContain('derived.*');
    });

    it('should update getModeConfig return value', () => {
      const manager = new ModeManager({ old: ['*'] });
      expect(manager.getModeConfig()).toBeUndefined();

      const newConfig: ModeConfig = {
        modes: {
          new: { name: 'new', includes: ['*'] },
        },
      };
      manager.setModeConfig(newConfig);

      expect(manager.getModeConfig()).toBe(newConfig);
    });
  });

  describe('getModeConfig', () => {
    it('should return undefined for legacy config', () => {
      const manager = new ModeManager({ default: ['*'] });

      expect(manager.getModeConfig()).toBeUndefined();
    });

    it('should return the ModeConfig for ModeConfig constructor', () => {
      const config: ModeConfig = {
        modes: {
          coding: { name: 'coding', includes: ['*'] },
        },
      };
      const manager = new ModeManager(config);

      expect(manager.getModeConfig()).toBe(config);
    });
  });
});
