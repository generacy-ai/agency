/**
 * Tests for FacetBinder
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { FacetBinder } from '../../facets/binder.js';
import { AgencyFacetRegistry } from '../../facets/registry.js';
import type { PluginManifest } from '../../plugins/types.js';

describe('FacetBinder', () => {
  let registry: AgencyFacetRegistry;
  let binder: FacetBinder;

  beforeEach(() => {
    registry = new AgencyFacetRegistry();
    binder = new FacetBinder(registry);
  });

  const createManifest = (overrides: Partial<PluginManifest>): PluginManifest => ({
    id: 'test-plugin',
    name: 'Test Plugin',
    version: '1.0.0',
    main: './dist/index.js',
    dependencies: [],
    critical: false,
    ...overrides,
  });

  describe('bindAll', () => {
    it('should return success when no facets are required', () => {
      const plugins = [createManifest({ id: 'plugin-a' })];

      const result = binder.bindAll(plugins);

      expect(result.success).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.bound).toHaveLength(0);
    });

    it('should return success when required facets are available', () => {
      registry.register('SourceControl', { clone: () => {} });

      const plugins = [
        createManifest({
          id: 'plugin-a',
          requires: [{ facet: 'SourceControl' }],
        }),
      ];

      const result = binder.bindAll(plugins);

      expect(result.success).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.bound).toHaveLength(1);
      expect(result.bound[0]?.facet).toBe('SourceControl');
    });

    it('should fail when required facet is missing', () => {
      const plugins = [
        createManifest({
          id: 'plugin-a',
          requires: [{ facet: 'SourceControl' }],
        }),
      ];

      const result = binder.bindAll(plugins);

      expect(result.success).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]?.facet).toBe('SourceControl');
      expect(result.errors[0]?.plugin).toBe('plugin-a');
    });

    it('should bind with qualifier when specified', () => {
      registry.register('SourceControl', { type: 'git' }, { qualifier: 'git' });
      registry.register('SourceControl', { type: 'svn' }, { qualifier: 'svn' });

      const plugins = [
        createManifest({
          id: 'plugin-a',
          requires: [{ facet: 'SourceControl', qualifier: 'git' }],
        }),
      ];

      const result = binder.bindAll(plugins);

      expect(result.success).toBe(true);
      expect(result.bound).toHaveLength(1);
      expect(result.bound[0]?.qualifier).toBe('git');
    });

    it('should fail when qualified facet is missing', () => {
      registry.register('SourceControl', { type: 'svn' }, { qualifier: 'svn' });

      const plugins = [
        createManifest({
          id: 'plugin-a',
          requires: [{ facet: 'SourceControl', qualifier: 'git' }],
        }),
      ];

      const result = binder.bindAll(plugins);

      expect(result.success).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]?.qualifier).toBe('git');
    });

    it('should handle optional facets (uses) gracefully', () => {
      const plugins = [
        createManifest({
          id: 'plugin-a',
          uses: [{ facet: 'Optional' }],
        }),
      ];

      const result = binder.bindAll(plugins);

      expect(result.success).toBe(true);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]).toContain('Optional');
    });

    it('should bind optional facets when available', () => {
      registry.register('Optional', { feature: true });

      const plugins = [
        createManifest({
          id: 'plugin-a',
          uses: [{ facet: 'Optional' }],
        }),
      ];

      const result = binder.bindAll(plugins);

      expect(result.success).toBe(true);
      expect(result.bound).toHaveLength(1);
      expect(result.warnings).toHaveLength(0);
    });

    it('should warn when declared provider was not registered', () => {
      const plugins = [
        createManifest({
          id: 'plugin-a',
          provides: [{ facet: 'MyFacet' }],
        }),
      ];

      const result = binder.bindAll(plugins);

      expect(result.success).toBe(true);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]).toContain('MyFacet');
      expect(result.warnings[0]).toContain('did not register');
    });

    it('should not warn when declared provider was registered', () => {
      registry.register('MyFacet', { impl: true });

      const plugins = [
        createManifest({
          id: 'plugin-a',
          provides: [{ facet: 'MyFacet' }],
        }),
      ];

      const result = binder.bindAll(plugins);

      expect(result.success).toBe(true);
      expect(result.warnings).toHaveLength(0);
    });

    it('should handle multiple plugins with cross-dependencies', () => {
      registry.register('SourceControl', { type: 'git' }, { qualifier: 'git' });
      registry.register('IssueTracker', { type: 'github' });

      const plugins = [
        createManifest({
          id: 'spec-kit',
          requires: [
            { facet: 'SourceControl' },
            { facet: 'IssueTracker' },
          ],
        }),
        createManifest({
          id: 'git-plugin',
          provides: [{ facet: 'SourceControl', qualifier: 'git' }],
        }),
      ];

      const result = binder.bindAll(plugins);

      expect(result.success).toBe(true);
      expect(result.bound).toHaveLength(2);
    });
  });

  describe('formatResult', () => {
    it('should format successful binding', () => {
      const result = {
        success: true,
        bound: [{ plugin: 'plugin-a', facet: 'SourceControl', provider: 'git' }],
        errors: [],
        warnings: [],
      };

      const lines = FacetBinder.formatResult(result);

      expect(lines).toContain('Facets bound:');
      expect(lines.some((l) => l.includes('SourceControl'))).toBe(true);
    });

    it('should format errors', () => {
      const result = {
        success: false,
        bound: [],
        errors: [{
          plugin: 'plugin-a',
          facet: 'SourceControl',
          error: new Error('not found') as any,
        }],
        warnings: [],
      };

      const lines = FacetBinder.formatResult(result);

      expect(lines).toContain('Facet binding errors:');
      expect(lines.some((l) => l.includes('SourceControl'))).toBe(true);
    });

    it('should format warnings', () => {
      const result = {
        success: true,
        bound: [],
        errors: [],
        warnings: ['Some warning'],
      };

      const lines = FacetBinder.formatResult(result);

      expect(lines).toContain('Facet warnings:');
      expect(lines.some((l) => l.includes('Some warning'))).toBe(true);
    });
  });
});
