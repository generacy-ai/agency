import type * as vscode from 'vscode';
import { EXTENSION_NAME, OUTPUT_CHANNEL_NAME } from './constants';
import { DisposableManager, Logger, createScopedLogger } from './utils';
<<<<<<< HEAD
import { ConfigService, ModeService } from './services';
import { registerPluginTreeView, registerModeTreeView } from './providers';
import { registerPluginCommands, initializePluginCommands, registerToolCommands, initializeToolCommands, switchMode, viewModeTools, initializeModeCommands } from './commands';
import { McpClientService } from './services';
import { ErrorNotificationService } from './errors';
import { StatusBarManager } from './status';
import { WelcomeViewProvider } from './welcome';
=======
import { ConfigService } from './services';
import { registerPluginTreeView } from './providers';
import { registerPluginCommands, initializePluginCommands, registerToolCommands, initializeToolCommands } from './commands';
import { McpClientService } from './services';
>>>>>>> origin/038-epic-agency-vs-code

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

<<<<<<< HEAD
  // Register mode commands (fully implemented)
  state.disposables.add(
    commands.registerCommand('agency.switchMode', (item) => switchMode(vscodeModule, item))
  );
  state.disposables.add(
    commands.registerCommand('agency.viewModeTools', (modeId) => viewModeTools(vscodeModule, modeId))
  );
  log.debug('Registered 2 mode commands');

  // Stub command registrations for commands not yet implemented
  // These are registered to prevent "command not found" errors
  const stubCommands = [
=======
  // Stub command registrations for commands not yet implemented
  // These are registered to prevent "command not found" errors
  const stubCommands = [
    'agency.switchMode',
    'agency.viewModeTools',
>>>>>>> origin/038-epic-agency-vs-code
    'agency.startContainer',
    'agency.stopContainer',
    'agency.rebuildContainer',
    'agency.viewContainerLogs',
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
<<<<<<< HEAD
    try {
      const configService = ConfigService.getInstance();
      await configService.initialize(vscodeModule);
      disposables.add({ dispose: () => ConfigService.reset() });
    } catch (error) {
      log.error('Failed to initialize ConfigService', error);
      await ErrorNotificationService.showError(error as Error);
      throw error;
    }

    // Initialize McpClientService
    try {
      const mcpService = McpClientService.getInstance();
      await mcpService.initialize(vscodeModule);
      disposables.add({ dispose: () => McpClientService.reset() });
    } catch (error) {
      log.error('Failed to initialize McpClientService', error);
      await ErrorNotificationService.showError(error as Error);
      throw error;
    }

    // Initialize ModeService
    try {
      const modeService = ModeService.getInstance();
      await modeService.initialize(vscodeModule);
      disposables.add({ dispose: () => ModeService.reset() });
    } catch (error) {
      log.error('Failed to initialize ModeService', error);
      await ErrorNotificationService.showError(error as Error);
      throw error;
    }
=======
    const configService = ConfigService.getInstance();
    await configService.initialize(vscodeModule);
    disposables.add({ dispose: () => ConfigService.reset() });

    // Initialize McpClientService
    const mcpService = McpClientService.getInstance();
    await mcpService.initialize(vscodeModule);
    disposables.add({ dispose: () => McpClientService.reset() });
>>>>>>> origin/038-epic-agency-vs-code

    // Initialize plugin commands with extension URI for webview access
    initializePluginCommands(context.extensionUri);

    // Initialize tool commands with extension URI for webview access
    initializeToolCommands(context.extensionUri);

<<<<<<< HEAD
    // Initialize mode commands
    initializeModeCommands();

    // Initialize StatusBarManager
    const statusBarManager = StatusBarManager.getInstance();
    statusBarManager.initialize(vscodeModule);
    disposables.add(statusBarManager);

    // Register status bar click commands
    disposables.add(
      vscodeModule.commands.registerCommand('agency.showMcpStatus', () => {
        log.info('Showing MCP status');
        // TODO: Implement MCP status view
      })
    );
    disposables.add(
      vscodeModule.commands.registerCommand('agency.connectMcp', () => {
        log.info('Connecting to MCP');
        // TODO: Trigger MCP connection
      })
    );
    disposables.add(
      vscodeModule.commands.registerCommand('agency.showMcpError', () => {
        log.info('Showing MCP error');
        // TODO: Show MCP error details
      })
    );
    disposables.add(
      vscodeModule.commands.registerCommand('agency.showContainerStatus', () => {
        log.info('Showing container status');
        // TODO: Implement container status view
      })
    );

    // Register WelcomeViewProvider
    const configService = ConfigService.getInstance();
    const welcomeProvider = new WelcomeViewProvider(context, {
      hasConfig: () => configService.getConfig() !== null,
    });
    const welcomeTreeView = vscodeModule.window.createTreeView('agency.welcome', {
      treeDataProvider: welcomeProvider,
      showCollapseAll: false,
    });
    disposables.add(welcomeTreeView);

    // Register welcome view commands
    disposables.add(
      vscodeModule.commands.registerCommand('agency.initConfig', async () => {
        log.info('Initializing configuration');
        // TODO: Implement config initialization
        welcomeProvider.refresh();
      })
    );
    disposables.add(
      vscodeModule.commands.registerCommand('agency.showPlugins', () => {
        log.info('Showing plugins');
        vscodeModule.commands.executeCommand('agency.focusPlugins');
      })
    );
    disposables.add(
      vscodeModule.commands.registerCommand('agency.openDocs', (section?: string) => {
        log.info(`Opening documentation: ${section || 'main'}`);
        const baseUrl = 'https://github.com/generacy-ai/agency';
        const url = section ? `${baseUrl}#${section}` : baseUrl;
        vscodeModule.env.openExternal(vscodeModule.Uri.parse(url));
      })
    );

=======
>>>>>>> origin/038-epic-agency-vs-code
    // Register tree views
    const pluginTreeDisposable = await registerPluginTreeView(vscodeModule);
    disposables.add(pluginTreeDisposable);

<<<<<<< HEAD
    const modeTreeDisposable = registerModeTreeView(vscodeModule);
    disposables.add(modeTreeDisposable);

=======
>>>>>>> origin/038-epic-agency-vs-code
    // Register commands
    registerCommands(vscodeModule, extensionState, log);

    log.info(`${EXTENSION_NAME} extension activated successfully`);
  } catch (error) {
    log.error('Failed to activate extension', error);
<<<<<<< HEAD
    await ErrorNotificationService.showError(error as Error);
=======
>>>>>>> origin/038-epic-agency-vs-code
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

<<<<<<< HEAD
    try {
      // The DisposableManager is registered with context.subscriptions,
      // so VS Code will call dispose() on it automatically.
      // We just need to clear our reference.
      extensionState = null;

      log.info(`${EXTENSION_NAME} extension deactivated`);
    } catch (error) {
      log.error('Error during deactivation', error);
      // Don't throw during deactivation to ensure cleanup completes
    }
=======
    // The DisposableManager is registered with context.subscriptions,
    // so VS Code will call dispose() on it automatically.
    // We just need to clear our reference.
    extensionState = null;

    log.info(`${EXTENSION_NAME} extension deactivated`);
>>>>>>> origin/038-epic-agency-vs-code
  }
}

/**
 * Get the current extension state.
 * Returns null if the extension is not activated.
 */
export function getExtensionState(): ExtensionState | null {
  return extensionState;
}
