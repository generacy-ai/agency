/**
 * Welcome view types
 */

import * as vscode from 'vscode';

/**
 * Welcome view tree item
 */
export interface WelcomeItem extends vscode.TreeItem {
  /**
   * Item identifier
   */
  readonly id: string;

  /**
   * Display label
   */
  readonly label: string;

  /**
   * Item description
   */
  readonly description?: string;

  /**
   * Command to execute on click
   */
  readonly command?: vscode.Command;

  /**
   * Icon (codicon or theme icon)
   */
  readonly iconPath?: string | vscode.ThemeIcon;

  /**
   * Collapsible state
   */
  readonly collapsibleState: vscode.TreeItemCollapsibleState;
}
