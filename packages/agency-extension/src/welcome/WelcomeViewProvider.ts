/**
 * Welcome view provider for first-time user onboarding
 */

import * as vscode from 'vscode';
import type { WelcomeItem } from '../types/welcome';

/**
 * Provides welcome view tree items for getting started
 */
export class WelcomeViewProvider implements vscode.TreeDataProvider<WelcomeItem> {
  private _onDidChangeTreeData: vscode.EventEmitter<WelcomeItem | undefined | null | void> =
    new vscode.EventEmitter<WelcomeItem | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<WelcomeItem | undefined | null | void> =
    this._onDidChangeTreeData.event;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly configService: { hasConfig: () => boolean }
  ) {}

  /**
   * Refresh the tree view
   */
  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  /**
   * Get tree item representation
   */
  getTreeItem(element: WelcomeItem): vscode.TreeItem {
    return element;
  }

  /**
   * Get children for tree view
   */
  getChildren(element?: WelcomeItem): WelcomeItem[] {
    // No nested items
    if (element) {
      return [];
    }

    // Check if we should show welcome view
    if (!this.shouldShowWelcome()) {
      return [];
    }

    return this.getWelcomeItems();
  }

  /**
   * Check if welcome view should be shown
   */
  private shouldShowWelcome(): boolean {
    // Show if no config file exists (first-time user)
    const hasConfig = this.configService.hasConfig();

    // Check if user has dismissed welcome
    const dismissed = this.context.globalState.get<boolean>('agency.welcomeDismissed', false);

    return !hasConfig && !dismissed;
  }

  /**
   * Get welcome items for first-time users
   */
  private getWelcomeItems(): WelcomeItem[] {
    return [
      {
        id: 'create-config',
        label: 'Create Configuration',
        description: 'Set up your first Agency configuration',
        command: {
          command: 'agency.initConfig',
          title: 'Create Configuration',
        },
        iconPath: new vscode.ThemeIcon('file-add'),
        collapsibleState: vscode.TreeItemCollapsibleState.None,
      },
      {
        id: 'browse-plugins',
        label: 'Browse Plugins',
        description: 'Explore available MCP plugins',
        command: {
          command: 'agency.showPlugins',
          title: 'Browse Plugins',
        },
        iconPath: new vscode.ThemeIcon('extensions'),
        collapsibleState: vscode.TreeItemCollapsibleState.None,
      },
      {
        id: 'connect-container',
        label: 'Connect to Container',
        description: 'Connect to a dev container',
        command: {
          command: 'agency.connectMcp',
          title: 'Connect to Container',
        },
        iconPath: new vscode.ThemeIcon('debug-disconnect'),
        collapsibleState: vscode.TreeItemCollapsibleState.None,
      },
      {
        id: 'view-docs',
        label: 'View Documentation',
        description: 'Learn how to use Agency',
        command: {
          command: 'agency.openDocs',
          title: 'View Documentation',
          arguments: ['getting-started'],
        },
        iconPath: new vscode.ThemeIcon('book'),
        collapsibleState: vscode.TreeItemCollapsibleState.None,
      },
      {
        id: 'watch-tutorial',
        label: 'Watch Tutorial',
        description: 'Complete the getting started walkthrough',
        command: {
          command: 'workbench.action.openWalkthrough',
          title: 'Watch Tutorial',
          arguments: ['generacy-ai.agency#agency.gettingStarted'],
        },
        iconPath: new vscode.ThemeIcon('play-circle'),
        collapsibleState: vscode.TreeItemCollapsibleState.None,
      },
    ];
  }

  /**
   * Dismiss welcome view
   */
  async dismiss(): Promise<void> {
    await this.context.globalState.update('agency.welcomeDismissed', true);
    this.refresh();
  }
}
