/**
 * Container command handlers for the Agency extension.
 * These commands manage dev container lifecycle operations.
 */

import type * as vscode from 'vscode';
import type { ContainerTreeItem } from '../providers/ContainerTreeProvider';
import { ContainerService } from '../services/ContainerService';
import { createScopedLogger } from '../utils';

const log = createScopedLogger('ContainerCommands');

/** Singleton container service instance */
let containerServiceInstance: ContainerService | null = null;

/** Tree provider for refreshing after operations */
let treeProvider: any | null = null;

/**
 * Initialize container commands with dependencies.
 * Must be called during extension activation.
 *
 * @param service The container service instance
 * @param provider The container tree provider for refresh
 */
export function initializeContainerCommands(
  service: ContainerService,
  provider: any
): void {
  containerServiceInstance = service;
  treeProvider = provider;
  log.debug('Container commands initialized');
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
 * Start a stopped container.
 *
 * @param vscodeModule The VS Code module
 * @param item Container tree item to start
 */
export async function startContainer(
  vscodeModule: typeof vscode,
  item: ContainerTreeItem
): Promise<void> {
  const service = getContainerService();
  const containerId = item.container.id;
  const containerName = item.container.name;

  log.info(`Starting container: ${containerName} (${containerId})`);

  try {
    await vscodeModule.window.withProgress(
      {
        location: vscodeModule.ProgressLocation.Notification,
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

    vscodeModule.window.showInformationMessage(`Container ${containerName} started successfully.`);
    refreshTree();
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    log.error(`Failed to start container ${containerName}`, error);
    vscodeModule.window.showErrorMessage(`Failed to start container ${containerName}: ${errorMsg}`);
  }
}

/**
 * Stop a running container.
 *
 * @param vscodeModule The VS Code module
 * @param item Container tree item to stop
 */
export async function stopContainer(
  vscodeModule: typeof vscode,
  item: ContainerTreeItem
): Promise<void> {
  const service = getContainerService();
  const containerId = item.container.id;
  const containerName = item.container.name;

  log.info(`Stopping container: ${containerName} (${containerId})`);

  try {
    await vscodeModule.window.withProgress(
      {
        location: vscodeModule.ProgressLocation.Notification,
        title: `Stopping container ${containerName}...`,
        cancellable: false,
      },
      async () => {
        const result = await service.stopContainer(containerId);

        if (!result.success) {
          throw new Error(result.error || 'Unknown error');
        }

        log.info(`Container stopped successfully: ${containerName}`);
      }
    );

    vscodeModule.window.showInformationMessage(`Container ${containerName} stopped successfully.`);
    refreshTree();
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    log.error(`Failed to stop container ${containerName}`, error);
    vscodeModule.window.showErrorMessage(`Failed to stop container ${containerName}: ${errorMsg}`);
  }
}

/**
 * Rebuild a container from scratch.
 * This is a destructive operation that requires user confirmation.
 *
 * @param vscodeModule The VS Code module
 * @param item Container tree item to rebuild
 */
export async function rebuildContainer(
  vscodeModule: typeof vscode,
  item: ContainerTreeItem
): Promise<void> {
  const service = getContainerService();
  const containerId = item.container.id;
  const containerName = item.container.name;

  log.info(`Rebuild requested for container: ${containerName} (${containerId})`);

  // Show confirmation dialog (destructive operation)
  const confirmation = await vscodeModule.window.showWarningMessage(
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
    await vscodeModule.window.withProgress(
      {
        location: vscodeModule.ProgressLocation.Notification,
        title: `Rebuilding container ${containerName}...`,
        cancellable: true,
      },
      async (progress, token) => {
        // Check for cancellation
        if (token.isCancellationRequested) {
          log.debug('Container rebuild cancelled during execution');
          throw new Error('Rebuild cancelled');
        }

        const result = await service.rebuildContainer(containerId);

        if (!result.success) {
          throw new Error(result.error || 'Unknown error');
        }

        log.info(`Container rebuilt successfully: ${containerName}`);
      }
    );

    vscodeModule.window.showInformationMessage(
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
    vscodeModule.window.showErrorMessage(
      `Failed to rebuild container ${containerName}: ${errorMsg}`
    );
  }
}

/**
 * View container logs.
 * Opens a webview panel if ContainerDetailPanel is available,
 * otherwise falls back to an output channel.
 *
 * @param vscodeModule The VS Code module
 * @param item Container tree item to view logs for
 */
export async function viewContainerLogs(
  vscodeModule: typeof vscode,
  item: ContainerTreeItem
): Promise<void> {
  const service = getContainerService();
  const containerId = item.container.id;
  const containerName = item.container.name;

  log.info(`Viewing logs for container: ${containerName} (${containerId})`);

  try {
    // TODO: Check if ContainerDetailPanel exists (TG-020)
    // For now, use output channel fallback

    // Create output channel for logs
    const outputChannel = vscodeModule.window.createOutputChannel(
      `Container: ${containerName}`
    );
    outputChannel.show();

    outputChannel.appendLine(`=== Logs for container: ${containerName} ===`);
    outputChannel.appendLine(`Container ID: ${containerId}`);
    outputChannel.appendLine(`Image: ${item.container.image}`);
    outputChannel.appendLine(`Status: ${item.container.status}`);
    outputChannel.appendLine('');

    // Fetch logs (last 100 lines)
    const logs = await service.getLogs(containerId, { tail: 100 });

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
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    log.error(`Failed to view logs for container ${containerName}`, error);
    vscodeModule.window.showErrorMessage(
      `Failed to view logs for container ${containerName}: ${errorMsg}`
    );
  }
}
