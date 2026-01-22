/**
 * Error types for the Agency extension.
 * Provides typed errors with user-friendly messages and suggested actions.
 */

/**
 * Error categories for routing and handling
 */
export enum ErrorCategory {
  DOCKER = 'docker',
  MCP = 'mcp',
  CONFIG = 'config',
  NETWORK = 'network',
  VALIDATION = 'validation',
  PERMISSION = 'permission',
  UNKNOWN = 'unknown',
}

/**
 * Suggested action for error resolution
 */
export interface ErrorAction {
  /**
   * Label for action button
   */
  label: string;

  /**
   * Command to execute
   */
  command: string;

  /**
   * Optional command arguments
   */
  args?: unknown[];
}

/**
 * Base class for all typed errors in the extension
 */
export abstract class AgencyError extends Error {
  /**
   * Error category for routing and handling
   */
  abstract readonly category: ErrorCategory;

  /**
   * Get user-friendly message (no technical details)
   */
  abstract getUserMessage(): string;

  /**
   * Get suggested action for user
   */
  abstract getAction(): ErrorAction | null;

  /**
   * Get detailed technical message for logging
   */
  getTechnicalMessage(): string {
    return this.message;
  }
}

/**
 * Docker not running error
 */
export class DockerNotRunningError extends AgencyError {
  override readonly category = ErrorCategory.DOCKER;

  constructor(message: string = 'Docker daemon is not running') {
    super(message);
    this.name = 'DockerNotRunningError';
  }

  override getUserMessage(): string {
    return 'Docker is not running. Agency requires Docker to manage dev containers.';
  }

  override getAction(): ErrorAction {
    return {
      label: 'View Documentation',
      command: 'agency.openDocs',
      args: ['docker-setup'],
    };
  }
}

/**
 * Container not found error
 */
export class ContainerNotFoundError extends AgencyError {
  override readonly category = ErrorCategory.DOCKER;

  constructor(public readonly containerId?: string) {
    super(`Container not found${containerId ? `: ${containerId}` : ''}`);
    this.name = 'ContainerNotFoundError';
  }

  override getUserMessage(): string {
    return 'No dev container found. Create one to test MCP tools.';
  }

  override getAction(): ErrorAction {
    return {
      label: 'Create Container',
      command: 'agency.createContainer',
    };
  }
}

/**
 * MCP connection error
 */
export class McpConnectionError extends AgencyError {
  override readonly category = ErrorCategory.MCP;

  constructor(
    message: string,
    public override readonly cause?: Error
  ) {
    super(message);
    this.name = 'McpConnectionError';
  }

  override getUserMessage(): string {
    return 'Could not connect to MCP server in container.';
  }

  override getAction(): ErrorAction {
    return {
      label: 'Check Container',
      command: 'agency.showContainerStatus',
    };
  }

  override getTechnicalMessage(): string {
    return this.cause
      ? `${this.message}\nCause: ${this.cause.message}`
      : this.message;
  }
}

/**
 * Configuration validation error
 */
export class ConfigValidationError extends AgencyError {
  override readonly category = ErrorCategory.CONFIG;

  constructor(
    message: string,
    public readonly validationErrors: string[]
  ) {
    super(message);
    this.name = 'ConfigValidationError';
  }

  override getUserMessage(): string {
    return 'Configuration file has errors and could not be loaded.';
  }

  override getAction(): ErrorAction {
    return {
      label: 'View Errors',
      command: 'agency.showConfigErrors',
      args: [this.validationErrors],
    };
  }

  override getTechnicalMessage(): string {
    return `${this.message}\nValidation errors:\n${this.validationErrors.join('\n')}`;
  }
}

/**
 * Permission denied error
 */
export class PermissionDeniedError extends AgencyError {
  override readonly category = ErrorCategory.PERMISSION;

  constructor(public readonly resource: string) {
    super(`Permission denied accessing ${resource}`);
    this.name = 'PermissionDeniedError';
  }

  override getUserMessage(): string {
    return `Permission denied accessing ${this.resource}.`;
  }

  override getAction(): ErrorAction {
    return {
      label: 'View Logs',
      command: 'agency.showLogs',
    };
  }
}
