import { describe, it, expect } from 'vitest';
import {
  PluginConfigSchema,
  ModeConfigSchema,
  ContainerConfigSchema,
  AgencyConfigSchema,
  parsePluginConfig,
  parseModeConfig,
  parseContainerConfig,
  parseAgencyConfig,
  getValidationErrors,
} from '../../config/ConfigSchema';

describe('ConfigSchema', () => {
  describe('PluginConfigSchema', () => {
    it('should parse valid plugin config', () => {
      const input = {
        id: 'my-plugin',
        enabled: true,
        settings: { key: 'value' },
      };

      const result = PluginConfigSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.id).toBe('my-plugin');
        expect(result.data.enabled).toBe(true);
        expect(result.data.settings).toEqual({ key: 'value' });
      }
    });

    it('should apply defaults for optional fields', () => {
      const input = { id: 'minimal-plugin' };

      const result = PluginConfigSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.enabled).toBe(true);
        expect(result.data.settings).toEqual({});
      }
    });

    it('should reject empty plugin id', () => {
      const input = { id: '', enabled: true };

      const result = PluginConfigSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('should reject missing plugin id', () => {
      const input = { enabled: true };

      const result = PluginConfigSchema.safeParse(input);
      expect(result.success).toBe(false);
    });
  });

  describe('ModeConfigSchema', () => {
    it('should parse valid mode config', () => {
      const input = {
        id: 'dev-mode',
        name: 'Development',
        inherits: 'base',
        tools: ['tool1', 'tool2'],
      };

      const result = ModeConfigSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.id).toBe('dev-mode');
        expect(result.data.name).toBe('Development');
        expect(result.data.inherits).toBe('base');
        expect(result.data.tools).toEqual(['tool1', 'tool2']);
      }
    });

    it('should apply defaults for optional fields', () => {
      const input = { id: 'simple', name: 'Simple Mode' };

      const result = ModeConfigSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.inherits).toBeUndefined();
        expect(result.data.tools).toEqual([]);
      }
    });

    it('should reject empty mode name', () => {
      const input = { id: 'mode', name: '' };

      const result = ModeConfigSchema.safeParse(input);
      expect(result.success).toBe(false);
    });
  });

  describe('ContainerConfigSchema', () => {
    it('should parse valid container config', () => {
      const input = {
        id: 'dev-container',
        name: 'Development Container',
        workspacePath: '/workspace/project',
        dockerComposePath: 'docker-compose.yml',
      };

      const result = ContainerConfigSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.id).toBe('dev-container');
        expect(result.data.workspacePath).toBe('/workspace/project');
        expect(result.data.dockerComposePath).toBe('docker-compose.yml');
      }
    });

    it('should allow optional dockerComposePath', () => {
      const input = {
        id: 'container',
        name: 'Container',
        workspacePath: '/workspace',
      };

      const result = ContainerConfigSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.dockerComposePath).toBeUndefined();
      }
    });

    it('should reject empty workspacePath', () => {
      const input = { id: 'container', name: 'Container', workspacePath: '' };

      const result = ContainerConfigSchema.safeParse(input);
      expect(result.success).toBe(false);
    });
  });

  describe('AgencyConfigSchema', () => {
    it('should parse valid full config', () => {
      const input = {
        version: '1.0.0',
        plugins: [{ id: 'plugin1', enabled: true, settings: {} }],
        modes: [{ id: 'default', name: 'Default', tools: [] }],
        containers: [{ id: 'dev', name: 'Dev', workspacePath: '/work' }],
      };

      const result = AgencyConfigSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.version).toBe('1.0.0');
        expect(result.data.plugins).toHaveLength(1);
        expect(result.data.modes).toHaveLength(1);
        expect(result.data.containers).toHaveLength(1);
      }
    });

    it('should apply defaults for empty config', () => {
      const input = {};

      const result = AgencyConfigSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.version).toBe('1.0.0');
        expect(result.data.plugins).toEqual([]);
        expect(result.data.modes).toEqual([]);
        expect(result.data.containers).toEqual([]);
      }
    });

    it('should reject invalid nested config', () => {
      const input = {
        version: '1.0.0',
        plugins: [{ id: '', enabled: true }], // Invalid: empty id
      };

      const result = AgencyConfigSchema.safeParse(input);
      expect(result.success).toBe(false);
    });
  });

  describe('parsePluginConfig', () => {
    it('should return parsed config for valid input', () => {
      const result = parsePluginConfig({ id: 'test', enabled: false });
      expect(result).not.toBeNull();
      expect(result?.id).toBe('test');
      expect(result?.enabled).toBe(false);
    });

    it('should return null for invalid input', () => {
      const result = parsePluginConfig({ enabled: true }); // Missing id
      expect(result).toBeNull();
    });
  });

  describe('parseModeConfig', () => {
    it('should return parsed config for valid input', () => {
      const result = parseModeConfig({ id: 'mode', name: 'Mode' });
      expect(result).not.toBeNull();
      expect(result?.id).toBe('mode');
    });

    it('should return null for invalid input', () => {
      const result = parseModeConfig({ id: 'mode' }); // Missing name
      expect(result).toBeNull();
    });
  });

  describe('parseContainerConfig', () => {
    it('should return parsed config for valid input', () => {
      const result = parseContainerConfig({
        id: 'c',
        name: 'Container',
        workspacePath: '/path',
      });
      expect(result).not.toBeNull();
    });

    it('should return null for invalid input', () => {
      const result = parseContainerConfig({ id: 'c', name: 'Container' }); // Missing workspacePath
      expect(result).toBeNull();
    });
  });

  describe('parseAgencyConfig', () => {
    it('should return parsed config for valid input', () => {
      const result = parseAgencyConfig({ version: '2.0.0' });
      expect(result).not.toBeNull();
      expect(result?.version).toBe('2.0.0');
    });

    it('should return null for deeply invalid input', () => {
      const result = parseAgencyConfig({
        plugins: [{ id: '' }], // Invalid nested
      });
      expect(result).toBeNull();
    });
  });

  describe('getValidationErrors', () => {
    it('should return empty array for valid config', () => {
      const errors = getValidationErrors({ version: '1.0.0' });
      expect(errors).toEqual([]);
    });

    it('should return error messages for invalid config', () => {
      const errors = getValidationErrors({
        plugins: [{ id: '' }],
      });
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0]).toContain('plugins');
    });

    it('should handle multiple errors', () => {
      const errors = getValidationErrors({
        plugins: [{ id: '' }],
        modes: [{ id: '', name: '' }],
      });
      // Should have errors for both invalid plugin and mode
      expect(errors.length).toBeGreaterThan(1);
    });
  });
});
