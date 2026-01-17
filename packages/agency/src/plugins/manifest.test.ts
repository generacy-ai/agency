import { describe, expect, it } from 'vitest';
import {
  PluginManifestSchema,
  validateManifest,
  parseManifest,
  safeParseManifest,
  validateDependencyIds,
  createTestManifest,
} from './manifest.js';

describe('PluginManifestSchema', () => {
  describe('valid manifests', () => {
    it('accepts a minimal valid manifest', () => {
      const manifest = {
        id: '@generacy-ai/agency-plugin-test',
        name: 'Test Plugin',
        version: '1.0.0',
      };

      const result = PluginManifestSchema.safeParse(manifest);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.dependencies).toEqual([]);
        expect(result.data.critical).toBe(false);
        expect(result.data.main).toBe('./dist/index.js');
      }
    });

    it('accepts a full manifest with all fields', () => {
      const manifest = {
        id: '@generacy-ai/agency-plugin-full',
        name: 'Full Plugin',
        version: '2.1.0-beta.1',
        description: 'A full plugin with all fields',
        main: './src/index.ts',
        types: './dist/index.d.ts',
        dependencies: ['@generacy-ai/agency-plugin-dep'],
        peerDependencies: { '@modelcontextprotocol/sdk': '^1.0.0' },
        tools: ['tool1', 'tool2'],
        modes: ['custom-mode'],
        channels: ['events'],
        critical: true,
      };

      const result = PluginManifestSchema.safeParse(manifest);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.critical).toBe(true);
        expect(result.data.dependencies).toHaveLength(1);
      }
    });

    it('accepts various valid semver versions', () => {
      const versions = ['0.0.1', '1.0.0', '10.20.30', '1.0.0-alpha', '1.0.0-beta.1', '1.0.0+build.123'];

      for (const version of versions) {
        const manifest = {
          id: '@test/plugin',
          name: 'Test',
          version,
        };
        const result = PluginManifestSchema.safeParse(manifest);
        expect(result.success, `Version ${version} should be valid`).toBe(true);
      }
    });

    it('accepts various valid plugin IDs', () => {
      const ids = [
        '@generacy-ai/agency-plugin-test',
        '@my-scope/my-plugin',
        '@a/b',
        '@test-scope/test-plugin-name',
      ];

      for (const id of ids) {
        const manifest = {
          id,
          name: 'Test',
          version: '1.0.0',
        };
        const result = PluginManifestSchema.safeParse(manifest);
        expect(result.success, `ID ${id} should be valid`).toBe(true);
      }
    });
  });

  describe('invalid manifests', () => {
    it('rejects manifest without id', () => {
      const manifest = {
        name: 'Test Plugin',
        version: '1.0.0',
      };

      const result = PluginManifestSchema.safeParse(manifest);
      expect(result.success).toBe(false);
    });

    it('rejects manifest with invalid id format', () => {
      const invalidIds = [
        'not-scoped',
        '@/no-package',
        'scope/no-at',
        '@scope/',
        '',
      ];

      for (const id of invalidIds) {
        const manifest = {
          id,
          name: 'Test',
          version: '1.0.0',
        };
        const result = PluginManifestSchema.safeParse(manifest);
        expect(result.success, `ID ${id} should be invalid`).toBe(false);
      }
    });

    it('rejects manifest with invalid version', () => {
      const invalidVersions = ['1', '1.0', 'v1.0.0', 'invalid', ''];

      for (const version of invalidVersions) {
        const manifest = {
          id: '@test/plugin',
          name: 'Test',
          version,
        };
        const result = PluginManifestSchema.safeParse(manifest);
        expect(result.success, `Version ${version} should be invalid`).toBe(false);
      }
    });

    it('rejects manifest without name', () => {
      const manifest = {
        id: '@test/plugin',
        version: '1.0.0',
      };

      const result = PluginManifestSchema.safeParse(manifest);
      expect(result.success).toBe(false);
    });

    it('rejects manifest with empty name', () => {
      const manifest = {
        id: '@test/plugin',
        name: '',
        version: '1.0.0',
      };

      const result = PluginManifestSchema.safeParse(manifest);
      expect(result.success).toBe(false);
    });
  });
});

describe('validateManifest', () => {
  it('returns valid: true for valid manifest', () => {
    const manifest = {
      id: '@test/plugin',
      name: 'Test',
      version: '1.0.0',
    };

    const result = validateManifest(manifest);
    expect(result.valid).toBe(true);
    expect(result.errors).toBeUndefined();
  });

  it('returns errors for invalid manifest', () => {
    const manifest = {
      id: 'invalid-id',
      name: '',
      version: 'bad',
    };

    const result = validateManifest(manifest);
    expect(result.valid).toBe(false);
    expect(result.errors).toBeDefined();
    expect(result.errors!.length).toBeGreaterThan(0);
  });

  it('includes path in error details', () => {
    const manifest = {
      id: '@test/plugin',
      name: 'Test',
      version: 'invalid',
    };

    const result = validateManifest(manifest);
    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({ path: 'version' })
    );
  });
});

describe('parseManifest', () => {
  it('returns typed manifest for valid input', () => {
    const manifest = {
      id: '@test/plugin',
      name: 'Test',
      version: '1.0.0',
    };

    const result = parseManifest(manifest);
    expect(result.id).toBe('@test/plugin');
    expect(result.dependencies).toEqual([]);
    expect(result.critical).toBe(false);
  });

  it('throws for invalid input', () => {
    const manifest = {
      id: 'invalid',
      name: 'Test',
      version: '1.0.0',
    };

    expect(() => parseManifest(manifest)).toThrow();
  });
});

describe('safeParseManifest', () => {
  it('returns manifest for valid input', () => {
    const manifest = {
      id: '@test/plugin',
      name: 'Test',
      version: '1.0.0',
    };

    const result = safeParseManifest(manifest);
    expect(result).not.toBeNull();
    expect(result?.id).toBe('@test/plugin');
  });

  it('returns null for invalid input', () => {
    const manifest = {
      id: 'invalid',
      name: 'Test',
      version: '1.0.0',
    };

    const result = safeParseManifest(manifest);
    expect(result).toBeNull();
  });
});

describe('validateDependencyIds', () => {
  it('returns empty array for valid dependencies', () => {
    const manifest = createTestManifest('@test/plugin', {
      dependencies: ['@dep/one', '@dep/two'],
    });

    const invalid = validateDependencyIds(manifest);
    expect(invalid).toEqual([]);
  });

  it('returns invalid dependency IDs', () => {
    const manifest = createTestManifest('@test/plugin', {
      dependencies: ['@valid/dep', 'invalid-dep', 'also-invalid'],
    });

    const invalid = validateDependencyIds(manifest);
    expect(invalid).toEqual(['invalid-dep', 'also-invalid']);
  });

  it('returns empty array for empty dependencies', () => {
    const manifest = createTestManifest('@test/plugin');

    const invalid = validateDependencyIds(manifest);
    expect(invalid).toEqual([]);
  });
});

describe('createTestManifest', () => {
  it('creates a minimal valid manifest', () => {
    const manifest = createTestManifest('@test/my-plugin');

    expect(manifest.id).toBe('@test/my-plugin');
    expect(manifest.name).toBe('my-plugin');
    expect(manifest.version).toBe('1.0.0');
    expect(manifest.main).toBe('./dist/index.js');
    expect(manifest.dependencies).toEqual([]);
    expect(manifest.critical).toBe(false);
  });

  it('applies overrides', () => {
    const manifest = createTestManifest('@test/plugin', {
      version: '2.0.0',
      critical: true,
      dependencies: ['@dep/one'],
    });

    expect(manifest.version).toBe('2.0.0');
    expect(manifest.critical).toBe(true);
    expect(manifest.dependencies).toEqual(['@dep/one']);
  });
});
