import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { PluginDiscovery, findNodeModules, createDiscoveryOptions } from './discovery.js';

describe('PluginDiscovery', () => {
  let testDir: string;
  let discovery: PluginDiscovery;

  beforeEach(async () => {
    // Create a temporary test directory
    testDir = join(tmpdir(), `agency-discovery-test-${Date.now()}`);
    await mkdir(testDir, { recursive: true });
    discovery = new PluginDiscovery();
  });

  afterEach(async () => {
    // Clean up test directory
    await rm(testDir, { recursive: true, force: true });
  });

  async function createMockPlugin(
    basePath: string,
    name: string,
    manifest: Record<string, unknown>
  ): Promise<string> {
    const pluginPath = join(basePath, ...name.split('/'));
    await mkdir(pluginPath, { recursive: true });

    const packageJson = {
      name,
      version: manifest.version ?? '1.0.0',
      description: manifest.description,
      main: manifest.main ?? './dist/index.js',
      ...manifest,
    };

    await writeFile(
      join(pluginPath, 'package.json'),
      JSON.stringify(packageJson, null, 2)
    );

    return pluginPath;
  }

  describe('discoverFromNodeModules', () => {
    it('discovers scoped agency plugins', async () => {
      const nodeModules = join(testDir, 'node_modules');
      await createMockPlugin(nodeModules, '@generacy-ai/agency-plugin-test', {
        version: '1.0.0',
      });

      const plugins = await discovery.discoverFromNodeModules(nodeModules);

      expect(plugins).toHaveLength(1);
      expect(plugins[0]?.manifest.id).toBe('@generacy-ai/agency-plugin-test');
      expect(plugins[0]?.source).toBe('node_modules');
    });

    it('discovers multiple plugins', async () => {
      const nodeModules = join(testDir, 'node_modules');
      await createMockPlugin(nodeModules, '@generacy-ai/agency-plugin-one', {
        version: '1.0.0',
      });
      await createMockPlugin(nodeModules, '@generacy-ai/agency-plugin-two', {
        version: '2.0.0',
      });

      const plugins = await discovery.discoverFromNodeModules(nodeModules);

      expect(plugins).toHaveLength(2);
      const ids = plugins.map((p) => p.manifest.id).sort();
      expect(ids).toEqual([
        '@generacy-ai/agency-plugin-one',
        '@generacy-ai/agency-plugin-two',
      ]);
    });

    it('ignores non-matching packages', async () => {
      const nodeModules = join(testDir, 'node_modules');
      await createMockPlugin(nodeModules, '@generacy-ai/agency-plugin-valid', {
        version: '1.0.0',
      });
      await createMockPlugin(nodeModules, '@other/package', {
        version: '1.0.0',
      });
      await createMockPlugin(nodeModules, 'regular-package', {
        name: 'regular-package',
        version: '1.0.0',
      });

      const plugins = await discovery.discoverFromNodeModules(nodeModules);

      expect(plugins).toHaveLength(1);
      expect(plugins[0]?.manifest.id).toBe('@generacy-ai/agency-plugin-valid');
    });

    it('returns empty array for non-existent directory', async () => {
      const plugins = await discovery.discoverFromNodeModules(
        join(testDir, 'non-existent')
      );

      expect(plugins).toEqual([]);
    });

    it('skips plugins with invalid manifests', async () => {
      const nodeModules = join(testDir, 'node_modules');
      await createMockPlugin(nodeModules, '@generacy-ai/agency-plugin-valid', {
        version: '1.0.0',
      });

      // Create invalid plugin (missing version)
      const invalidPath = join(nodeModules, '@generacy-ai/agency-plugin-invalid');
      await mkdir(invalidPath, { recursive: true });
      await writeFile(
        join(invalidPath, 'package.json'),
        JSON.stringify({ name: '@generacy-ai/agency-plugin-invalid' })
      );

      const plugins = await discovery.discoverFromNodeModules(nodeModules);

      expect(plugins).toHaveLength(1);
      expect(plugins[0]?.manifest.id).toBe('@generacy-ai/agency-plugin-valid');
    });
  });

  describe('loadFromExplicitPath', () => {
    it('loads a plugin from explicit path', async () => {
      const pluginPath = await createMockPlugin(testDir, 'my-custom-plugin', {
        name: '@custom/my-plugin',
        version: '1.0.0',
      });

      const plugin = await discovery.loadFromExplicitPath(pluginPath);

      expect(plugin).not.toBeNull();
      expect(plugin?.manifest.id).toBe('@custom/my-plugin');
      expect(plugin?.source).toBe('explicit');
    });

    it('returns null for non-existent path', async () => {
      const plugin = await discovery.loadFromExplicitPath(
        join(testDir, 'non-existent')
      );

      expect(plugin).toBeNull();
    });

    it('returns null for invalid package.json', async () => {
      const pluginPath = join(testDir, 'invalid-plugin');
      await mkdir(pluginPath, { recursive: true });
      await writeFile(join(pluginPath, 'package.json'), 'not json');

      const plugin = await discovery.loadFromExplicitPath(pluginPath);

      expect(plugin).toBeNull();
    });
  });

  describe('discover', () => {
    it('combines node_modules and explicit paths', async () => {
      const nodeModules = join(testDir, 'node_modules');
      await createMockPlugin(nodeModules, '@generacy-ai/agency-plugin-nm', {
        version: '1.0.0',
      });

      const explicitPath = await createMockPlugin(testDir, 'explicit-plugin', {
        name: '@custom/explicit',
        version: '2.0.0',
      });

      const plugins = await discovery.discover({
        searchPaths: [nodeModules],
        additionalPlugins: [explicitPath],
      });

      expect(plugins).toHaveLength(2);
      const ids = plugins.map((p) => p.manifest.id).sort();
      expect(ids).toEqual(['@custom/explicit', '@generacy-ai/agency-plugin-nm']);
    });
  });

  describe('with agency manifest field', () => {
    it('uses agency field for manifest data', async () => {
      const nodeModules = join(testDir, 'node_modules');
      const pluginPath = join(nodeModules, '@generacy-ai/agency-plugin-agency');
      await mkdir(pluginPath, { recursive: true });

      const packageJson = {
        name: '@generacy-ai/agency-plugin-agency',
        version: '1.0.0',
        agency: {
          name: 'Custom Name',
          dependencies: ['@generacy-ai/agency-plugin-dep'],
          critical: true,
          tools: ['tool1', 'tool2'],
        },
      };

      await writeFile(
        join(pluginPath, 'package.json'),
        JSON.stringify(packageJson, null, 2)
      );

      const plugins = await discovery.discoverFromNodeModules(nodeModules);

      expect(plugins).toHaveLength(1);
      expect(plugins[0]?.manifest.name).toBe('Custom Name');
      expect(plugins[0]?.manifest.dependencies).toEqual(['@generacy-ai/agency-plugin-dep']);
      expect(plugins[0]?.manifest.critical).toBe(true);
      expect(plugins[0]?.manifest.tools).toEqual(['tool1', 'tool2']);
    });
  });
});

describe('findNodeModules', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = join(tmpdir(), `agency-findnm-test-${Date.now()}`);
    await mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  it('finds node_modules in current directory', async () => {
    const nodeModules = join(testDir, 'node_modules');
    await mkdir(nodeModules, { recursive: true });

    const result = await findNodeModules(testDir);

    expect(result).toBe(nodeModules);
  });

  it('finds node_modules in parent directory', async () => {
    const nodeModules = join(testDir, 'node_modules');
    await mkdir(nodeModules, { recursive: true });

    const subDir = join(testDir, 'packages', 'sub');
    await mkdir(subDir, { recursive: true });

    const result = await findNodeModules(subDir);

    expect(result).toBe(nodeModules);
  });

  it('returns null when no node_modules found', async () => {
    const result = await findNodeModules(testDir);

    expect(result).toBeNull();
  });
});

describe('createDiscoveryOptions', () => {
  it('creates options with node_modules path', () => {
    const options = createDiscoveryOptions('/project');

    expect(options.searchPaths).toEqual(['/project/node_modules']);
    expect(options.additionalPlugins).toBeUndefined();
  });

  it('includes additional plugins when provided', () => {
    const options = createDiscoveryOptions('/project', ['/custom/plugin1', '/custom/plugin2']);

    expect(options.searchPaths).toEqual(['/project/node_modules']);
    expect(options.additionalPlugins).toEqual(['/custom/plugin1', '/custom/plugin2']);
  });
});

describe('PluginDiscovery with custom pattern', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = join(tmpdir(), `agency-pattern-test-${Date.now()}`);
    await mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  it('uses custom pattern for matching', async () => {
    const customPattern = /^@custom\/plugin-[\w-]+$/;
    const discovery = new PluginDiscovery(customPattern);

    const nodeModules = join(testDir, 'node_modules');

    // Create matching plugin
    const matchingPath = join(nodeModules, '@custom/plugin-test');
    await mkdir(matchingPath, { recursive: true });
    await writeFile(
      join(matchingPath, 'package.json'),
      JSON.stringify({
        name: '@custom/plugin-test',
        version: '1.0.0',
      })
    );

    // Create non-matching plugin
    const nonMatchingPath = join(nodeModules, '@generacy-ai/agency-plugin-test');
    await mkdir(nonMatchingPath, { recursive: true });
    await writeFile(
      join(nonMatchingPath, 'package.json'),
      JSON.stringify({
        name: '@generacy-ai/agency-plugin-test',
        version: '1.0.0',
      })
    );

    const plugins = await discovery.discoverFromNodeModules(nodeModules);

    expect(plugins).toHaveLength(1);
    expect(plugins[0]?.manifest.id).toBe('@custom/plugin-test');
  });
});
