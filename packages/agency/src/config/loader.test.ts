import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ConfigLoader } from './loader.js';
import { AgencyError, ErrorCodes } from '../errors/index.js';

describe('ConfigLoader', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = join(tmpdir(), `agency-test-${Date.now()}`);
    await mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
    vi.unstubAllEnvs();
  });

  describe('load from .agency/config.json', () => {
    it('should load config from .agency/config.json', async () => {
      const agencyDir = join(testDir, '.agency');
      await mkdir(agencyDir);
      await writeFile(
        join(agencyDir, 'config.json'),
        JSON.stringify({
          name: 'test-agency',
          plugins: ['test-plugin'],
          modes: { dev: ['*'] },
        })
      );

      const loader = new ConfigLoader(testDir);
      const config = await loader.load();

      expect(config.name).toBe('test-agency');
      expect(config.plugins).toEqual(['test-plugin']);
      // Config modes merge with defaults (default mode always exists)
      expect(config.modes.dev).toEqual(['*']);
    });
  });

  describe('load from package.json', () => {
    it('should load config from package.json agency field', async () => {
      await writeFile(
        join(testDir, 'package.json'),
        JSON.stringify({
          name: 'test-package',
          agency: {
            name: 'package-agency',
            plugins: ['pkg-plugin'],
          },
        })
      );

      const loader = new ConfigLoader(testDir);
      const config = await loader.load();

      expect(config.name).toBe('package-agency');
      expect(config.plugins).toEqual(['pkg-plugin']);
    });

    it('should ignore package.json without agency field', async () => {
      await writeFile(
        join(testDir, 'package.json'),
        JSON.stringify({ name: 'test-package' })
      );

      const loader = new ConfigLoader(testDir);
      const config = await loader.load();

      // Should use defaults
      expect(config.name).toBe('agency');
    });
  });

  describe('load from environment variables', () => {
    it('should load AGENCY_NAME from environment', async () => {
      vi.stubEnv('AGENCY_NAME', 'env-agency');

      const loader = new ConfigLoader(testDir);
      const config = await loader.load();

      expect(config.name).toBe('env-agency');
    });

    it('should load AGENCY_PLUGINS from environment', async () => {
      vi.stubEnv('AGENCY_PLUGINS', 'plugin-a, plugin-b, plugin-c');

      const loader = new ConfigLoader(testDir);
      const config = await loader.load();

      expect(config.plugins).toEqual(['plugin-a', 'plugin-b', 'plugin-c']);
    });

    it('should load AGENCY_DEFAULT_MODE from environment', async () => {
      vi.stubEnv('AGENCY_DEFAULT_MODE', 'production');

      const loader = new ConfigLoader(testDir);
      const config = await loader.load();

      expect(config.defaultMode).toBe('production');
    });
  });

  describe('config priority', () => {
    it('should prioritize .agency/config.json over package.json', async () => {
      // Create .agency/config.json (priority 1)
      const agencyDir = join(testDir, '.agency');
      await mkdir(agencyDir);
      await writeFile(
        join(agencyDir, 'config.json'),
        JSON.stringify({ name: 'agency-config' })
      );

      // Create package.json (priority 2)
      await writeFile(
        join(testDir, 'package.json'),
        JSON.stringify({ agency: { name: 'package-config' } })
      );

      const loader = new ConfigLoader(testDir);
      const config = await loader.load();

      expect(config.name).toBe('agency-config');
    });

    it('should prioritize package.json over env vars', async () => {
      vi.stubEnv('AGENCY_NAME', 'env-config');

      await writeFile(
        join(testDir, 'package.json'),
        JSON.stringify({ agency: { name: 'package-config' } })
      );

      const loader = new ConfigLoader(testDir);
      const config = await loader.load();

      expect(config.name).toBe('package-config');
    });
  });

  describe('config validation', () => {
    it('should use defaults when no config found', async () => {
      const loader = new ConfigLoader(testDir);
      const config = await loader.load();

      expect(config.name).toBe('agency');
      expect(config.plugins).toEqual([]);
      expect(config.modes).toEqual({ default: ['*'] });
      expect(config.defaultMode).toBe('default');
    });
  });

  describe('config merging', () => {
    it('should merge modes from multiple sources', async () => {
      const agencyDir = join(testDir, '.agency');
      await mkdir(agencyDir);
      await writeFile(
        join(agencyDir, 'config.json'),
        JSON.stringify({
          name: 'test',
          modes: { dev: ['dev.*'] },
        })
      );

      await writeFile(
        join(testDir, 'package.json'),
        JSON.stringify({
          agency: {
            modes: { prod: ['prod.*'] },
          },
        })
      );

      const loader = new ConfigLoader(testDir);
      const config = await loader.load();

      // .agency/config.json has higher priority, its modes win but merge with defaults
      expect(config.modes.dev).toEqual(['dev.*']);
      expect(config.modes['default']).toEqual(['*']); // Default always present
    });
  });
});
