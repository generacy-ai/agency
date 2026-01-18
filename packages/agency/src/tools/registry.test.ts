import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ToolRegistry } from './registry.js';
import type { AgencyTool, ToolResult } from './types.js';
import { AgencyError, ErrorCodes } from '../errors/index.js';

// Helper to create a test tool
function createTestTool(overrides: Partial<AgencyTool> = {}): AgencyTool {
  return {
    name: 'test.tool',
    description: 'A test tool',
    inputSchema: { type: 'object' },
    namespace: 'test',
    outputPattern: 'terse',
    execute: async (): Promise<ToolResult> => ({
      content: [{ type: 'text', text: 'done' }],
    }),
    ...overrides,
  };
}

describe('ToolRegistry', () => {
  let registry: ToolRegistry;

  beforeEach(() => {
    registry = new ToolRegistry();
  });

  describe('register/unregister', () => {
    it('should register a tool', () => {
      const tool = createTestTool();
      registry.register(tool);

      expect(registry.has('test.tool')).toBe(true);
      expect(registry.size).toBe(1);
    });

    it('should unregister a tool', () => {
      const tool = createTestTool();
      registry.register(tool);

      const result = registry.unregister('test.tool');

      expect(result).toBe(true);
      expect(registry.has('test.tool')).toBe(false);
      expect(registry.size).toBe(0);
    });

    it('should return false when unregistering non-existent tool', () => {
      const result = registry.unregister('nonexistent');
      expect(result).toBe(false);
    });

    it('should overwrite tool when registering with same name', () => {
      const tool1 = createTestTool({ description: 'First' });
      const tool2 = createTestTool({ description: 'Second' });

      registry.register(tool1);
      registry.register(tool2);

      expect(registry.size).toBe(1);
      expect(registry.get('test.tool')?.description).toBe('Second');
    });

    it('should warn when registering duplicate tool', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const tool1 = createTestTool({ description: 'First' });
      const tool2 = createTestTool({ description: 'Second' });

      registry.register(tool1);
      registry.register(tool2);

      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('test.tool')
      );

      warnSpy.mockRestore();
    });
  });

  describe('get/getOrThrow', () => {
    it('should get a registered tool', () => {
      const tool = createTestTool();
      registry.register(tool);

      const result = registry.get('test.tool');

      expect(result).toBe(tool);
    });

    it('should return undefined for non-existent tool', () => {
      const result = registry.get('nonexistent');
      expect(result).toBeUndefined();
    });

    it('should throw for non-existent tool with getOrThrow', () => {
      expect(() => registry.getOrThrow('nonexistent')).toThrow(AgencyError);
      expect(() => registry.getOrThrow('nonexistent')).toThrow('Tool not found');
    });
  });

  describe('getAll', () => {
    it('should return all registered tools', () => {
      const tool1 = createTestTool({ name: 'test.tool1' });
      const tool2 = createTestTool({ name: 'test.tool2' });

      registry.register(tool1);
      registry.register(tool2);

      const all = registry.getAll();

      expect(all).toHaveLength(2);
      expect(all).toContain(tool1);
      expect(all).toContain(tool2);
    });
  });

  describe('mode filtering', () => {
    beforeEach(() => {
      registry.setModePatterns({
        default: ['*'],
        dev: ['dev.*', 'test.*'],
        prod: ['prod.*'],
        source: ['source_control.*'],
      });
    });

    it('should filter tools by mode using glob patterns', () => {
      registry.register(createTestTool({ name: 'dev.debug', namespace: 'dev' }));
      registry.register(createTestTool({ name: 'prod.deploy', namespace: 'prod' }));

      const devTools = registry.getToolsForMode('dev');
      const prodTools = registry.getToolsForMode('prod');

      expect(devTools).toHaveLength(1);
      expect(devTools[0]?.name).toBe('dev.debug');

      expect(prodTools).toHaveLength(1);
      expect(prodTools[0]?.name).toBe('prod.deploy');
    });

    it('should match wildcard pattern *', () => {
      registry.register(createTestTool({ name: 'any.tool' }));
      registry.register(createTestTool({ name: 'other.thing' }));

      const tools = registry.getToolsForMode('default');

      expect(tools).toHaveLength(2);
    });

    it('should match namespace.* pattern', () => {
      registry.register(createTestTool({ name: 'source_control.commit' }));
      registry.register(createTestTool({ name: 'source_control.push' }));
      registry.register(createTestTool({ name: 'build.run' }));

      const tools = registry.getToolsForMode('source');

      expect(tools).toHaveLength(2);
      expect(tools.map((t) => t.name).sort()).toEqual([
        'source_control.commit',
        'source_control.push',
      ]);
    });

    it('should use explicit modes array if defined', () => {
      registry.register(
        createTestTool({
          name: 'special.tool',
          modes: ['prod'],
        })
      );

      const devTools = registry.getToolsForMode('dev');
      const prodTools = registry.getToolsForMode('prod');

      expect(devTools).toHaveLength(0);
      expect(prodTools).toHaveLength(1);
    });

    it('should return empty array for undefined mode', () => {
      registry.register(createTestTool());

      const tools = registry.getToolsForMode('nonexistent');

      expect(tools).toEqual([]);
    });

    it('should support excludes patterns (excludes win over includes)', () => {
      registry.setModePatterns({
        restricted: {
          includes: ['source_control.*'],
          excludes: ['source_control.push'],
        },
      });

      registry.register(createTestTool({ name: 'source_control.commit' }));
      registry.register(createTestTool({ name: 'source_control.push' }));
      registry.register(createTestTool({ name: 'source_control.status' }));

      const tools = registry.getToolsForMode('restricted');

      expect(tools).toHaveLength(2);
      expect(tools.map((t) => t.name).sort()).toEqual([
        'source_control.commit',
        'source_control.status',
      ]);
    });

    it('should support negation patterns in includes', () => {
      registry.setModePatterns({
        testing: {
          includes: ['test.*', '!test.integration_*'],
          excludes: [],
        },
      });

      registry.register(createTestTool({ name: 'test.unit_run' }));
      registry.register(createTestTool({ name: 'test.integration_db' }));
      registry.register(createTestTool({ name: 'test.snapshot' }));

      const tools = registry.getToolsForMode('testing');

      expect(tools).toHaveLength(2);
      expect(tools.map((t) => t.name).sort()).toEqual([
        'test.snapshot',
        'test.unit_run',
      ]);
    });

    it('should work with mixed legacy and new format in setModePatterns', () => {
      registry.setModePatterns({
        legacy: ['build.*'],
        modern: {
          includes: ['source_control.*'],
          excludes: ['source_control.force_push'],
        },
      });

      registry.register(createTestTool({ name: 'build.compile' }));
      registry.register(createTestTool({ name: 'source_control.commit' }));
      registry.register(createTestTool({ name: 'source_control.force_push' }));

      const legacyTools = registry.getToolsForMode('legacy');
      const modernTools = registry.getToolsForMode('modern');

      expect(legacyTools).toHaveLength(1);
      expect(legacyTools[0]?.name).toBe('build.compile');

      expect(modernTools).toHaveLength(1);
      expect(modernTools[0]?.name).toBe('source_control.commit');
    });
  });

  describe('getMcpToolsForMode', () => {
    it('should return tools in MCP format', () => {
      registry.setModePatterns({ default: ['*'] });
      registry.register(
        createTestTool({
          name: 'test.tool',
          description: 'Test description',
          inputSchema: {
            type: 'object',
            properties: { arg: { type: 'string' } },
            required: ['arg'],
          },
        })
      );

      const mcpTools = registry.getMcpToolsForMode('default');

      expect(mcpTools).toHaveLength(1);
      expect(mcpTools[0]).toEqual({
        name: 'test.tool',
        description: 'Test description',
        inputSchema: {
          type: 'object',
          properties: { arg: { type: 'string' } },
          required: ['arg'],
        },
      });
    });
  });

  describe('clear', () => {
    it('should clear all tools', () => {
      registry.register(createTestTool({ name: 'test.tool1' }));
      registry.register(createTestTool({ name: 'test.tool2' }));

      registry.clear();

      expect(registry.size).toBe(0);
      expect(registry.getAll()).toEqual([]);
    });
  });

  describe('getByPrefix', () => {
    it('should return tools matching the prefix', () => {
      registry.register(createTestTool({ name: 'source_control.commit' }));
      registry.register(createTestTool({ name: 'source_control.push' }));
      registry.register(createTestTool({ name: 'build.compile' }));

      const sourceTools = registry.getByPrefix('source_control');

      expect(sourceTools).toHaveLength(2);
      expect(sourceTools.map((t) => t.name).sort()).toEqual([
        'source_control.commit',
        'source_control.push',
      ]);
    });

    it('should return empty array for non-existent prefix', () => {
      registry.register(createTestTool({ name: 'build.compile' }));

      const tools = registry.getByPrefix('nonexistent');

      expect(tools).toEqual([]);
    });

    it('should not match partial prefix', () => {
      registry.register(createTestTool({ name: 'source_control.commit' }));

      const tools = registry.getByPrefix('source');

      expect(tools).toEqual([]);
    });
  });

  describe('validateName', () => {
    it('should validate standard prefix names', () => {
      const result = registry.validateName('source_control.commit');

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should warn on custom prefix in permissive mode', () => {
      const result = registry.validateName('custom.action');

      expect(result.valid).toBe(true);
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings[0]).toContain('custom prefix');
    });

    it('should reject custom prefix in strict mode', () => {
      const result = registry.validateName('custom.action', { strict: true });

      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('strict mode');
    });

    it('should reject invalid format', () => {
      const result = registry.validateName('no-dot-here');

      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('exactly one dot');
    });
  });

  describe('getCatalog', () => {
    it('should return all tools in catalog', () => {
      registry.register(createTestTool({ name: 'build.compile' }));
      registry.register(createTestTool({ name: 'test.run' }));

      const catalog = registry.getCatalog();

      expect(catalog.tools).toHaveLength(2);
    });

    it('should group tools by prefix', () => {
      registry.register(createTestTool({ name: 'source_control.commit' }));
      registry.register(createTestTool({ name: 'source_control.push' }));
      registry.register(createTestTool({ name: 'build.compile' }));

      const catalog = registry.getCatalog();

      expect(Object.keys(catalog.byPrefix).sort()).toEqual(['build', 'source_control']);
      expect(catalog.byPrefix['source_control']).toHaveLength(2);
      expect(catalog.byPrefix['build']).toHaveLength(1);
    });

    it('should include generatedAt timestamp', () => {
      const catalog = registry.getCatalog();

      expect(catalog.generatedAt).toBeDefined();
      expect(new Date(catalog.generatedAt).getTime()).not.toBeNaN();
    });

    it('should return empty catalog when no tools registered', () => {
      const catalog = registry.getCatalog();

      expect(catalog.tools).toHaveLength(0);
      expect(Object.keys(catalog.byPrefix)).toHaveLength(0);
    });
  });
});
