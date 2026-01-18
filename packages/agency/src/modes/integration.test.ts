/**
 * Mode System Integration Tests
 *
 * Tests the complete mode system workflow end-to-end:
 * load config -> resolve inheritance -> filter tools
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { loadModeConfig, DEFAULT_MODES } from './config-loader.js';
import { ModeManager } from './manager.js';
import { ToolRegistry } from '../tools/registry.js';
import type { AgencyTool, ToolResult } from '../tools/types.js';

/**
 * Helper to create a test tool with minimal required properties
 */
function createTestTool(name: string, overrides: Partial<AgencyTool> = {}): AgencyTool {
  const dotIndex = name.indexOf('.');
  const namespace = dotIndex !== -1 ? name.substring(0, dotIndex) : 'test';

  return {
    name,
    description: `Test tool: ${name}`,
    inputSchema: { type: 'object' },
    namespace,
    outputPattern: 'terse',
    execute: async (): Promise<ToolResult> => ({
      content: [{ type: 'text', text: 'done' }],
    }),
    ...overrides,
  };
}

describe('Mode System Integration', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = join(tmpdir(), `agency-mode-integration-${Date.now()}`);
    await mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  describe('Full workflow with YAML config', () => {
    it('should load YAML config, create ModeManager, and filter tools correctly', async () => {
      // Step 1: Create temp directory with .agency/modes.yaml
      const agencyDir = join(testDir, '.agency');
      await mkdir(agencyDir);
      await writeFile(
        join(agencyDir, 'modes.yaml'),
        `
modes:
  reading:
    name: reading
    description: Read-only mode
    includes:
      - "source_control.status"
      - "source_control.log"
      - "humancy.*"
  writing:
    name: writing
    description: Write mode
    extends: reading
    includes:
      - "source_control.commit"
      - "source_control.push"
    excludes:
      - "source_control.force_push"
defaultMode: reading
`
      );

      // Step 2: Load config using loadModeConfig
      const config = loadModeConfig(testDir);

      expect(config.defaultMode).toBe('reading');
      expect(config.modes.reading).toBeDefined();
      expect(config.modes.writing).toBeDefined();

      // Step 3: Create ModeManager with the loaded config
      const modeManager = new ModeManager(config);

      expect(modeManager.getMode()).toBe('reading');
      expect(modeManager.hasMode('reading')).toBe(true);
      expect(modeManager.hasMode('writing')).toBe(true);

      // Step 4: Create ToolRegistry and set mode patterns from config
      const registry = new ToolRegistry();

      // Convert modes to pattern format for registry
      const modePatterns: Record<string, { includes: string[]; excludes?: string[] }> = {};
      for (const [name, mode] of Object.entries(config.modes)) {
        const resolvedMode = modeManager.getResolvedMode(name);
        if (resolvedMode) {
          modePatterns[name] = {
            includes: resolvedMode.includes,
            excludes: resolvedMode.excludes,
          };
        }
      }
      registry.setModePatterns(modePatterns);

      // Step 5: Register test tools with various names
      registry.register(createTestTool('source_control.status'));
      registry.register(createTestTool('source_control.log'));
      registry.register(createTestTool('source_control.commit'));
      registry.register(createTestTool('source_control.push'));
      registry.register(createTestTool('source_control.force_push'));
      registry.register(createTestTool('humancy.ask_human'));
      registry.register(createTestTool('build.compile'));

      // Step 6: Verify tools are filtered correctly based on mode patterns
      const readingTools = registry.getToolsForMode('reading');
      const readingNames = readingTools.map((t) => t.name).sort();

      expect(readingNames).toEqual([
        'humancy.ask_human',
        'source_control.log',
        'source_control.status',
      ]);

      const writingTools = registry.getToolsForMode('writing');
      const writingNames = writingTools.map((t) => t.name).sort();

      // Writing extends reading, so should include reading patterns + its own
      // But exclude source_control.force_push
      expect(writingNames).toEqual([
        'humancy.ask_human',
        'source_control.commit',
        'source_control.log',
        'source_control.push',
        'source_control.status',
      ]);

      // Verify force_push is excluded
      expect(writingNames).not.toContain('source_control.force_push');
    });

    it('should support complex tool pattern matching', async () => {
      const agencyDir = join(testDir, '.agency');
      await mkdir(agencyDir);
      await writeFile(
        join(agencyDir, 'modes.yaml'),
        `
modes:
  testing:
    name: testing
    description: Testing mode
    includes:
      - "test.*"
      - "build.test_*"
    excludes:
      - "test.integration_*"
defaultMode: testing
`
      );

      const config = loadModeConfig(testDir);
      const modeManager = new ModeManager(config);
      const registry = new ToolRegistry();

      const resolved = modeManager.getResolvedMode('testing');
      registry.setModePatterns({
        testing: {
          includes: resolved!.includes,
          excludes: resolved!.excludes,
        },
      });

      // Register various test tools
      registry.register(createTestTool('test.unit_run'));
      registry.register(createTestTool('test.snapshot'));
      registry.register(createTestTool('test.integration_db'));
      registry.register(createTestTool('test.integration_api'));
      registry.register(createTestTool('build.test_coverage'));
      registry.register(createTestTool('build.compile'));

      const tools = registry.getToolsForMode('testing');
      const names = tools.map((t) => t.name).sort();

      expect(names).toEqual([
        'build.test_coverage',
        'test.snapshot',
        'test.unit_run',
      ]);

      // Integration tests should be excluded
      expect(names).not.toContain('test.integration_db');
      expect(names).not.toContain('test.integration_api');

      // build.compile doesn't match test.* or build.test_*
      expect(names).not.toContain('build.compile');
    });
  });

  describe('Full workflow with JSON fallback', () => {
    it('should load JSON config when YAML does not exist and filter tools', async () => {
      // Create temp directory with .agency/config.json (no YAML)
      const agencyDir = join(testDir, '.agency');
      await mkdir(agencyDir);
      await writeFile(
        join(agencyDir, 'config.json'),
        JSON.stringify({
          name: 'test-project',
          modes: {
            json_mode: {
              name: 'json_mode',
              description: 'JSON-based mode',
              includes: ['json.*', 'data.*'],
            },
            extended_json: {
              name: 'extended_json',
              extends: 'json_mode',
              includes: ['transform.*'],
              excludes: ['transform.dangerous'],
            },
          },
          defaultMode: 'json_mode',
        })
      );

      // Load config and verify JSON is loaded correctly
      const config = loadModeConfig(testDir);

      expect(config.defaultMode).toBe('json_mode');
      expect(config.modes.json_mode).toBeDefined();
      expect(config.modes.extended_json).toBeDefined();

      // Create ModeManager and ToolRegistry
      const modeManager = new ModeManager(config);
      const registry = new ToolRegistry();

      // Set mode patterns from resolved modes
      const modePatterns: Record<string, { includes: string[]; excludes?: string[] }> = {};
      for (const name of modeManager.getAvailableModes()) {
        const resolved = modeManager.getResolvedMode(name);
        if (resolved) {
          modePatterns[name] = {
            includes: resolved.includes,
            excludes: resolved.excludes,
          };
        }
      }
      registry.setModePatterns(modePatterns);

      // Register test tools
      registry.register(createTestTool('json.parse'));
      registry.register(createTestTool('json.stringify'));
      registry.register(createTestTool('data.fetch'));
      registry.register(createTestTool('transform.map'));
      registry.register(createTestTool('transform.dangerous'));
      registry.register(createTestTool('other.tool'));

      // Test json_mode filtering
      const jsonModeTools = registry.getToolsForMode('json_mode');
      const jsonNames = jsonModeTools.map((t) => t.name).sort();

      expect(jsonNames).toEqual([
        'data.fetch',
        'json.parse',
        'json.stringify',
      ]);

      // Test extended_json filtering (includes parent patterns)
      const extendedTools = registry.getToolsForMode('extended_json');
      const extendedNames = extendedTools.map((t) => t.name).sort();

      expect(extendedNames).toEqual([
        'data.fetch',
        'json.parse',
        'json.stringify',
        'transform.map',
      ]);

      // transform.dangerous should be excluded
      expect(extendedNames).not.toContain('transform.dangerous');
    });
  });

  describe('Full workflow with default modes', () => {
    it('should use DEFAULT_MODES when no config files exist', async () => {
      // Create temp directory with no config files
      // (testDir is already empty at this point)

      // Load config and verify DEFAULT_MODES are used
      const config = loadModeConfig(testDir);

      expect(config.defaultMode).toBe('coding');
      expect(config.modes.research).toBeDefined();
      expect(config.modes.coding).toBeDefined();
      expect(config.modes.review).toBeDefined();
      expect(config.modes.debug).toBeDefined();

      // Verify inheritance chain
      expect(config.modes.coding.extends).toBe('research');
      expect(config.modes.review.extends).toBe('research');
      expect(config.modes.debug.extends).toBe('coding');

      // Create ModeManager and ToolRegistry
      const modeManager = new ModeManager(config);
      const registry = new ToolRegistry();

      // Set mode patterns from resolved modes
      const modePatterns: Record<string, { includes: string[]; excludes?: string[] }> = {};
      for (const name of modeManager.getAvailableModes()) {
        const resolved = modeManager.getResolvedMode(name);
        if (resolved) {
          modePatterns[name] = {
            includes: resolved.includes,
            excludes: resolved.excludes,
          };
        }
      }
      registry.setModePatterns(modePatterns);

      // Register tools matching default mode patterns
      registry.register(createTestTool('humancy.ask_human'));
      registry.register(createTestTool('source_control.status'));
      registry.register(createTestTool('source_control.log'));
      registry.register(createTestTool('source_control.commit'));
      registry.register(createTestTool('source_control.diff'));
      registry.register(createTestTool('source_control.blame'));
      registry.register(createTestTool('build.compile'));
      registry.register(createTestTool('test.run'));
      registry.register(createTestTool('run.debug'));

      // Test research mode (base mode)
      const researchTools = registry.getToolsForMode('research');
      const researchNames = researchTools.map((t) => t.name).sort();

      expect(researchNames).toContain('humancy.ask_human');
      expect(researchNames).toContain('source_control.status');
      expect(researchNames).toContain('source_control.log');

      // Test coding mode (extends research)
      const codingTools = registry.getToolsForMode('coding');
      const codingNames = codingTools.map((t) => t.name).sort();

      // Should include research patterns + coding-specific patterns
      expect(codingNames).toContain('humancy.ask_human');
      expect(codingNames).toContain('source_control.status');
      expect(codingNames).toContain('source_control.commit');
      expect(codingNames).toContain('build.compile');
      expect(codingNames).toContain('test.run');

      // Test review mode (extends research)
      const reviewTools = registry.getToolsForMode('review');
      const reviewNames = reviewTools.map((t) => t.name).sort();

      expect(reviewNames).toContain('humancy.ask_human');
      expect(reviewNames).toContain('source_control.diff');
      expect(reviewNames).toContain('source_control.blame');

      // Test debug mode (extends coding)
      const debugTools = registry.getToolsForMode('debug');
      const debugNames = debugTools.map((t) => t.name).sort();

      // Should include coding patterns (which includes research) + debug-specific
      expect(debugNames).toContain('humancy.ask_human');
      expect(debugNames).toContain('source_control.commit');
      expect(debugNames).toContain('build.compile');
      expect(debugNames).toContain('run.debug');
    });
  });

  describe('Mode inheritance in filtering', () => {
    it('should properly merge includes from inheritance chain', async () => {
      const agencyDir = join(testDir, '.agency');
      await mkdir(agencyDir);
      await writeFile(
        join(agencyDir, 'modes.yaml'),
        `
modes:
  grandparent:
    name: grandparent
    includes:
      - "level0.*"
  parent:
    name: parent
    extends: grandparent
    includes:
      - "level1.*"
  child:
    name: child
    extends: parent
    includes:
      - "level2.*"
defaultMode: child
`
      );

      const config = loadModeConfig(testDir);
      const modeManager = new ModeManager(config);
      const registry = new ToolRegistry();

      // Set mode patterns from resolved modes
      const modePatterns: Record<string, { includes: string[]; excludes?: string[] }> = {};
      for (const name of modeManager.getAvailableModes()) {
        const resolved = modeManager.getResolvedMode(name);
        if (resolved) {
          modePatterns[name] = {
            includes: resolved.includes,
            excludes: resolved.excludes,
          };
        }
      }
      registry.setModePatterns(modePatterns);

      // Register tools at each level
      registry.register(createTestTool('level0.tool'));
      registry.register(createTestTool('level1.tool'));
      registry.register(createTestTool('level2.tool'));
      registry.register(createTestTool('other.tool'));

      // Verify child mode includes all ancestor patterns
      const childTools = registry.getToolsForMode('child');
      const childNames = childTools.map((t) => t.name).sort();

      expect(childNames).toEqual([
        'level0.tool',
        'level1.tool',
        'level2.tool',
      ]);

      // Verify parent mode includes grandparent patterns
      const parentTools = registry.getToolsForMode('parent');
      const parentNames = parentTools.map((t) => t.name).sort();

      expect(parentNames).toEqual([
        'level0.tool',
        'level1.tool',
      ]);

      // Verify grandparent mode only has its own patterns
      const grandparentTools = registry.getToolsForMode('grandparent');
      const grandparentNames = grandparentTools.map((t) => t.name).sort();

      expect(grandparentNames).toEqual(['level0.tool']);

      // Verify inheritance chain is tracked
      const childResolved = modeManager.getResolvedMode('child');
      expect(childResolved?.inheritanceChain).toEqual(['child', 'parent', 'grandparent']);
    });

    it('should properly merge excludes from inheritance chain', async () => {
      const agencyDir = join(testDir, '.agency');
      await mkdir(agencyDir);
      await writeFile(
        join(agencyDir, 'modes.yaml'),
        `
modes:
  base:
    name: base
    includes:
      - "*"
    excludes:
      - "dangerous.*"
  restricted:
    name: restricted
    extends: base
    includes:
      - "restricted_only.*"
    excludes:
      - "admin.*"
      - "internal.*"
defaultMode: restricted
`
      );

      const config = loadModeConfig(testDir);
      const modeManager = new ModeManager(config);
      const registry = new ToolRegistry();

      const resolved = modeManager.getResolvedMode('restricted');
      registry.setModePatterns({
        base: {
          includes: modeManager.getResolvedMode('base')!.includes,
          excludes: modeManager.getResolvedMode('base')!.excludes,
        },
        restricted: {
          includes: resolved!.includes,
          excludes: resolved!.excludes,
        },
      });

      // Verify the resolved mode has combined patterns
      // restricted inherits from base: includes ['*', 'restricted_only.*'], excludes ['dangerous.*', 'admin.*', 'internal.*']
      expect(resolved!.includes).toContain('*');
      expect(resolved!.includes).toContain('restricted_only.*');
      expect(resolved!.excludes).toContain('dangerous.*');
      expect(resolved!.excludes).toContain('admin.*');
      expect(resolved!.excludes).toContain('internal.*');

      // Register tools
      registry.register(createTestTool('safe.tool'));
      registry.register(createTestTool('dangerous.exploit'));
      registry.register(createTestTool('admin.delete'));
      registry.register(createTestTool('internal.secret'));
      registry.register(createTestTool('restricted_only.feature'));

      // Verify base mode: includes * but excludes dangerous.*
      const baseTools = registry.getToolsForMode('base');
      const baseNames = baseTools.map((t) => t.name).sort();

      expect(baseNames).toContain('safe.tool');
      expect(baseNames).toContain('admin.delete');
      expect(baseNames).toContain('internal.secret');
      expect(baseNames).toContain('restricted_only.feature');
      expect(baseNames).not.toContain('dangerous.exploit');

      // Verify restricted mode: inherits * from base, adds own excludes
      // So it excludes: dangerous.* (inherited) + admin.* + internal.*
      const restrictedTools = registry.getToolsForMode('restricted');
      const restrictedNames = restrictedTools.map((t) => t.name).sort();

      expect(restrictedNames).toContain('safe.tool');
      expect(restrictedNames).toContain('restricted_only.feature');
      expect(restrictedNames).not.toContain('dangerous.exploit');
      expect(restrictedNames).not.toContain('admin.delete');
      expect(restrictedNames).not.toContain('internal.secret');
    });
  });

  describe('Mode switching', () => {
    it('should switch modes and notify callbacks', async () => {
      const agencyDir = join(testDir, '.agency');
      await mkdir(agencyDir);
      await writeFile(
        join(agencyDir, 'modes.yaml'),
        `
modes:
  mode_a:
    name: mode_a
    includes:
      - "a.*"
  mode_b:
    name: mode_b
    includes:
      - "b.*"
  mode_c:
    name: mode_c
    includes:
      - "c.*"
defaultMode: mode_a
`
      );

      const config = loadModeConfig(testDir);
      const modeManager = new ModeManager(config);
      const registry = new ToolRegistry();

      // Set up mode change tracking
      const modeChanges: string[] = [];
      const unsubscribe = modeManager.onModeChange((mode) => {
        modeChanges.push(mode);
      });

      // Set mode patterns
      const modePatterns: Record<string, { includes: string[]; excludes?: string[] }> = {};
      for (const name of modeManager.getAvailableModes()) {
        const resolved = modeManager.getResolvedMode(name);
        if (resolved) {
          modePatterns[name] = {
            includes: resolved.includes,
            excludes: resolved.excludes,
          };
        }
      }
      registry.setModePatterns(modePatterns);

      // Register tools
      registry.register(createTestTool('a.tool'));
      registry.register(createTestTool('b.tool'));
      registry.register(createTestTool('c.tool'));

      // Verify initial state
      expect(modeManager.getMode()).toBe('mode_a');

      // Verify tool filtering changes with mode
      let tools = registry.getToolsForMode(modeManager.getMode());
      expect(tools.map((t) => t.name)).toEqual(['a.tool']);

      // Switch to mode_b
      modeManager.setMode('mode_b');
      expect(modeManager.getMode()).toBe('mode_b');

      tools = registry.getToolsForMode(modeManager.getMode());
      expect(tools.map((t) => t.name)).toEqual(['b.tool']);

      // Switch to mode_c
      modeManager.setMode('mode_c');
      expect(modeManager.getMode()).toBe('mode_c');

      tools = registry.getToolsForMode(modeManager.getMode());
      expect(tools.map((t) => t.name)).toEqual(['c.tool']);

      // Verify callback was called for each mode change
      expect(modeChanges).toEqual(['mode_b', 'mode_c']);

      // Verify setting same mode doesn't trigger callback
      modeManager.setMode('mode_c');
      expect(modeChanges).toEqual(['mode_b', 'mode_c']);

      // Clean up
      unsubscribe();

      // Verify callback is not called after unsubscribe
      modeManager.setMode('mode_a');
      expect(modeChanges).toEqual(['mode_b', 'mode_c']);
    });

    it('should support multiple mode change callbacks', async () => {
      const config = loadModeConfig(testDir); // Uses default modes
      const modeManager = new ModeManager(config);

      const callback1Changes: string[] = [];
      const callback2Changes: string[] = [];

      const unsub1 = modeManager.onModeChange((mode) => {
        callback1Changes.push(mode);
      });

      const unsub2 = modeManager.onModeChange((mode) => {
        callback2Changes.push(mode);
      });

      expect(modeManager.getCallbackCount()).toBe(2);

      // Switch mode
      modeManager.setMode('research');

      expect(callback1Changes).toEqual(['research']);
      expect(callback2Changes).toEqual(['research']);

      // Unsubscribe one callback
      unsub1();
      expect(modeManager.getCallbackCount()).toBe(1);

      // Switch again
      modeManager.setMode('debug');

      expect(callback1Changes).toEqual(['research']); // No new changes
      expect(callback2Changes).toEqual(['research', 'debug']);

      // Clean up
      unsub2();
    });

    it('should handle callback errors gracefully', async () => {
      const config = loadModeConfig(testDir);
      const modeManager = new ModeManager(config);

      const successfulChanges: string[] = [];

      // First callback throws
      modeManager.onModeChange(() => {
        throw new Error('Callback error');
      });

      // Second callback should still be called
      modeManager.onModeChange((mode) => {
        successfulChanges.push(mode);
      });

      // This should not throw
      modeManager.setMode('research');

      // Second callback should have been called despite first throwing
      expect(successfulChanges).toEqual(['research']);
    });
  });

  describe('Dynamic mode registration', () => {
    it('should allow plugins to register new modes at runtime', async () => {
      const config = loadModeConfig(testDir);
      const modeManager = new ModeManager(config);
      const registry = new ToolRegistry();

      // Initial setup with default modes
      const modePatterns: Record<string, { includes: string[]; excludes?: string[] }> = {};
      for (const name of modeManager.getAvailableModes()) {
        const resolved = modeManager.getResolvedMode(name);
        if (resolved) {
          modePatterns[name] = {
            includes: resolved.includes,
            excludes: resolved.excludes,
          };
        }
      }
      registry.setModePatterns(modePatterns);

      // Simulate plugin registering a new mode
      const pluginId = '@test/plugin';
      modeManager.registerMode('plugin_mode', ['plugin.*', 'custom.*'], pluginId);

      // Update registry with new mode
      modePatterns['plugin_mode'] = {
        includes: ['plugin.*', 'custom.*'],
        excludes: [],
      };
      registry.setModePatterns(modePatterns);

      // Register plugin tools
      registry.register(createTestTool('plugin.action'));
      registry.register(createTestTool('custom.feature'));

      // Verify plugin mode works
      expect(modeManager.hasMode('plugin_mode')).toBe(true);
      expect(modeManager.getModesByPlugin(pluginId)).toContain('plugin_mode');

      // Switch to plugin mode and verify filtering
      modeManager.setMode('plugin_mode');
      const tools = registry.getToolsForMode('plugin_mode');
      const names = tools.map((t) => t.name).sort();

      expect(names).toEqual(['custom.feature', 'plugin.action']);

      // Unregister plugin modes
      const count = modeManager.unregisterModesByPlugin(pluginId);
      expect(count).toBe(0); // Can't unregister current mode

      // Switch away and then unregister
      modeManager.setMode('coding');
      const count2 = modeManager.unregisterModesByPlugin(pluginId);
      expect(count2).toBe(1);
      expect(modeManager.hasMode('plugin_mode')).toBe(false);
    });
  });

  describe('Runtime configuration changes', () => {
    it('should support changing mode configuration at runtime via setModeConfig', async () => {
      const initialConfig = loadModeConfig(testDir);
      const modeManager = new ModeManager(initialConfig);
      const registry = new ToolRegistry();

      const modeChanges: string[] = [];
      modeManager.onModeChange((mode) => {
        modeChanges.push(mode);
      });

      // Register initial tools
      registry.register(createTestTool('source_control.commit'));
      registry.register(createTestTool('build.compile'));
      registry.register(createTestTool('deploy.release'));

      // Verify initial state
      expect(modeManager.getMode()).toBe('coding');

      // Create new configuration
      const newConfig = {
        modes: {
          minimal: {
            name: 'minimal',
            includes: ['source_control.*'],
          },
          full: {
            name: 'full',
            includes: ['*'],
            excludes: ['deploy.*'],
          },
        },
        defaultMode: 'minimal',
      };

      // Apply new configuration
      modeManager.setModeConfig(newConfig);

      // Update registry patterns
      const newPatterns: Record<string, { includes: string[]; excludes?: string[] }> = {};
      for (const name of modeManager.getAvailableModes()) {
        const resolved = modeManager.getResolvedMode(name);
        if (resolved) {
          newPatterns[name] = {
            includes: resolved.includes,
            excludes: resolved.excludes,
          };
        }
      }
      registry.setModePatterns(newPatterns);

      // Verify mode changed to new default (since 'coding' no longer exists)
      expect(modeManager.getMode()).toBe('minimal');
      expect(modeChanges).toContain('minimal');

      // Verify old modes no longer exist
      expect(modeManager.hasMode('coding')).toBe(false);
      expect(modeManager.hasMode('research')).toBe(false);

      // Verify new modes work
      expect(modeManager.hasMode('minimal')).toBe(true);
      expect(modeManager.hasMode('full')).toBe(true);

      // Verify filtering with new modes
      const minimalTools = registry.getToolsForMode('minimal');
      expect(minimalTools.map((t) => t.name)).toEqual(['source_control.commit']);

      const fullTools = registry.getToolsForMode('full');
      const fullNames = fullTools.map((t) => t.name).sort();
      expect(fullNames).toEqual(['build.compile', 'source_control.commit']);
      expect(fullNames).not.toContain('deploy.release'); // Excluded
    });
  });

  describe('Tool explicit modes property', () => {
    it('should respect explicit modes array on tools over pattern matching', async () => {
      const config = loadModeConfig(testDir);
      const modeManager = new ModeManager(config);
      const registry = new ToolRegistry();

      // Set mode patterns
      const modePatterns: Record<string, { includes: string[]; excludes?: string[] }> = {};
      for (const name of modeManager.getAvailableModes()) {
        const resolved = modeManager.getResolvedMode(name);
        if (resolved) {
          modePatterns[name] = {
            includes: resolved.includes,
            excludes: resolved.excludes,
          };
        }
      }
      registry.setModePatterns(modePatterns);

      // Register tool with explicit modes (overrides pattern matching)
      registry.register(
        createTestTool('source_control.dangerous_reset', {
          modes: ['debug'], // Only available in debug mode
        })
      );

      // Register normal tool (uses pattern matching)
      registry.register(createTestTool('source_control.status'));

      // In coding mode, source_control.* should match
      const codingTools = registry.getToolsForMode('coding');
      const codingNames = codingTools.map((t) => t.name).sort();

      // source_control.status matches pattern
      expect(codingNames).toContain('source_control.status');
      // source_control.dangerous_reset has explicit modes, only 'debug'
      expect(codingNames).not.toContain('source_control.dangerous_reset');

      // In debug mode (extends coding), explicit mode tool is available
      const debugTools = registry.getToolsForMode('debug');
      const debugNames = debugTools.map((t) => t.name).sort();

      expect(debugNames).toContain('source_control.status');
      expect(debugNames).toContain('source_control.dangerous_reset');
    });
  });

  describe('ModeManager isToolVisible integration', () => {
    it('should correctly check tool visibility using ModeManager', async () => {
      const agencyDir = join(testDir, '.agency');
      await mkdir(agencyDir);
      await writeFile(
        join(agencyDir, 'modes.yaml'),
        `
modes:
  safe:
    name: safe
    includes:
      - "read.*"
      - "list.*"
    excludes:
      - "read.secrets"
  elevated:
    name: elevated
    includes:
      - "read.*"
      - "list.*"
      - "write.*"
      - "read.secrets"
defaultMode: safe
`
      );

      const config = loadModeConfig(testDir);
      const modeManager = new ModeManager(config);

      // Check visibility in safe mode (current mode)
      expect(modeManager.isToolVisible('read.file')).toBe(true);
      expect(modeManager.isToolVisible('list.files')).toBe(true);
      expect(modeManager.isToolVisible('read.secrets')).toBe(false); // Excluded
      expect(modeManager.isToolVisible('write.file')).toBe(false); // Not included
      expect(modeManager.isToolVisible('delete.file')).toBe(false);

      // Check visibility in elevated mode (does NOT extend safe, so no inherited excludes)
      expect(modeManager.isToolVisible('read.file', 'elevated')).toBe(true);
      expect(modeManager.isToolVisible('write.file', 'elevated')).toBe(true);
      expect(modeManager.isToolVisible('read.secrets', 'elevated')).toBe(true); // No excludes in elevated

      // Switch to elevated mode and verify
      modeManager.setMode('elevated');
      expect(modeManager.isToolVisible('write.file')).toBe(true);
      expect(modeManager.isToolVisible('read.secrets')).toBe(true);
    });

    it('should demonstrate that excludes are inherited and always win', async () => {
      const agencyDir = join(testDir, '.agency');
      await mkdir(agencyDir);
      await writeFile(
        join(agencyDir, 'modes.yaml'),
        `
modes:
  parent:
    name: parent
    includes:
      - "*"
    excludes:
      - "dangerous.*"
  child:
    name: child
    extends: parent
    includes:
      - "dangerous.safe_one"
defaultMode: child
`
      );

      const config = loadModeConfig(testDir);
      const modeManager = new ModeManager(config);

      // Verify that parent's excludes are inherited by child
      // Even though child tries to include dangerous.safe_one,
      // the inherited exclude "dangerous.*" still wins
      expect(modeManager.isToolVisible('safe.tool', 'child')).toBe(true);
      expect(modeManager.isToolVisible('dangerous.safe_one', 'child')).toBe(false);
      expect(modeManager.isToolVisible('dangerous.other', 'child')).toBe(false);

      // Verify inheritance chain
      const resolved = modeManager.getResolvedMode('child');
      expect(resolved?.excludes).toContain('dangerous.*');
    });
  });
});
