/**
 * Configuration loader for Agency
 *
 * Loads configuration from multiple sources with priority:
 * 1. .agency/config.json (highest)
 * 2. package.json "agency" field
 * 3. Environment variables (lowest)
 */

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { AgencyError, ErrorCodes } from '../errors/index.js';
import {
  AgencyConfigSchema,
  DEFAULT_CONFIG,
  type AgencyConfig,
  type ConfigSource,
  type PartialAgencyConfig,
} from './schema.js';

/**
 * Configuration loader class
 *
 * Loads and merges configuration from multiple sources based on priority.
 */
export class ConfigLoader {
  private readonly projectRoot: string;

  constructor(projectRoot: string = process.cwd()) {
    this.projectRoot = projectRoot;
  }

  /**
   * Load configuration from all sources and merge by priority
   */
  async load(): Promise<AgencyConfig> {
    const sources: ConfigSource[] = [];

    // Load from .agency/config.json (priority 1 - highest)
    const fileConfig = await this.loadAgencyConfigFile();
    if (fileConfig) {
      sources.push({
        priority: 1,
        name: '.agency/config.json',
        config: fileConfig,
      });
    }

    // Load from package.json "agency" field (priority 2)
    const packageConfig = await this.loadPackageJson();
    if (packageConfig) {
      sources.push({
        priority: 2,
        name: 'package.json',
        config: packageConfig,
      });
    }

    // Load from environment variables (priority 3 - lowest)
    const envConfig = this.loadEnvVars();
    if (Object.keys(envConfig).length > 0) {
      sources.push({
        priority: 3,
        name: 'environment',
        config: envConfig,
      });
    }

    // Merge configs by priority
    const merged = this.merge(sources);

    // Validate the merged config
    const result = AgencyConfigSchema.safeParse(merged);
    if (!result.success) {
      throw new AgencyError(
        ErrorCodes.CONFIG_INVALID,
        `Configuration validation failed: ${result.error.message}`,
        { errors: result.error.errors }
      );
    }

    return result.data;
  }

  /**
   * Load configuration from .agency/config.json
   */
  private async loadAgencyConfigFile(): Promise<PartialAgencyConfig | null> {
    const configPath = join(this.projectRoot, '.agency', 'config.json');
    try {
      const content = await readFile(configPath, 'utf-8');
      return JSON.parse(content) as PartialAgencyConfig;
    } catch {
      return null;
    }
  }

  /**
   * Load configuration from package.json "agency" field
   */
  private async loadPackageJson(): Promise<PartialAgencyConfig | null> {
    const packagePath = join(this.projectRoot, 'package.json');
    try {
      const content = await readFile(packagePath, 'utf-8');
      const pkg = JSON.parse(content) as Record<string, unknown>;
      if (pkg['agency'] && typeof pkg['agency'] === 'object') {
        return pkg['agency'] as PartialAgencyConfig;
      }
      return null;
    } catch {
      return null;
    }
  }

  /**
   * Load configuration from environment variables
   *
   * Environment variables use AGENCY_ prefix:
   * - AGENCY_NAME: Server name
   * - AGENCY_PLUGINS: Comma-separated list of plugins
   * - AGENCY_DEFAULT_MODE: Default mode
   */
  private loadEnvVars(): PartialAgencyConfig {
    const config: PartialAgencyConfig = {};

    if (process.env['AGENCY_NAME']) {
      config.name = process.env['AGENCY_NAME'];
    }

    if (process.env['AGENCY_PLUGINS']) {
      config.plugins = process.env['AGENCY_PLUGINS']
        .split(',')
        .map((p) => p.trim())
        .filter((p) => p.length > 0);
    }

    if (process.env['AGENCY_DEFAULT_MODE']) {
      config.defaultMode = process.env['AGENCY_DEFAULT_MODE'];
    }

    return config;
  }

  /**
   * Merge configuration sources by priority (lower priority number = higher precedence)
   */
  private merge(sources: ConfigSource[]): PartialAgencyConfig {
    // Sort by priority (lower first = higher precedence)
    const sorted = [...sources].sort((a, b) => a.priority - b.priority);

    // Start with defaults, then apply each source
    let merged: PartialAgencyConfig = { ...DEFAULT_CONFIG };

    // Apply in reverse order (lowest priority first, so higher priority wins)
    for (const source of sorted.reverse()) {
      merged = this.mergeConfigs(merged, source.config);
    }

    return merged;
  }

  /**
   * Deep merge two configs (target is overwritten by source)
   */
  private mergeConfigs(
    target: PartialAgencyConfig,
    source: PartialAgencyConfig
  ): PartialAgencyConfig {
    const result: PartialAgencyConfig = { ...target };

    if (source.name !== undefined) {
      result.name = source.name;
    }

    if (source.plugins !== undefined) {
      result.plugins = source.plugins;
    }

    if (source.pluginPaths !== undefined) {
      result.pluginPaths = source.pluginPaths;
    }

    if (source.pluginOptions !== undefined) {
      result.pluginOptions = { ...target.pluginOptions, ...source.pluginOptions };
    }

    if (source.modes !== undefined) {
      result.modes = { ...target.modes, ...source.modes };
    }

    if (source.defaultMode !== undefined) {
      result.defaultMode = source.defaultMode;
    }

    return result;
  }
}
