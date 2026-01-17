import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ModeManager, ModeErrorCodes } from './manager.js';
import { AgencyError, ErrorCodes } from '../errors/index.js';

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
});
