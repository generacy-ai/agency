import type * as vscode from 'vscode';
import {
  type AgencyConfig,
  type PluginConfig,
  type ModeConfig,
  type ContainerConfig,
  readConfig,
  writeConfig,
  watchConfig,
  initializeConfig,
  DEFAULT_CONFIG_PATH,
  DEFAULT_CONFIG_VERSION,
  isCompatibleVersion,
  parseAgencyConfig,
} from '../config';
import { createScopedLogger, DisposableManager } from '../utils';

const log = createScopedLogger('ConfigService');

/**
 * Interface for config version migrations.
 * Each migration transforms config from one version to the next.
 */
interface ConfigMigration {
  fromVersion: string;
  toVersion: string;
  migrate(config: Record<string, unknown>): Record<string, unknown>;
}

/**
 * Registry of config migrations.
 * Add new migrations here when schema changes.
 */
const MIGRATIONS: ConfigMigration[] = [
  // Example migration for future use:
  // {
  //   fromVersion: '1.0.0',
  //   toVersion: '1.1.0',
  //   migrate(config) {
  //     return { ...config, newField: 'default' };
  //   },
  // },
];

/**
 * Simple event emitter for VS Code-style events.
 */
class EventEmitter<T> {
  private _listeners: Set<(value: T) => void> = new Set();

  get event(): (listener: (value: T) => void) => vscode.Disposable {
    return (listener: (value: T) => void): vscode.Disposable => {
      this._listeners.add(listener);
      return {
        dispose: () => {
          this._listeners.delete(listener);
        },
      };
    };
  }

  fire(value: T): void {
    for (const listener of this._listeners) {
      try {
        listener(value);
      } catch (error) {
        log.error('Error in config change listener', error);
      }
    }
  }

  dispose(): void {
    this._listeners.clear();
  }
}

/**
 * ConfigService provides centralized access to Agency configuration.
 *
 * This is a singleton service that:
 * - Loads and caches the configuration
 * - Watches for external config file changes
 * - Provides typed getter methods for config sections
 * - Provides save methods that update and persist config
 * - Emits events when configuration changes
 * - Handles config version migration
 *
 * @example
 * ```typescript
 * // In extension activation
 * const configService = ConfigService.getInstance();
 * await configService.initialize(vscode);
 *
 * // Get configuration
 * const plugins = configService.getPlugins();
 * const mode = configService.getMode('default');
 *
 * // Save configuration
 * await configService.savePluginConfig({ id: 'my-plugin', enabled: true, settings: {} });
 *
 * // Listen for changes
 * configService.onConfigChange((config) => {
 *   console.log('Config changed:', config);
 * });
 * ```
 */
export class ConfigService {
  private static _instance: ConfigService | undefined;

  private _config: AgencyConfig | null = null;
  private _vscodeModule: typeof vscode | null = null;
  private _initialized = false;
  private _disposables = new DisposableManager();
  private _onConfigChange = new EventEmitter<AgencyConfig | null>();

  /**
   * Private constructor to enforce singleton pattern.
   * Use ConfigService.getInstance() to get the instance.
   */
  private constructor() {}

  /**
   * Get the singleton ConfigService instance.
   * Creates a new instance if one doesn't exist.
   */
  static getInstance(): ConfigService {
    if (!ConfigService._instance) {
      ConfigService._instance = new ConfigService();
    }
    return ConfigService._instance;
  }

  /**
   * Reset the singleton instance.
   * This is primarily for testing purposes.
   */
  static reset(): void {
    if (ConfigService._instance) {
      ConfigService._instance.dispose();
      ConfigService._instance = undefined;
    }
  }

  /**
   * Initialize the ConfigService.
   * Must be called before using other methods.
   *
   * @param vscodeModule The VS Code module for API access
   * @throws Error if already initialized
   */
  async initialize(vscodeModule: typeof vscode): Promise<void> {
    if (this._initialized) {
      log.debug('ConfigService already initialized');
      return;
    }

    this._vscodeModule = vscodeModule;

    // Load or create config
    this._config = await initializeConfig(vscodeModule, DEFAULT_CONFIG_PATH);

    // Check for version migration
    if (this._config && !isCompatibleVersion(this._config.version)) {
      log.info(
        `Config version ${this._config.version} needs migration to ${DEFAULT_CONFIG_VERSION}`
      );
      this._config = this._migrateConfig(this._config);
      await this._saveConfig();
    }

    // Set up file watcher for external changes
    const watcher = watchConfig(vscodeModule, DEFAULT_CONFIG_PATH, (newConfig) => {
      if (newConfig) {
        // Check if migration is needed for externally changed config
        if (!isCompatibleVersion(newConfig.version)) {
          newConfig = this._migrateConfig(newConfig);
        }
      }
      this._config = newConfig;
      this._onConfigChange.fire(newConfig);
      log.debug('Config reloaded from external change');
    });
    this._disposables.add(watcher);

    this._initialized = true;
    this._onConfigChange.fire(this._config);
    log.info('ConfigService initialized');
  }

  /**
   * Check if the service has been initialized.
   */
  isInitialized(): boolean {
    return this._initialized;
  }

  /**
   * Get the full configuration.
   * Returns null if no configuration is loaded.
   */
  getConfig(): AgencyConfig | null {
    this._ensureInitialized();
    return this._config;
  }

  /**
   * Get all plugin configurations.
   * Returns empty array if no configuration is loaded.
   */
  getPlugins(): PluginConfig[] {
    this._ensureInitialized();
    return this._config?.plugins ?? [];
  }

  /**
   * Get all mode configurations.
   * Returns empty array if no configuration is loaded.
   */
  getModes(): ModeConfig[] {
    this._ensureInitialized();
    return this._config?.modes ?? [];
  }

  /**
   * Get all container configurations.
   * Returns empty array if no configuration is loaded.
   */
  getContainers(): ContainerConfig[] {
    this._ensureInitialized();
    return this._config?.containers ?? [];
  }

  /**
   * Get a specific plugin by ID.
   * Returns undefined if not found.
   */
  getPlugin(id: string): PluginConfig | undefined {
    return this.getPlugins().find((p) => p.id === id);
  }

  /**
   * Get a specific mode by ID.
   * Returns undefined if not found.
   */
  getMode(id: string): ModeConfig | undefined {
    return this.getModes().find((m) => m.id === id);
  }

  /**
   * Get a specific container by ID.
   * Returns undefined if not found.
   */
  getContainer(id: string): ContainerConfig | undefined {
    return this.getContainers().find((c) => c.id === id);
  }

  /**
   * Save a plugin configuration.
   * Updates existing plugin if ID matches, otherwise adds new plugin.
   *
   * @param plugin The plugin configuration to save
   */
  async savePluginConfig(plugin: PluginConfig): Promise<void> {
    this._ensureInitialized();
    if (!this._config) {
      throw new Error('No configuration loaded');
    }

    const index = this._config.plugins.findIndex((p) => p.id === plugin.id);
    if (index >= 0) {
      this._config.plugins[index] = plugin;
    } else {
      this._config.plugins.push(plugin);
    }

    await this._saveConfig();
    log.debug(`Plugin config saved: ${plugin.id}`);
  }

  /**
   * Save a mode configuration.
   * Updates existing mode if ID matches, otherwise adds new mode.
   *
   * @param mode The mode configuration to save
   */
  async saveModeConfig(mode: ModeConfig): Promise<void> {
    this._ensureInitialized();
    if (!this._config) {
      throw new Error('No configuration loaded');
    }

    const index = this._config.modes.findIndex((m) => m.id === mode.id);
    if (index >= 0) {
      this._config.modes[index] = mode;
    } else {
      this._config.modes.push(mode);
    }

    await this._saveConfig();
    log.debug(`Mode config saved: ${mode.id}`);
  }

  /**
   * Save a container configuration.
   * Updates existing container if ID matches, otherwise adds new container.
   *
   * @param container The container configuration to save
   */
  async saveContainerConfig(container: ContainerConfig): Promise<void> {
    this._ensureInitialized();
    if (!this._config) {
      throw new Error('No configuration loaded');
    }

    const index = this._config.containers.findIndex((c) => c.id === container.id);
    if (index >= 0) {
      this._config.containers[index] = container;
    } else {
      this._config.containers.push(container);
    }

    await this._saveConfig();
    log.debug(`Container config saved: ${container.id}`);
  }

  /**
   * Remove a plugin by ID.
   *
   * @param id The plugin ID to remove
   * @returns true if plugin was found and removed, false otherwise
   */
  async removePlugin(id: string): Promise<boolean> {
    this._ensureInitialized();
    if (!this._config) {
      throw new Error('No configuration loaded');
    }

    const index = this._config.plugins.findIndex((p) => p.id === id);
    if (index < 0) {
      return false;
    }

    this._config.plugins.splice(index, 1);
    await this._saveConfig();
    log.debug(`Plugin removed: ${id}`);
    return true;
  }

  /**
   * Remove a mode by ID.
   * Cannot remove the 'default' mode.
   *
   * @param id The mode ID to remove
   * @returns true if mode was found and removed, false otherwise
   */
  async removeMode(id: string): Promise<boolean> {
    this._ensureInitialized();
    if (!this._config) {
      throw new Error('No configuration loaded');
    }

    if (id === 'default') {
      log.warn('Cannot remove the default mode');
      return false;
    }

    const index = this._config.modes.findIndex((m) => m.id === id);
    if (index < 0) {
      return false;
    }

    this._config.modes.splice(index, 1);
    await this._saveConfig();
    log.debug(`Mode removed: ${id}`);
    return true;
  }

  /**
   * Remove a container by ID.
   *
   * @param id The container ID to remove
   * @returns true if container was found and removed, false otherwise
   */
  async removeContainer(id: string): Promise<boolean> {
    this._ensureInitialized();
    if (!this._config) {
      throw new Error('No configuration loaded');
    }

    const index = this._config.containers.findIndex((c) => c.id === id);
    if (index < 0) {
      return false;
    }

    this._config.containers.splice(index, 1);
    await this._saveConfig();
    log.debug(`Container removed: ${id}`);
    return true;
  }

  /**
   * Event fired when configuration changes.
   * This includes initial load, external file changes, and save operations.
   */
  get onConfigChange(): (listener: (config: AgencyConfig | null) => void) => vscode.Disposable {
    return this._onConfigChange.event;
  }

  /**
   * Dispose of the ConfigService and clean up resources.
   */
  dispose(): void {
    this._disposables.dispose();
    this._onConfigChange.dispose();
    this._config = null;
    this._vscodeModule = null;
    this._initialized = false;
    log.debug('ConfigService disposed');
  }

  /**
   * Ensure the service is initialized before use.
   * @throws Error if not initialized
   */
  private _ensureInitialized(): void {
    if (!this._initialized) {
      throw new Error('ConfigService not initialized. Call initialize() first.');
    }
  }

  /**
   * Save the current config to file and emit change event.
   */
  private async _saveConfig(): Promise<void> {
    if (!this._vscodeModule || !this._config) {
      throw new Error('Cannot save: service not properly initialized');
    }

    await writeConfig(this._vscodeModule, DEFAULT_CONFIG_PATH, this._config);
    this._onConfigChange.fire(this._config);
  }

  /**
   * Migrate config from an older version to the current version.
   * Applies migrations in sequence until reaching current version.
   *
   * @param config The config to migrate
   * @returns The migrated config
   */
  private _migrateConfig(config: AgencyConfig): AgencyConfig {
    let currentConfig: Record<string, unknown> = { ...config };
    let currentVersion = config.version;

    // Apply migrations in sequence
    for (const migration of MIGRATIONS) {
      if (migration.fromVersion === currentVersion) {
        log.info(`Applying migration from ${migration.fromVersion} to ${migration.toVersion}`);
        currentConfig = migration.migrate(currentConfig);
        currentVersion = migration.toVersion;
      }
    }

    // Update version to current
    currentConfig['version'] = DEFAULT_CONFIG_VERSION;

    // Parse to ensure validity
    const result = parseAgencyConfig(currentConfig);
    if (!result) {
      log.error('Migration resulted in invalid config, using defaults');
      return {
        version: DEFAULT_CONFIG_VERSION,
        plugins: config.plugins ?? [],
        modes: config.modes ?? [],
        containers: config.containers ?? [],
      };
    }

    log.info(`Config migrated to version ${DEFAULT_CONFIG_VERSION}`);
    return result;
  }
}
