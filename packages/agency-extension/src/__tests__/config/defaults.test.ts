import { describe, it, expect } from 'vitest';
import {
  DEFAULT_CONFIG_VERSION,
  DEFAULT_CONFIG_FILENAME,
  DEFAULT_CONFIG_DIR,
  DEFAULT_CONFIG_PATH,
  createDefaultConfig,
  isCompatibleVersion,
} from '../../config/defaults';
import { AgencyConfigSchema } from '../../config/ConfigSchema';

describe('defaults', () => {
  describe('constants', () => {
    it('should have valid version format', () => {
      expect(DEFAULT_CONFIG_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
    });

    it('should have correct filename', () => {
      expect(DEFAULT_CONFIG_FILENAME).toBe('agency.config.json');
    });

    it('should have correct directory', () => {
      expect(DEFAULT_CONFIG_DIR).toBe('.agency');
    });

    it('should have correct full path', () => {
      expect(DEFAULT_CONFIG_PATH).toBe('.agency/agency.config.json');
    });
  });

  describe('createDefaultConfig', () => {
    it('should return a valid AgencyConfig', () => {
      const config = createDefaultConfig();

      const result = AgencyConfigSchema.safeParse(config);
      expect(result.success).toBe(true);
    });

    it('should have the current version', () => {
      const config = createDefaultConfig();
      expect(config.version).toBe(DEFAULT_CONFIG_VERSION);
    });

    it('should have empty plugins array', () => {
      const config = createDefaultConfig();
      expect(config.plugins).toEqual([]);
    });

    it('should have a default mode', () => {
      const config = createDefaultConfig();
      expect(config.modes).toHaveLength(1);
      expect(config.modes[0].id).toBe('default');
      expect(config.modes[0].name).toBe('Default');
    });

    it('should have empty containers array', () => {
      const config = createDefaultConfig();
      expect(config.containers).toEqual([]);
    });

    it('should return a new object each time', () => {
      const config1 = createDefaultConfig();
      const config2 = createDefaultConfig();
      expect(config1).not.toBe(config2);
      expect(config1.modes).not.toBe(config2.modes);
    });
  });

  describe('isCompatibleVersion', () => {
    it('should return true for same major version', () => {
      expect(isCompatibleVersion('1.0.0')).toBe(true);
      expect(isCompatibleVersion('1.5.0')).toBe(true);
      expect(isCompatibleVersion('1.99.99')).toBe(true);
    });

    it('should return false for different major version', () => {
      expect(isCompatibleVersion('0.9.0')).toBe(false);
      expect(isCompatibleVersion('2.0.0')).toBe(false);
      expect(isCompatibleVersion('10.0.0')).toBe(false);
    });

    it('should handle various version formats', () => {
      expect(isCompatibleVersion('1')).toBe(true);
      expect(isCompatibleVersion('1.0')).toBe(true);
      expect(isCompatibleVersion('2')).toBe(false);
    });
  });
});
