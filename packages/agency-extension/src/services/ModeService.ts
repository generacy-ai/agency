import type * as vscode from 'vscode';
import type {
  ModeInfo,
  ModeSwitchRequest,
  ModeSwitchResult,
  ModeValidationResult,
  ModeValidationError,
  ModeValidationWarning,
  ModeStateEvent,
} from '../types/mode';
import type { ModeConfig } from '../config/ConfigSchema';
import { ConfigService } from './ConfigService';
import { createScopedLogger, DisposableManager } from '../utils';

const log = createScopedLogger('ModeService');

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
        log.error('Error in mode state listener', error);
      }
    }
  }

  dispose(): void {
    this._listeners.clear();
  }
}

/**
 * ModeService manages mode configurations and switching.
 *
 * Modes control which tools are active. Modes support inheritance,
 * allowing child modes to include/exclude tools from parent modes.
 *
 * @example
 * ```typescript
 * const modeService = ModeService.getInstance();
 * await modeService.initialize(vscode);
 *
 * // Get current mode
 * const currentMode = modeService.getCurrentMode();
 *
 * // Switch mode
 * const result = await modeService.setCurrentMode({ modeId: 'debug', persist: true });
 *
 * // Get mode tree
 * const tree = modeService.buildModeTree();
 * ```
 */
export class ModeService {
  private static _instance: ModeService | undefined;

  private _configService: ConfigService;
  private _currentModeId: string = 'default';
  private _initialized = false;
  private _disposables = new DisposableManager();
  private _onModeStateChange = new EventEmitter<ModeStateEvent>();
  private _vscodeModule: typeof vscode | undefined;

  /**
   * Private constructor to enforce singleton pattern.
   */
  private constructor() {
    this._configService = ConfigService.getInstance();
  }

  /**
   * Get the singleton ModeService instance.
   */
  static getInstance(): ModeService {
    if (!ModeService._instance) {
      ModeService._instance = new ModeService();
    }
    return ModeService._instance;
  }

  /**
   * Reset the singleton instance (for testing).
   */
  static reset(): void {
    if (ModeService._instance) {
      ModeService._instance.dispose();
      ModeService._instance = undefined;
    }
  }

  /**
   * Initialize the ModeService.
   *
   * @param vscodeModule The VS Code module
   */
  async initialize(vscodeModule: typeof vscode): Promise<void> {
    if (this._initialized) {
      log.debug('ModeService already initialized');
      return;
    }

    this._vscodeModule = vscodeModule;

    // Ensure ConfigService is initialized
    if (!this._configService.isInitialized()) {
      await this._configService.initialize(vscodeModule);
    }

    // Load persisted mode from workspace settings first
    const persistedModeId = this._loadPersistedMode();

    // Load current mode from config (default to 'default' mode)
    const modes = this._configService.getModes();
    if (modes.length > 0) {
      // Check if persisted mode exists in config
      if (persistedModeId && modes.find((m) => m.id === persistedModeId)) {
        this._currentModeId = persistedModeId;
        log.info(`Restored persisted mode: ${persistedModeId}`);
      } else {
        // Use first mode or 'default' if it exists
        const defaultMode = modes.find((m) => m.id === 'default');
        if (defaultMode) {
          this._currentModeId = defaultMode.id;
        } else {
          const firstMode = modes[0];
          if (firstMode) {
            this._currentModeId = firstMode.id;
          }
        }
      }
    }

    // Listen for config changes
    const configDisposable = this._configService.onConfigChange(() => {
      this._onModeStateChange.fire({
        type: 'updated',
        modeId: this._currentModeId,
        modeInfo: this._buildModeInfo(this._currentModeId),
        timestamp: Date.now(),
      });
    });
    this._disposables.add(configDisposable);

    this._initialized = true;
    log.info('ModeService initialized');
  }

  /**
   * Load persisted mode from workspace settings.
   *
   * @returns The persisted mode ID or undefined if not set
   */
  private _loadPersistedMode(): string | undefined {
    if (!this._vscodeModule) {
      return undefined;
    }

    const config = this._vscodeModule.workspace.getConfiguration('agency');
    const modeId = config.get<string>('currentMode');

    // Empty string means use default, return undefined to trigger default logic
    if (!modeId || modeId.trim() === '') {
      return undefined;
    }

    return modeId;
  }

  /**
   * Persist current mode to workspace settings.
   *
   * @param modeId The mode ID to persist
   */
  private async _persistMode(modeId: string): Promise<void> {
    if (!this._vscodeModule) {
      log.warn('Cannot persist mode: vscode module not available');
      return;
    }

    try {
      const config = this._vscodeModule.workspace.getConfiguration('agency');
      await config.update(
        'currentMode',
        modeId,
        this._vscodeModule.ConfigurationTarget.Workspace
      );
      log.debug(`Persisted mode to workspace settings: ${modeId}`);
    } catch (error) {
      log.error('Failed to persist mode to workspace settings', error);
    }
  }

  /**
   * Get all mode configurations.
   */
  getModes(): ModeConfig[] {
    this._ensureInitialized();
    return this._configService.getModes();
  }

  /**
   * Get the currently active mode.
   */
  getCurrentMode(): ModeInfo | undefined {
    this._ensureInitialized();
    return this._buildModeInfo(this._currentModeId);
  }

  /**
   * Set the current active mode.
   *
   * @param request Mode switch request
   * @returns Result of the switch operation
   */
  async setCurrentMode(request: ModeSwitchRequest): Promise<ModeSwitchResult> {
    this._ensureInitialized();

    const previousModeId = this._currentModeId;
    const previousMode = this._buildModeInfo(previousModeId);
    const newMode = this._buildModeInfo(request.modeId);

    if (!newMode) {
      return {
        success: false,
        previousModeId,
        newModeId: request.modeId,
        addedTools: [],
        removedTools: [],
        error: `Mode '${request.modeId}' not found`,
        timestamp: Date.now(),
      };
    }

    // Calculate tool changes
    const previousTools = new Set(previousMode?.effectiveTools ?? []);
    const newTools = new Set(newMode.effectiveTools);

    const addedTools = [...newTools].filter((t) => !previousTools.has(t));
    const removedTools = [...previousTools].filter((t) => !newTools.has(t));

    // Update current mode
    this._currentModeId = request.modeId;

    // Persist to workspace settings if requested
    if (request.persist) {
      await this._persistMode(request.modeId);
    }

    // Emit events
    this._onModeStateChange.fire({
      type: 'deactivated',
      modeId: previousModeId,
      modeInfo: previousMode,
      timestamp: Date.now(),
    });
    this._onModeStateChange.fire({
      type: 'activated',
      modeId: request.modeId,
      modeInfo: newMode,
      timestamp: Date.now(),
    });

    log.info(`Switched mode: ${previousModeId} → ${request.modeId}`);

    return {
      success: true,
      previousModeId,
      newModeId: request.modeId,
      addedTools,
      removedTools,
      timestamp: Date.now(),
    };
  }

  /**
   * Validate all mode configurations.
   *
   * @returns Validation result with errors and warnings
   */
  validateModes(): ModeValidationResult {
    this._ensureInitialized();

    const modes = this._configService.getModes();
    const errors: ModeValidationError[] = [];
    const warnings: ModeValidationWarning[] = [];

    // Check for duplicate IDs
    const idSet = new Set<string>();
    for (const mode of modes) {
      if (idSet.has(mode.id)) {
        errors.push({
          modeId: mode.id,
          code: 'duplicate_id',
          message: `Duplicate mode ID: ${mode.id}`,
        });
      }
      idSet.add(mode.id);
    }

    // Check for circular inheritance
    for (const mode of modes) {
      if (this._hasCircularInheritance(mode.id, modes)) {
        errors.push({
          modeId: mode.id,
          code: 'circular_inheritance',
          message: `Circular inheritance detected for mode: ${mode.id}`,
        });
      }
    }

    // Check for missing parents
    for (const mode of modes) {
      if (mode.inherits && !modes.find((m) => m.id === mode.inherits)) {
        errors.push({
          modeId: mode.id,
          code: 'missing_parent',
          message: `Parent mode '${mode.inherits}' not found`,
        });
      }
    }

    // Check for empty modes
    for (const mode of modes) {
      if (mode.tools.length === 0 && !mode.inherits) {
        warnings.push({
          modeId: mode.id,
          code: 'empty_mode',
          message: `Mode '${mode.id}' has no tools and no parent`,
        });
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Build a mode inheritance tree.
   *
   * @returns Root modes with children populated
   */
  buildModeTree(): ModeInfo[] {
    this._ensureInitialized();

    const modes = this._configService.getModes();
    const modeInfoMap = new Map<string, ModeInfo>();

    // First pass: create ModeInfo for each mode
    for (const mode of modes) {
      const modeInfo = this._buildModeInfo(mode.id);
      if (modeInfo) {
        modeInfoMap.set(mode.id, modeInfo);
      }
    }

    // Second pass: build tree structure
    const roots: ModeInfo[] = [];
    for (const modeInfo of modeInfoMap.values()) {
      if (modeInfo.config.parentId) {
        const parent = modeInfoMap.get(modeInfo.config.parentId);
        if (parent) {
          parent.children.push(modeInfo);
          modeInfo.parent = parent;
        }
      } else {
        roots.push(modeInfo);
      }
    }

    return roots;
  }

  /**
   * Event fired when mode state changes.
   */
  get onModeStateChange(): (listener: (event: ModeStateEvent) => void) => vscode.Disposable {
    return this._onModeStateChange.event;
  }

  /**
   * Dispose of the service.
   */
  dispose(): void {
    this._disposables.dispose();
    this._onModeStateChange.dispose();
    this._initialized = false;
    log.debug('ModeService disposed');
  }

  /**
   * Ensure the service is initialized.
   */
  private _ensureInitialized(): void {
    if (!this._initialized) {
      throw new Error('ModeService not initialized. Call initialize() first.');
    }
  }

  /**
   * Build ModeInfo for a given mode ID.
   */
  private _buildModeInfo(modeId: string): ModeInfo | undefined {
    const modes = this._configService.getModes();
    const mode = modes.find((m) => m.id === modeId);
    if (!mode) {
      return undefined;
    }

    // Resolve effective tools through inheritance
    const effectiveTools = this._resolveEffectiveTools(mode, modes);

    // Calculate depth
    const depth = this._calculateDepth(mode, modes);

    // Convert to ModeInfo format (map schema fields to ModeConfig interface)
    const modeConfig = {
      id: mode.id,
      name: mode.name,
      description: undefined,
      parentId: mode.inherits,
      includedTools: mode.tools,
      excludedTools: [] as string[],
      isDefault: mode.id === 'default',
    };

    return {
      config: modeConfig,
      effectiveTools,
      parent: mode.inherits ? this._buildModeInfo(mode.inherits) : undefined,
      children: [], // Populated by caller if needed
      depth,
      isActive: mode.id === this._currentModeId,
    };
  }

  /**
   * Resolve effective tools for a mode by walking the inheritance chain.
   * With the current schema, modes inherit ALL tools from parents and add their own.
   */
  private _resolveEffectiveTools(mode: ModeConfig, allModes: ModeConfig[]): string[] {
    const visited = new Set<string>();
    const tools = new Set<string>();

    const resolve = (currentMode: ModeConfig): void => {
      if (visited.has(currentMode.id)) {
        return; // Prevent infinite loops
      }
      visited.add(currentMode.id);

      // Recursively resolve parent first
      if (currentMode.inherits) {
        const parent = allModes.find((m) => m.id === currentMode.inherits);
        if (parent) {
          resolve(parent);
        }
      }

      // Add this mode's tools
      for (const tool of currentMode.tools) {
        tools.add(tool);
      }
    };

    resolve(mode);
    return Array.from(tools).sort();
  }

  /**
   * Calculate the depth of a mode in the inheritance tree.
   */
  private _calculateDepth(mode: ModeConfig, allModes: ModeConfig[]): number {
    const visited = new Set<string>();
    let depth = 0;

    let current: ModeConfig | undefined = mode;
    while (current?.inherits) {
      if (visited.has(current.id)) {
        break; // Circular reference
      }
      visited.add(current.id);
      depth++;
      current = allModes.find((m) => m.id === current!.inherits);
    }

    return depth;
  }

  /**
   * Check if a mode has circular inheritance.
   */
  private _hasCircularInheritance(modeId: string, allModes: ModeConfig[]): boolean {
    const visited = new Set<string>();

    let current = allModes.find((m) => m.id === modeId);
    while (current?.inherits) {
      if (visited.has(current.id)) {
        return true; // Circular reference detected
      }
      visited.add(current.id);
      current = allModes.find((m) => m.id === current!.inherits);
    }

    return false;
  }
}
