import type * as vscode from 'vscode';
import { execa, type ExecaChildProcess, type Options as ExecaOptions } from 'execa';
import type {
  ContainerInfo,
  ContainerStatus,
  ContainerHealth,
  ContainerActionResult,
  ContainerAction,
  ContainerLogEntry,
  ContainerLogOptions,
  ContainerStateEvent,
  ContainerDiscoverySource,
  PortMapping,
} from '../types';
import { createScopedLogger, DisposableManager } from '../utils';

const log = createScopedLogger('ContainerService');

/** Dev container label prefix */
const DEVCONTAINER_LABEL_PREFIX = 'devcontainer.';

/** Dev container metadata label */
const DEVCONTAINER_METADATA_LABEL = 'devcontainer.metadata';

/** Dev container local folder label */
const DEVCONTAINER_LOCAL_FOLDER_LABEL = 'devcontainer.local_folder';

/** VS Code Remote Containers extension ID */
const REMOTE_CONTAINERS_EXTENSION_ID = 'ms-vscode-remote.remote-containers';

/** Docker command timeout in milliseconds */
const DOCKER_COMMAND_TIMEOUT = 30000;

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
 * Raw container data from Docker CLI JSON output.
 */
interface DockerContainerJson {
  Id: string;
  Names: string[];
  Image: string;
  State: string;
  Status: string;
  Created: number;
  Ports: Array<{
    IP?: string;
    PrivatePort: number;
    PublicPort?: number;
    Type: string;
  }>;
  Labels: Record<string, string>;
  Mounts: Array<{
    Type: string;
    Source: string;
    Destination: string;
  }>;
}

/**
 * Docker inspect output for a container.
 */
interface DockerInspectJson {
  Id: string;
  Name: string;
  State: {
    Status: string;
    Running: boolean;
    Paused: boolean;
    Restarting: boolean;
    Dead: boolean;
    StartedAt: string;
    Health?: {
      Status: string;
    };
  };
  Config: {
    Image: string;
    Labels: Record<string, string>;
  };
  NetworkSettings: {
    Ports: Record<
      string,
      Array<{
        HostIp: string;
        HostPort: string;
      }> | null
    >;
  };
  Mounts: Array<{
    Type: string;
    Source: string;
    Destination: string;
  }>;
  Created: string;
}

/**
 * ContainerService provides dev container discovery and management.
 *
 * This is a singleton service that:
 * - Discovers dev containers via VS Code Remote Containers API
 * - Falls back to Docker CLI for container operations
 * - Provides container lifecycle management (start, stop, rebuild)
 * - Streams container logs as an async iterable
 *
 * @example
 * ```typescript
 * // In extension activation
 * const containerService = ContainerService.getInstance();
 * await containerService.initialize(vscode);
 *
 * // List containers
 * const containers = await containerService.listContainers();
 *
 * // Start a container
 * await containerService.startContainer(containers[0].id);
 *
 * // Stream logs
 * for await (const entry of containerService.getContainerLogs(containers[0].id)) {
 *   console.log(entry.content);
 * }
 * ```
 */
export class ContainerService {
  private static _instance: ContainerService | undefined;

  private _vscodeModule: typeof vscode | null = null;
  private _initialized = false;
  private _disposables = new DisposableManager();

  // Event emitters
  private _onContainerStateChange = new EventEmitter<ContainerStateEvent>();

  // Container cache
  private _containerCache: Map<string, ContainerInfo> = new Map();
  private _lastRefresh: number = 0;
  private _cacheValidityMs: number = 5000; // 5 seconds

  // VS Code Remote Containers API (if available)
  private _remoteContainersApi: unknown | null = null;

  /**
   * Private constructor to enforce singleton pattern.
   * Use ContainerService.getInstance() to get the instance.
   */
  private constructor() {}

  /**
   * Get the singleton ContainerService instance.
   * Creates a new instance if one doesn't exist.
   */
  static getInstance(): ContainerService {
    if (!ContainerService._instance) {
      ContainerService._instance = new ContainerService();
    }
    return ContainerService._instance;
  }

  /**
   * Reset the singleton instance.
   * This is primarily for testing purposes.
   */
  static reset(): void {
    if (ContainerService._instance) {
      ContainerService._instance.dispose();
      ContainerService._instance = undefined;
    }
  }

  /**
   * Initialize the ContainerService.
   * Must be called before using other methods.
   *
   * @param vscodeModule The VS Code module for API access
   */
  async initialize(vscodeModule: typeof vscode): Promise<void> {
    if (this._initialized) {
      log.debug('ContainerService already initialized');
      return;
    }

    this._vscodeModule = vscodeModule;

    // Try to get the VS Code Remote Containers extension API
    await this._initializeRemoteContainersApi();

    this._initialized = true;
    log.info('ContainerService initialized');
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
   * Event fired when a container's state changes.
   */
  get onContainerStateChange(): (listener: (event: ContainerStateEvent) => void) => vscode.Disposable {
    return this._onContainerStateChange.event;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Container Discovery
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * List all available containers.
   * Prioritizes VS Code Remote Containers API, falls back to Docker CLI.
   *
   * @param forceRefresh Force refresh of container list (bypass cache)
   * @returns Array of container information
   */
  async listContainers(forceRefresh = false): Promise<ContainerInfo[]> {
    this._ensureInitialized();

    // Check cache validity
    if (!forceRefresh && this._isCacheValid()) {
      log.debug('Returning cached container list');
      return Array.from(this._containerCache.values());
    }

    let containers: ContainerInfo[] = [];

    // Try VS Code Remote Containers API first
    if (this._remoteContainersApi) {
      try {
        containers = await this._listContainersViaRemoteApi();
        log.debug(`Found ${containers.length} containers via Remote Containers API`);
      } catch (error) {
        log.warn('Failed to list containers via Remote API, falling back to Docker CLI', error);
        containers = await this._listContainersViaDocker();
      }
    } else {
      // Fall back to Docker CLI
      containers = await this._listContainersViaDocker();
    }

    // Update cache
    this._containerCache.clear();
    for (const container of containers) {
      this._containerCache.set(container.id, container);
    }
    this._lastRefresh = Date.now();

    return containers;
  }

  /**
   * Get information about a specific container.
   *
   * @param id Container ID or name
   * @returns Container information or undefined if not found
   */
  async getContainer(id: string): Promise<ContainerInfo | undefined> {
    this._ensureInitialized();

    // Check cache first
    const cached = this._containerCache.get(id);
    if (cached && this._isCacheValid()) {
      return cached;
    }

    // Fetch fresh data
    try {
      const container = await this._inspectContainer(id);
      if (container) {
        this._containerCache.set(container.id, container);
      }
      return container;
    } catch (error) {
      log.error(`Failed to get container ${id}`, error);
      return undefined;
    }
  }

  /**
   * Get the current status of a container.
   *
   * @param id Container ID or name
   * @returns Current container status
   */
  async getContainerStatus(id: string): Promise<ContainerStatus> {
    this._ensureInitialized();

    const container = await this.getContainer(id);
    return container?.status ?? 'unknown';
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Container Lifecycle
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Start a container.
   *
   * @param id Container ID or name
   * @returns Result of the start operation
   */
  async startContainer(id: string): Promise<ContainerActionResult> {
    this._ensureInitialized();

    const previousStatus = await this.getContainerStatus(id);

    try {
      await this._runDockerCommand(['start', id]);

      // Invalidate cache and get new status
      this._invalidateCache(id);
      const newStatus = await this.getContainerStatus(id);

      // Fire state change event
      this._onContainerStateChange.fire({
        containerId: id,
        previousStatus,
        newStatus,
        timestamp: Date.now(),
        reason: 'User initiated start',
      });

      log.info(`Container ${id} started successfully`);
      return {
        success: true,
        containerId: id,
        action: 'start',
        timestamp: Date.now(),
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      log.error(`Failed to start container ${id}`, error);
      return {
        success: false,
        containerId: id,
        action: 'start',
        error: errorMessage,
        timestamp: Date.now(),
      };
    }
  }

  /**
   * Stop a container.
   *
   * @param id Container ID or name
   * @returns Result of the stop operation
   */
  async stopContainer(id: string): Promise<ContainerActionResult> {
    this._ensureInitialized();

    const previousStatus = await this.getContainerStatus(id);

    try {
      await this._runDockerCommand(['stop', id]);

      // Invalidate cache and get new status
      this._invalidateCache(id);
      const newStatus = await this.getContainerStatus(id);

      // Fire state change event
      this._onContainerStateChange.fire({
        containerId: id,
        previousStatus,
        newStatus,
        timestamp: Date.now(),
        reason: 'User initiated stop',
      });

      log.info(`Container ${id} stopped successfully`);
      return {
        success: true,
        containerId: id,
        action: 'stop',
        timestamp: Date.now(),
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      log.error(`Failed to stop container ${id}`, error);
      return {
        success: false,
        containerId: id,
        action: 'stop',
        error: errorMessage,
        timestamp: Date.now(),
      };
    }
  }

  /**
   * Rebuild a dev container.
   * This stops the container, removes it, and triggers a rebuild via VS Code.
   *
   * @param id Container ID or name
   * @returns Result of the rebuild operation
   */
  async rebuildContainer(id: string): Promise<ContainerActionResult> {
    this._ensureInitialized();

    const container = await this.getContainer(id);
    if (!container) {
      return {
        success: false,
        containerId: id,
        action: 'rebuild',
        error: 'Container not found',
        timestamp: Date.now(),
      };
    }

    if (!container.isDevContainer) {
      return {
        success: false,
        containerId: id,
        action: 'rebuild',
        error: 'Container is not a dev container',
        timestamp: Date.now(),
      };
    }

    try {
      // Try to use VS Code's Remote Containers rebuild command
      if (this._vscodeModule) {
        // If connected to this container, use the rebuild command
        const remoteUri = container.remoteUri;
        if (remoteUri) {
          await this._vscodeModule.commands.executeCommand(
            'remote-containers.rebuildContainer'
          );
          log.info(`Triggered rebuild for container ${id} via VS Code Remote Containers`);
          return {
            success: true,
            containerId: id,
            action: 'rebuild',
            details: 'Rebuild initiated via VS Code Remote Containers',
            timestamp: Date.now(),
          };
        }
      }

      // Fallback: Manual rebuild process
      // 1. Stop the container
      await this._runDockerCommand(['stop', id]);

      // 2. Remove the container
      await this._runDockerCommand(['rm', id]);

      // Invalidate cache
      this._invalidateCache(id);

      log.info(`Container ${id} removed for rebuild`);
      return {
        success: true,
        containerId: id,
        action: 'rebuild',
        details: 'Container removed. Reopen the folder in VS Code to rebuild.',
        timestamp: Date.now(),
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      log.error(`Failed to rebuild container ${id}`, error);
      return {
        success: false,
        containerId: id,
        action: 'rebuild',
        error: errorMessage,
        timestamp: Date.now(),
      };
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Container Logs
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Get container logs as an async iterable.
   * Supports both historical and streaming logs.
   *
   * @param id Container ID or name
   * @param options Log options (tail, follow, since, etc.)
   * @returns Async iterable of log entries
   */
  async *getContainerLogs(
    id: string,
    options: ContainerLogOptions = {}
  ): AsyncIterable<ContainerLogEntry> {
    this._ensureInitialized();

    const args: string[] = ['logs'];

    // Add options
    if (options.tail !== undefined) {
      args.push('--tail', String(options.tail));
    }
    if (options.since !== undefined) {
      const sinceDate = new Date(options.since);
      args.push('--since', sinceDate.toISOString());
    }
    if (options.until !== undefined) {
      const untilDate = new Date(options.until);
      args.push('--until', untilDate.toISOString());
    }
    if (options.timestamps) {
      args.push('--timestamps');
    }
    if (options.follow) {
      args.push('--follow');
    }

    args.push(id);

    log.debug(`Fetching logs for container ${id} with args: ${args.join(' ')}`);

    try {
      if (options.follow) {
        // Streaming mode - use subprocess with stream handling
        yield* this._streamContainerLogs(args);
      } else {
        // Non-streaming mode - fetch all logs at once
        const result = await this._runDockerCommand(args);
        const lines = result.stdout.split('\n').filter((line) => line.length > 0);

        for (const line of lines) {
          yield this._parseLogLine(line, options.timestamps);
        }
      }
    } catch (error) {
      log.error(`Failed to get logs for container ${id}`, error);
      throw error;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Dev Container Detection
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Check if a container is a dev container.
   *
   * @param container Container to check
   * @returns True if the container is a dev container
   */
  isDevContainer(container: ContainerInfo): boolean {
    return container.isDevContainer;
  }

  /**
   * Detect dev containers from the container list.
   *
   * @returns Array of dev containers only
   */
  async listDevContainers(): Promise<ContainerInfo[]> {
    const containers = await this.listContainers();
    return containers.filter((c) => c.isDevContainer);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Lifecycle
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Dispose of the ContainerService and clean up resources.
   */
  dispose(): void {
    this._containerCache.clear();
    this._onContainerStateChange.dispose();
    this._disposables.dispose();
    this._vscodeModule = null;
    this._remoteContainersApi = null;
    this._initialized = false;
    log.debug('ContainerService disposed');
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Private Methods - VS Code Remote Containers API
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Initialize the VS Code Remote Containers API if available.
   */
  private async _initializeRemoteContainersApi(): Promise<void> {
    if (!this._vscodeModule) return;

    try {
      const extension = this._vscodeModule.extensions.getExtension(REMOTE_CONTAINERS_EXTENSION_ID);
      if (extension) {
        if (!extension.isActive) {
          await extension.activate();
        }
        this._remoteContainersApi = extension.exports;
        log.info('VS Code Remote Containers API available');
      } else {
        log.info('VS Code Remote Containers extension not installed, using Docker CLI fallback');
      }
    } catch (error) {
      log.warn('Failed to initialize Remote Containers API', error);
    }
  }

  /**
   * List containers via VS Code Remote Containers API.
   * This is a placeholder - the actual API may vary.
   */
  private async _listContainersViaRemoteApi(): Promise<ContainerInfo[]> {
    // The Remote Containers API doesn't provide a direct container listing.
    // We fall back to Docker CLI but mark containers that have remote URIs.
    const containers = await this._listContainersViaDocker();

    // Enhance with Remote Containers information if available
    if (this._vscodeModule) {
      // Check if we're currently connected to a remote container
      const remoteContext = this._vscodeModule.env.remoteName;
      if (remoteContext === 'dev-container' || remoteContext === 'attached-container') {
        // We're in a dev container - mark the current container
        const currentContainerId = process.env['HOSTNAME'];
        if (currentContainerId) {
          const container = containers.find((c) => c.id.startsWith(currentContainerId) || c.name === currentContainerId);
          if (container) {
            container.remoteUri = this._vscodeModule.env.machineId;
          }
        }
      }
    }

    return containers;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Private Methods - Docker CLI
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * List containers via Docker CLI.
   */
  private async _listContainersViaDocker(): Promise<ContainerInfo[]> {
    try {
      const result = await this._runDockerCommand([
        'ps',
        '-a',
        '--format',
        '{{json .}}',
      ]);

      const containers: ContainerInfo[] = [];
      const lines = result.stdout.split('\n').filter((line) => line.trim().length > 0);

      for (const line of lines) {
        try {
          const raw = JSON.parse(line) as DockerContainerJson;
          const container = await this._dockerJsonToContainerInfo(raw);
          containers.push(container);
        } catch (parseError) {
          log.warn(`Failed to parse container JSON: ${line}`, parseError);
        }
      }

      return containers;
    } catch (error) {
      log.error('Failed to list containers via Docker CLI', error);
      throw error;
    }
  }

  /**
   * Inspect a specific container via Docker CLI.
   */
  private async _inspectContainer(id: string): Promise<ContainerInfo | undefined> {
    try {
      const result = await this._runDockerCommand(['inspect', id]);
      const inspectData = JSON.parse(result.stdout) as DockerInspectJson[];

      const firstInspect = inspectData[0];
      if (!firstInspect) {
        return undefined;
      }

      return this._dockerInspectToContainerInfo(firstInspect);
    } catch (error) {
      log.error(`Failed to inspect container ${id}`, error);
      return undefined;
    }
  }

  /**
   * Convert Docker CLI JSON output to ContainerInfo.
   */
  private async _dockerJsonToContainerInfo(raw: DockerContainerJson): Promise<ContainerInfo> {
    // Get more details via inspect
    const inspectInfo = await this._inspectContainer(raw.Id.substring(0, 12));
    if (inspectInfo) {
      return inspectInfo;
    }

    // Fallback to basic info from ps output
    const ports: PortMapping[] = raw.Ports.filter((p) => p.PublicPort !== undefined).map((p) => ({
      host: p.PublicPort!,
      container: p.PrivatePort,
      protocol: p.Type === 'udp' ? 'udp' : 'tcp',
    }));

    const isDevContainer = this._detectDevContainer(raw.Labels);
    const workspacePath = this._extractWorkspacePath(raw.Labels, raw.Mounts);

    return {
      id: raw.Id.substring(0, 12),
      name: raw.Names[0]?.replace(/^\//, '') ?? raw.Id.substring(0, 12),
      image: raw.Image,
      status: this._parseContainerStatus(raw.State),
      health: 'none',
      isDevContainer,
      workspacePath,
      ports,
      labels: raw.Labels,
      createdAt: raw.Created * 1000,
      hasMcpServer: false,
    };
  }

  /**
   * Convert Docker inspect JSON to ContainerInfo.
   */
  private _dockerInspectToContainerInfo(inspect: DockerInspectJson): ContainerInfo {
    // Parse ports from NetworkSettings
    const ports: PortMapping[] = [];
    for (const [containerPort, hostBindings] of Object.entries(inspect.NetworkSettings.Ports)) {
      if (!hostBindings) continue;
      const [portNum, protocol] = containerPort.split('/');
      if (!portNum) continue;
      for (const binding of hostBindings) {
        ports.push({
          host: parseInt(binding.HostPort, 10),
          container: parseInt(portNum, 10),
          protocol: protocol === 'udp' ? 'udp' : 'tcp',
        });
      }
    }

    const isDevContainer = this._detectDevContainer(inspect.Config.Labels);
    const workspacePath = this._extractWorkspacePath(inspect.Config.Labels, inspect.Mounts);
    const health = this._parseHealthStatus(inspect.State.Health?.Status);

    // Check for MCP server availability
    const hasMcpServer = this._detectMcpServer(inspect.Config.Labels);

    return {
      id: inspect.Id.substring(0, 12),
      name: inspect.Name.replace(/^\//, ''),
      image: inspect.Config.Image,
      status: this._parseInspectStatus(inspect.State),
      health,
      isDevContainer,
      workspacePath,
      ports,
      labels: inspect.Config.Labels,
      createdAt: new Date(inspect.Created).getTime(),
      startedAt: inspect.State.StartedAt !== '0001-01-01T00:00:00Z'
        ? new Date(inspect.State.StartedAt).getTime()
        : undefined,
      hasMcpServer,
    };
  }

  /**
   * Parse container status from Docker ps State.
   */
  private _parseContainerStatus(state: string): ContainerStatus {
    const normalized = state.toLowerCase();
    if (normalized === 'running') return 'running';
    if (normalized === 'exited') return 'exited';
    if (normalized === 'paused') return 'paused';
    if (normalized === 'restarting') return 'restarting';
    if (normalized === 'dead') return 'dead';
    if (normalized === 'created') return 'created';
    if (normalized === 'removing') return 'removing';
    return 'unknown';
  }

  /**
   * Parse container status from Docker inspect State.
   */
  private _parseInspectStatus(state: DockerInspectJson['State']): ContainerStatus {
    if (state.Running) return 'running';
    if (state.Paused) return 'paused';
    if (state.Restarting) return 'restarting';
    if (state.Dead) return 'dead';

    const status = state.Status.toLowerCase();
    return this._parseContainerStatus(status);
  }

  /**
   * Parse health status from Docker inspect.
   */
  private _parseHealthStatus(status?: string): ContainerHealth {
    if (!status) return 'none';
    const normalized = status.toLowerCase();
    if (normalized === 'healthy') return 'healthy';
    if (normalized === 'unhealthy') return 'unhealthy';
    if (normalized === 'starting') return 'starting';
    return 'none';
  }

  /**
   * Detect if a container is a dev container based on labels.
   */
  private _detectDevContainer(labels: Record<string, string>): boolean {
    // Check for devcontainer metadata label
    if (labels[DEVCONTAINER_METADATA_LABEL]) {
      return true;
    }

    // Check for devcontainer local folder label
    if (labels[DEVCONTAINER_LOCAL_FOLDER_LABEL]) {
      return true;
    }

    // Check for any devcontainer.* labels
    for (const key of Object.keys(labels)) {
      if (key.startsWith(DEVCONTAINER_LABEL_PREFIX)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Extract workspace path from labels or mounts.
   */
  private _extractWorkspacePath(
    labels: Record<string, string>,
    mounts: Array<{ Type: string; Source: string; Destination: string }>
  ): string | undefined {
    // Try to get from devcontainer label
    const localFolder = labels[DEVCONTAINER_LOCAL_FOLDER_LABEL];
    if (localFolder) {
      return localFolder;
    }

    // Look for workspace mount (commonly /workspaces/*)
    const workspaceMount = mounts.find(
      (m) => m.Type === 'bind' && m.Destination.startsWith('/workspaces/')
    );
    if (workspaceMount) {
      return workspaceMount.Source;
    }

    return undefined;
  }

  /**
   * Detect if MCP server is available in a container.
   */
  private _detectMcpServer(labels: Record<string, string>): boolean {
    // Check for agency-specific labels
    if (labels['agency.mcp-server'] === 'true') {
      return true;
    }

    // Could also check for running processes or ports, but that's more expensive
    return false;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Private Methods - Docker Commands
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Run a Docker CLI command.
   */
  private async _runDockerCommand(
    args: string[],
    options: ExecaOptions = {}
  ): Promise<{ stdout: string; stderr: string }> {
    try {
      const result = await execa('docker', args, {
        timeout: DOCKER_COMMAND_TIMEOUT,
        ...options,
      });
      return { stdout: result.stdout, stderr: result.stderr };
    } catch (error) {
      log.error(`Docker command failed: docker ${args.join(' ')}`, error);
      throw error;
    }
  }

  /**
   * Stream container logs using subprocess.
   */
  private async *_streamContainerLogs(args: string[]): AsyncIterable<ContainerLogEntry> {
    const subprocess = execa('docker', args, {
      buffer: false,
    });

    const stdout = subprocess.stdout;
    const stderr = subprocess.stderr;

    if (!stdout || !stderr) {
      throw new Error('Failed to get subprocess streams');
    }

    // Create a combined async iterator from both streams
    const decoder = new TextDecoder();
    let stdoutBuffer = '';
    let stderrBuffer = '';

    const processChunk = function* (
      chunk: Uint8Array,
      buffer: string,
      stream: 'stdout' | 'stderr'
    ): Generator<{ entry: ContainerLogEntry; remaining: string }> {
      buffer += decoder.decode(chunk, { stream: true });
      const lines = buffer.split('\n');

      // Keep the last incomplete line in the buffer
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        if (line.length > 0) {
          yield {
            entry: {
              content: line,
              stream,
              timestamp: Date.now(),
            },
            remaining: buffer,
          };
        }
      }
    };

    // Read from both streams concurrently
    // This is a simplified implementation - a production version would use
    // proper stream multiplexing
    try {
      for await (const chunk of stdout) {
        for (const result of processChunk(chunk as Uint8Array, stdoutBuffer, 'stdout')) {
          stdoutBuffer = result.remaining;
          yield result.entry;
        }
      }
    } catch (error) {
      // Stream ended or error occurred
      if (stdoutBuffer.length > 0) {
        yield {
          content: stdoutBuffer,
          stream: 'stdout',
          timestamp: Date.now(),
        };
      }
    }
  }

  /**
   * Parse a log line into a ContainerLogEntry.
   */
  private _parseLogLine(line: string, hasTimestamp = false): ContainerLogEntry {
    let content = line;
    let timestamp = Date.now();

    if (hasTimestamp) {
      // Docker timestamps are in RFC3339Nano format at the start of the line
      const match = line.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z)\s(.*)$/);
      if (match && match[1] && match[2]) {
        timestamp = new Date(match[1]).getTime();
        content = match[2];
      }
    }

    return {
      content,
      stream: 'stdout', // Docker logs command combines stdout/stderr
      timestamp,
    };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Private Methods - Cache
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Check if the container cache is still valid.
   */
  private _isCacheValid(): boolean {
    return Date.now() - this._lastRefresh < this._cacheValidityMs;
  }

  /**
   * Invalidate cache for a specific container or all containers.
   */
  private _invalidateCache(id?: string): void {
    if (id) {
      this._containerCache.delete(id);
    } else {
      this._containerCache.clear();
    }
    this._lastRefresh = 0;
  }

  /**
   * Ensure the service is initialized.
   */
  private _ensureInitialized(): void {
    if (!this._initialized) {
      throw new Error('ContainerService not initialized. Call initialize() first.');
    }
  }
}
