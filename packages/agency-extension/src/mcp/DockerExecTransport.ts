/**
 * Docker exec transport for MCP communication.
 *
 * This transport uses `docker exec -i` to communicate with an MCP server
 * running inside a Docker container via stdin/stdout.
 */

import { execa, type ExecaChildProcess, type Options as ExecaOptions } from 'execa';
import type {
  McpTransport,
  DockerExecConfig,
  ConnectionState,
  ConnectionStateEvent,
  MessageEvent,
  McpTransportError,
} from './types';
import { McpErrorCode, DEFAULT_CONFIG } from './types';

/**
 * Transport implementation using docker exec for stdio communication.
 */
export class DockerExecTransport implements McpTransport {
  private process: ExecaChildProcess | null = null;
  private state: ConnectionState = 'disconnected';
  private buffer = '';
  private reconnectAttempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  private readonly stateChangeListeners: Set<(event: ConnectionStateEvent) => void> =
    new Set();
  private readonly messageListeners: Set<(event: MessageEvent) => void> = new Set();
  private readonly errorListeners: Set<(error: McpTransportError) => void> = new Set();

  private readonly config: Required<DockerExecConfig>;

  constructor(config: DockerExecConfig) {
    this.config = {
      containerId: config.containerId,
      command: config.command,
      workDir: config.workDir ?? '/app',
      env: config.env ?? {},
      connectionTimeout: config.connectionTimeout ?? DEFAULT_CONFIG.CONNECTION_TIMEOUT,
      maxReconnectAttempts:
        config.maxReconnectAttempts ?? DEFAULT_CONFIG.MAX_RECONNECT_ATTEMPTS,
      reconnectDelay: config.reconnectDelay ?? DEFAULT_CONFIG.RECONNECT_DELAY,
    };
  }

  /**
   * Start the docker exec process and establish stdio communication.
   */
  async start(): Promise<void> {
    if (this.state === 'connected' || this.state === 'connecting') {
      return;
    }

    this.setState('connecting');

    try {
      await this.startProcess();
      this.setState('connected');
      this.reconnectAttempt = 0;
    } catch (error) {
      const mcpError = this.wrapError(error, McpErrorCode.CONNECTION_FAILED);
      this.handleError(mcpError);
      throw mcpError;
    }
  }

  /**
   * Stop the docker exec process.
   */
  async stop(): Promise<void> {
    this.clearReconnectTimer();

    if (this.process) {
      try {
        // Close stdin to signal the process to exit
        this.process.stdin?.end();

        // Give the process a moment to exit gracefully
        await Promise.race([
          this.process,
          new Promise((resolve) => setTimeout(resolve, 1000)),
        ]);

        // Kill if still running
        if (!this.process.killed) {
          this.process.kill('SIGTERM');
        }
      } catch {
        // Ignore errors during cleanup
      } finally {
        this.process = null;
      }
    }

    this.setState('disconnected');
    this.buffer = '';
  }

  /**
   * Send a JSON-RPC message to the MCP server.
   */
  async send(message: unknown): Promise<void> {
    if (this.state !== 'connected' || !this.process?.stdin) {
      throw new (this.createError(
        'Not connected to MCP server',
        McpErrorCode.DISCONNECTED
      ).constructor as typeof Error)(
        'Not connected to MCP server'
      ) as McpTransportError;
    }

    const data = JSON.stringify(message) + '\n';

    return new Promise((resolve, reject) => {
      this.process!.stdin!.write(data, (error) => {
        if (error) {
          reject(this.wrapError(error, McpErrorCode.PROTOCOL_ERROR));
        } else {
          resolve();
        }
      });
    });
  }

  /**
   * Get the current connection state.
   */
  getState(): ConnectionState {
    return this.state;
  }

  /**
   * Subscribe to connection state changes.
   */
  onStateChange(callback: (event: ConnectionStateEvent) => void): () => void {
    this.stateChangeListeners.add(callback);
    return () => this.stateChangeListeners.delete(callback);
  }

  /**
   * Subscribe to incoming messages.
   */
  onMessage(callback: (event: MessageEvent) => void): () => void {
    this.messageListeners.add(callback);
    return () => this.messageListeners.delete(callback);
  }

  /**
   * Subscribe to error events.
   */
  onError(callback: (error: McpTransportError) => void): () => void {
    this.errorListeners.add(callback);
    return () => this.errorListeners.delete(callback);
  }

  /**
   * Start the docker exec process.
   */
  private async startProcess(): Promise<void> {
    const args = ['exec', '-i'];

    // Add working directory if specified
    if (this.config.workDir) {
      args.push('-w', this.config.workDir);
    }

    // Add environment variables
    for (const [key, value] of Object.entries(this.config.env)) {
      args.push('-e', `${key}=${value}`);
    }

    // Add container ID and command
    args.push(this.config.containerId, ...this.config.command);

    const execaOptions: ExecaOptions = {
      stdio: ['pipe', 'pipe', 'pipe'],
      buffer: false,
      timeout: 0, // No timeout for the process itself
    };

    this.process = execa('docker', args, execaOptions);

    // Handle stdout (JSON-RPC messages)
    this.process.stdout?.on('data', (chunk: Buffer) => {
      this.handleData(chunk.toString());
    });

    // Handle stderr (logs/errors)
    this.process.stderr?.on('data', (chunk: Buffer) => {
      // Log stderr but don't treat as protocol error
      console.error('[DockerExecTransport] stderr:', chunk.toString());
    });

    // Handle process exit
    this.process.on('exit', (code, signal) => {
      this.handleProcessExit(code, signal);
    });

    this.process.on('error', (error) => {
      this.handleError(this.wrapError(error, McpErrorCode.DOCKER_ERROR));
    });

    // Wait for the process to be ready (with timeout)
    await this.waitForReady();
  }

  /**
   * Wait for the MCP server to be ready.
   */
  private async waitForReady(): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(
          this.createError(
            `Connection timeout after ${this.config.connectionTimeout}ms`,
            McpErrorCode.CONNECTION_TIMEOUT
          )
        );
      }, this.config.connectionTimeout);

      // Consider ready once the process is running and stdin is writable
      const checkReady = () => {
        if (this.process?.stdin?.writable) {
          clearTimeout(timeout);
          resolve();
        } else {
          setTimeout(checkReady, 50);
        }
      };

      checkReady();
    });
  }

  /**
   * Handle incoming data from stdout.
   */
  private handleData(data: string): void {
    this.buffer += data;

    // Process complete lines (newline-delimited JSON)
    let newlineIndex: number;
    while ((newlineIndex = this.buffer.indexOf('\n')) !== -1) {
      const line = this.buffer.slice(0, newlineIndex).trim();
      this.buffer = this.buffer.slice(newlineIndex + 1);

      if (line) {
        this.processLine(line);
      }
    }
  }

  /**
   * Process a single line of JSON-RPC message.
   */
  private processLine(line: string): void {
    try {
      const message = JSON.parse(line);
      const event: MessageEvent = {
        data: message,
        timestamp: Date.now(),
      };

      for (const listener of this.messageListeners) {
        try {
          listener(event);
        } catch (error) {
          console.error('[DockerExecTransport] Message listener error:', error);
        }
      }
    } catch (error) {
      this.handleError(
        this.createError(
          `Failed to parse message: ${line}`,
          McpErrorCode.INVALID_RESPONSE,
          error instanceof Error ? error : undefined
        )
      );
    }
  }

  /**
   * Handle process exit.
   */
  private handleProcessExit(code: number | null, signal: string | null): void {
    this.process = null;

    if (this.state === 'connected' || this.state === 'connecting') {
      const error = this.createError(
        `Process exited unexpectedly (code: ${code}, signal: ${signal})`,
        McpErrorCode.DISCONNECTED
      );

      this.handleError(error);
      this.attemptReconnect();
    }
  }

  /**
   * Attempt to reconnect to the MCP server.
   */
  private attemptReconnect(): void {
    if (this.reconnectAttempt >= this.config.maxReconnectAttempts) {
      this.setState('error');
      return;
    }

    this.reconnectAttempt++;
    this.setState('reconnecting');

    this.reconnectTimer = setTimeout(async () => {
      try {
        await this.start();
      } catch {
        // Error already handled in start()
      }
    }, this.config.reconnectDelay);
  }

  /**
   * Clear the reconnect timer.
   */
  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  /**
   * Update the connection state and notify listeners.
   */
  private setState(newState: ConnectionState, error?: Error): void {
    if (this.state === newState) {
      return;
    }

    const event: ConnectionStateEvent = {
      previousState: this.state,
      currentState: newState,
      timestamp: Date.now(),
      error,
      reconnectAttempt:
        newState === 'reconnecting' ? this.reconnectAttempt : undefined,
    };

    this.state = newState;

    for (const listener of this.stateChangeListeners) {
      try {
        listener(event);
      } catch (listenerError) {
        console.error('[DockerExecTransport] State change listener error:', listenerError);
      }
    }
  }

  /**
   * Handle an error and notify listeners.
   */
  private handleError(error: McpTransportError): void {
    for (const listener of this.errorListeners) {
      try {
        listener(error);
      } catch (listenerError) {
        console.error('[DockerExecTransport] Error listener error:', listenerError);
      }
    }
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
    (error as unknown as { code: McpErrorCode }).code = code;
    (error as unknown as { cause?: Error }).cause = cause;
    return error;
  }

  /**
   * Wrap an unknown error as an MCP transport error.
   */
  private wrapError(error: unknown, code: McpErrorCode): McpTransportError {
    if (error instanceof Error) {
      return this.createError(error.message, code, error);
    }
    return this.createError(String(error), code);
  }
}
