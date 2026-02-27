import type * as vscode from 'vscode';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import type {
  McpConnectionOptions,
  McpConnectionStatus,
  McpConnectionStatusChangeEvent,
  McpReconnectConfig,
  McpConnectionInfo,
  McpServerCapabilities,
  ToolInfo,
  ToolResult,
  ToolResultContent,
  TextContent,
  PluginMetadata,
} from '../types';
import { DEFAULT_RECONNECT_CONFIG } from '../types';
import { createScopedLogger, DisposableManager, delay } from '../utils';

const log = createScopedLogger('McpClientService');

/** Default connection timeout in milliseconds */
const DEFAULT_CONNECTION_TIMEOUT = 30000;

/** Default tool execution timeout in milliseconds */
const DEFAULT_TOOL_TIMEOUT = 60000;

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
        log.error('Error in connection status listener', error);
      }
    }
  }

  dispose(): void {
    this._listeners.clear();
  }
}

/**
 * McpClientService provides MCP client connection management.
 *
 * This is a singleton service that:
 * - Manages connection lifecycle to MCP servers in dev containers
 * - Provides tool listing and execution capabilities
 * - Emits events on connection status changes
 * - Handles auto-reconnect with exponential backoff
 *
 * @example
 * ```typescript
 * // In extension activation
 * const mcpService = McpClientService.getInstance();
 * await mcpService.initialize(vscode);
 *
 * // Connect to container
 * await mcpService.connect({ containerId: 'my-container' });
 *
 * // List and execute tools
 * const tools = await mcpService.listTools();
 * const result = await mcpService.executeTool('read_file', { path: '/tmp/test.txt' });
 *
 * // Listen for connection changes
 * mcpService.onConnectionStatusChange((event) => {
 *   console.log(`Status changed: ${event.previousStatus} -> ${event.newStatus}`);
 * });
 * ```
 */
export class McpClientService {
  private static _instance: McpClientService | undefined;

  private _vscodeModule: typeof vscode | null = null;
  private _initialized = false;
  private _disposables = new DisposableManager();
  private _onConnectionStatusChange = new EventEmitter<McpConnectionStatusChangeEvent>();

  // Connection state
  private _client: Client | null = null;
  private _transport: StdioClientTransport | null = null;
  private _status: McpConnectionStatus = 'disconnected';
  private _connectionOptions: McpConnectionOptions | null = null;
  private _connectedAt: number | null = null;
  private _serverCapabilities: McpServerCapabilities | null = null;

  // Reconnect state
  private _reconnectConfig: McpReconnectConfig = { ...DEFAULT_RECONNECT_CONFIG };
  private _reconnectAttempts = 0;
  private _reconnectTimeoutId: ReturnType<typeof setTimeout> | null = null;
  private _isReconnecting = false;

  /**
   * Private constructor to enforce singleton pattern.
   * Use McpClientService.getInstance() to get the instance.
   */
  private constructor() {}

  /**
   * Get the singleton McpClientService instance.
   * Creates a new instance if one doesn't exist.
   */
  static getInstance(): McpClientService {
    if (!McpClientService._instance) {
      McpClientService._instance = new McpClientService();
    }
    return McpClientService._instance;
  }

  /**
   * Reset the singleton instance.
   * This is primarily for testing purposes.
   */
  static reset(): void {
    if (McpClientService._instance) {
      McpClientService._instance.dispose();
      McpClientService._instance = undefined;
    }
  }

  /**
   * Initialize the McpClientService.
   * Must be called before using other methods.
   *
   * @param vscodeModule The VS Code module for API access
   */
  async initialize(vscodeModule: typeof vscode): Promise<void> {
    if (this._initialized) {
      log.debug('McpClientService already initialized');
      return;
    }

    this._vscodeModule = vscodeModule;
    this._initialized = true;
    log.info('McpClientService initialized');
  }

  /**
   * Check if the service has been initialized.
   */
  isInitialized(): boolean {
    return this._initialized;
  }

  /**
   * Configure auto-reconnect behavior.
   *
   * @param config Reconnect configuration options
   */
  setReconnectConfig(config: Partial<McpReconnectConfig>): void {
    this._reconnectConfig = { ...this._reconnectConfig, ...config };
    log.debug('Reconnect config updated', this._reconnectConfig);
  }

  /**
   * Get current reconnect configuration.
   */
  getReconnectConfig(): McpReconnectConfig {
    return { ...this._reconnectConfig };
  }

  /**
   * Connect to an MCP server in a container.
   *
   * @param options Connection options
   * @throws Error if already connected or connection fails
   */
  async connect(options: McpConnectionOptions): Promise<void> {
    this._ensureInitialized();

    if (this._status === 'connected' || this._status === 'connecting') {
      throw new Error(`Cannot connect: already ${this._status}`);
    }

    this._connectionOptions = options;
    this._reconnectAttempts = 0;

    await this._doConnect(options);
  }

  /**
   * Disconnect from the MCP server.
   */
  async disconnect(): Promise<void> {
    this._ensureInitialized();

    // Cancel any pending reconnect
    this._cancelReconnect();

    if (this._status === 'disconnected') {
      log.debug('Already disconnected');
      return;
    }

    const previousStatus = this._status;

    try {
      if (this._client) {
        await this._client.close();
      }
    } catch (error) {
      log.warn('Error closing MCP client', error);
    }

    this._cleanup();
    this._setStatus('disconnected', previousStatus);
    log.info('Disconnected from MCP server');
  }

  /**
   * Check if currently connected to an MCP server.
   */
  isConnected(): boolean {
    return this._status === 'connected';
  }

  /**
   * Get the current connection status.
   */
  getConnectionStatus(): McpConnectionStatus {
    return this._status;
  }

  /**
   * Get detailed connection information.
   */
  getConnectionInfo(): McpConnectionInfo {
    return {
      status: this._status,
      containerId: this._connectionOptions?.containerId,
      connectedAt: this._connectedAt ?? undefined,
      reconnectAttempts: this._reconnectAttempts,
      errorMessage: this._status === 'error' ? 'Connection error' : undefined,
      serverCapabilities: this._serverCapabilities ?? undefined,
    };
  }

  /**
   * List all available tools from the MCP server.
   *
   * @returns Array of tool information
   * @throws Error if not connected
   */
  async listTools(): Promise<ToolInfo[]> {
    this._ensureInitialized();
    this._ensureConnected();

    if (!this._client) {
      throw new Error('MCP client not available');
    }

    try {
      const result = await this._client.listTools();

      return result.tools.map((tool) => ({
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema as ToolInfo['inputSchema'],
        namespace: this._extractNamespace(tool.name),
      }));
    } catch (error) {
      log.error('Failed to list tools', error);
      throw error;
    }
  }

  /**
   * Execute a tool on the MCP server.
   *
   * @param name Tool name to execute
   * @param params Tool parameters
   * @param timeout Optional timeout in milliseconds
   * @returns Tool execution result
   * @throws Error if not connected or execution fails
   */
  async executeTool(
    name: string,
    params: Record<string, unknown>,
    timeout?: number
  ): Promise<ToolResult> {
    this._ensureInitialized();
    this._ensureConnected();

    if (!this._client) {
      throw new Error('MCP client not available');
    }

    const startTime = Date.now();
    const effectiveTimeout = timeout ?? DEFAULT_TOOL_TIMEOUT;

    try {
      // Create a timeout promise
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(new Error(`Tool execution timed out after ${effectiveTimeout}ms`));
        }, effectiveTimeout);
      });

      // Race between execution and timeout
      const result = await Promise.race([
        this._client.callTool({ name, arguments: params }),
        timeoutPromise,
      ]);

      const duration = Date.now() - startTime;

      // Convert MCP result to our ToolResult format
      const rawContent = result.content as Array<{ type: string; text?: string }> || [];
      const content: ToolResultContent[] = rawContent.map((item) => {
        if (item.type === 'text' && typeof item.text === 'string') {
          return { type: 'text', text: item.text } as TextContent;
        }
        // Handle other content types as text fallback
        return { type: 'text', text: JSON.stringify(item) } as TextContent;
      });

      return {
        isError: result.isError === true,
        content,
        duration,
        timestamp: Date.now(),
        errorMessage: result.isError ? this._extractErrorMessage(content) : undefined,
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);

      log.error(`Tool execution failed: ${name}`, error);

      return {
        isError: true,
        content: [{ type: 'text', text: errorMessage }],
        duration,
        timestamp: Date.now(),
        errorMessage,
      };
    }
  }

  /**
   * Query the MCP server for plugin metadata including settings schemas.
   *
   * Calls the `agency.plugins_describe` tool on the server to discover
   * available plugins and their settings schemas. Falls back to an empty
   * array if the server doesn't support this tool or if disconnected.
   *
   * @returns Array of plugin metadata, or empty array on failure
   */
  async getPluginMetadata(): Promise<PluginMetadata[]> {
    if (!this._initialized || this._status !== 'connected') {
      return [];
    }

    try {
      const result = await this.executeTool('agency.plugins_describe', {});
      return this._parsePluginMetadata(result);
    } catch {
      log.warn('Plugin metadata query not available');
      return [];
    }
  }

  /**
   * Parse a tool result into PluginMetadata[].
   */
  private _parsePluginMetadata(result: ToolResult): PluginMetadata[] {
    if (result.isError || result.content.length === 0) {
      return [];
    }

    const textContent = result.content.find((c) => c.type === 'text') as TextContent | undefined;
    if (!textContent?.text) {
      return [];
    }

    try {
      const parsed = JSON.parse(textContent.text);
      const plugins = Array.isArray(parsed) ? parsed : parsed.plugins;

      if (!Array.isArray(plugins)) {
        log.warn('Plugin metadata response is not an array');
        return [];
      }

      return plugins
        .filter((p: unknown): p is Record<string, unknown> =>
          typeof p === 'object' && p !== null && typeof (p as Record<string, unknown>).id === 'string' && typeof (p as Record<string, unknown>).name === 'string'
        )
        .map((p) => ({
          id: p.id as string,
          name: p.name as string,
          description: typeof p.description === 'string' ? p.description : undefined,
          version: typeof p.version === 'string' ? p.version : undefined,
          settingsSchema: typeof p.settingsSchema === 'object' && p.settingsSchema !== null
            ? (p.settingsSchema as PluginMetadata['settingsSchema'])
            : undefined,
        }));
    } catch {
      log.warn('Failed to parse plugin metadata response');
      return [];
    }
  }

  /**
   * Event fired when connection status changes.
   */
  get onConnectionStatusChange(): (
    listener: (event: McpConnectionStatusChangeEvent) => void
  ) => vscode.Disposable {
    return this._onConnectionStatusChange.event;
  }

  /**
   * Dispose of the McpClientService and clean up resources.
   */
  dispose(): void {
    this._cancelReconnect();

    if (this._client) {
      this._client.close().catch((error) => {
        log.warn('Error closing client during dispose', error);
      });
    }

    this._cleanup();
    this._disposables.dispose();
    this._onConnectionStatusChange.dispose();
    this._vscodeModule = null;
    this._initialized = false;
    log.debug('McpClientService disposed');
  }

  /**
   * Internal method to perform the actual connection.
   */
  private async _doConnect(options: McpConnectionOptions): Promise<void> {
    const previousStatus = this._status;
    this._setStatus(this._isReconnecting ? 'reconnecting' : 'connecting', previousStatus);

    try {
      const transport = options.transport ?? 'stdio';
      const command = options.command;
      const args = options.args ?? [];

      if (transport === 'docker-exec') {
        // Docker exec transport - run command inside a container
        if (!options.containerId) {
          throw new Error('containerId is required for docker-exec transport');
        }
        const dockerArgs = ['exec', '-i', options.containerId, command, ...args];
        this._transport = new StdioClientTransport({
          command: 'docker',
          args: dockerArgs,
          env: options.environment,
        });
        log.debug(`Using docker-exec transport: docker ${dockerArgs.join(' ')}`);
      } else {
        // Direct stdio transport - spawn command locally
        this._transport = new StdioClientTransport({
          command,
          args,
          env: options.environment,
          cwd: options.workingDirectory,
        });
        log.debug(`Using stdio transport: ${command} ${args.join(' ')}`);
      }

      // Create MCP client
      this._client = new Client(
        {
          name: 'agency-extension',
          version: '1.0.0',
        },
        {
          capabilities: {},
        }
      );

      // Connect with timeout
      const connectTimeout = options.timeout ?? DEFAULT_CONNECTION_TIMEOUT;
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(new Error(`Connection timed out after ${connectTimeout}ms`));
        }, connectTimeout);
      });

      await Promise.race([this._client.connect(this._transport), timeoutPromise]);

      // Store server capabilities
      this._serverCapabilities = {
        tools: true, // We connected with tools capability
        name: 'mcp-server',
        version: '1.0.0',
      };

      this._connectedAt = Date.now();
      this._reconnectAttempts = 0;
      this._isReconnecting = false;

      this._setStatus('connected', this._status);
      const connectTarget = transport === 'docker-exec' ? `container: ${options.containerId}` : `local: ${command}`;
      log.info(`Connected to MCP server (${connectTarget})`);

      // Set up disconnect handler for auto-reconnect
      this._setupDisconnectHandler();
    } catch (error) {
      log.error('Connection failed', error);
      this._cleanup();

      // Increment attempt counter
      this._reconnectAttempts++;

      // Attempt reconnect if enabled and not exhausted
      if (this._reconnectConfig.enabled && this._reconnectAttempts < this._reconnectConfig.maxAttempts) {
        await this._scheduleReconnect(error as Error);
      } else {
        this._setStatus('error', this._status, error as Error);
        throw error;
      }
    }
  }

  /**
   * Set up handler for unexpected disconnections.
   */
  private _setupDisconnectHandler(): void {
    if (!this._transport) return;

    // Monitor the transport for closure
    // The StdioClientTransport doesn't expose events directly,
    // so we'll rely on client operations failing to detect disconnection
  }

  /**
   * Schedule a reconnection attempt with exponential backoff.
   */
  private async _scheduleReconnect(error: Error): Promise<void> {
    if (!this._connectionOptions || !this._reconnectConfig.enabled) {
      return;
    }

    this._isReconnecting = true;

    // Calculate delay with exponential backoff
    const delayMs = Math.min(
      this._reconnectConfig.initialDelay *
        Math.pow(this._reconnectConfig.backoffMultiplier, this._reconnectAttempts - 1),
      this._reconnectConfig.maxDelay
    );

    log.info(
      `Scheduling reconnect attempt ${this._reconnectAttempts}/${this._reconnectConfig.maxAttempts} in ${delayMs}ms`
    );

    this._setStatus('reconnecting', this._status, error);

    await delay(delayMs);

    // Check if reconnect was cancelled
    if (!this._isReconnecting || !this._connectionOptions) {
      return;
    }

    try {
      await this._doConnect(this._connectionOptions);
    } catch (retryError) {
      // If we've exhausted retries, re-throw the error
      if (this._reconnectAttempts >= this._reconnectConfig.maxAttempts) {
        log.error('Max reconnect attempts reached');
        throw retryError;
      }
    }
  }

  /**
   * Cancel any pending reconnection.
   */
  private _cancelReconnect(): void {
    this._isReconnecting = false;
    if (this._reconnectTimeoutId) {
      clearTimeout(this._reconnectTimeoutId);
      this._reconnectTimeoutId = null;
    }
  }

  /**
   * Clean up connection resources.
   */
  private _cleanup(): void {
    this._client = null;
    this._transport = null;
    this._connectedAt = null;
    this._serverCapabilities = null;
  }

  /**
   * Set connection status and emit event.
   */
  private _setStatus(
    newStatus: McpConnectionStatus,
    previousStatus: McpConnectionStatus,
    error?: Error
  ): void {
    if (this._status === newStatus) return;

    this._status = newStatus;
    this._onConnectionStatusChange.fire({
      previousStatus,
      newStatus,
      error,
      timestamp: Date.now(),
      containerId: this._connectionOptions?.containerId,
    });

    log.debug(`Connection status: ${previousStatus} -> ${newStatus}`);
  }

  /**
   * Extract namespace from tool name (e.g., "file_read" -> "file").
   */
  private _extractNamespace(toolName: string): string | undefined {
    const underscoreIndex = toolName.indexOf('_');
    if (underscoreIndex > 0) {
      return toolName.substring(0, underscoreIndex);
    }
    return undefined;
  }

  /**
   * Extract error message from tool result content.
   */
  private _extractErrorMessage(content: ToolResultContent[]): string | undefined {
    const textContent = content.find((c) => c.type === 'text') as TextContent | undefined;
    return textContent?.text;
  }

  /**
   * Ensure the service is initialized.
   */
  private _ensureInitialized(): void {
    if (!this._initialized) {
      throw new Error('McpClientService not initialized. Call initialize() first.');
    }
  }

  /**
   * Ensure connected to MCP server.
   */
  private _ensureConnected(): void {
    if (this._status !== 'connected') {
      throw new Error(`Not connected to MCP server. Current status: ${this._status}`);
    }
  }
}
