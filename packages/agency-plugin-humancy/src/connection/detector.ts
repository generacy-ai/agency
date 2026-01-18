/**
 * Connection Mode Detector for Humancy plugin
 *
 * Implements hybrid detection with fallback:
 * 1. Check configuration for explicit mode preference
 * 2. If not configured, auto-detect: Direct → Via Generacy → Offline
 */

import type { AgencyCoreAPI } from '@generacy-ai/agency';
import { ConnectionMode, type ConnectionState } from './types.js';

/**
 * Configuration key for explicit mode preference
 */
const CONFIG_KEY = 'humancy.mode';

/**
 * Configuration key for Generacy endpoint
 */
const GENERACY_ENDPOINT_KEY = 'generacy.endpoint';

/**
 * Connection mode detector with hybrid detection and fallback
 */
export class ConnectionModeDetector {
  private state: ConnectionState;
  private coreAPI?: AgencyCoreAPI;

  constructor() {
    this.state = {
      mode: ConnectionMode.OFFLINE,
      connected: false,
    };
  }

  /**
   * Initialize detector with core API access
   */
  initialize(coreAPI: AgencyCoreAPI): void {
    this.coreAPI = coreAPI;
  }

  /**
   * Detect the appropriate connection mode
   *
   * Priority:
   * 1. Explicit config preference
   * 2. Direct mode (if Humancy extension detected)
   * 3. Via Generacy (if Generacy endpoint configured)
   * 4. Offline (fallback)
   */
  async detect(): Promise<ConnectionMode> {
    // 1. Check for explicit configuration
    const configuredMode = this.getConfiguredMode();
    if (configuredMode) {
      this.state.mode = configuredMode;
      return configuredMode;
    }

    // 2. Try to detect Direct mode (local Humancy extension)
    if (await this.detectDirectMode()) {
      this.state.mode = ConnectionMode.DIRECT;
      this.state.connected = true;
      this.state.lastConnected = new Date();
      return ConnectionMode.DIRECT;
    }

    // 3. Try Via Generacy mode
    if (this.detectGeneracyMode()) {
      this.state.mode = ConnectionMode.VIA_GENERACY;
      // Connection status will be determined on first use
      return ConnectionMode.VIA_GENERACY;
    }

    // 4. Fallback to Offline mode
    this.state.mode = ConnectionMode.OFFLINE;
    this.state.connected = false;
    return ConnectionMode.OFFLINE;
  }

  /**
   * Get explicit mode from configuration
   */
  private getConfiguredMode(): ConnectionMode | undefined {
    if (!this.coreAPI) {
      return undefined;
    }

    const mode = this.coreAPI.getConfig<string>(CONFIG_KEY);
    if (!mode) {
      return undefined;
    }

    // Validate configured mode
    switch (mode.toLowerCase()) {
      case 'direct':
        return ConnectionMode.DIRECT;
      case 'generacy':
        return ConnectionMode.VIA_GENERACY;
      case 'offline':
        return ConnectionMode.OFFLINE;
      default:
        // Invalid config, fall through to auto-detect
        return undefined;
    }
  }

  /**
   * Detect if Humancy VS Code extension is available locally
   *
   * In a real implementation, this would check for IPC availability
   * or a health endpoint. For now, we check for environment signals.
   */
  private async detectDirectMode(): Promise<boolean> {
    // Check if running in VS Code context with Humancy extension
    // This is a simplified check - real implementation would probe IPC
    const vscodeEnv = process.env['VSCODE_PID'] !== undefined;
    const humancySocket = process.env['HUMANCY_SOCKET_PATH'] !== undefined;

    if (vscodeEnv && humancySocket) {
      // TODO: Actually probe the socket to verify connection
      return true;
    }

    return false;
  }

  /**
   * Detect if Generacy orchestration is available
   */
  private detectGeneracyMode(): boolean {
    if (!this.coreAPI) {
      return false;
    }

    // Check if Generacy endpoint is configured
    const endpoint = this.coreAPI.getConfig<string>(GENERACY_ENDPOINT_KEY);
    return endpoint !== undefined && endpoint.length > 0;
  }

  /**
   * Get current connection state
   */
  getState(): ConnectionState {
    return { ...this.state };
  }

  /**
   * Get current connection mode
   */
  getMode(): ConnectionMode {
    return this.state.mode;
  }

  /**
   * Check if currently connected
   */
  isConnected(): boolean {
    return this.state.connected;
  }

  /**
   * Update connection state after a communication attempt
   */
  updateConnectionState(success: boolean, error?: string): void {
    this.state.connected = success;
    if (success) {
      this.state.lastConnected = new Date();
      this.state.error = undefined;
    } else {
      this.state.error = error;
    }
  }

  /**
   * Force a specific mode (useful for testing or manual override)
   */
  setMode(mode: ConnectionMode): void {
    this.state.mode = mode;
  }
}
