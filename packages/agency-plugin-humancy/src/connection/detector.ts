/**
 * Connection Mode Detector for Humancy plugin
 *
 * Implements hybrid detection with fallback:
 * 1. Check configuration for explicit mode preference
 * 2. If not configured, auto-detect: Direct → Cloud → Offline
 */

import type { AgencyCoreAPI } from '@generacy-ai/agency';
import { ConnectionMode, type ConnectionState, type HttpClientInfo } from './types.js';

/**
 * Configuration key for explicit mode preference
 */
const CONFIG_KEY = 'humancy.mode';

/**
 * Configuration key for API URL
 */
const API_URL_KEY = 'humancy.apiUrl';

/**
 * Environment variable for API URL
 */
const API_URL_ENV = 'HUMANCY_API_URL';

/**
 * Environment variable for API key
 */
const API_KEY_ENV = 'GENERACY_API_KEY';

/**
 * Default API URL
 */
const DEFAULT_API_URL = 'https://generacy.ai/api/humancy';

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
   * 3. Cloud mode (if API config present)
   * 4. Offline (fallback)
   */
  async detect(): Promise<ConnectionMode> {
    // 1. Check for explicit configuration
    const configuredMode = this.getConfiguredMode();
    if (configuredMode) {
      this.state.mode = configuredMode;
      if (configuredMode === ConnectionMode.CLOUD) {
        this.state.httpClientInfo = this.getHttpClientInfo();
      }
      return configuredMode;
    }

    // 2. Try to detect Direct mode (local Humancy extension)
    if (await this.detectDirectMode()) {
      this.state.mode = ConnectionMode.DIRECT;
      this.state.connected = true;
      this.state.lastConnected = new Date();
      return ConnectionMode.DIRECT;
    }

    // 3. Try Cloud mode (API config present)
    if (this.hasApiConfig()) {
      this.state.mode = ConnectionMode.CLOUD;
      this.state.httpClientInfo = this.getHttpClientInfo();
      // Connection status will be determined on first use
      return ConnectionMode.CLOUD;
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
      case 'cloud':
        return ConnectionMode.CLOUD;
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
   * Check if API configuration is available for cloud mode
   */
  private hasApiConfig(): boolean {
    // Check environment variable
    if (process.env[API_URL_ENV]) {
      return true;
    }

    // Check config
    if (this.coreAPI) {
      const apiUrl = this.coreAPI.getConfig<string>(API_URL_KEY);
      if (apiUrl && apiUrl.length > 0) {
        return true;
      }
    }

    return false;
  }

  /**
   * Get HTTP client info for cloud mode
   */
  private getHttpClientInfo(): HttpClientInfo {
    const baseUrl = this.getApiUrl();
    const authenticated = this.hasApiKey();

    return {
      baseUrl,
      authenticated,
    };
  }

  /**
   * Get the API URL from config or environment
   */
  getApiUrl(): string {
    // Priority: env var > config > default
    const envUrl = process.env[API_URL_ENV];
    if (envUrl) {
      return envUrl;
    }

    if (this.coreAPI) {
      const configUrl = this.coreAPI.getConfig<string>(API_URL_KEY);
      if (configUrl) {
        return configUrl;
      }
    }

    return DEFAULT_API_URL;
  }

  /**
   * Get the API key from config or environment
   */
  getApiKey(): string | undefined {
    // Priority: env var > config
    const envKey = process.env[API_KEY_ENV];
    if (envKey) {
      return envKey;
    }

    if (this.coreAPI) {
      return this.coreAPI.getConfig<string>('humancy.apiKey');
    }

    return undefined;
  }

  /**
   * Check if API key is configured
   */
  hasApiKey(): boolean {
    const key = this.getApiKey();
    return key !== undefined && key.length > 0;
  }

  /**
   * Get the request timeout from config
   */
  getTimeout(): number {
    if (this.coreAPI) {
      const timeout = this.coreAPI.getConfig<number>('humancy.timeout');
      if (timeout && timeout > 0) {
        return timeout;
      }
    }
    return 60000; // Default 60 seconds
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
    if (mode === ConnectionMode.CLOUD) {
      this.state.httpClientInfo = this.getHttpClientInfo();
    } else {
      this.state.httpClientInfo = undefined;
    }
  }
}
