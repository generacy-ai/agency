/**
 * MCP client wrapping @modelcontextprotocol/sdk Client.
 *
 * This client provides a high-level interface for communicating with
 * MCP servers via the DockerExecTransport.
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import type { JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js';
import type {
  McpClient,
  McpTransport,
  ConnectionState,
  ConnectionStateEvent,
  ToolCallEventInternal,
  ToolExecutionOptions,
  DockerExecConfig,
} from './types';
import { McpErrorCode, DEFAULT_CONFIG } from './types';
import { DockerExecTransport } from './DockerExecTransport';
import type { ToolInfo, ToolExecutionRequest, ToolResult, ToolResultContent } from '../types';

/**
 * MCP transport error with error code.
 */
interface McpTransportError extends Error {
  code: McpErrorCode;
  cause?: Error;
}

/**
 * Generate a unique ID for tool calls.
 */
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

/**
 * Configuration for StdioClient.
 */
export interface StdioClientConfig extends DockerExecConfig {
  /** Client name for MCP protocol */
  clientName?: string;

  /** Client version for MCP protocol */
  clientVersion?: string;

  /** Default tool execution timeout */
  defaultExecutionTimeout?: number;
}

/**
 * Adapter to make DockerExecTransport compatible with MCP SDK Transport interface.
 */
class TransportAdapter implements Transport {
  private _onmessage: (<T extends JSONRPCMessage>(message: T) => void) | undefined;
  private _onerror: ((error: Error) => void) | undefined;
  private _onclose: (() => void) | undefined;

  constructor(private readonly transport: McpTransport) {
    // Wire up transport events to SDK handlers
    this.transport.onMessage((event) => {
      if (this._onmessage) {
        this._onmessage(event.data as JSONRPCMessage);
      }
    });

    this.transport.onError((error) => {
      if (this._onerror) {
        this._onerror(error);
      }
    });

    this.transport.onStateChange((event) => {
      if (event.currentState === 'disconnected' && this._onclose) {
        this._onclose();
      }
    });
  }

  async start(): Promise<void> {
    await this.transport.start();
  }

  async close(): Promise<void> {
    await this.transport.stop();
  }

  async send(message: JSONRPCMessage): Promise<void> {
    await this.transport.send(message);
  }

  set onmessage(handler: (<T extends JSONRPCMessage>(message: T) => void) | undefined) {
    this._onmessage = handler;
  }

  get onmessage(): (<T extends JSONRPCMessage>(message: T) => void) | undefined {
    return this._onmessage;
  }

  set onerror(handler: ((error: Error) => void) | undefined) {
    this._onerror = handler;
  }

  get onerror(): ((error: Error) => void) | undefined {
    return this._onerror;
  }

  set onclose(handler: (() => void) | undefined) {
    this._onclose = handler;
  }

  get onclose(): (() => void) | undefined {
    return this._onclose;
  }
}

/**
 * High-level MCP client using stdio transport.
 */
export class StdioClient implements McpClient {
  private readonly transport: DockerExecTransport;
  private readonly transportAdapter: TransportAdapter;
  private readonly sdkClient: Client;
  private readonly config: Required<
    Pick<StdioClientConfig, 'clientName' | 'clientVersion' | 'defaultExecutionTimeout'>
  >;

  private connectionState: ConnectionState = 'disconnected';
  private toolCache: ToolInfo[] | null = null;

  private readonly stateChangeListeners: Set<(event: ConnectionStateEvent) => void> =
    new Set();
  private readonly toolCallListeners: Set<(event: ToolCallEventInternal) => void> =
    new Set();

  constructor(config: StdioClientConfig) {
    this.config = {
      clientName: config.clientName ?? 'agency-extension',
      clientVersion: config.clientVersion ?? '0.0.0',
      defaultExecutionTimeout:
        config.defaultExecutionTimeout ?? DEFAULT_CONFIG.EXECUTION_TIMEOUT,
    };

    // Create the transport
    this.transport = new DockerExecTransport(config);
    this.transportAdapter = new TransportAdapter(this.transport);

    // Create the MCP SDK client
    this.sdkClient = new Client(
      {
        name: this.config.clientName,
        version: this.config.clientVersion,
      },
      {
        capabilities: {},
      }
    );

    // Wire up transport state changes
    this.transport.onStateChange((event) => {
      this.updateConnectionState(event.currentState, event.error);
    });
  }

  /**
   * Connect to the MCP server.
   */
  async connect(): Promise<void> {
    if (this.connectionState === 'connected') {
      return;
    }

    try {
      this.updateConnectionState('connecting');

      // Connect the SDK client to our transport
      await this.sdkClient.connect(this.transportAdapter);

      this.updateConnectionState('connected');
      this.toolCache = null; // Clear cache on new connection
    } catch (error) {
      this.updateConnectionState('error', error instanceof Error ? error : undefined);
      throw this.wrapError(error, McpErrorCode.CONNECTION_FAILED);
    }
  }

  /**
   * Disconnect from the MCP server.
   */
  async disconnect(): Promise<void> {
    if (this.connectionState === 'disconnected') {
      return;
    }

    try {
      await this.sdkClient.close();
    } finally {
      this.updateConnectionState('disconnected');
      this.toolCache = null;
    }
  }

  /**
   * Check if connected to the MCP server.
   */
  isConnected(): boolean {
    return this.connectionState === 'connected';
  }

  /**
   * Get the current connection state.
   */
  getConnectionState(): ConnectionState {
    return this.connectionState;
  }

  /**
   * List available tools from the MCP server.
   */
  async listTools(): Promise<ToolInfo[]> {
    this.ensureConnected();

    // Return cached tools if available
    if (this.toolCache !== null) {
      return this.toolCache;
    }

    try {
      const response = await this.sdkClient.listTools();

      this.toolCache = response.tools.map((tool): ToolInfo => ({
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema as ToolInfo['inputSchema'],
        namespace: this.extractNamespace(tool.name),
      }));

      return this.toolCache;
    } catch (error) {
      throw this.wrapError(error, McpErrorCode.PROTOCOL_ERROR);
    }
  }

  /**
   * Execute a tool on the MCP server.
   */
  async executeTool(
    request: ToolExecutionRequest,
    options?: ToolExecutionOptions
  ): Promise<ToolResult> {
    this.ensureConnected();

    const callId = request.requestId ?? generateId();
    const timeout = options?.timeout ?? request.timeout ?? this.config.defaultExecutionTimeout;
    const startedAt = Date.now();

    // Emit tool call start event
    this.emitToolCall({
      id: callId,
      toolName: request.name,
      arguments: request.arguments,
      startedAt,
    });

    try {
      // Execute with timeout
      const resultPromise = this.sdkClient.callTool({
        name: request.name,
        arguments: request.arguments,
      });

      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(
            this.createError(
              `Tool execution timed out after ${timeout}ms`,
              McpErrorCode.EXECUTION_TIMEOUT
            )
          );
        }, timeout);
      });

      const response = await Promise.race([resultPromise, timeoutPromise]);
      const completedAt = Date.now();

      // Convert SDK response to our ToolResult format
      const isError = response.isError === true;
      const result: ToolResult = {
        isError,
        content: this.convertContent(response.content),
        duration: completedAt - startedAt,
        timestamp: completedAt,
        requestId: callId,
      };

      if (isError) {
        result.errorMessage = this.extractErrorMessage(response.content);
      }

      // Emit tool call completion event
      this.emitToolCall({
        id: callId,
        toolName: request.name,
        arguments: request.arguments,
        startedAt,
        completedAt,
        result,
      });

      return result;
    } catch (error) {
      const completedAt = Date.now();
      const mcpError = this.wrapError(error, McpErrorCode.EXECUTION_FAILED);

      // Emit tool call error event
      this.emitToolCall({
        id: callId,
        toolName: request.name,
        arguments: request.arguments,
        startedAt,
        completedAt,
        error: mcpError,
      });

      // Handle retry logic
      if (options?.retry && (options.maxRetries ?? DEFAULT_CONFIG.MAX_EXECUTION_RETRIES) > 0) {
        return this.executeTool(request, {
          ...options,
          maxRetries: (options.maxRetries ?? DEFAULT_CONFIG.MAX_EXECUTION_RETRIES) - 1,
        });
      }

      throw mcpError;
    }
  }

  /**
   * Subscribe to connection state changes.
   */
  onConnectionStateChange(callback: (event: ConnectionStateEvent) => void): () => void {
    this.stateChangeListeners.add(callback);
    return () => this.stateChangeListeners.delete(callback);
  }

  /**
   * Subscribe to tool call events.
   */
  onToolCall(callback: (event: ToolCallEventInternal) => void): () => void {
    this.toolCallListeners.add(callback);
    return () => this.toolCallListeners.delete(callback);
  }

  /**
   * Clear the tool cache to force a refresh on next listTools call.
   */
  clearToolCache(): void {
    this.toolCache = null;
  }

  /**
   * Ensure the client is connected.
   */
  private ensureConnected(): void {
    if (!this.isConnected()) {
      throw this.createError('Not connected to MCP server', McpErrorCode.DISCONNECTED);
    }
  }

  /**
   * Update connection state and notify listeners.
   */
  private updateConnectionState(state: ConnectionState, error?: Error): void {
    if (this.connectionState === state) {
      return;
    }

    const event: ConnectionStateEvent = {
      previousState: this.connectionState,
      currentState: state,
      timestamp: Date.now(),
      error,
    };

    this.connectionState = state;

    for (const listener of this.stateChangeListeners) {
      try {
        listener(event);
      } catch (listenerError) {
        console.error('[StdioClient] State change listener error:', listenerError);
      }
    }
  }

  /**
   * Emit a tool call event to listeners.
   */
  private emitToolCall(event: ToolCallEventInternal): void {
    for (const listener of this.toolCallListeners) {
      try {
        listener(event);
      } catch (error) {
        console.error('[StdioClient] Tool call listener error:', error);
      }
    }
  }

  /**
   * Extract namespace from tool name (e.g., "mcp__server__tool" -> "server").
   */
  private extractNamespace(toolName: string): string | undefined {
    const parts = toolName.split('__');
    if (parts.length >= 2) {
      return parts[1];
    }
    return undefined;
  }

  /**
   * Convert MCP SDK content to our ToolResultContent format.
   */
  private convertContent(content: unknown): ToolResultContent[] {
    if (!Array.isArray(content)) {
      return [];
    }

    return content.map((item): ToolResultContent => {
      if (typeof item === 'object' && item !== null) {
        const typed = item as Record<string, unknown>;
        const itemType = typed['type'];
        const itemText = typed['text'];
        const itemData = typed['data'];
        const itemMimeType = typed['mimeType'];
        const itemResource = typed['resource'];

        if (itemType === 'text' && typeof itemText === 'string') {
          return { type: 'text', text: itemText };
        }

        if (itemType === 'image') {
          return {
            type: 'image',
            data: String(itemData ?? ''),
            mimeType: String(itemMimeType ?? 'image/png'),
          };
        }

        if (itemType === 'resource' && typeof itemResource === 'object' && itemResource !== null) {
          const resource = itemResource as Record<string, unknown>;
          return {
            type: 'resource',
            resource: {
              uri: String(resource['uri'] ?? ''),
              mimeType: resource['mimeType'] as string | undefined,
              text: resource['text'] as string | undefined,
              blob: resource['blob'] as string | undefined,
            },
          };
        }
      }

      // Fallback: convert to text
      return { type: 'text', text: JSON.stringify(item) };
    });
  }

  /**
   * Extract error message from content array.
   */
  private extractErrorMessage(content: unknown): string {
    if (!Array.isArray(content)) {
      return 'Unknown error';
    }

    for (const item of content) {
      if (typeof item === 'object' && item !== null) {
        const typed = item as Record<string, unknown>;
        const itemType = typed['type'];
        const itemText = typed['text'];
        if (itemType === 'text' && typeof itemText === 'string') {
          return itemText;
        }
      }
    }

    return 'Unknown error';
  }

  /**
   * Create an MCP transport error.
   */
  private createError(
    message: string,
    code: McpErrorCode,
    cause?: Error
  ): McpTransportError {
    const error = new Error(message) as McpTransportError;
    error.name = 'McpTransportError';
    error.code = code;
    error.cause = cause;
    return error;
  }

  /**
   * Wrap an unknown error as an MCP transport error.
   */
  private wrapError(error: unknown, code: McpErrorCode): McpTransportError {
    if (
      error instanceof Error &&
      'code' in error &&
      Object.values(McpErrorCode).includes((error as McpTransportError).code)
    ) {
      return error as McpTransportError;
    }

    if (error instanceof Error) {
      return this.createError(error.message, code, error);
    }

    return this.createError(String(error), code);
  }
}
