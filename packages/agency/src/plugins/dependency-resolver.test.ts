import { describe, expect, it, beforeEach } from 'vitest';
import {
  DependencyResolver,
  CircularDependencyError,
  checkDependencies,
  resolveLoadOrder,
} from './dependency-resolver.js';
import { createTestManifest } from './manifest.js';
import type { PluginManifest } from './types.js';

describe('DependencyResolver', () => {
  let resolver: DependencyResolver;

  beforeEach(() => {
    resolver = new DependencyResolver();
  });

  describe('check', () => {
    it('returns satisfied for plugins with no dependencies', () => {
      const manifests = [
        createTestManifest('@test/plugin-a'),
        createTestManifest('@test/plugin-b'),
      ];

      const result = resolver.check(manifests);

      expect(result.satisfied).toBe(true);
      expect(result.missing).toEqual([]);
      expect(result.conflicts).toEqual([]);
      expect(result.loadOrder).toBeDefined();
    });

    it('returns satisfied for resolved dependencies', () => {
      const manifests = [
        createTestManifest('@test/plugin-a'),
        createTestManifest('@test/plugin-b', {
          dependencies: ['@test/plugin-a'],
        }),
      ];

      const result = resolver.check(manifests);

      expect(result.satisfied).toBe(true);
      expect(result.missing).toEqual([]);
    });

    it('returns missing for unresolved dependencies', () => {
      const manifests = [
        createTestManifest('@test/plugin-a', {
          dependencies: ['@test/missing-plugin'],
        }),
      ];

      const result = resolver.check(manifests);

      expect(result.satisfied).toBe(false);
      expect(result.missing).toContain('@test/missing-plugin');
      expect(result.loadOrder).toBeUndefined();
    });

    it('deduplicates missing dependencies', () => {
      const manifests = [
        createTestManifest('@test/plugin-a', {
          dependencies: ['@test/missing'],
        }),
        createTestManifest('@test/plugin-b', {
          dependencies: ['@test/missing'],
        }),
      ];

      const result = resolver.check(manifests);

      expect(result.satisfied).toBe(false);
      expect(result.missing).toEqual(['@test/missing']);
    });

    it('returns unsatisfied for circular dependencies', () => {
      const manifests = [
        createTestManifest('@test/plugin-a', {
          dependencies: ['@test/plugin-b'],
        }),
        createTestManifest('@test/plugin-b', {
          dependencies: ['@test/plugin-a'],
        }),
      ];

      const result = resolver.check(manifests);

      expect(result.satisfied).toBe(false);
      expect(result.loadOrder).toBeUndefined();
    });
  });

  describe('resolve', () => {
    it('returns correct order for linear dependencies', () => {
      const manifests = [
        createTestManifest('@test/plugin-c', {
          dependencies: ['@test/plugin-b'],
        }),
        createTestManifest('@test/plugin-a'),
        createTestManifest('@test/plugin-b', {
          dependencies: ['@test/plugin-a'],
        }),
      ];

      const order = resolver.resolve(manifests);

      // a -> b -> c
      expect(order.indexOf('@test/plugin-a')).toBeLessThan(
        order.indexOf('@test/plugin-b')
      );
      expect(order.indexOf('@test/plugin-b')).toBeLessThan(
        order.indexOf('@test/plugin-c')
      );
    });

    it('returns deterministic order for independent plugins', () => {
      const manifests = [
        createTestManifest('@test/plugin-z'),
        createTestManifest('@test/plugin-a'),
        createTestManifest('@test/plugin-m'),
      ];

      const order1 = resolver.resolve(manifests);
      const order2 = resolver.resolve(manifests);

      expect(order1).toEqual(order2);
      // Alphabetical order for independent plugins
      expect(order1).toEqual([
        '@test/plugin-a',
        '@test/plugin-m',
        '@test/plugin-z',
      ]);
    });

    it('handles diamond dependencies', () => {
      // a -> b, a -> c, b -> d, c -> d
      const manifests = [
        createTestManifest('@test/d'),
        createTestManifest('@test/b', { dependencies: ['@test/d'] }),
        createTestManifest('@test/c', { dependencies: ['@test/d'] }),
        createTestManifest('@test/a', {
          dependencies: ['@test/b', '@test/c'],
        }),
      ];

      const order = resolver.resolve(manifests);

      // d must come before b and c, b and c must come before a
      expect(order.indexOf('@test/d')).toBeLessThan(order.indexOf('@test/b'));
      expect(order.indexOf('@test/d')).toBeLessThan(order.indexOf('@test/c'));
      expect(order.indexOf('@test/b')).toBeLessThan(order.indexOf('@test/a'));
      expect(order.indexOf('@test/c')).toBeLessThan(order.indexOf('@test/a'));
    });

    it('throws CircularDependencyError for cycles', () => {
      const manifests = [
        createTestManifest('@test/plugin-a', {
          dependencies: ['@test/plugin-b'],
        }),
        createTestManifest('@test/plugin-b', {
          dependencies: ['@test/plugin-a'],
        }),
      ];

      expect(() => resolver.resolve(manifests)).toThrow(CircularDependencyError);
    });

    it('throws CircularDependencyError for three-way cycles', () => {
      const manifests = [
        createTestManifest('@test/a', { dependencies: ['@test/b'] }),
        createTestManifest('@test/b', { dependencies: ['@test/c'] }),
        createTestManifest('@test/c', { dependencies: ['@test/a'] }),
      ];

      expect(() => resolver.resolve(manifests)).toThrow(CircularDependencyError);
    });

    it('handles empty input', () => {
      const order = resolver.resolve([]);
      expect(order).toEqual([]);
    });

    it('handles single plugin', () => {
      const manifests = [createTestManifest('@test/plugin')];
      const order = resolver.resolve(manifests);
      expect(order).toEqual(['@test/plugin']);
    });
  });

  describe('getShutdownOrder', () => {
    it('returns reverse of load order', () => {
      const manifests = [
        createTestManifest('@test/plugin-a'),
        createTestManifest('@test/plugin-b', {
          dependencies: ['@test/plugin-a'],
        }),
        createTestManifest('@test/plugin-c', {
          dependencies: ['@test/plugin-b'],
        }),
      ];

      const loadOrder = resolver.resolve(manifests);
      const shutdownOrder = resolver.getShutdownOrder(manifests);

      expect(shutdownOrder).toEqual(loadOrder.reverse());
    });

    it('shuts down dependents before dependencies', () => {
      const manifests = [
        createTestManifest('@test/core'),
        createTestManifest('@test/plugin', {
          dependencies: ['@test/core'],
        }),
      ];

      const shutdownOrder = resolver.getShutdownOrder(manifests);

      // Plugin should shutdown before core
      expect(shutdownOrder.indexOf('@test/plugin')).toBeLessThan(
        shutdownOrder.indexOf('@test/core')
      );
    });
  });

  describe('getMissingDependencies', () => {
    it('returns empty for satisfied dependencies', () => {
      const manifest = createTestManifest('@test/plugin', {
        dependencies: ['@test/dep'],
      });
      const available = new Set(['@test/dep', '@test/other']);

      const missing = resolver.getMissingDependencies(manifest, available);

      expect(missing).toEqual([]);
    });

    it('returns missing dependency IDs', () => {
      const manifest = createTestManifest('@test/plugin', {
        dependencies: ['@test/exists', '@test/missing1', '@test/missing2'],
      });
      const available = new Set(['@test/exists']);

      const missing = resolver.getMissingDependencies(manifest, available);

      expect(missing).toEqual(['@test/missing1', '@test/missing2']);
    });
  });
});

describe('checkDependencies', () => {
  it('is a convenience wrapper for DependencyResolver.check', () => {
    const manifests = [
      createTestManifest('@test/a'),
      createTestManifest('@test/b', { dependencies: ['@test/a'] }),
    ];

    const result = checkDependencies(manifests);

    expect(result.satisfied).toBe(true);
    expect(result.loadOrder).toBeDefined();
  });
});

describe('resolveLoadOrder', () => {
  it('is a convenience wrapper for DependencyResolver.resolve', () => {
    const manifests = [
      createTestManifest('@test/a'),
      createTestManifest('@test/b', { dependencies: ['@test/a'] }),
    ];

    const order = resolveLoadOrder(manifests);

    expect(order.indexOf('@test/a')).toBeLessThan(order.indexOf('@test/b'));
  });
});

describe('CircularDependencyError', () => {
  it('includes cycle information', () => {
    const error = new CircularDependencyError(['@test/a', '@test/b', '@test/a']);

    expect(error.name).toBe('CircularDependencyError');
    expect(error.cycle).toEqual(['@test/a', '@test/b', '@test/a']);
    expect(error.message).toContain('@test/a');
    expect(error.message).toContain('@test/b');
  });
});
