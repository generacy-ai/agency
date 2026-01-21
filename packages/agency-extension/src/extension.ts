import type * as vscode from 'vscode';
import { EXTENSION_NAME, OUTPUT_CHANNEL_NAME } from './constants';
import { DisposableManager, Logger, createScopedLogger } from './utils';

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
 * Commands are registered but implementations are stubs until later tasks.
 */
function registerCommands(
  vscodeModule: typeof vscode,
  state: ExtensionState,
  log: ReturnType<typeof createScopedLogger>
): void {
  const { commands } = vscodeModule;

  // Stub command registrations - implementations will be added in later tasks
  // These are registered to prevent "command not found" errors

  const stubCommands = [
    'agency.configurePlugin',
    'agency.enablePlugin',
    'agency.disablePlugin',
    'agency.refreshPlugins',
    'agency.testTool',
    'agency.refreshTools',
    'agency.connectMcp',
    'agency.disconnectMcp',
    'agency.switchMode',
    'agency.viewModeTools',
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
