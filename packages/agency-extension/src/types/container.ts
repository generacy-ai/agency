/**
 * Container-related type definitions for the Agency VS Code extension.
 * These types support dev container management.
 */

/**
 * Container runtime status.
 */
export type ContainerStatus =
  | 'running'
  | 'stopped'
  | 'paused'
  | 'restarting'
  | 'removing'
  | 'exited'
  | 'dead'
  | 'created'
  | 'unknown';

/**
 * Container health status.
 */
export type ContainerHealth = 'healthy' | 'unhealthy' | 'starting' | 'none';

/**
 * Information about a dev container.
 */
export interface ContainerInfo {
  /** Container ID (short form) */
  id: string;

  /** Container name */
  name: string;

  /** Container image name */
  image: string;

  /** Current status */
  status: ContainerStatus;

  /** Health check status */
  health: ContainerHealth;

  /** Whether this is a dev container (has devcontainer labels) */
  isDevContainer: boolean;

  /** Workspace folder path mounted in the container */
  workspacePath?: string;

  /** Exposed ports (host:container mappings) */
  ports: PortMapping[];

  /** Container labels */
  labels: Record<string, string>;

  /** Timestamp when container was created (ms since epoch) */
  createdAt: number;

  /** Timestamp when container was started (ms since epoch) */
  startedAt?: number;

  /** Remote URI for VS Code Remote connection */
  remoteUri?: string;

  /** Whether MCP server is available in this container */
  hasMcpServer: boolean;
}

/**
 * Port mapping between host and container.
 */
export interface PortMapping {
  /** Host port */
  host: number;

  /** Container port */
  container: number;

  /** Protocol (tcp/udp) */
  protocol: 'tcp' | 'udp';
}

/**
 * Result of a container action.
 */
export interface ContainerActionResult {
  /** Whether the action was successful */
  success: boolean;

  /** Container ID the action was performed on */
  containerId: string;

  /** Action that was performed */
  action: ContainerAction;

  /** Error message if success is false */
  error?: string;

  /** Additional details or output from the action */
  details?: string;

  /** Timestamp when action completed */
  timestamp: number;
}

/**
 * Available container actions.
 */
export type ContainerAction = 'start' | 'stop' | 'restart' | 'rebuild' | 'remove';

/**
 * Log entry from a container.
 */
export interface ContainerLogEntry {
  /** Log line content */
  content: string;

  /** Log stream (stdout/stderr) */
  stream: 'stdout' | 'stderr';

  /** Timestamp of the log entry */
  timestamp: number;
}

/**
 * Options for fetching container logs.
 */
export interface ContainerLogOptions {
  /** Number of lines to fetch from the end (tail) */
  tail?: number;

  /** Fetch logs since this timestamp (ms since epoch) */
  since?: number;

  /** Fetch logs until this timestamp (ms since epoch) */
  until?: number;

  /** Include timestamps in log entries */
  timestamps?: boolean;

  /** Follow log output (streaming) */
  follow?: boolean;
}

/**
 * Container discovery source.
 */
export type ContainerDiscoverySource = 'vscode-remote' | 'docker-api' | 'manual';

/**
 * Configuration for a specific container.
 */
export interface ContainerConfig {
  /** Container ID or name pattern */
  id: string;

  /** Display name override */
  displayName?: string;

  /** Whether to auto-connect MCP when this container starts */
  autoConnect: boolean;

  /** Custom MCP server command (if different from default) */
  mcpCommand?: string;

  /** Environment variables to set when connecting */
  environment?: Record<string, string>;
}

/**
 * Container state change event.
 */
export interface ContainerStateEvent {
  /** Container ID */
  containerId: string;

  /** Previous status */
  previousStatus: ContainerStatus;

  /** New status */
  newStatus: ContainerStatus;

  /** Timestamp of the change */
  timestamp: number;

  /** Reason for the change (if available) */
  reason?: string;
}
