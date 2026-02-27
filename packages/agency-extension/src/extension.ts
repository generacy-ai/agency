import type * as vscode from 'vscode';
import { EXTENSION_NAME, OUTPUT_CHANNEL_NAME } from './constants';
import { DisposableManager, Logger, createScopedLogger } from './utils';
import { ConfigService, McpClientService, ModeService, McpConnectionManager, ActivityService } from './services';
import { ContainerService } from './services/ContainerService';
import { StatusBarManager } from './status/StatusBarManager';
import { registerPluginTreeView, registerModeTreeView, registerToolTreeView, registerActivityTreeView, ContainerTreeProvider } from './providers';
import {
  registerPluginCommands,
  initializePluginCommands,
  registerToolCommands,
  initializeToolCommands,
  registerModeCommands,
  initializeModeCommands,
  registerContainerCommands,
  initializeContainerCommands,
  registerSetupCommands,
  initializeSetupCommands,
} from './commands';
import type { McpConnectionOptions } from './types';

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

// Register mode commands (fully implemented)
  const modeCommandDisposables = registerModeCommands(vscodeModule);
  for (const disposable of modeCommandDisposables) {
    state.disposables.add(disposable);
  }
  log.debug(`Registered ${modeCommandDisposables.length} mode commands`);

  // Register container commands (fully implemented)
  const containerCommandDisposables = registerContainerCommands(vscodeModule);
  for (const disposable of containerCommandDisposables) {
    state.disposables.add(disposable);
  }
  log.debug(`Registered ${containerCommandDisposables.length} container commands`);

  // Register setup commands (init, verify setup)
  const setupCommandDisposables = registerSetupCommands(vscodeModule);
  for (const disposable of setupCommandDisposables) {
    state.disposables.add(disposable);
  }
  log.debug(`Registered ${setupCommandDisposables.length} setup commands`);

  // All commands are now fully implemented - no stub commands needed
  const stubCommands: string[] = [
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
 * Auto-connect to the local MCP server if configured.
 *
 * Uses a 3-tier fallback chain for server discovery:
 * 1. Per-container `connection.command` / `connection.args` from agency.config.json
 * 2. VS Code setting `agency.mcpServerCommand`
 * 3. Final fallback: `npx @generacy-ai/agency`
 */
async function autoConnectMcpServer(
  vscodeModule: typeof vscode,
  configService: ConfigService,
  mcpService: McpClientService,
  statusBarManager: StatusBarManager,
  log: ReturnType<typeof createScopedLogger>
): Promise<void> {
  // Check if there's an MCP server configured
  const containers = configService.getContainers();
  const containerConfig = containers[0]; // Use first container config for MCP settings

  // 3-tier fallback chain for MCP server command:
  // 1. Per-container connection.command
  const containerCommand = containerConfig?.connection?.command;
  const containerArgs = containerConfig?.connection?.args;

  // 2. VS Code setting agency.mcpServerCommand
  const settingCommand = vscodeModule.workspace.getConfiguration('agency').get<string>('mcpServerCommand');

  // 3. Final fallback: npx @generacy-ai/agency
  let mcpCommand: string;
  let mcpArgs: string[];

  if (containerCommand) {
    mcpCommand = containerCommand;
    mcpArgs = containerArgs ?? [];
  } else if (settingCommand) {
    // Parse the setting command into command + args (e.g. "npx @generacy-ai/agency" → "npx", ["@generacy-ai/agency"])
    const parts = settingCommand.split(/\s+/);
    mcpCommand = parts[0];
    mcpArgs = parts.slice(1);
  } else {
    mcpCommand = 'npx';
    mcpArgs = ['@generacy-ai/agency'];
  }

  // Get workspace folder for the MCP server working directory
  const workspaceFolders = vscodeModule.workspace.workspaceFolders;
  const workspaceFolder = workspaceFolders?.[0]?.uri.fsPath;

  log.info(`Auto-connecting to local MCP server: ${mcpCommand} ${mcpArgs.join(' ')} (cwd: ${workspaceFolder ?? 'not set'})`);

  // Subscribe to connection status changes to update status bar
  mcpService.onConnectionStatusChange((event) => {
    if (event.newStatus === 'connected') {
      statusBarManager.updateMcpStatus({ state: 'connected', connectedAt: new Date() });
    } else if (event.newStatus === 'connecting' || event.newStatus === 'reconnecting') {
      statusBarManager.updateMcpStatus({ state: 'connecting', startedAt: new Date() });
    } else if (event.newStatus === 'error') {
      statusBarManager.updateMcpStatus({ state: 'error', error: event.error ?? new Error('Connection error'), occurredAt: new Date() });
    } else {
      statusBarManager.updateMcpStatus({ state: 'disconnected', reason: 'Not connected' });
    }
  });

  try {
    const options: McpConnectionOptions = {
      transport: 'stdio',
      command: mcpCommand,
      args: mcpArgs,
      workingDirectory: workspaceFolder,
    };

    await mcpService.connect(options);
    log.info('Successfully connected to local MCP server');
  } catch (error) {
    log.warn('Failed to auto-connect to MCP server', error);
    // Don't throw - extension should still work without MCP connection
  }
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

    // Initialize ModeService
    const modeService = ModeService.getInstance();
    await modeService.initialize(vscodeModule);
    disposables.add({ dispose: () => ModeService.reset() });

    // Initialize plugin commands with extension URI for webview access
    initializePluginCommands(context.extensionUri);

    // Initialize tool commands with extension URI for webview access
    initializeToolCommands(context.extensionUri);

// Initialize mode commands
    initializeModeCommands();

    // Initialize ContainerService
    const containerService = ContainerService.getInstance();
    await containerService.initialize(vscodeModule);
    disposables.add({ dispose: () => ContainerService.reset() });

    // Initialize McpConnectionManager (subscribes to container events)
    const mcpConnectionManager = McpConnectionManager.getInstance();
    await mcpConnectionManager.initialize(containerService, mcpService);
    disposables.add({ dispose: () => McpConnectionManager.reset() });

    // Initialize StatusBarManager for visual status indicators
    const statusBarManager = StatusBarManager.initialize();
    disposables.add(statusBarManager);
    log.debug('StatusBarManager initialized');

    // Initialize ActivityService
    const activityService = ActivityService.getInstance();
    await activityService.initialize(vscodeModule);
    disposables.add({ dispose: () => ActivityService.reset() });

    // Register tree views
    const pluginTreeDisposable = await registerPluginTreeView(vscodeModule);
    disposables.add(pluginTreeDisposable);

    // Register mode tree view
    const modeTreeDisposable = registerModeTreeView(vscodeModule);
    disposables.add(modeTreeDisposable);

    // Register tool tree view
    const toolTreeDisposable = await registerToolTreeView(vscodeModule);
    disposables.add(toolTreeDisposable);

    // Register activity tree view
    const activityTreeDisposable = await registerActivityTreeView(vscodeModule);
    disposables.add(activityTreeDisposable);

    // Create and register container tree view
    const containerTreeProvider = new ContainerTreeProvider(containerService);
    const containerTreeView = vscodeModule.window.createTreeView('agency.containers', {
      treeDataProvider: containerTreeProvider,
      showCollapseAll: false,
    });
    disposables.add(containerTreeView);

    // Initialize container commands with dependencies
    initializeContainerCommands(containerService, containerTreeProvider, context.extensionUri);

    // Initialize setup commands (init, verify)
    initializeSetupCommands();

    // Register commands
    registerAllCommands(vscodeModule, extensionState, log);

    // Auto-connect to local MCP server
    await autoConnectMcpServer(vscodeModule, configService, mcpService, statusBarManager, log);

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
