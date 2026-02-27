import { describe, it, expect } from 'vitest';
import {
  PluginConfigSchema,
  ModeConfigSchema,
  ConnectionConfigSchema,
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
        description: 'Full development toolkit',
        parentId: 'base',
        includedTools: ['source_control.*', 'build.*'],
        excludedTools: ['source_control.force_push'],
        isDefault: true,
      };

      const result = ModeConfigSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.id).toBe('dev-mode');
        expect(result.data.name).toBe('Development');
        expect(result.data.description).toBe('Full development toolkit');
        expect(result.data.parentId).toBe('base');
        expect(result.data.includedTools).toEqual(['source_control.*', 'build.*']);
        expect(result.data.excludedTools).toEqual(['source_control.force_push']);
        expect(result.data.isDefault).toBe(true);
      }
    });

    it('should apply defaults for optional fields', () => {
      const input = { id: 'simple', name: 'Simple Mode' };

      const result = ModeConfigSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.description).toBeUndefined();
        expect(result.data.parentId).toBeUndefined();
        expect(result.data.includedTools).toEqual([]);
        expect(result.data.excludedTools).toEqual([]);
        expect(result.data.isDefault).toBeUndefined();
      }
    });

    it('should reject empty mode name', () => {
      const input = { id: 'mode', name: '' };

      const result = ModeConfigSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('should reject empty mode id', () => {
      const input = { id: '', name: 'Mode' };

      const result = ModeConfigSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('should accept mode with description only', () => {
      const input = { id: 'review', name: 'Code Review', description: 'Read-only review mode' };

      const result = ModeConfigSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.description).toBe('Read-only review mode');
      }
    });

    it('should accept mode with isDefault true', () => {
      const input = { id: 'default', name: 'Default', isDefault: true, includedTools: ['*'] };

      const result = ModeConfigSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.isDefault).toBe(true);
        expect(result.data.includedTools).toEqual(['*']);
      }
    });

    it('should accept mode with isDefault false', () => {
      const input = { id: 'restricted', name: 'Restricted', isDefault: false };

      const result = ModeConfigSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.isDefault).toBe(false);
      }
    });

    it('should accept mode with parentId for inheritance', () => {
      const input = {
        id: 'child-mode',
        name: 'Child Mode',
        parentId: 'base-mode',
        excludedTools: ['dangerous_tool'],
      };

      const result = ModeConfigSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.parentId).toBe('base-mode');
        expect(result.data.excludedTools).toEqual(['dangerous_tool']);
      }
    });

    it('should accept mode with wildcard includedTools pattern', () => {
      const input = {
        id: 'dev',
        name: 'Development',
        includedTools: ['source_control.*', 'build.*', 'test.*'],
      };

      const result = ModeConfigSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.includedTools).toEqual(['source_control.*', 'build.*', 'test.*']);
      }
    });
  });

  describe('ConnectionConfigSchema', () => {
    it('should parse valid connection config', () => {
      const input = {
        command: 'npx',
        args: ['@generacy-ai/agency'],
        env: { NODE_ENV: 'development', DEBUG: 'true' },
      };

      const result = ConnectionConfigSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.command).toBe('npx');
        expect(result.data.args).toEqual(['@generacy-ai/agency']);
        expect(result.data.env).toEqual({ NODE_ENV: 'development', DEBUG: 'true' });
      }
    });

    it('should allow minimal connection with only command', () => {
      const input = { command: 'agency-server' };

      const result = ConnectionConfigSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.command).toBe('agency-server');
        expect(result.data.args).toBeUndefined();
        expect(result.data.env).toBeUndefined();
      }
    });

    it('should reject empty command', () => {
      const input = { command: '' };

      const result = ConnectionConfigSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('should reject missing command', () => {
      const input = { args: ['--port', '3000'] };

      const result = ConnectionConfigSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('should accept connection with env only', () => {
      const input = {
        command: 'agency',
        env: { API_KEY: 'secret-key' },
      };

      const result = ConnectionConfigSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.env).toEqual({ API_KEY: 'secret-key' });
        expect(result.data.args).toBeUndefined();
      }
    });
  });

  describe('ContainerConfigSchema', () => {
    it('should parse valid container config', () => {
      const input = {
        id: 'dev-container',
        name: 'Development Container',
        workspacePath: '/workspace/project',
        devcontainerPath: '.devcontainer/devcontainer.json',
      };

      const result = ContainerConfigSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.id).toBe('dev-container');
        expect(result.data.workspacePath).toBe('/workspace/project');
        expect(result.data.devcontainerPath).toBe('.devcontainer/devcontainer.json');
      }
    });

    it('should parse container with nested connection config', () => {
      const input = {
        id: 'dev-container',
        name: 'Dev',
        workspacePath: '/workspace',
        connection: {
          command: 'npx',
          args: ['@generacy-ai/agency'],
          env: { NODE_ENV: 'production' },
        },
      };

      const result = ContainerConfigSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.connection).toBeDefined();
        expect(result.data.connection?.command).toBe('npx');
        expect(result.data.connection?.args).toEqual(['@generacy-ai/agency']);
        expect(result.data.connection?.env).toEqual({ NODE_ENV: 'production' });
      }
    });

    it('should allow optional devcontainerPath', () => {
      const input = {
        id: 'container',
        name: 'Container',
        workspacePath: '/workspace',
      };

      const result = ContainerConfigSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.devcontainerPath).toBeUndefined();
      }
    });

    it('should allow optional connection', () => {
      const input = {
        id: 'container',
        name: 'Container',
        workspacePath: '/workspace',
      };

      const result = ContainerConfigSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.connection).toBeUndefined();
      }
    });

    it('should reject empty workspacePath', () => {
      const input = { id: 'container', name: 'Container', workspacePath: '' };

      const result = ContainerConfigSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('should reject container with invalid connection', () => {
      const input = {
        id: 'container',
        name: 'Container',
        workspacePath: '/workspace',
        connection: { command: '' }, // Invalid: empty command
      };

      const result = ContainerConfigSchema.safeParse(input);
      expect(result.success).toBe(false);
    });
  });

  describe('AgencyConfigSchema', () => {
    it('should parse valid full config', () => {
      const input = {
        version: '1.0.0',
        plugins: [{ id: 'plugin1', enabled: true, settings: {} }],
        modes: [{ id: 'default', name: 'Default', includedTools: ['*'], excludedTools: [] }],
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

    it('should parse full config with all new fields', () => {
      const input = {
        version: '1.0.0',
        plugins: [{ id: 'plugin1', enabled: true, settings: { apiKey: '123' } }],
        modes: [
          {
            id: 'base',
            name: 'Base',
            description: 'Base mode with all tools',
            includedTools: ['*'],
            excludedTools: [],
            isDefault: true,
          },
          {
            id: 'review',
            name: 'Code Review',
            description: 'Read-only review mode',
            parentId: 'base',
            includedTools: ['source_control.*'],
            excludedTools: ['source_control.force_push'],
          },
        ],
        containers: [
          {
            id: 'dev',
            name: 'Dev Container',
            workspacePath: '/workspace',
            devcontainerPath: '.devcontainer/devcontainer.json',
            connection: {
              command: 'npx',
              args: ['@generacy-ai/agency'],
              env: { NODE_ENV: 'development' },
            },
          },
        ],
      };

      const result = AgencyConfigSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.modes).toHaveLength(2);
        expect(result.data.modes[0].description).toBe('Base mode with all tools');
        expect(result.data.modes[0].isDefault).toBe(true);
        expect(result.data.modes[1].parentId).toBe('base');
        expect(result.data.containers[0].devcontainerPath).toBe('.devcontainer/devcontainer.json');
        expect(result.data.containers[0].connection?.command).toBe('npx');
        expect(result.data.containers[0].connection?.env).toEqual({ NODE_ENV: 'development' });
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

    it('should parse container with connection', () => {
      const result = parseContainerConfig({
        id: 'c',
        name: 'Container',
        workspacePath: '/path',
        connection: { command: 'npx', args: ['@generacy-ai/agency'] },
      });
      expect(result).not.toBeNull();
      expect(result?.connection?.command).toBe('npx');
      expect(result?.connection?.args).toEqual(['@generacy-ai/agency']);
    });

    it('should return null for invalid input', () => {
      const result = parseContainerConfig({ id: 'c', name: 'Container' }); // Missing workspacePath
      expect(result).toBeNull();
    });

    it('should return null for invalid connection', () => {
      const result = parseContainerConfig({
        id: 'c',
        name: 'Container',
        workspacePath: '/path',
        connection: { command: '' }, // Invalid: empty command
      });
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
