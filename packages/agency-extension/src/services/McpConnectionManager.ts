import type * as vscode from 'vscode';
import type { ContainerService } from './ContainerService';
import type { McpClientService } from './McpClientService';
import type { ContainerStateEvent, ContainerStatus } from '../types';
import { createScopedLogger, DisposableManager } from '../utils';

const log = createScopedLogger('McpConnectionManager');

/**
 * Association between a container and its MCP connection state.
 */
export interface McpContainerAssociation {
  /** Container ID */
  containerId: string;

  /** Whether the MCP connection is currently active */
  isConnected: boolean;

  /** Timestamp of the last connection attempt (ms since epoch) */
  lastAttempt?: number;

  /** Whether to automatically connect when the container starts */
  autoConnect: boolean;

  /** Error message from the last failed connection attempt */
  error?: string;

  /** MCP server command to run in the container */
  mcpCommand: string;

  /** Arguments for the MCP server command */
  mcpArgs: string[];
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
        log.error('Error in event listener', error);
      }
    }
  }

  dispose(): void {
    this._listeners.clear();
  }
}

/**
 * Event fired when a container-MCP association changes.
 */
export interface McpAssociationChangeEvent {
  /** Container ID */
  containerId: string;

  /** Previous connection state */
  wasConnected: boolean;

  /** New connection state */
  isConnected: boolean;

  /** Timestamp of the change */
  timestamp: number;

  /** Error message if connection failed */
  error?: string;
}

/**
 * McpConnectionManager manages the relationship between containers and MCP connections.
 *
 * This is a singleton service that:
 * - Subscribes to ContainerService.onContainerStateChange events
 * - Triggers MCP connect when a container enters 'running' state
 * - Triggers MCP disconnect when a container enters 'stopped' or 'exited' state
 * - Maintains a mapping of container IDs to their MCP connection associations
 *
 * @example
 * ```typescript
 * // In extension activation
 * const containerService = ContainerService.getInstance();
 * await containerService.initialize(vscode);
 *
 * const mcpService = McpClientService.getInstance();
 * await mcpService.initialize(vscode);
 *
 * const connectionManager = McpConnectionManager.getInstance();
 * await connectionManager.initialize(containerService, mcpService);
 *
 * // Associate a container for auto-connect
 * await connectionManager.associateContainer('my-container-id');
 *
 * // Get connection mappings
 * const mappings = connectionManager.getConnectionMapping();
 * ```
 */
export class McpConnectionManager {
  private static _instance: McpConnectionManager | undefined;

  private _containerService: ContainerService | null = null;
  private _mcpService: McpClientService | null = null;
  private _initialized = false;
  private _disposables = new DisposableManager();

  // Association mapping: containerId -> McpContainerAssociation
  private _associations: Map<string, McpContainerAssociation> = new Map();

  // Event emitters
  private _onAssociationChange = new EventEmitter<McpAssociationChangeEvent>();

  /**
   * Private constructor to enforce singleton pattern.
   * Use McpConnectionManager.getInstance() to get the instance.
   */
  private constructor() {}

  /**
   * Get the singleton McpConnectionManager instance.
   * Creates a new instance if one doesn't exist.
   */
  static getInstance(): McpConnectionManager {
    if (!McpConnectionManager._instance) {
      McpConnectionManager._instance = new McpConnectionManager();
    }
    return McpConnectionManager._instance;
  }

  /**
   * Reset the singleton instance.
   * This is primarily for testing purposes.
   */
  static reset(): void {
    if (McpConnectionManager._instance) {
      McpConnectionManager._instance.dispose();
      McpConnectionManager._instance = undefined;
    }
  }

  /**
   * Initialize the McpConnectionManager.
   * Must be called before using other methods.
   *
   * @param containerService The ContainerService instance for container state events
   * @param mcpService The McpClientService instance for MCP connections
   */
  async initialize(
    containerService: ContainerService,
    mcpService: McpClientService
  ): Promise<void> {
    if (this._initialized) {
      log.debug('McpConnectionManager already initialized');
      return;
    }

    this._containerService = containerService;
    this._mcpService = mcpService;

    // Subscribe to container state changes
    const stateChangeDisposable = containerService.onContainerStateChange(
      (event: ContainerStateEvent) => {
        this._handleContainerStateChange(event);
      }
    );
    this._disposables.add(stateChangeDisposable);

    // Subscribe to MCP connection status changes to update associations
    const connectionStatusDisposable = mcpService.onConnectionStatusChange((event) => {
      this._handleMcpConnectionStatusChange(event);
    });
    this._disposables.add(connectionStatusDisposable);

    this._initialized = true;
    log.info('McpConnectionManager initialized');
  }

  /**
   * Check if the service has been initialized.
   */
  isInitialized(): boolean {
    return this._initialized;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Event Subscription
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Event fired when a container-MCP association changes.
   */
  get onAssociationChange(): (
    listener: (event: McpAssociationChangeEvent) => void
  ) => vscode.Disposable {
    return this._onAssociationChange.event;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Association Management
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Get the current connection mapping for all associated containers.
   *
   * @returns Map of container IDs to their MCP connection associations
   */
  getConnectionMapping(): Map<string, McpContainerAssociation> {
    return new Map(this._associations);
  }

  /**
   * Get the association for a specific container.
   *
   * @param containerId Container ID to look up
   * @returns The association or undefined if not found
   */
  getAssociation(containerId: string): McpContainerAssociation | undefined {
    return this._associations.get(containerId);
  }

  /**
   * Associate a container for MCP connection management.
   * If the container is currently running, this will trigger a connection attempt.
   *
   * @param containerId Container ID to associate
   * @param options Association options
   */
  async associateContainer(
    containerId: string,
    options: {
      autoConnect?: boolean;
      mcpCommand?: string;
      mcpArgs?: string[];
    } = {}
  ): Promise<void> {
    this._ensureInitialized();

    const {
      autoConnect = true,
      mcpCommand = 'node',
      mcpArgs = ['/workspaces/agency/packages/agency/dist/cli.js'],
    } = options;

    // Check if already associated
    const existing = this._associations.get(containerId);
    if (existing) {
      // Update settings if different
      if (existing.autoConnect !== autoConnect) {
        existing.autoConnect = autoConnect;
        log.debug(`Updated auto-connect for container ${containerId}: ${autoConnect}`);
      }
      existing.mcpCommand = mcpCommand;
      existing.mcpArgs = mcpArgs;
      return;
    }

    // Create new association
    const association: McpContainerAssociation = {
      containerId,
      isConnected: false,
      autoConnect,
      mcpCommand,
      mcpArgs,
    };
    this._associations.set(containerId, association);
    log.info(`Associated container ${containerId} for MCP connection management`);

    // If auto-connect is enabled, check if container is running and connect
    if (autoConnect && this._containerService) {
      try {
        const container = await this._containerService.getContainer(containerId);
        if (container && container.status === 'running') {
          log.debug(`Container ${containerId} is running, initiating MCP connection`);
          await this._connectToContainer(containerId);
        }
      } catch (error) {
        log.error(`Failed to check container status for ${containerId}`, error);
      }
    }
  }

  /**
   * Remove an association for a container.
   * If connected, this will disconnect the MCP connection.
   *
   * @param containerId Container ID to disassociate
   */
  async disassociateContainer(containerId: string): Promise<void> {
    this._ensureInitialized();

    const association = this._associations.get(containerId);
    if (!association) {
      log.debug(`Container ${containerId} is not associated`);
      return;
    }

    // Disconnect if connected
    if (association.isConnected && this._mcpService) {
      try {
        await this._mcpService.disconnect();
      } catch (error) {
        log.warn(`Failed to disconnect from container ${containerId}`, error);
      }
    }

    this._associations.delete(containerId);
    log.info(`Disassociated container ${containerId} from MCP connection management`);
  }

  /**
   * Set the auto-connect setting for an associated container.
   *
   * @param containerId Container ID
   * @param autoConnect Whether to auto-connect
   */
  setAutoConnect(containerId: string, autoConnect: boolean): void {
    const association = this._associations.get(containerId);
    if (association) {
      association.autoConnect = autoConnect;
      log.debug(`Set auto-connect for container ${containerId}: ${autoConnect}`);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Lifecycle
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Dispose of the McpConnectionManager and clean up resources.
   */
  dispose(): void {
    this._associations.clear();
    this._onAssociationChange.dispose();
    this._disposables.dispose();
    this._containerService = null;
    this._mcpService = null;
    this._initialized = false;
    log.debug('McpConnectionManager disposed');
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Private Methods - Event Handlers
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Handle container state change events from ContainerService.
   */
  private _handleContainerStateChange(event: ContainerStateEvent): void {
    const { containerId, newStatus, previousStatus } = event;

    // Only process if this container is associated
    const association = this._associations.get(containerId);
    if (!association) {
      log.debug(`Ignoring state change for unassociated container ${containerId}`);
      return;
    }

    log.debug(
      `Container ${containerId} state changed: ${previousStatus} -> ${newStatus}`
    );

    // Handle state transitions
    if (this._isRunningState(newStatus) && !this._isRunningState(previousStatus)) {
      // Container started
      this._onContainerStarted(containerId, association);
    } else if (this._isStoppedState(newStatus) && !this._isStoppedState(previousStatus)) {
      // Container stopped
      this._onContainerStopped(containerId, association);
    }
  }

  /**
   * Handle MCP connection status change events.
   */
  private _handleMcpConnectionStatusChange(event: {
    previousStatus: string;
    newStatus: string;
    containerId?: string;
    error?: Error;
  }): void {
    const { containerId, newStatus, error } = event;

    if (!containerId) {
      return;
    }

    const association = this._associations.get(containerId);
    if (!association) {
      return;
    }

    const wasConnected = association.isConnected;
    const isConnected = newStatus === 'connected';

    if (wasConnected !== isConnected) {
      association.isConnected = isConnected;
      association.error = error?.message;

      this._onAssociationChange.fire({
        containerId,
        wasConnected,
        isConnected,
        timestamp: Date.now(),
        error: error?.message,
      });
    }
  }

  /**
   * Handle container started event.
   */
  private _onContainerStarted(
    containerId: string,
    association: McpContainerAssociation
  ): void {
    if (!association.autoConnect) {
      log.debug(`Auto-connect disabled for container ${containerId}, skipping connection`);
      return;
    }

    log.info(`Container ${containerId} started, initiating MCP connection`);
    this._connectToContainer(containerId).catch((error) => {
      log.error(`Failed to connect to container ${containerId} on start`, error);
    });
  }

  /**
   * Handle container stopped event.
   */
  private _onContainerStopped(
    containerId: string,
    association: McpContainerAssociation
  ): void {
    if (!association.isConnected) {
      log.debug(`Container ${containerId} stopped but was not connected`);
      return;
    }

    log.info(`Container ${containerId} stopped, disconnecting MCP`);
    this._disconnectFromContainer(containerId).catch((error) => {
      log.error(`Failed to disconnect from container ${containerId} on stop`, error);
    });
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Private Methods - Connection Management
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Connect to a container's MCP server.
   */
  private async _connectToContainer(containerId: string): Promise<void> {
    if (!this._mcpService) {
      throw new Error('MCP service not available');
    }

    const association = this._associations.get(containerId);
    if (!association) {
      throw new Error(`Container ${containerId} is not associated`);
    }

    const wasConnected = association.isConnected;
    association.lastAttempt = Date.now();

    try {
      await this._mcpService.connect({
        transport: 'docker-exec',
        containerId,
        command: association.mcpCommand,
        args: association.mcpArgs,
      });
      association.isConnected = true;
      association.error = undefined;

      log.info(`Successfully connected to MCP server in container ${containerId}`);

      this._onAssociationChange.fire({
        containerId,
        wasConnected,
        isConnected: true,
        timestamp: Date.now(),
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      association.isConnected = false;
      association.error = errorMessage;

      log.error(`Failed to connect to MCP server in container ${containerId}`, error);

      this._onAssociationChange.fire({
        containerId,
        wasConnected,
        isConnected: false,
        timestamp: Date.now(),
        error: errorMessage,
      });

      throw error;
    }
  }

  /**
   * Disconnect from a container's MCP server.
   */
  private async _disconnectFromContainer(containerId: string): Promise<void> {
    if (!this._mcpService) {
      throw new Error('MCP service not available');
    }

    const association = this._associations.get(containerId);
    if (!association) {
      throw new Error(`Container ${containerId} is not associated`);
    }

    const wasConnected = association.isConnected;

    try {
      await this._mcpService.disconnect();
      association.isConnected = false;
      association.error = undefined;

      log.info(`Successfully disconnected from MCP server in container ${containerId}`);

      this._onAssociationChange.fire({
        containerId,
        wasConnected,
        isConnected: false,
        timestamp: Date.now(),
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      association.error = errorMessage;

      log.error(`Failed to disconnect from MCP server in container ${containerId}`, error);
      throw error;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Private Methods - Helpers
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Check if a container status represents a running state.
   */
  private _isRunningState(status: ContainerStatus): boolean {
    return status === 'running';
  }

  /**
   * Check if a container status represents a stopped state.
   */
  private _isStoppedState(status: ContainerStatus): boolean {
    return status === 'stopped' || status === 'exited' || status === 'dead';
  }

  /**
   * Ensure the service is initialized.
   */
  private _ensureInitialized(): void {
    if (!this._initialized) {
      throw new Error('McpConnectionManager not initialized. Call initialize() first.');
    }
  }
}
