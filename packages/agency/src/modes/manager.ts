/**
 * Mode Manager for Agency
 *
 * Manages the current mode and provides mode switching functionality.
 * Modes control which tools are visible to agents.
 */

import { AgencyError, ErrorCodes } from '../errors/index.js';

/**
 * Mode manager for controlling tool visibility
 */
export class ModeManager {
  private currentMode: string;
  private readonly availableModes: Set<string>;

  constructor(modes: Record<string, string[]>, defaultMode?: string) {
    this.availableModes = new Set(Object.keys(modes));

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
    this.currentMode = mode;
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
}
