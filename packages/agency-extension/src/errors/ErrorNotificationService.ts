/**
 * Error notification service for the Agency extension.
 * Handles error display, categorization, and user actions.
 */

import * as vscode from 'vscode';
import { AgencyError, ErrorAction, ErrorCategory } from './ErrorTypes';

/**
 * Service for displaying errors to users with appropriate notifications
 * and actions. Handles both typed AgencyError instances and generic errors.
 */
export class ErrorNotificationService {
  private static outputChannel: vscode.OutputChannel | null = null;

  /**
   * Initialize the error notification service.
   * Must be called before using showError().
   */
  static initialize(): void {
    if (!this.outputChannel) {
      this.outputChannel = vscode.window.createOutputChannel('Agency');
    }
  }

  /**
   * Dispose of resources used by the service.
   */
  static dispose(): void {
    if (this.outputChannel) {
      this.outputChannel.dispose();
      this.outputChannel = null;
    }
  }

  /**
   * Show an error notification to the user.
   * Logs detailed information to output channel and displays user-friendly message.
   *
   * @param error - Error to display (AgencyError or generic Error)
   */
  static async showError(error: Error): Promise<void> {
    // Ensure output channel exists
    if (!this.outputChannel) {
      this.initialize();
    }

    // 1. Log detailed error to output channel
    this.logError(error);

    // 2. Determine if AgencyError or generic Error
    const isAgencyError = error instanceof AgencyError;

    // 3. Get user message
    const userMessage = isAgencyError
      ? error.getUserMessage()
      : this.getGenericUserMessage(error);

    // 4. Get actions
    const actions = this.getActions(error);

    // 5. Show notification with action buttons
    const actionLabels = actions.map(action => action.label);
    const selectedAction = await vscode.window.showErrorMessage(
      userMessage,
      ...actionLabels
    );

    // 6. Handle button clicks
    if (selectedAction) {
      await this.handleAction(actions, selectedAction);
    }
  }

  /**
   * Log detailed error information to output channel
   */
  private static logError(error: Error): void {
    if (!this.outputChannel) {
      return;
    }

    const timestamp = new Date().toISOString();
    const isAgencyError = error instanceof AgencyError;

    // Log header
    this.outputChannel.appendLine('');
    this.outputChannel.appendLine('='.repeat(80));
    this.outputChannel.appendLine(`[${timestamp}] ERROR`);

    // Log category if available
    if (isAgencyError) {
      this.outputChannel.appendLine(`Category: ${error.category}`);
    }

    // Log error name and message
    this.outputChannel.appendLine(`Type: ${error.name}`);

    // Log technical message
    const technicalMessage = isAgencyError
      ? error.getTechnicalMessage()
      : error.message;
    this.outputChannel.appendLine(`Message: ${technicalMessage}`);

    // Log stack trace if available
    if (error.stack) {
      this.outputChannel.appendLine('Stack trace:');
      this.outputChannel.appendLine(error.stack);
    }

    this.outputChannel.appendLine('='.repeat(80));
  }

  /**
   * Get user-friendly message for generic errors
   */
  private static getGenericUserMessage(error: Error): string {
    // Try to detect error category from message patterns
    const category = this.detectErrorCategory(error);

    switch (category) {
      case ErrorCategory.DOCKER:
        return 'Docker operation failed. Check if Docker is running and accessible.';
      case ErrorCategory.MCP:
        return 'MCP server operation failed. See logs for details.';
      case ErrorCategory.CONFIG:
        return 'Configuration error. Check your settings and try again.';
      case ErrorCategory.NETWORK:
        return 'Network operation failed. Check your connection and try again.';
      case ErrorCategory.VALIDATION:
        return 'Validation error. Check the input and try again.';
      case ErrorCategory.PERMISSION:
        return 'Permission denied. Check file permissions and try again.';
      default:
        return `An error occurred: ${error.message}`;
    }
  }

  /**
   * Detect error category from error message patterns
   */
  private static detectErrorCategory(error: Error): ErrorCategory {
    const message = error.message.toLowerCase();

    if (message.includes('docker') || message.includes('container')) {
      return ErrorCategory.DOCKER;
    }
    if (message.includes('mcp') || message.includes('model context protocol')) {
      return ErrorCategory.MCP;
    }
    if (message.includes('config') || message.includes('configuration')) {
      return ErrorCategory.CONFIG;
    }
    if (
      message.includes('network') ||
      message.includes('connection') ||
      message.includes('econnrefused') ||
      message.includes('timeout')
    ) {
      return ErrorCategory.NETWORK;
    }
    if (message.includes('validation') || message.includes('invalid')) {
      return ErrorCategory.VALIDATION;
    }
    if (
      message.includes('permission') ||
      message.includes('eacces') ||
      message.includes('eperm')
    ) {
      return ErrorCategory.PERMISSION;
    }

    return ErrorCategory.UNKNOWN;
  }

  /**
   * Get action buttons for error
   */
  private static getActions(error: Error): ErrorAction[] {
    const actions: ErrorAction[] = [];

    // Get specific action from AgencyError
    if (error instanceof AgencyError) {
      const specificAction = error.getAction();
      if (specificAction) {
        actions.push(specificAction);
      }
    }

    // Always add "View Logs" action
    actions.push({
      label: 'View Logs',
      command: 'agency.showLogs',
    });

    return actions;
  }

  /**
   * Handle action button click
   */
  private static async handleAction(
    actions: ErrorAction[],
    selectedLabel: string
  ): Promise<void> {
    const action = actions.find(a => a.label === selectedLabel);
    if (!action) {
      return;
    }

    // Handle special "View Logs" command
    if (action.command === 'agency.showLogs') {
      if (this.outputChannel) {
        this.outputChannel.show();
      }
      return;
    }

    // Execute command with arguments
    try {
      await vscode.commands.executeCommand(
        action.command,
        ...(action.args || [])
      );
    } catch (commandError) {
      // Log command execution error but don't show another notification
      if (this.outputChannel) {
        this.outputChannel.appendLine(
          `Failed to execute command ${action.command}: ${commandError}`
        );
      }
    }
  }
}
