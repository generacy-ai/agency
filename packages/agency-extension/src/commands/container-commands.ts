/**
 * Container command handlers for the Agency extension.
 * These commands manage dev container lifecycle operations.
 */

import type * as vscode from 'vscode';
import type { ContainerTreeItem } from '../providers/ContainerTreeProvider';
import { ContainerService } from '../services/ContainerService';
import { createScopedLogger, detectDevContainer } from '../utils';

const log = createScopedLogger('ContainerCommands');

/** Singleton container service instance */
let containerServiceInstance: ContainerService | null = null;

/** Tree provider for refreshing after operations */
let treeProvider: any | null = null;

/** Extension URI for webview access */
let extensionUri: vscode.Uri | null = null;

/** VS Code module reference */
let vscodeModule: typeof vscode | null = null;

/**
 * Initialize container commands with dependencies.
 * Must be called during extension activation.
 *
 * @param service The container service instance
 * @param provider The container tree provider for refresh
 * @param extUri The extension URI for webview access
 */
export function initializeContainerCommands(
  service: ContainerService,
  provider: any,
  extUri?: vscode.Uri
): void {
  containerServiceInstance = service;
  treeProvider = provider;
  if (extUri) {
    extensionUri = extUri;
  }
  log.debug('Container commands initialized');
}

/**
 * Set the VS Code module reference for command handlers.
 * @param vsModule The VS Code module
 */
export function setVscodeModule(vsModule: typeof vscode): void {
  vscodeModule = vsModule;
}

/**
 * Get the extension URI.
 * @returns The extension URI or null if not set
 */
export function getExtensionUri(): vscode.Uri | null {
  return extensionUri;
}

/**
 * Get the container service instance.
 * @throws Error if service is not initialized
 */
function getContainerService(): ContainerService {
  if (!containerServiceInstance) {
    throw new Error('Container service not initialized. Call initializeContainerCommands first.');
  }
  return containerServiceInstance;
}

/**
 * Refresh the container tree view.
 */
function refreshTree(): void {
  if (treeProvider && typeof treeProvider.refresh === 'function') {
    treeProvider.refresh();
  }
}

/**
 * Validate that devcontainer.json exists in the workspace.
 * @param vsModule The VS Code module
 * @param workspacePath The workspace path to check
 * @returns True if devcontainer.json exists, false otherwise
 */
async function validateDevContainerConfig(
  vsModule: typeof vscode,
  workspacePath?: string
): Promise<boolean> {
  if (!workspacePath) {
    // Try to get from workspace folders
    const workspaceFolders = vsModule.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
      log.warn('No workspace folder available for devcontainer.json validation');
      return false;
    }
    const firstFolder = workspaceFolders[0];
    if (!firstFolder) {
      log.warn('No workspace folder available for devcontainer.json validation');
      return false;
    }
    workspacePath = firstFolder.uri.fsPath;
  }

  const result = await detectDevContainer(workspacePath);
  if (!result.found) {
    log.warn(`No devcontainer.json found in ${workspacePath}: ${result.error}`);
    return false;
  }

  log.debug(`Found devcontainer.json at: ${result.path}`);
  return true;
}

/**
 * Start a stopped container.
 * Validates that devcontainer.json exists before starting.
 *
 * @param vsModule The VS Code module
 * @param item Container tree item to start
 * @param skipValidation Skip devcontainer.json validation (default: false)
 */
export async function startContainer(
  vsModule: typeof vscode,
  item: ContainerTreeItem,
  skipValidation = false
): Promise<void> {
  const service = getContainerService();
  const containerId = item.container.id;
  const containerName = item.container.name;

  log.info(`Starting container: ${containerName} (${containerId})`);

  // Validate devcontainer.json exists (only for dev containers)
  if (!skipValidation && item.container.isDevContainer) {
    const workspacePath = item.container.workspacePath;
    const hasDevContainer = await validateDevContainerConfig(vsModule, workspacePath);

    if (!hasDevContainer) {
      const proceed = await vsModule.window.showWarningMessage(
        `No devcontainer.json found for container "${containerName}". Start anyway?`,
        'Start Anyway',
        'Cancel'
      );

      if (proceed !== 'Start Anyway') {
        log.debug('Container start cancelled - no devcontainer.json');
        return;
      }
    }
  }

  try {
    await vsModule.window.withProgress(
      {
        location: vsModule.ProgressLocation.Notification,
        title: `Starting container ${containerName}...`,
        cancellable: false,
      },
      async () => {
        const result = await service.startContainer(containerId);

        if (!result.success) {
          throw new Error(result.error || 'Unknown error');
        }

        log.info(`Container started successfully: ${containerName}`);
      }
    );

    vsModule.window.showInformationMessage(`Container ${containerName} started successfully.`);
    refreshTree();
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    log.error(`Failed to start container ${containerName}`, error);
    vsModule.window.showErrorMessage(`Failed to start container ${containerName}: ${errorMsg}`);
  }
}

/**
 * Stop a running container.
 * MCP disconnect is handled automatically via McpConnectionManager event subscription.
 *
 * @param vsModule The VS Code module
 * @param item Container tree item to stop
 */
export async function stopContainer(
  vsModule: typeof vscode,
  item: ContainerTreeItem
): Promise<void> {
  const service = getContainerService();
  const containerId = item.container.id;
  const containerName = item.container.name;

  log.info(`Stopping container: ${containerName} (${containerId})`);

  try {
    await vsModule.window.withProgress(
      {
        location: vsModule.ProgressLocation.Notification,
        title: `Stopping container ${containerName}...`,
        cancellable: false,
      },
      async () => {
        const result = await service.stopContainer(containerId);

        if (!result.success) {
          throw new Error(result.error || 'Unknown error');
        }

        log.info(`Container stopped successfully: ${containerName}`);
        // Note: MCP disconnect is handled automatically by McpConnectionManager
        // when it receives the container state change event
      }
    );

    vsModule.window.showInformationMessage(`Container ${containerName} stopped successfully.`);
    refreshTree();
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    log.error(`Failed to stop container ${containerName}`, error);
    vsModule.window.showErrorMessage(`Failed to stop container ${containerName}: ${errorMsg}`);
  }
}

/**
 * Rebuild a container from scratch.
 * This is a destructive operation that requires user confirmation.
 * Validates that devcontainer.json exists before rebuild.
 * MCP reconnection is handled automatically via McpConnectionManager.
 *
 * @param vsModule The VS Code module
 * @param item Container tree item to rebuild
 * @param skipValidation Skip devcontainer.json validation (default: false)
 */
export async function rebuildContainer(
  vsModule: typeof vscode,
  item: ContainerTreeItem,
  skipValidation = false
): Promise<void> {
  const service = getContainerService();
  const containerId = item.container.id;
  const containerName = item.container.name;

  log.info(`Rebuild requested for container: ${containerName} (${containerId})`);

  // Validate devcontainer.json exists
  if (!skipValidation) {
    const workspacePath = item.container.workspacePath;
    const hasDevContainer = await validateDevContainerConfig(vsModule, workspacePath);

    if (!hasDevContainer) {
      vsModule.window.showErrorMessage(
        `Cannot rebuild container "${containerName}": No devcontainer.json found. ` +
        'A devcontainer.json is required for rebuild operations.'
      );
      return;
    }
  }

  // Show confirmation dialog (destructive operation)
  const confirmation = await vsModule.window.showWarningMessage(
    `Rebuild container "${containerName}"? This will stop and rebuild the container from scratch.`,
    { modal: true },
    'Rebuild',
    'Cancel'
  );

  if (confirmation !== 'Rebuild') {
    log.debug('Container rebuild cancelled by user');
    return;
  }

  try {
    await vsModule.window.withProgress(
      {
        location: vsModule.ProgressLocation.Notification,
        title: `Rebuilding container ${containerName}...`,
        cancellable: true,
      },
      async (progress, token) => {
        // Check for cancellation
        if (token.isCancellationRequested) {
          log.debug('Container rebuild cancelled during execution');
          throw new Error('Rebuild cancelled');
        }

        progress.report({ message: 'Stopping container...' });

        const result = await service.rebuildContainer(containerId);

        if (!result.success) {
          throw new Error(result.error || 'Unknown error');
        }

        progress.report({ message: 'Container rebuilt. Waiting for restart...' });
        log.info(`Container rebuilt successfully: ${containerName}`);
        // Note: MCP reconnection is handled automatically by McpConnectionManager
        // when it receives the container state change event (running -> stopped -> running)
      }
    );

    vsModule.window.showInformationMessage(
      `Container ${containerName} rebuilt successfully.`
    );
    refreshTree();
  } catch (error) {
    if (error instanceof Error && error.message === 'Rebuild cancelled') {
      // User cancelled, no error message needed
      return;
    }

    const errorMsg = error instanceof Error ? error.message : String(error);
    log.error(`Failed to rebuild container ${containerName}`, error);
    vsModule.window.showErrorMessage(
      `Failed to rebuild container ${containerName}: ${errorMsg}`
    );
  }
}

/**
 * View container logs.
 * Opens the ContainerDetailPanel webview with log viewing and filtering.
 *
 * @param vsModule The VS Code module
 * @param item Container tree item to view logs for
 * @param extUri Optional extension URI (uses cached if not provided)
 */
export async function viewContainerLogs(
  vsModule: typeof vscode,
  item: ContainerTreeItem,
  extUri?: vscode.Uri
): Promise<void> {
  const containerId = item.container.id;
  const containerName = item.container.name;
  const uri = extUri || extensionUri;

  log.info(`Viewing logs for container: ${containerName} (${containerId})`);

  try {
    // Use ContainerDetailPanel if extension URI is available
    if (uri) {
      // Dynamic import to avoid circular dependencies
      const { ContainerDetailPanel } = await import('../views/containers/ContainerDetailPanel');
      ContainerDetailPanel.createOrShow(vsModule, uri, containerId);
      log.debug(`Opened ContainerDetailPanel for ${containerName}`);
    } else {
      // Fallback to output channel if no extension URI
      log.debug('No extension URI available, using output channel fallback');
      await viewContainerLogsInOutputChannel(vsModule, item);
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    log.error(`Failed to view logs for container ${containerName}`, error);
    vsModule.window.showErrorMessage(
      `Failed to view logs for container ${containerName}: ${errorMsg}`
    );
  }
}

/**
 * View container logs in an output channel (fallback).
 * Used when ContainerDetailPanel is not available.
 *
 * @param vsModule The VS Code module
 * @param item Container tree item to view logs for
 */
async function viewContainerLogsInOutputChannel(
  vsModule: typeof vscode,
  item: ContainerTreeItem
): Promise<void> {
  const service = getContainerService();
  const containerId = item.container.id;
  const containerName = item.container.name;

  // Create output channel for logs
  const outputChannel = vsModule.window.createOutputChannel(
    `Container: ${containerName}`
  );
  outputChannel.show();

  outputChannel.appendLine(`=== Logs for container: ${containerName} ===`);
  outputChannel.appendLine(`Container ID: ${containerId}`);
  outputChannel.appendLine(`Image: ${item.container.image}`);
  outputChannel.appendLine(`Status: ${item.container.status}`);
  outputChannel.appendLine('');

  // Fetch logs using async iterator (last 100 lines)
  const logs: Array<{ timestamp: number; stream: string; content: string }> = [];
  try {
    for await (const logEntry of service.getContainerLogs(containerId, { tail: 100 })) {
      logs.push(logEntry);
    }
  } catch (error) {
    log.warn(`Error fetching logs for ${containerName}`, error);
  }

  if (logs.length === 0) {
    outputChannel.appendLine('No logs available.');
  } else {
    for (const logEntry of logs) {
      const timestamp = new Date(logEntry.timestamp).toISOString();
      const stream = logEntry.stream === 'stderr' ? '[stderr]' : '[stdout]';
      outputChannel.appendLine(`${timestamp} ${stream} ${logEntry.content}`);
    }
  }

  log.debug(`Displayed ${logs.length} log entries for ${containerName}`);
}

/**
 * Show a container picker when command is invoked without a tree item context.
 *
 * @param vsModule The VS Code module
 * @param title Title for the picker
 * @param filter Optional filter for container status
 * @returns Selected container tree item or undefined if cancelled
 */
export async function showContainerPicker(
  vsModule: typeof vscode,
  title: string,
  filter?: (container: { status: string }) => boolean
): Promise<ContainerTreeItem | undefined> {
  const service = getContainerService();

  try {
    let containers = await service.listContainers();

    // Apply filter if provided
    if (filter) {
      containers = containers.filter(filter);
    }

    if (containers.length === 0) {
      vsModule.window.showInformationMessage('No containers available.');
      return undefined;
    }

    const items = containers.map((container) => ({
      label: container.name,
      description: `${container.image} - ${container.status}`,
      detail: `ID: ${container.id}`,
      container,
    }));

    const selected = await vsModule.window.showQuickPick(items, {
      title,
      placeHolder: 'Select a container',
    });

    if (!selected) {
      return undefined;
    }

    // Create a pseudo tree item
    const { ContainerTreeItem: TreeItem } = await import('../providers/ContainerTreeProvider');
    return new TreeItem(selected.container, vsModule.TreeItemCollapsibleState.None);
  } catch (error) {
    log.error('Failed to show container picker', error);
    vsModule.window.showErrorMessage('Failed to load containers');
    return undefined;
  }
}

/**
 * Register container commands with VS Code.
 *
 * @param vsModule The VS Code module
 * @returns Array of disposables for the registered commands
 */
export function registerContainerCommands(
  vsModule: typeof vscode
): vscode.Disposable[] {
  const disposables: vscode.Disposable[] = [];
  setVscodeModule(vsModule);

  // Register startContainer command
  disposables.push(
    vsModule.commands.registerCommand(
      'agency.startContainer',
      async (item?: ContainerTreeItem) => {
        const targetItem = item || await showContainerPicker(
          vsModule,
          'Start Container',
          (c) => c.status !== 'running'
        );
        if (targetItem) {
          await startContainer(vsModule, targetItem);
        }
      }
    )
  );

  // Register stopContainer command
  disposables.push(
    vsModule.commands.registerCommand(
      'agency.stopContainer',
      async (item?: ContainerTreeItem) => {
        const targetItem = item || await showContainerPicker(
          vsModule,
          'Stop Container',
          (c) => c.status === 'running'
        );
        if (targetItem) {
          await stopContainer(vsModule, targetItem);
        }
      }
    )
  );

  // Register rebuildContainer command
  disposables.push(
    vsModule.commands.registerCommand(
      'agency.rebuildContainer',
      async (item?: ContainerTreeItem) => {
        const targetItem = item || await showContainerPicker(
          vsModule,
          'Rebuild Container',
          (c) => c.status === 'running' || c.status === 'exited' || c.status === 'stopped'
        );
        if (targetItem) {
          await rebuildContainer(vsModule, targetItem);
        }
      }
    )
  );

  // Register viewContainerLogs command
  disposables.push(
    vsModule.commands.registerCommand(
      'agency.viewContainerLogs',
      async (item?: ContainerTreeItem) => {
        const targetItem = item || await showContainerPicker(
          vsModule,
          'View Container Logs'
        );
        if (targetItem) {
          await viewContainerLogs(vsModule, targetItem);
        }
      }
    )
  );

  log.debug(`Registered ${disposables.length} container commands`);
  return disposables;
}
