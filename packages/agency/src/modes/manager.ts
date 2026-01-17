/**
 * Mode Manager for Agency
 *
 * Manages the current mode and provides mode switching functionality.
 * Modes control which tools are visible to agents.
 *
 * Enhanced to support:
 * - Dynamic mode registration by plugins
 * - Mode change callbacks for plugin notification
 */

import { AgencyError, ErrorCodes } from '../errors/index.js';

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
 * Mode manager for controlling tool visibility
 *
 * Provides mode registration, switching, and change notification
 * for plugins and other components.
 */
export class ModeManager {
  private currentMode: string;
  private readonly availableModes: Set<string>;
  private readonly modeCallbacks: Set<ModeChangeCallback> = new Set();
  private readonly modePatterns: Map<string, string[]>;
  private readonly pluginModes: Map<string, string> = new Map(); // mode -> registering plugin

  constructor(modes: Record<string, string[]>, defaultMode?: string) {
    this.availableModes = new Set(Object.keys(modes));
    this.modePatterns = new Map(Object.entries(modes));

    // Determine the starting mode
    if (defaultMode && this.availableModes.has(defaultMode)) {
      this.currentMode = defaultMode;
    } else if (this.availableModes.has('default')) {
      this.currentMode = 'default';
    } else {
      // Use first available mode
      const firstMode = Object.keys(modes)[0];
      this.currentMode = firstMode ?? 'default';
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
   * Get tool patterns for a mode
   *
   * @param mode Mode name
   * @returns Tool patterns or undefined if mode doesn't exist
   */
  getModePatterns(mode: string): string[] | undefined {
    return this.modePatterns.get(mode);
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
