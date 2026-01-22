/**
 * Tree view provider for dev containers in the Agency extension.
 */

import * as vscode from 'vscode';
import type { ContainerInfo, ContainerStatus } from '../types';
import type { ContainerService } from '../services/ContainerService';
import { createScopedLogger } from '../utils';

const log = createScopedLogger('ContainerTreeProvider');

/**
 * Tree item representing a container in the Containers view.
 */
export class ContainerTreeItem extends vscode.TreeItem {
  /**
   * The underlying container information.
   */
  public readonly container: ContainerInfo;

  /**
   * Create a new ContainerTreeItem.
   * @param container - Container information
   * @param collapsibleState - Tree item collapsible state
   */
  constructor(container: ContainerInfo, collapsibleState: vscode.TreeItemCollapsibleState) {
    super(container.name, collapsibleState);
    this.container = container;

    // Set label and description
    this.label = container.name;
    this.description = container.image;

    // Set context value for command enablement
    this.contextValue = this.getContextValue(container.status);

    // Set icon based on status
    this.iconPath = this.getIconPath(container.status);

    // Build tooltip with container details
    this.tooltip = this.buildTooltip(container);
  }

  /**
   * Get context value for command enablement based on container status.
   * @param status - Container status
   * @returns Context value string
   */
  private getContextValue(status: ContainerStatus): string {
    switch (status) {
      case 'running':
      case 'restarting':
        return 'containerRunning';
      case 'paused':
        return 'containerPaused';
      case 'stopped':
      case 'created':
      case 'exited':
        return 'containerStopped';
      default:
        return 'containerAny';
    }
  }

  /**
   * Get icon for container based on status.
   * @param status - Container status
   * @returns ThemeIcon for the container
   */
  private getIconPath(status: ContainerStatus): vscode.ThemeIcon {
    switch (status) {
      case 'running':
        return new vscode.ThemeIcon('debug-start', new vscode.ThemeColor('charts.green'));
      case 'stopped':
      case 'exited':
        return new vscode.ThemeIcon('debug-stop', new vscode.ThemeColor('disabledForeground'));
      case 'paused':
        return new vscode.ThemeIcon('debug-pause', new vscode.ThemeColor('charts.yellow'));
      case 'restarting':
        return new vscode.ThemeIcon('sync~spin', new vscode.ThemeColor('charts.blue'));
      case 'dead':
        return new vscode.ThemeIcon('error', new vscode.ThemeColor('charts.red'));
      case 'created':
        return new vscode.ThemeIcon('circle-outline', new vscode.ThemeColor('disabledForeground'));
      default:
        return new vscode.ThemeIcon('question', new vscode.ThemeColor('disabledForeground'));
    }
  }

  /**
   * Build tooltip with container details.
   * @param container - Container information
   * @returns Markdown string for tooltip
   */
  private buildTooltip(container: ContainerInfo): vscode.MarkdownString {
    const tooltip = new vscode.MarkdownString();
    tooltip.isTrusted = true;

    tooltip.appendMarkdown(`**${container.name}**\n\n`);
    tooltip.appendMarkdown(`- **Status**: ${container.status}\n`);
    tooltip.appendMarkdown(`- **Image**: ${container.image}\n`);
    tooltip.appendMarkdown(`- **ID**: ${container.id}\n`);

    if (container.workspacePath) {
      tooltip.appendMarkdown(`- **Workspace**: ${container.workspacePath}\n`);
    }

    if (container.ports.length > 0) {
      tooltip.appendMarkdown(`- **Ports**: ${container.ports.map(p => `${p.host}:${p.container}`).join(', ')}\n`);
    }

    if (container.hasMcpServer) {
      tooltip.appendMarkdown(`- **MCP Server**: Available ✓\n`);
    }

    const createdDate = new Date(container.createdAt);
    tooltip.appendMarkdown(`- **Created**: ${createdDate.toLocaleString()}\n`);

    if (container.startedAt) {
      const startedDate = new Date(container.startedAt);
      tooltip.appendMarkdown(`- **Started**: ${startedDate.toLocaleString()}\n`);
    }

    return tooltip;
  }
}

/**
 * Tree data provider for dev containers.
 *
 * Displays a list of containers with their status and provides
 * actions for managing container lifecycle.
 */
export class ContainerTreeProvider implements vscode.TreeDataProvider<ContainerTreeItem> {
  private _onDidChangeTreeData: vscode.EventEmitter<ContainerTreeItem | undefined | null | void> =
    new vscode.EventEmitter<ContainerTreeItem | undefined | null | void>();

  /**
   * Event that fires when tree data changes.
   */
  readonly onDidChangeTreeData: vscode.Event<ContainerTreeItem | undefined | null | void> =
    this._onDidChangeTreeData.event;

  /**
   * Create a new ContainerTreeProvider.
   * @param containerService - Container service for fetching container information
   */
  constructor(private readonly containerService: ContainerService) {
    // Subscribe to container state changes
    this.containerService.onDidChangeState(() => {
      this.refresh();
    });
  }

  /**
   * Refresh the tree view.
   * This will trigger a reload of all container items.
   */
  refresh(): void {
    log.debug('Refreshing container tree view');
    this._onDidChangeTreeData.fire();
  }

  /**
   * Get tree item representation.
   * @param element - Container tree item
   * @returns The tree item
   */
  getTreeItem(element: ContainerTreeItem): vscode.TreeItem {
    return element;
  }

  /**
   * Get children of the tree item.
   * @param element - Parent element (undefined for root)
   * @returns Array of container tree items
   */
  async getChildren(element?: ContainerTreeItem): Promise<ContainerTreeItem[]> {
    // Root level - return all containers
    if (!element) {
      try {
        const containers = await this.containerService.listContainers();
        log.debug(`Fetched ${containers.length} containers`);

        return containers.map(
          container =>
            new ContainerTreeItem(container, vscode.TreeItemCollapsibleState.None)
        );
      } catch (error) {
        log.error('Failed to fetch containers', error);
        // Show error in tree view
        vscode.window.showErrorMessage(`Failed to fetch containers: ${error instanceof Error ? error.message : String(error)}`);
        return [];
      }
    }

    // Container items have no children
    return [];
  }
}
