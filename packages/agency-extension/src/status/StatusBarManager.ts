/**
 * StatusBarManager - Manages status bar items for MCP, Container, and Mode states.
 *
 * Provides visual feedback in the VS Code status bar about:
 * - MCP connection status (connected, disconnected, connecting, error)
 * - Container status (running, stopped, starting, error)
 * - Current mode (active mode name, click to switch)
 *
 * Implements singleton pattern for centralized status management.
 */

import * as vscode from 'vscode';
import { ConnectionStatus, StatusBarState } from '../types/status';
import { COMMANDS } from '../constants';
import { ModeService } from '../services';

export class StatusBarManager {
  private static instance: StatusBarManager | null = null;
  private mcpStatusItem: vscode.StatusBarItem;
  private containerStatusItem: vscode.StatusBarItem;
  private modeStatusItem: vscode.StatusBarItem;
  private modeDisposable: vscode.Disposable | null = null;

  private constructor() {
    // Create MCP status bar item (right-aligned, priority 100)
    this.mcpStatusItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Right,
      100
    );
    this.mcpStatusItem.name = 'MCP Connection Status';

    // Create Container status bar item (right-aligned, priority 99)
    this.containerStatusItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Right,
      99
    );
    this.containerStatusItem.name = 'Container Status';

    // Create Mode status bar item (right-aligned, priority 98)
    this.modeStatusItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Right,
      98
    );
    this.modeStatusItem.name = 'Current Mode';
    this.modeStatusItem.command = COMMANDS.SWITCH_MODE;

    // Initialize with disconnected/stopped states
    this.updateMcpStatus({ state: 'disconnected' });
    this.updateContainerStatus({ state: 'disconnected' });
    this.updateModeStatus();

    // Show items
    this.mcpStatusItem.show();
    this.containerStatusItem.show();
    this.modeStatusItem.show();

    // Subscribe to mode changes
    this.subscribeToModeChanges();
  }

  /**
   * Subscribe to ModeService state changes.
   */
  private subscribeToModeChanges(): void {
    try {
      const modeService = ModeService.getInstance();
      this.modeDisposable = modeService.onModeStateChange(() => {
        this.updateModeStatus();
      });
    } catch {
      // ModeService may not be initialized yet - that's OK
    }
  }

  /**
   * Update the mode status bar item.
   */
  updateModeStatus(): void {
    try {
      const modeService = ModeService.getInstance();
      const currentMode = modeService.getCurrentMode();

      if (currentMode) {
        this.modeStatusItem.text = `$(symbol-property) ${currentMode.config.name}`;
        this.modeStatusItem.tooltip = `Current mode: ${currentMode.config.name}\n${currentMode.effectiveTools.length} tools active\nClick to switch mode`;
        this.modeStatusItem.color = undefined;
      } else {
        this.modeStatusItem.text = '$(symbol-property) No Mode';
        this.modeStatusItem.tooltip = 'No mode selected\nClick to switch mode';
        this.modeStatusItem.color = new vscode.ThemeColor('statusBarItem.warningForeground');
      }
    } catch {
      // ModeService not initialized - show placeholder
      this.modeStatusItem.text = '$(symbol-property) Mode';
      this.modeStatusItem.tooltip = 'Mode system not initialized';
      this.modeStatusItem.color = new vscode.ThemeColor('statusBarItem.warningForeground');
    }
  }

  /**
   * Initialize the singleton instance.
   * Must be called before getInstance().
   *
   * @returns The StatusBarManager instance
   * @throws Error if already initialized
   */
  static initialize(): StatusBarManager {
    if (StatusBarManager.instance !== null) {
      throw new Error('StatusBarManager already initialized');
    }
    StatusBarManager.instance = new StatusBarManager();
    return StatusBarManager.instance;
  }

  /**
   * Get the singleton instance.
   *
   * @returns The StatusBarManager instance or null if not initialized
   */
  static getInstance(): StatusBarManager | null {
    return StatusBarManager.instance;
  }

  /**
   * Update the MCP connection status bar item.
   *
   * @param status - Current MCP connection status
   */
  updateMcpStatus(status: ConnectionStatus): void {
    const state = this.getMcpStatusBarState(status);
    this.applyStatusBarState(this.mcpStatusItem, state);
  }

  /**
   * Update the Container status bar item.
   *
   * @param status - Current container connection status
   */
  updateContainerStatus(status: ConnectionStatus): void {
    const state = this.getContainerStatusBarState(status);
    this.applyStatusBarState(this.containerStatusItem, state);
  }

  /**
   * Map MCP connection status to status bar state.
   *
   * @param status - Connection status
   * @returns Status bar state configuration
   */
  private getMcpStatusBarState(status: ConnectionStatus): StatusBarState {
    switch (status.state) {
      case 'connected':
        return {
          text: 'MCP',
          tooltip: 'Connected to MCP server',
          icon: 'plug',
          command: COMMANDS.DISCONNECT_MCP,
        };

      case 'disconnected':
        return {
          text: 'MCP',
          tooltip: status.reason
            ? `Disconnected from MCP server: ${status.reason}`
            : 'Disconnected from MCP server',
          icon: 'debug-disconnect',
          color: 'statusBarItem.warningForeground',
          command: COMMANDS.CONNECT_MCP,
        };

      case 'connecting':
        return {
          text: 'MCP',
          tooltip: 'Connecting to MCP server...',
          icon: 'loading~spin',
          command: undefined,
        };

      case 'error':
        return {
          text: 'MCP',
          tooltip: `MCP connection error: ${status.error.message}`,
          icon: 'error',
          color: 'statusBarItem.errorForeground',
          command: COMMANDS.CONNECT_MCP,
        };
    }
  }

  /**
   * Map Container connection status to status bar state.
   *
   * @param status - Connection status
   * @returns Status bar state configuration
   */
  private getContainerStatusBarState(status: ConnectionStatus): StatusBarState {
    switch (status.state) {
      case 'connected':
        return {
          text: 'Container',
          tooltip: 'Container running',
          icon: 'vm-active',
          command: COMMANDS.VIEW_CONTAINER_LOGS,
        };

      case 'disconnected':
        return {
          text: 'Container',
          tooltip: status.reason
            ? `Container stopped: ${status.reason}`
            : 'Container stopped',
          icon: 'vm-outline',
          color: 'statusBarItem.warningForeground',
          command: COMMANDS.START_CONTAINER,
        };

      case 'connecting':
        return {
          text: 'Container',
          tooltip: 'Starting container...',
          icon: 'loading~spin',
          command: undefined,
        };

      case 'error':
        return {
          text: 'Container',
          tooltip: `Container error: ${status.error.message}`,
          icon: 'error',
          color: 'statusBarItem.errorForeground',
          command: COMMANDS.VIEW_CONTAINER_LOGS,
        };
    }
  }

  /**
   * Apply status bar state to a status bar item.
   *
   * @param item - Status bar item to update
   * @param state - State configuration to apply
   */
  private applyStatusBarState(
    item: vscode.StatusBarItem,
    state: StatusBarState
  ): void {
    // Set text with icon
    item.text = `$(${state.icon}) ${state.text}`;

    // Set tooltip
    item.tooltip = state.tooltip;

    // Set color (using theme color or undefined for default)
    if (state.color) {
      item.color = new vscode.ThemeColor(state.color);
    } else {
      item.color = undefined;
    }

    // Set command (if any)
    item.command = state.command;
  }

  /**
   * Dispose of all status bar items and clean up resources.
   */
  dispose(): void {
    this.mcpStatusItem.dispose();
    this.containerStatusItem.dispose();
    this.modeStatusItem.dispose();
    if (this.modeDisposable) {
      this.modeDisposable.dispose();
      this.modeDisposable = null;
    }
    StatusBarManager.instance = null;
  }
}
