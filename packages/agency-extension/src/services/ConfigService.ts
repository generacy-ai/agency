import { createHash } from 'node:crypto';
import type * as vscode from 'vscode';
import {
  type AgencyConfig,
  type PluginConfig,
  type ModeConfig,
  type ContainerConfig,
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
 * Event fired when an external config file change conflicts with
 * unsaved webview edits.
 */
export interface ConfigConflictEvent {
  /** Whether the config file was changed externally */
  externalChanges: boolean;
  /** Whether the webview has unsaved changes */
  webviewDirty: boolean;
}

/**
 * Registry of config migrations.
 * Add new migrations here when schema changes.
 */
const MIGRATIONS: ConfigMigration[] = [
  // Add version-based migrations here as needed.
];

/**
 * Check whether a raw mode object uses old-format field names.
 */
function isModeOldFormat(mode: Record<string, unknown>): boolean {
  return 'inherits' in mode || ('tools' in mode && !('includedTools' in mode));
}

/**
 * Check whether a raw container object uses old-format field names.
 */
function isContainerOldFormat(container: Record<string, unknown>): boolean {
  return 'mcpCommand' in container || 'mcpArgs' in container || 'dockerComposePath' in container;
}

/**
 * Detect whether raw parsed JSON contains old-format config fields.
 * Checks modes for `inherits`/`tools` and containers for `mcpCommand`/`mcpArgs`/`dockerComposePath`.
 */
export function needsSchemaMigration(raw: Record<string, unknown>): boolean {
  const modes = raw['modes'];
  if (Array.isArray(modes)) {
    for (const mode of modes) {
      if (mode && typeof mode === 'object' && isModeOldFormat(mode as Record<string, unknown>)) {
        return true;
      }
    }
  }

  const containers = raw['containers'];
  if (Array.isArray(containers)) {
    for (const container of containers) {
      if (container && typeof container === 'object' && isContainerOldFormat(container as Record<string, unknown>)) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Migrate a single mode object from old format to new format.
 * - `inherits` → `parentId`
 * - `tools` → `includedTools` (with `excludedTools: []`)
 */
function migrateMode(mode: Record<string, unknown>): Record<string, unknown> {
  const migrated = { ...mode };

  if ('inherits' in migrated) {
    migrated['parentId'] = migrated['inherits'];
    delete migrated['inherits'];
  }

  if ('tools' in migrated && !('includedTools' in migrated)) {
    migrated['includedTools'] = migrated['tools'];
    migrated['excludedTools'] = [];
    delete migrated['tools'];
  }

  return migrated;
}

/**
 * Migrate a single container object from old format to new format.
 * - `mcpCommand` → `connection.command`
 * - `mcpArgs` → `connection.args`
 * - `dockerComposePath` → `devcontainerPath`
 */
function migrateContainer(container: Record<string, unknown>): Record<string, unknown> {
  const migrated = { ...container };

  // Migrate flat mcpCommand/mcpArgs into nested connection object
  if ('mcpCommand' in migrated || 'mcpArgs' in migrated) {
    const connection: Record<string, unknown> = {};
    if ('mcpCommand' in migrated) {
      connection['command'] = migrated['mcpCommand'];
      delete migrated['mcpCommand'];
    }
    if ('mcpArgs' in migrated) {
      connection['args'] = migrated['mcpArgs'];
      delete migrated['mcpArgs'];
    }
    // Preserve any existing connection.env if somehow both old and new fields exist
    if (migrated['connection'] && typeof migrated['connection'] === 'object') {
      const existing = migrated['connection'] as Record<string, unknown>;
      if (existing['env']) {
        connection['env'] = existing['env'];
      }
    }
    migrated['connection'] = connection;
  }

  // Rename dockerComposePath → devcontainerPath
  if ('dockerComposePath' in migrated) {
    migrated['devcontainerPath'] = migrated['dockerComposePath'];
    delete migrated['dockerComposePath'];
  }

  return migrated;
}

/**
 * Migrate raw config JSON from old-format fields to new-format fields.
 * This operates on the raw parsed JSON before Zod validation.
 *
 * Migrations applied:
 * - modes[].inherits → modes[].parentId
 * - modes[].tools → modes[].includedTools + excludedTools: []
 * - containers[].mcpCommand → containers[].connection.command
 * - containers[].mcpArgs → containers[].connection.args
 * - containers[].dockerComposePath → containers[].devcontainerPath
 */
export function migrateOldFormatConfig(raw: Record<string, unknown>): Record<string, unknown> {
  const migrated = { ...raw };

  // Migrate modes
  const modes = migrated['modes'];
  if (Array.isArray(modes)) {
    migrated['modes'] = modes.map((mode) => {
      if (mode && typeof mode === 'object') {
        return migrateMode(mode as Record<string, unknown>);
      }
      return mode;
    });
  }

  // Migrate containers
  const containers = migrated['containers'];
  if (Array.isArray(containers)) {
    migrated['containers'] = containers.map((container) => {
      if (container && typeof container === 'object') {
        return migrateContainer(container as Record<string, unknown>);
      }
      return container;
    });
  }

  return migrated;
}

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
  private _onConfigConflict = new EventEmitter<ConfigConflictEvent>();
  private _lastSavedHash = '';
  private _webviewDirty = false;

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

    // Check for schema field migration before normal loading.
    // Old-format fields (e.g. `inherits`, `tools`, `mcpCommand`) would be
    // silently dropped by Zod validation, so we must migrate the raw JSON first.
    await this._migrateSchemaFieldsIfNeeded(vscodeModule);

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

    // Compute initial hash for conflict detection
    this._lastSavedHash = await this._computeConfigHash(vscodeModule);

    // Set up file watcher for external changes
    const watcher = watchConfig(vscodeModule, DEFAULT_CONFIG_PATH, async (newConfig) => {
      // Compute hash of the new file content before any migration
      const newHash = await this._computeConfigHash(vscodeModule);

      // Detect conflict: external change while webview has unsaved edits
      if (newHash !== this._lastSavedHash && this._webviewDirty) {
        this._onConfigConflict.fire({
          externalChanges: true,
          webviewDirty: true,
        });
        log.warn('Config conflict detected: external change while webview is dirty');
      }

      // Update hash to reflect the new file state
      this._lastSavedHash = newHash;

      // Check raw file for old-format fields that need migration
      const watcherMigrated = await this._migrateSchemaFieldsIfNeeded(vscodeModule);
      if (watcherMigrated) {
        // Re-read the newly migrated config
        newConfig = await this._readParsedConfig(vscodeModule);
        // Update hash after migration rewrote the file
        this._lastSavedHash = await this._computeConfigHash(vscodeModule);
      }

      if (newConfig) {
        // Check if version migration is needed for externally changed config
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
   * Event fired when a config conflict is detected.
   * Occurs when external file changes are detected while the webview has unsaved edits.
   */
  get onConfigConflict(): (listener: (event: ConfigConflictEvent) => void) => vscode.Disposable {
    return this._onConfigConflict.event;
  }

  /**
   * Set the webview dirty state.
   * Called by webviews when the user edits config in the UI.
   * Cleared automatically on save.
   *
   * @param dirty Whether the webview has unsaved changes
   */
  setWebviewDirty(dirty: boolean): void {
    this._ensureInitialized();
    this._webviewDirty = dirty;
  }

  /**
   * Check if the webview has unsaved changes.
   */
  isWebviewDirty(): boolean {
    return this._webviewDirty;
  }

  /**
   * Dispose of the ConfigService and clean up resources.
   */
  dispose(): void {
    this._disposables.dispose();
    this._onConfigChange.dispose();
    this._onConfigConflict.dispose();
    this._config = null;
    this._vscodeModule = null;
    this._initialized = false;
    this._lastSavedHash = '';
    this._webviewDirty = false;
    log.debug('ConfigService disposed');
  }

  /**
   * Compute a SHA-256 hash of the raw config file content.
   * Returns an empty string if the file cannot be read.
   */
  private async _computeConfigHash(vscodeModule: typeof vscode): Promise<string> {
    try {
      const workspaceFolder = vscodeModule.workspace.workspaceFolders?.[0];
      if (!workspaceFolder) {
        return '';
      }

      const configUri = vscodeModule.Uri.joinPath(workspaceFolder.uri, DEFAULT_CONFIG_PATH);
      const fileData = await vscodeModule.workspace.fs.readFile(configUri);
      const content = new TextDecoder().decode(fileData);
      return createHash('sha256').update(content).digest('hex');
    } catch {
      return '';
    }
  }

  /**
   * Read the raw config file as parsed JSON (without Zod validation).
   * Returns null if the file doesn't exist, isn't valid JSON, or if
   * the required VS Code filesystem APIs are not available.
   */
  private async _readRawConfig(vscodeModule: typeof vscode): Promise<Record<string, unknown> | null> {
    try {
      const workspaceFolder = vscodeModule.workspace.workspaceFolders?.[0];
      if (!workspaceFolder) {
        return null;
      }

      const configUri = vscodeModule.Uri.joinPath(workspaceFolder.uri, DEFAULT_CONFIG_PATH);
      const fileData = await vscodeModule.workspace.fs.readFile(configUri);
      const content = new TextDecoder().decode(fileData);
      const parsed = JSON.parse(content);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
      return null;
    } catch {
      return null;
    }
  }

  /**
   * Read and parse config using Zod (re-read after migration).
   */
  private async _readParsedConfig(vscodeModule: typeof vscode): Promise<AgencyConfig | null> {
    const raw = await this._readRawConfig(vscodeModule);
    if (!raw) {
      return null;
    }
    return parseAgencyConfig(raw);
  }

  /**
   * Check the raw config file for old-format fields and migrate if needed.
   * Writes the migrated config back to disk.
   *
   * @returns true if migration was performed, false otherwise
   */
  private async _migrateSchemaFieldsIfNeeded(vscodeModule: typeof vscode): Promise<boolean> {
    const raw = await this._readRawConfig(vscodeModule);
    if (!raw || !needsSchemaMigration(raw)) {
      return false;
    }

    log.warn('Detected old-format config fields, migrating to new schema');

    const migrated = migrateOldFormatConfig(raw);
    const parsed = parseAgencyConfig(migrated);
    if (!parsed) {
      log.error('Schema migration resulted in invalid config, skipping migration');
      return false;
    }

    // Write migrated config back to disk
    try {
      const workspaceFolder = vscodeModule.workspace.workspaceFolders?.[0];
      if (!workspaceFolder) {
        return false;
      }

      const configUri = vscodeModule.Uri.joinPath(workspaceFolder.uri, DEFAULT_CONFIG_PATH);
      const content = JSON.stringify(migrated, null, 2);
      const encoded = new TextEncoder().encode(content);

      await vscodeModule.workspace.fs.writeFile(configUri, encoded);
      log.info('Config file migrated to new schema format');
      return true;
    } catch (error) {
      log.error('Failed to write migrated config', error);
      return false;
    }
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

    // Update hash to match what we just wrote and clear dirty flag
    this._lastSavedHash = await this._computeConfigHash(this._vscodeModule);
    this._webviewDirty = false;

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
