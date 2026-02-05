/**
 * Tests for AgencyFacetRegistry
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { AgencyFacetRegistry } from '../../facets/registry.js';
import { FacetNotFoundError, AmbiguousFacetError } from '@generacy-ai/latency';

describe('AgencyFacetRegistry', () => {
  let registry: AgencyFacetRegistry;

  beforeEach(() => {
    registry = new AgencyFacetRegistry();
  });

  describe('register', () => {
    it('should register a provider', () => {
      const provider = { name: 'test' };
      registry.register('TestFacet', provider);

      expect(registry.has('TestFacet')).toBe(true);
    });

    it('should register a provider with qualifier', () => {
      const provider = { name: 'test' };
      registry.register('TestFacet', provider, { qualifier: 'impl1' });

      expect(registry.has('TestFacet', 'impl1')).toBe(true);
      expect(registry.has('TestFacet', 'impl2')).toBe(false);
    });

    it('should register multiple providers for the same facet', () => {
      const provider1 = { name: 'test1' };
      const provider2 = { name: 'test2' };
      registry.register('TestFacet', provider1, { qualifier: 'impl1' });
      registry.register('TestFacet', provider2, { qualifier: 'impl2' });

      expect(registry.has('TestFacet', 'impl1')).toBe(true);
      expect(registry.has('TestFacet', 'impl2')).toBe(true);
    });

    it('should track plugin ownership', () => {
      const provider = { name: 'test' };
      registry.register('TestFacet', provider, { pluginId: 'test-plugin' });

      const byPlugin = registry.getByPlugin('test-plugin');
      expect(byPlugin).toHaveLength(1);
      expect(byPlugin[0]?.facet).toBe('TestFacet');
    });
  });

  describe('resolve', () => {
    it('should resolve a registered provider', () => {
      const provider = { name: 'test' };
      registry.register('TestFacet', provider);

      const resolved = registry.resolve<typeof provider>('TestFacet');
      expect(resolved).toBe(provider);
    });

    it('should resolve a provider by qualifier', () => {
      const provider1 = { name: 'test1' };
      const provider2 = { name: 'test2' };
      registry.register('TestFacet', provider1, { qualifier: 'impl1' });
      registry.register('TestFacet', provider2, { qualifier: 'impl2' });

      expect(registry.resolve('TestFacet', 'impl1')).toBe(provider1);
      expect(registry.resolve('TestFacet', 'impl2')).toBe(provider2);
    });

    it('should return undefined for unregistered facet', () => {
      expect(registry.resolve('NonExistent')).toBeUndefined();
    });

    it('should resolve highest priority when multiple exist', () => {
      const lowPriority = { name: 'low' };
      const highPriority = { name: 'high' };
      registry.register('TestFacet', lowPriority, { priority: 1 });
      registry.register('TestFacet', highPriority, { priority: 10 });

      expect(registry.resolve('TestFacet')).toBe(highPriority);
    });

    it('should return undefined when multiple have same priority', () => {
      const provider1 = { name: 'test1' };
      const provider2 = { name: 'test2' };
      registry.register('TestFacet', provider1, { priority: 5 });
      registry.register('TestFacet', provider2, { priority: 5 });

      expect(registry.resolve('TestFacet')).toBeUndefined();
    });
  });

  describe('resolveOrThrow', () => {
    it('should resolve a registered provider', () => {
      const provider = { name: 'test' };
      registry.register('TestFacet', provider);

      expect(registry.resolveOrThrow('TestFacet')).toBe(provider);
    });

    it('should throw FacetNotFoundError for unregistered facet', () => {
      expect(() => registry.resolveOrThrow('NonExistent')).toThrow(FacetNotFoundError);
    });

    it('should throw FacetNotFoundError for unregistered qualifier', () => {
      const provider = { name: 'test' };
      registry.register('TestFacet', provider, { qualifier: 'impl1' });

      expect(() => registry.resolveOrThrow('TestFacet', 'impl2')).toThrow(FacetNotFoundError);
    });

    it('should throw AmbiguousFacetError when multiple have same priority', () => {
      const provider1 = { name: 'test1' };
      const provider2 = { name: 'test2' };
      registry.register('TestFacet', provider1, { priority: 5 });
      registry.register('TestFacet', provider2, { priority: 5 });

      expect(() => registry.resolveOrThrow('TestFacet')).toThrow(AmbiguousFacetError);
    });
  });

  describe('list', () => {
    it('should return empty array for unregistered facet', () => {
      expect(registry.list('NonExistent')).toEqual([]);
    });

    it('should list all registrations for a facet', () => {
      registry.register('TestFacet', { name: 'test1' }, { qualifier: 'impl1', priority: 1 });
      registry.register('TestFacet', { name: 'test2' }, { qualifier: 'impl2', priority: 5 });

      const list = registry.list('TestFacet');
      expect(list).toHaveLength(2);
      expect(list.find((r) => r.qualifier === 'impl1')?.priority).toBe(1);
      expect(list.find((r) => r.qualifier === 'impl2')?.priority).toBe(5);
    });
  });

  describe('has', () => {
    it('should return false for unregistered facet', () => {
      expect(registry.has('NonExistent')).toBe(false);
    });

    it('should return true for registered facet', () => {
      registry.register('TestFacet', { name: 'test' });
      expect(registry.has('TestFacet')).toBe(true);
    });

    it('should check qualifier when provided', () => {
      registry.register('TestFacet', { name: 'test' }, { qualifier: 'impl1' });
      expect(registry.has('TestFacet', 'impl1')).toBe(true);
      expect(registry.has('TestFacet', 'impl2')).toBe(false);
    });
  });

  describe('unregister', () => {
    it('should return false for unregistered facet', () => {
      expect(registry.unregister('NonExistent')).toBe(false);
    });

    it('should unregister a provider', () => {
      registry.register('TestFacet', { name: 'test' });
      expect(registry.unregister('TestFacet')).toBe(true);
      expect(registry.has('TestFacet')).toBe(false);
    });

    it('should unregister by qualifier', () => {
      registry.register('TestFacet', { name: 'test1' }, { qualifier: 'impl1' });
      registry.register('TestFacet', { name: 'test2' }, { qualifier: 'impl2' });

      expect(registry.unregister('TestFacet', 'impl1')).toBe(true);
      expect(registry.has('TestFacet', 'impl1')).toBe(false);
      expect(registry.has('TestFacet', 'impl2')).toBe(true);
    });

    it('should update plugin index when unregistering', () => {
      registry.register('TestFacet', { name: 'test' }, { pluginId: 'test-plugin' });
      registry.unregister('TestFacet');

      expect(registry.getByPlugin('test-plugin')).toHaveLength(0);
    });
  });

  describe('unregisterByPlugin', () => {
    it('should unregister all facets for a plugin', () => {
      registry.register('Facet1', { name: 'test1' }, { pluginId: 'test-plugin' });
      registry.register('Facet2', { name: 'test2' }, { pluginId: 'test-plugin' });
      registry.register('Facet3', { name: 'test3' }, { pluginId: 'other-plugin' });

      registry.unregisterByPlugin('test-plugin');

      expect(registry.has('Facet1')).toBe(false);
      expect(registry.has('Facet2')).toBe(false);
      expect(registry.has('Facet3')).toBe(true);
    });

    it('should handle non-existent plugin', () => {
      // Should not throw
      registry.unregisterByPlugin('non-existent');
    });
  });

  describe('getSummary', () => {
    it('should return summary of all registrations', () => {
      registry.register('Facet1', { name: 'test1' }, { qualifier: 'impl1', priority: 1 });
      registry.register('Facet1', { name: 'test2' }, { qualifier: 'impl2', priority: 5 });
      registry.register('Facet2', { name: 'test3' }, { priority: 10 });

      const summary = registry.getSummary();
      expect(summary.size).toBe(2);
      expect(summary.get('Facet1')).toHaveLength(2);
      expect(summary.get('Facet2')).toHaveLength(1);
    });
  });

  describe('clear', () => {
    it('should clear all registrations', () => {
      registry.register('Facet1', { name: 'test1' });
      registry.register('Facet2', { name: 'test2' });

      registry.clear();

      expect(registry.has('Facet1')).toBe(false);
      expect(registry.has('Facet2')).toBe(false);
    });
  });
});
