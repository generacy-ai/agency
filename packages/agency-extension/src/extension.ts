import type * as vscode from 'vscode';
import { EXTENSION_NAME, OUTPUT_CHANNEL_NAME } from './constants';
import { DisposableManager, Logger, createScopedLogger } from './utils';
import { ConfigService, ContainerService } from './services';
import { registerPluginTreeView, ContainerTreeProvider } from './providers';
import { registerPluginCommands, initializePluginCommands, registerToolCommands, initializeToolCommands, startContainer, stopContainer, rebuildContainer, viewContainerLogs, initializeContainerCommands } from './commands';
import { McpClientService } from './services';

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
 * Plugin and tool commands have real implementations, others are stubs.
 */
function registerCommands(
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
  state.disposables.add(
    commands.registerCommand('agency.startContainer', (item) => startContainer(vscodeModule, item))
  );
  state.disposables.add(
    commands.registerCommand('agency.stopContainer', (item) => stopContainer(vscodeModule, item))
  );
  state.disposables.add(
    commands.registerCommand('agency.rebuildContainer', (item) => rebuildContainer(vscodeModule, item))
  );
  state.disposables.add(
    commands.registerCommand('agency.viewContainerLogs', (item) => viewContainerLogs(vscodeModule, item))
  );
  log.debug('Registered 4 container commands');

  // Stub command registrations for commands not yet implemented
  // These are registered to prevent "command not found" errors
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

    // Initialize ContainerService
    const containerService = new ContainerService();
    await containerService.initialize(vscodeModule);
    disposables.add(containerService);

    // Initialize plugin commands with extension URI for webview access
    initializePluginCommands(context.extensionUri);

    // Initialize tool commands with extension URI for webview access
    initializeToolCommands(context.extensionUri);

    // Register tree views
    const pluginTreeDisposable = await registerPluginTreeView(vscodeModule);
    disposables.add(pluginTreeDisposable);

    // Register container tree view
    const containerTreeProvider = new ContainerTreeProvider(containerService);
    const containerTreeDisposable = vscodeModule.window.registerTreeDataProvider(
      'agency.containers',
      containerTreeProvider
    );
    disposables.add(containerTreeDisposable);

    // Initialize container commands with service and tree provider
    initializeContainerCommands(containerService, containerTreeProvider);

    // Register commands
    registerCommands(vscodeModule, extensionState, log);

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
