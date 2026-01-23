import type * as vscode from 'vscode';
import { EXTENSION_NAME, OUTPUT_CHANNEL_NAME } from './constants';
import { DisposableManager, Logger, createScopedLogger } from './utils';
import { ConfigService, McpClientService, McpConnectionManager } from './services';
import { ContainerService } from './services/ContainerService';
import { registerPluginTreeView, ContainerTreeProvider } from './providers';
import {
  registerPluginCommands,
  initializePluginCommands,
  registerToolCommands,
  initializeToolCommands,
  registerContainerCommands,
  initializeContainerCommands,
} from './commands';

/**
 * Extension state container.
 * Holds references to services and resources that need cleanup.
 */
interface ExtensionState {
  context: vscode.ExtensionContext;
  disposables: DisposableManager;
  outputChannel: vscode.OutputChannel;
}

let extensionState: ExtensionState | null = null;

/**
 * Initialize the logger with the output channel.
 */
function initializeLogger(outputChannel: vscode.OutputChannel): void {
  const logger = Logger.getInstance();
  logger.initialize(outputChannel);
}

/**
 * Register extension commands.
 * Plugin, tool, and container commands have real implementations.
 */
function registerAllCommands(
  vscodeModule: typeof vscode,
  state: ExtensionState,
  log: ReturnType<typeof createScopedLogger>
): void {
  const { commands } = vscodeModule;

  // Register plugin commands (fully implemented)
  const pluginCommandDisposables = registerPluginCommands(vscodeModule);
  for (const disposable of pluginCommandDisposables) {
    state.disposables.add(disposable);
  }
  log.debug(`Registered ${pluginCommandDisposables.length} plugin commands`);

  // Register tool commands (fully implemented)
  const toolCommandDisposables = registerToolCommands(vscodeModule);
  for (const disposable of toolCommandDisposables) {
    state.disposables.add(disposable);
  }
  log.debug(`Registered ${toolCommandDisposables.length} tool commands`);

  // Register container commands (fully implemented)
  const containerCommandDisposables = registerContainerCommands(vscodeModule);
  for (const disposable of containerCommandDisposables) {
    state.disposables.add(disposable);
  }
  log.debug(`Registered ${containerCommandDisposables.length} container commands`);

  // Stub command registrations for mode commands (not yet implemented)
  const stubCommands = [
    'agency.switchMode',
    'agency.viewModeTools',
  ];

  for (const command of stubCommands) {
    state.disposables.add(
      commands.registerCommand(command, () => {
        log.info(`Command ${command} invoked (not yet implemented)`);
        vscodeModule.window.showInformationMessage(`${command} will be implemented in a future update.`);
      })
    );
  }

  log.debug(`Registered ${stubCommands.length} stub commands`);
}

/**
 * This method is called when the extension is activated.
 * Activation happens based on the activationEvents in package.json.
 */
export async function activate(context: vscode.ExtensionContext): Promise<void> {
  // Import vscode dynamically to support testing
  const vscodeModule = await import('vscode');

  // Create output channel for logging
  const outputChannel = vscodeModule.window.createOutputChannel(OUTPUT_CHANNEL_NAME);

  // Initialize logger
  initializeLogger(outputChannel);

  const log = createScopedLogger('Extension');
  log.info(`${EXTENSION_NAME} extension is activating...`);

  // Create disposable manager for cleanup
  const disposables = new DisposableManager();
  disposables.add(outputChannel);

  // Store extension state
  extensionState = {
    context,
    disposables,
    outputChannel,
  };

  // Register all disposables with the extension context
  context.subscriptions.push(disposables);

  try {
    // Initialize ConfigService
    const configService = ConfigService.getInstance();
    await configService.initialize(vscodeModule);
    disposables.add({ dispose: () => ConfigService.reset() });

    // Initialize McpClientService
    const mcpService = McpClientService.getInstance();
    await mcpService.initialize(vscodeModule);
    disposables.add({ dispose: () => McpClientService.reset() });

    // Initialize plugin commands with extension URI for webview access
    initializePluginCommands(context.extensionUri);

    // Initialize tool commands with extension URI for webview access
    initializeToolCommands(context.extensionUri);

    // Initialize ContainerService
    const containerService = ContainerService.getInstance();
    await containerService.initialize(vscodeModule);
    disposables.add({ dispose: () => ContainerService.reset() });

    // Initialize McpConnectionManager (subscribes to container events)
    const mcpConnectionManager = McpConnectionManager.getInstance();
    await mcpConnectionManager.initialize(containerService, mcpService);
    disposables.add({ dispose: () => McpConnectionManager.reset() });

    // Register tree views
    const pluginTreeDisposable = await registerPluginTreeView(vscodeModule);
    disposables.add(pluginTreeDisposable);

    // Create and register container tree view
    const containerTreeProvider = new ContainerTreeProvider(containerService);
    const containerTreeView = vscodeModule.window.createTreeView('agency.containers', {
      treeDataProvider: containerTreeProvider,
      showCollapseAll: false,
    });
    disposables.add(containerTreeView);

    // Initialize container commands with dependencies
    initializeContainerCommands(containerService, containerTreeProvider, context.extensionUri);

    // Register commands
    registerAllCommands(vscodeModule, extensionState, log);

    log.info(`${EXTENSION_NAME} extension activated successfully`);
  } catch (error) {
    log.error('Failed to activate extension', error);
    throw error;
  }
}

/**
 * This method is called when the extension is deactivated.
 * Use this to clean up resources.
 */
export function deactivate(): void {
  if (extensionState) {
    const log = createScopedLogger('Extension');
    log.info(`${EXTENSION_NAME} extension is deactivating...`);

    // The DisposableManager is registered with context.subscriptions,
    // so VS Code will call dispose() on it automatically.
    // We just need to clear our reference.
    extensionState = null;

    log.info(`${EXTENSION_NAME} extension deactivated`);
  }
}

/**
 * Get the current extension state.
 * Returns null if the extension is not activated.
 */
export function getExtensionState(): ExtensionState | null {
  return extensionState;
}
