/**
 * Mode Manager for Agency
 *
 * Manages the current mode and provides mode switching functionality.
 * Modes control which tools are visible to agents.
 *
 * Enhanced to support:
 * - Dynamic mode registration by plugins
 * - Mode change callbacks for plugin notification
 * - ModeConfig with inheritance resolution
 * - Pattern matching for tool filtering
 */

import { AgencyError, ErrorCodes } from '../errors/index.js';
import type { ModeConfig, ResolvedMode } from './types.js';
import { resolveInheritance } from './inheritance-resolver.js';
import { matchesTool } from './pattern-matcher.js';

/**
 * Mode change callback function type
 */
export type ModeChangeCallback = (mode: string) => void;

/**
 * Unsubscribe function returned by onModeChange
 */
export type ModeChangeUnsubscribe = () => void;

/**
 * Mode error codes (re-export for convenience)
 */
export const ModeErrorCodes = {
  MODE_NOT_FOUND: ErrorCodes.MODE_NOT_FOUND,
  MODE_ALREADY_REGISTERED: ErrorCodes.MODE_ALREADY_REGISTERED,
} as const;

/**
 * Legacy mode configuration format (simple pattern arrays)
 */
export type LegacyModeConfig = Record<string, string[]>;

/**
 * Type guard to check if config is a ModeConfig object
 */
function isModeConfig(config: LegacyModeConfig | ModeConfig): config is ModeConfig {
  return (
    typeof config === 'object' &&
    config !== null &&
    'modes' in config &&
    typeof config.modes === 'object'
  );
}

/**
 * Mode manager for controlling tool visibility
 *
 * Provides mode registration, switching, and change notification
 * for plugins and other components.
 *
 * Supports two configuration formats:
 * - Legacy: `Record<string, string[]>` - simple mode name to patterns mapping
 * - ModeConfig: Full configuration with inheritance support
 */
export class ModeManager {
  private currentMode: string;
  private readonly availableModes: Set<string>;
  private readonly modeCallbacks: Set<ModeChangeCallback> = new Set();
  private readonly modePatterns: Map<string, string[]>;
  private readonly pluginModes: Map<string, string> = new Map(); // mode -> registering plugin

  /** Original ModeConfig if provided (undefined for legacy config) */
  private modeConfig: ModeConfig | undefined;

  /** Resolved modes with flattened inheritance (undefined for legacy config) */
  private resolvedModes: Map<string, ResolvedMode> | undefined;

  /**
   * Create a ModeManager with legacy config format
   * @param modes - Simple mode patterns: { modeName: ['pattern1', 'pattern2'] }
   * @param defaultMode - Optional default mode name
   */
  constructor(modes: LegacyModeConfig, defaultMode?: string);

  /**
   * Create a ModeManager with full ModeConfig
   * @param config - Full mode configuration with inheritance support
   */
  constructor(config: ModeConfig);

  constructor(config: LegacyModeConfig | ModeConfig, defaultMode?: string) {
    if (isModeConfig(config)) {
      // New ModeConfig format with inheritance support
      this.modeConfig = config;
      this.resolvedModes = new Map();

      // Resolve inheritance
      const resolved = resolveInheritance(config.modes);
      for (const mode of resolved) {
        this.resolvedModes.set(mode.name, mode);
      }

      // Initialize available modes and patterns from resolved modes
      this.availableModes = new Set(this.resolvedModes.keys());
      this.modePatterns = new Map();
      for (const [name, mode] of this.resolvedModes) {
        // Store includes as patterns for backwards compatibility
        this.modePatterns.set(name, mode.includes);
      }

      // Determine starting mode
      const configDefault = config.defaultMode ?? 'coding';
      if (this.availableModes.has(configDefault)) {
        this.currentMode = configDefault;
      } else if (this.availableModes.has('default')) {
        this.currentMode = 'default';
      } else {
        const firstMode = [...this.availableModes][0];
        this.currentMode = firstMode ?? 'default';
      }
    } else {
      // Legacy format: Record<string, string[]>
      this.availableModes = new Set(Object.keys(config));
      this.modePatterns = new Map(Object.entries(config));

      // Determine the starting mode
      if (defaultMode && this.availableModes.has(defaultMode)) {
        this.currentMode = defaultMode;
      } else if (this.availableModes.has('default')) {
        this.currentMode = 'default';
      } else {
        // Use first available mode
        const firstMode = Object.keys(config)[0];
        this.currentMode = firstMode ?? 'default';
      }
    }
  }

  /**
   * Get the current mode
   */
  getMode(): string {
    return this.currentMode;
  }

  /**
   * Set the current mode
   *
   * Notifies all registered callbacks when mode changes.
   *
   * @throws AgencyError if mode is not defined
   */
  setMode(mode: string): void {
    if (!this.availableModes.has(mode)) {
      throw new AgencyError(
        ErrorCodes.MODE_NOT_FOUND,
        `Mode not found: ${mode}`,
        { mode, availableModes: [...this.availableModes] }
      );
    }

    const previousMode = this.currentMode;
    this.currentMode = mode;

    // Only notify if mode actually changed
    if (previousMode !== mode) {
      this.notifyCallbacks(mode);
    }
  }

  /**
   * Check if a mode is available
   */
  hasMode(mode: string): boolean {
    return this.availableModes.has(mode);
  }

  /**
   * Get all available modes
   */
  getAvailableModes(): string[] {
    return [...this.availableModes];
  }

  /**
   * Register a new mode dynamically
   *
   * Allows plugins to add custom modes at runtime.
   *
   * @param mode Mode name to register
   * @param patterns Tool patterns for this mode (defaults to ['*'])
   * @param pluginId Optional plugin ID that registered this mode
   * @throws AgencyError if mode already exists
   */
  registerMode(mode: string, patterns: string[] = ['*'], pluginId?: string): void {
    if (this.availableModes.has(mode)) {
      throw new AgencyError(
        ErrorCodes.MODE_ALREADY_REGISTERED,
        `Mode already registered: ${mode}`,
        { mode, existingPlugin: this.pluginModes.get(mode) }
      );
    }

    this.availableModes.add(mode);
    this.modePatterns.set(mode, patterns);

    if (pluginId) {
      this.pluginModes.set(mode, pluginId);
    }
  }

  /**
   * Unregister a mode
   *
   * @param mode Mode name to unregister
   * @returns true if mode was found and removed
   */
  unregisterMode(mode: string): boolean {
    if (!this.availableModes.has(mode)) {
      return false;
    }

    // Don't allow unregistering the current mode
    if (this.currentMode === mode) {
      throw new AgencyError(
        ErrorCodes.MODE_NOT_FOUND,
        `Cannot unregister current mode: ${mode}`,
        { mode }
      );
    }

    this.availableModes.delete(mode);
    this.modePatterns.delete(mode);
    this.pluginModes.delete(mode);
    return true;
  }

  /**
   * Unregister all modes registered by a plugin
   *
   * @param pluginId Plugin ID
   * @returns Number of modes unregistered
   */
  unregisterModesByPlugin(pluginId: string): number {
    let count = 0;
    for (const [mode, owner] of this.pluginModes) {
      if (owner === pluginId && mode !== this.currentMode) {
        this.availableModes.delete(mode);
        this.modePatterns.delete(mode);
        this.pluginModes.delete(mode);
        count++;
      }
    }
    return count;
  }

  /**
   * Get modes registered by a specific plugin
   *
   * @param pluginId Plugin ID
   * @returns Array of mode names
   */
  getModesByPlugin(pluginId: string): string[] {
    const modes: string[] = [];
    for (const [mode, owner] of this.pluginModes) {
      if (owner === pluginId) {
        modes.push(mode);
      }
    }
    return modes;
  }

  /**
   * Get tool patterns for a mode (includes only, for backwards compatibility)
   *
   * @param mode Mode name
   * @returns Tool include patterns or undefined if mode doesn't exist
   */
  getModePatterns(mode: string): string[] | undefined {
    return this.modePatterns.get(mode);
  }

  /**
   * Get the resolved mode with flattened inheritance
   *
   * Only available when constructed with ModeConfig.
   * Returns undefined for legacy config or if mode doesn't exist.
   *
   * @param name Mode name
   * @returns ResolvedMode or undefined
   */
  getResolvedMode(name: string): ResolvedMode | undefined {
    return this.resolvedModes?.get(name);
  }

  /**
   * Get tool patterns (includes and excludes) for a mode
   *
   * Provides both include and exclude patterns for comprehensive tool filtering.
   * For legacy config, excludes will be an empty array.
   *
   * @param mode Mode name
   * @returns Object with includes and excludes arrays, or undefined if mode doesn't exist
   */
  getToolPatterns(mode: string): { includes: string[]; excludes: string[] } | undefined {
    if (!this.availableModes.has(mode)) {
      return undefined;
    }

    // Check resolved modes first (ModeConfig format)
    const resolved = this.resolvedModes?.get(mode);
    if (resolved) {
      return {
        includes: resolved.includes,
        excludes: resolved.excludes,
      };
    }

    // Fall back to legacy patterns (no excludes)
    const patterns = this.modePatterns.get(mode);
    if (patterns) {
      return {
        includes: patterns,
        excludes: [],
      };
    }

    return undefined;
  }

  /**
   * Check if a tool is visible in the specified mode
   *
   * Uses pattern matching with includes/excludes.
   * Excludes always win over includes.
   *
   * @param toolName Tool name to check
   * @param mode Mode name (defaults to current mode)
   * @returns true if tool is visible in the mode
   */
  isToolVisible(toolName: string, mode?: string): boolean {
    const targetMode = mode ?? this.currentMode;
    const patterns = this.getToolPatterns(targetMode);

    if (!patterns) {
      return false;
    }

    return matchesTool(toolName, patterns.includes, patterns.excludes);
  }

  /**
   * Set the mode configuration (replaces existing configuration)
   *
   * Allows runtime reconfiguration via API.
   * Resolves inheritance and updates all internal state.
   *
   * @param config New mode configuration
   * @throws AgencyError if current mode doesn't exist in new config
   */
  setModeConfig(config: ModeConfig): void {
    // Resolve inheritance for new config
    const resolved = resolveInheritance(config.modes);
    const newResolvedModes = new Map<string, ResolvedMode>();
    for (const mode of resolved) {
      newResolvedModes.set(mode.name, mode);
    }

    // Check if current mode exists in new config
    const newDefaultMode = config.defaultMode ?? 'coding';
    let newCurrentMode: string;

    if (newResolvedModes.has(this.currentMode)) {
      // Keep current mode if it exists in new config
      newCurrentMode = this.currentMode;
    } else if (newResolvedModes.has(newDefaultMode)) {
      // Fall back to new config's default
      newCurrentMode = newDefaultMode;
    } else if (newResolvedModes.has('default')) {
      // Fall back to 'default'
      newCurrentMode = 'default';
    } else {
      // Use first available mode
      const firstMode = [...newResolvedModes.keys()][0];
      if (!firstMode) {
        throw new AgencyError(
          ErrorCodes.MODE_CONFIG_INVALID,
          'Mode configuration must contain at least one mode',
          { config }
        );
      }
      newCurrentMode = firstMode;
    }

    // Update internal state
    this.modeConfig = config;
    this.resolvedModes = newResolvedModes;

    // Update available modes
    this.availableModes.clear();
    for (const name of newResolvedModes.keys()) {
      this.availableModes.add(name);
    }

    // Update mode patterns
    this.modePatterns.clear();
    for (const [name, mode] of newResolvedModes) {
      this.modePatterns.set(name, mode.includes);
    }

    // Update current mode and notify if changed
    const previousMode = this.currentMode;
    this.currentMode = newCurrentMode;
    if (previousMode !== newCurrentMode) {
      this.notifyCallbacks(newCurrentMode);
    }
  }

  /**
   * Get the current mode configuration
   *
   * Returns undefined if constructed with legacy config format.
   *
   * @returns ModeConfig or undefined
   */
  getModeConfig(): ModeConfig | undefined {
    return this.modeConfig;
  }

  /**
   * Subscribe to mode change events
   *
   * @param callback Function to call when mode changes
   * @returns Unsubscribe function
   */
  onModeChange(callback: ModeChangeCallback): ModeChangeUnsubscribe {
    this.modeCallbacks.add(callback);
    return () => {
      this.modeCallbacks.delete(callback);
    };
  }

  /**
   * Get the number of mode change subscribers
   */
  getCallbackCount(): number {
    return this.modeCallbacks.size;
  }

  /**
   * Notify all callbacks of a mode change
   */
  private notifyCallbacks(mode: string): void {
    for (const callback of this.modeCallbacks) {
      try {
        callback(mode);
      } catch {
        // Log but don't propagate callback errors
      }
    }
  }
}
