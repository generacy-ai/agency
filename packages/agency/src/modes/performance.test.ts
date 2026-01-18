/**
 * Performance Tests for Mode System
 *
 * Verifies that the mode system meets performance requirements:
 * - SC-001: Mode switch < 10ms
 */

import { describe, it, expect } from 'vitest';
import { ModeManager } from './manager.js';
import { ToolRegistry } from '../tools/registry.js';
import { resolveInheritance } from './inheritance-resolver.js';
import type { ModeConfig, ModeDefinition } from './types.js';
import type { AgencyTool } from '../tools/types.js';

/**
 * Create a mock AgencyTool for testing
 */
function createMockTool(name: string, namespace?: string): AgencyTool {
  const ns = namespace ?? name.split('.')[0] ?? 'default';
  return {
    name,
    description: `Mock tool ${name}`,
    namespace: ns,
    outputPattern: 'terse',
    inputSchema: { type: 'object' },
    execute: async () => ({ content: [{ type: 'text', text: 'ok' }] }),
  };
}

/**
 * Create a config with multiple modes including inheritance
 */
function createTestConfig(): ModeConfig {
  return {
    modes: {
      research: {
        name: 'research',
        description: 'Research mode',
        includes: ['humancy.*', 'source_control.status', 'source_control.log'],
      },
      coding: {
        name: 'coding',
        description: 'Coding mode',
        extends: 'research',
        includes: ['source_control.*', 'build.*', 'test.*'],
        excludes: ['build.deploy'],
      },
      review: {
        name: 'review',
        description: 'Review mode',
        extends: 'research',
        includes: ['source_control.diff', 'source_control.blame'],
      },
      debug: {
        name: 'debug',
        description: 'Debug mode',
        extends: 'coding',
        includes: ['run.*', 'debug.*'],
        excludes: ['debug.internal'],
      },
    },
    defaultMode: 'coding',
  };
}

/**
 * Create a deep inheritance chain config (4+ levels)
 */
function createDeepInheritanceConfig(): ModeConfig {
  return {
    modes: {
      level0: {
        name: 'level0',
        description: 'Base level',
        includes: ['base.*'],
      },
      level1: {
        name: 'level1',
        extends: 'level0',
        includes: ['level1.*'],
      },
      level2: {
        name: 'level2',
        extends: 'level1',
        includes: ['level2.*'],
      },
      level3: {
        name: 'level3',
        extends: 'level2',
        includes: ['level3.*'],
      },
      level4: {
        name: 'level4',
        extends: 'level3',
        includes: ['level4.*'],
        excludes: ['level4.internal'],
      },
    },
    defaultMode: 'level4',
  };
}

describe('Mode System Performance', () => {
  describe('Mode Switch Performance (SC-001)', () => {
    it('should switch modes in less than 10ms on average', () => {
      // Setup: Create ModeManager with multiple modes including inheritance
      const config = createTestConfig();
      const manager = new ModeManager(config);

      // Warmup: JIT optimization
      for (let i = 0; i < 10; i++) {
        manager.setMode('research');
        manager.setMode('coding');
        manager.setMode('review');
        manager.setMode('debug');
      }

      // Measure: Switch modes many times
      const iterations = 100;
      const modes = ['research', 'coding', 'review', 'debug'];
      const start = performance.now();

      for (let i = 0; i < iterations; i++) {
        for (const mode of modes) {
          manager.setMode(mode);
        }
      }

      const elapsed = performance.now() - start;
      const totalSwitches = iterations * modes.length;
      const avgTime = elapsed / totalSwitches;

      // Log for debugging
      console.log(`Mode switch performance:`);
      console.log(`  Total switches: ${totalSwitches}`);
      console.log(`  Total time: ${elapsed.toFixed(3)}ms`);
      console.log(`  Average time per switch: ${avgTime.toFixed(3)}ms`);

      // Assert: Average switch time should be < 10ms (SC-001)
      expect(avgTime).toBeLessThan(10);
    });

    it('should switch modes with callbacks in less than 10ms on average', () => {
      // Setup: Create ModeManager with callbacks registered
      const config = createTestConfig();
      const manager = new ModeManager(config);

      // Register multiple callbacks (simulating plugins)
      const callbacks: (() => void)[] = [];
      for (let i = 0; i < 5; i++) {
        const unsubscribe = manager.onModeChange(() => {
          // Minimal callback work
        });
        callbacks.push(unsubscribe);
      }

      // Warmup
      for (let i = 0; i < 10; i++) {
        manager.setMode('research');
        manager.setMode('coding');
      }

      // Measure
      const iterations = 100;
      const start = performance.now();

      for (let i = 0; i < iterations; i++) {
        manager.setMode('research');
        manager.setMode('coding');
      }

      const elapsed = performance.now() - start;
      const totalSwitches = iterations * 2;
      const avgTime = elapsed / totalSwitches;

      console.log(`Mode switch with callbacks:`);
      console.log(`  Registered callbacks: 5`);
      console.log(`  Total switches: ${totalSwitches}`);
      console.log(`  Average time per switch: ${avgTime.toFixed(3)}ms`);

      // Cleanup
      for (const unsubscribe of callbacks) {
        unsubscribe();
      }

      // Assert
      expect(avgTime).toBeLessThan(10);
    });
  });

  describe('Tool Filtering Performance', () => {
    it('should filter tools in less than 10ms with 100+ tools', () => {
      // Setup: Create ToolRegistry with many tools
      const registry = new ToolRegistry();

      // Register 100+ tools across different namespaces
      const namespaces = [
        'source_control',
        'build',
        'test',
        'run',
        'debug',
        'humancy',
        'web',
        'file',
        'shell',
        'database',
      ];
      const actionsPerNamespace = 12; // 10 namespaces * 12 actions = 120 tools

      for (const ns of namespaces) {
        for (let i = 0; i < actionsPerNamespace; i++) {
          registry.register(createMockTool(`${ns}.action${i}`, ns));
        }
      }

      expect(registry.size).toBeGreaterThanOrEqual(100);

      // Set mode patterns with includes and excludes
      registry.setModePatterns({
        coding: {
          includes: ['source_control.*', 'build.*', 'test.*', 'file.*'],
          excludes: ['build.deploy', 'file.delete'],
        },
      });

      // Warmup
      for (let i = 0; i < 10; i++) {
        registry.getToolsForMode('coding');
      }

      // Measure
      const iterations = 100;
      const start = performance.now();

      for (let i = 0; i < iterations; i++) {
        registry.getToolsForMode('coding');
      }

      const elapsed = performance.now() - start;
      const avgTime = elapsed / iterations;

      console.log(`Tool filtering performance:`);
      console.log(`  Total tools: ${registry.size}`);
      console.log(`  Iterations: ${iterations}`);
      console.log(`  Average time per filter: ${avgTime.toFixed(3)}ms`);

      // Assert: Average filter time should be < 10ms
      expect(avgTime).toBeLessThan(10);
    });

    it('should filter tools efficiently with complex patterns', () => {
      // Setup: Create ToolRegistry with many tools
      const registry = new ToolRegistry();

      // Create 150 tools with varied naming
      for (let i = 0; i < 150; i++) {
        const ns = `ns${i % 15}`;
        registry.register(createMockTool(`${ns}.tool${i}`, ns));
      }

      // Complex patterns with multiple includes and excludes
      registry.setModePatterns({
        complex: {
          includes: ['ns0.*', 'ns1.*', 'ns2.*', 'ns5.*', 'ns10.*', 'ns14.*'],
          excludes: ['ns0.tool0', 'ns1.tool1', 'ns2.tool2', '*.tool15'],
        },
      });

      // Warmup
      for (let i = 0; i < 10; i++) {
        registry.getToolsForMode('complex');
      }

      // Measure
      const iterations = 100;
      const start = performance.now();

      for (let i = 0; i < iterations; i++) {
        registry.getToolsForMode('complex');
      }

      const elapsed = performance.now() - start;
      const avgTime = elapsed / iterations;

      console.log(`Complex pattern filtering:`);
      console.log(`  Total tools: ${registry.size}`);
      console.log(`  Include patterns: 6`);
      console.log(`  Exclude patterns: 4`);
      console.log(`  Average time per filter: ${avgTime.toFixed(3)}ms`);

      expect(avgTime).toBeLessThan(10);
    });
  });

  describe('Inheritance Resolution Performance', () => {
    it('should resolve deep inheritance (4+ levels) efficiently', () => {
      // Setup: Create modes with deep inheritance
      const config = createDeepInheritanceConfig();

      // Warmup
      for (let i = 0; i < 5; i++) {
        resolveInheritance(config.modes);
      }

      // Measure
      const iterations = 100;
      const start = performance.now();

      for (let i = 0; i < iterations; i++) {
        resolveInheritance(config.modes);
      }

      const elapsed = performance.now() - start;
      const avgTime = elapsed / iterations;

      console.log(`Inheritance resolution performance (5 levels):`);
      console.log(`  Iterations: ${iterations}`);
      console.log(`  Average time per resolution: ${avgTime.toFixed(3)}ms`);

      // Assert: Should complete in reasonable time
      expect(avgTime).toBeLessThan(10);
    });

    it('should resolve wide inheritance tree efficiently', () => {
      // Setup: Create many modes at the same level extending a base
      const modes: Record<string, ModeDefinition> = {
        base: {
          name: 'base',
          description: 'Base mode',
          includes: ['core.*'],
        },
      };

      // Create 20 modes all extending base
      for (let i = 0; i < 20; i++) {
        modes[`child${i}`] = {
          name: `child${i}`,
          extends: 'base',
          includes: [`child${i}.*`],
        };
      }

      // Warmup
      for (let i = 0; i < 5; i++) {
        resolveInheritance(modes);
      }

      // Measure
      const iterations = 100;
      const start = performance.now();

      for (let i = 0; i < iterations; i++) {
        resolveInheritance(modes);
      }

      const elapsed = performance.now() - start;
      const avgTime = elapsed / iterations;

      console.log(`Wide inheritance resolution (21 modes):`);
      console.log(`  Iterations: ${iterations}`);
      console.log(`  Average time per resolution: ${avgTime.toFixed(3)}ms`);

      expect(avgTime).toBeLessThan(10);
    });
  });

  describe('ModeManager Construction Performance', () => {
    it('should construct ModeManager with complex config quickly', () => {
      // Warmup
      for (let i = 0; i < 5; i++) {
        const config = createTestConfig();
        new ModeManager(config);
      }

      // Measure
      const iterations = 100;
      const start = performance.now();

      for (let i = 0; i < iterations; i++) {
        const config = createTestConfig();
        new ModeManager(config);
      }

      const elapsed = performance.now() - start;
      const avgTime = elapsed / iterations;

      console.log(`ModeManager construction:`);
      console.log(`  Iterations: ${iterations}`);
      console.log(`  Average time per construction: ${avgTime.toFixed(3)}ms`);

      // Assert: Construction should be < 10ms
      expect(avgTime).toBeLessThan(10);
    });

    it('should construct with deep inheritance quickly', () => {
      // Warmup
      for (let i = 0; i < 5; i++) {
        const config = createDeepInheritanceConfig();
        new ModeManager(config);
      }

      // Measure
      const iterations = 100;
      const start = performance.now();

      for (let i = 0; i < iterations; i++) {
        const config = createDeepInheritanceConfig();
        new ModeManager(config);
      }

      const elapsed = performance.now() - start;
      const avgTime = elapsed / iterations;

      console.log(`ModeManager with deep inheritance:`);
      console.log(`  Iterations: ${iterations}`);
      console.log(`  Average time per construction: ${avgTime.toFixed(3)}ms`);

      expect(avgTime).toBeLessThan(10);
    });
  });

  describe('isToolVisible Performance', () => {
    it('should check tool visibility quickly with many patterns', () => {
      // Setup
      const config = createTestConfig();
      const manager = new ModeManager(config);

      // Test tool names
      const toolNames = [
        'source_control.commit',
        'source_control.push',
        'build.compile',
        'build.deploy', // excluded
        'test.run',
        'humancy.ask',
        'debug.breakpoint',
        'random.unknown',
      ];

      // Warmup
      for (let i = 0; i < 10; i++) {
        for (const tool of toolNames) {
          manager.isToolVisible(tool);
        }
      }

      // Measure
      const iterations = 100;
      const start = performance.now();

      for (let i = 0; i < iterations; i++) {
        for (const tool of toolNames) {
          manager.isToolVisible(tool);
        }
      }

      const elapsed = performance.now() - start;
      const totalChecks = iterations * toolNames.length;
      const avgTime = elapsed / totalChecks;

      console.log(`isToolVisible performance:`);
      console.log(`  Total checks: ${totalChecks}`);
      console.log(`  Average time per check: ${avgTime.toFixed(3)}ms`);

      // Assert: Each check should be very fast
      expect(avgTime).toBeLessThan(1); // Sub-millisecond
    });
  });

  describe('setModeConfig Performance', () => {
    it('should update config dynamically within time limits', () => {
      // Setup
      const initialConfig = createTestConfig();
      const manager = new ModeManager(initialConfig);
      const newConfig = createDeepInheritanceConfig();

      // Warmup
      for (let i = 0; i < 5; i++) {
        manager.setModeConfig(createTestConfig());
        manager.setModeConfig(createDeepInheritanceConfig());
      }

      // Reset
      manager.setModeConfig(initialConfig);

      // Measure
      const iterations = 100;
      const start = performance.now();

      for (let i = 0; i < iterations; i++) {
        manager.setModeConfig(i % 2 === 0 ? newConfig : initialConfig);
      }

      const elapsed = performance.now() - start;
      const avgTime = elapsed / iterations;

      console.log(`setModeConfig performance:`);
      console.log(`  Iterations: ${iterations}`);
      console.log(`  Average time per update: ${avgTime.toFixed(3)}ms`);

      expect(avgTime).toBeLessThan(10);
    });
  });
});
