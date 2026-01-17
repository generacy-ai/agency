import { describe, it, expect } from 'vitest';
import { ModeManager } from './manager.js';
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
});
