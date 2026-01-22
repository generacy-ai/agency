import type * as vscode from 'vscode';
import type { PluginConfig } from '../types';
import { COMMANDS } from '../constants';
import { ConfigService } from '../services';
import { PluginConfigPanel } from '../views';
import { createScopedLogger } from '../utils';

const log = createScopedLogger('PluginCommands');

/** Store the extension URI for webview resource access */
let extensionUri: vscode.Uri | null = null;

/**
 * Initialize plugin commands with extension context.
 * Must be called before using configurePlugin with webview.
 *
 * @param uri The extension's URI for resource resolution
 */
export function initializePluginCommands(uri: vscode.Uri): void {
  extensionUri = uri;
  log.debug('Plugin commands initialized with extension URI');
}

/**
 * Plugin command handlers for the Agency extension.
 * These commands manage plugin configuration, enabling/disabling, and refresh.
 */

/**
 * Opens a webview panel to configure plugin settings.
 * If no plugin is provided, shows a quick pick to select one.
 *
 * @param vscodeModule The VS Code module
 * @param plugin Optional plugin to configure directly
 */
export async function configurePlugin(
  vscodeModule: typeof vscode,
  plugin?: PluginConfig
): Promise<void> {
  const configService = ConfigService.getInstance();
  const plugins = configService.getPlugins();

  if (plugins.length === 0) {
    vscodeModule.window.showInformationMessage('No plugins configured. Add plugins to agency.config.json.');
    return;
  }

  // If plugin not provided, show quick pick to select one
  let selectedPlugin: PluginConfig | undefined = plugin;
  if (!selectedPlugin) {
    const items = plugins.map((p) => ({
      label: p.id,
      description: p.enabled ? 'enabled' : 'disabled',
      plugin: p,
    }));

    const selected = await vscodeModule.window.showQuickPick(items, {
      placeHolder: 'Select a plugin to configure',
      title: 'Configure Plugin',
    });

    if (!selected) {
      return; // User cancelled
    }

    selectedPlugin = selected.plugin;
  }

  // Open the plugin configuration webview panel
  if (extensionUri) {
    PluginConfigPanel.createOrShow(vscodeModule, extensionUri, selectedPlugin);
    log.info(`Opened config panel for plugin: ${selectedPlugin.id}`);
  } else {
    // Fallback to simple input box if extension URI not available
    log.warn('Extension URI not available, falling back to input box');
    await configurePluginFallback(vscodeModule, selectedPlugin);
  }
}

/**
 * Fallback configuration method using simple input box.
 * Used when webview is not available.
 */
async function configurePluginFallback(
  vscodeModule: typeof vscode,
  plugin: PluginConfig
): Promise<void> {
  const configService = ConfigService.getInstance();
  const settingsJson = JSON.stringify(plugin.settings, null, 2);

  const newSettings = await vscodeModule.window.showInputBox({
    prompt: `Edit settings for ${plugin.id} (JSON format)`,
    value: settingsJson,
    validateInput: (value) => {
      try {
        JSON.parse(value);
        return null;
      } catch {
        return 'Invalid JSON format';
      }
    },
  });

  if (newSettings === undefined) {
    return; // User cancelled
  }

  try {
    const parsedSettings = JSON.parse(newSettings) as Record<string, unknown>;
    await configService.savePluginConfig({
      ...plugin,
      settings: parsedSettings,
    });
    vscodeModule.window.showInformationMessage(`Plugin ${plugin.id} settings updated.`);
    log.info(`Plugin ${plugin.id} settings updated`);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    vscodeModule.window.showErrorMessage(`Failed to save plugin settings: ${message}`);
    log.error('Failed to save plugin settings', error);
  }
}

/**
 * Enables a plugin by setting its enabled flag to true.
 */
export async function enablePlugin(
  vscodeModule: typeof vscode,
  plugin?: PluginConfig
): Promise<void> {
  const configService = ConfigService.getInstance();
  const plugins = configService.getPlugins();

  if (plugins.length === 0) {
    vscodeModule.window.showInformationMessage('No plugins configured.');
    return;
  }

  // If plugin not provided, show quick pick to select one
  let selectedPlugin: PluginConfig | undefined = plugin;
  if (!selectedPlugin) {
    const disabledPlugins = plugins.filter((p) => !p.enabled);

    if (disabledPlugins.length === 0) {
      vscodeModule.window.showInformationMessage('All plugins are already enabled.');
      return;
    }

    const items = disabledPlugins.map((p) => ({
      label: p.id,
      description: 'disabled',
      plugin: p,
    }));

    const selected = await vscodeModule.window.showQuickPick(items, {
      placeHolder: 'Select a plugin to enable',
      title: 'Enable Plugin',
    });

    if (!selected) {
      return; // User cancelled
    }

    selectedPlugin = selected.plugin;
  }

  if (selectedPlugin.enabled) {
    vscodeModule.window.showInformationMessage(`Plugin ${selectedPlugin.id} is already enabled.`);
    return;
  }

  try {
    await configService.savePluginConfig({
      ...selectedPlugin,
      enabled: true,
    });
    vscodeModule.window.showInformationMessage(`Plugin ${selectedPlugin.id} enabled.`);
    log.info(`Plugin ${selectedPlugin.id} enabled`);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    vscodeModule.window.showErrorMessage(`Failed to enable plugin: ${message}`);
    log.error('Failed to enable plugin', error);
  }
}

/**
 * Disables a plugin by setting its enabled flag to false.
 */
export async function disablePlugin(
  vscodeModule: typeof vscode,
  plugin?: PluginConfig
): Promise<void> {
  const configService = ConfigService.getInstance();
  const plugins = configService.getPlugins();

  if (plugins.length === 0) {
    vscodeModule.window.showInformationMessage('No plugins configured.');
    return;
  }

  // If plugin not provided, show quick pick to select one
  let selectedPlugin: PluginConfig | undefined = plugin;
  if (!selectedPlugin) {
    const enabledPlugins = plugins.filter((p) => p.enabled);

    if (enabledPlugins.length === 0) {
      vscodeModule.window.showInformationMessage('All plugins are already disabled.');
      return;
    }

    const items = enabledPlugins.map((p) => ({
      label: p.id,
      description: 'enabled',
      plugin: p,
    }));

    const selected = await vscodeModule.window.showQuickPick(items, {
      placeHolder: 'Select a plugin to disable',
      title: 'Disable Plugin',
    });

    if (!selected) {
      return; // User cancelled
    }

    selectedPlugin = selected.plugin;
  }

  if (!selectedPlugin.enabled) {
    vscodeModule.window.showInformationMessage(`Plugin ${selectedPlugin.id} is already disabled.`);
    return;
  }

  try {
    await configService.savePluginConfig({
      ...selectedPlugin,
      enabled: false,
    });
    vscodeModule.window.showInformationMessage(`Plugin ${selectedPlugin.id} disabled.`);
    log.info(`Plugin ${selectedPlugin.id} disabled`);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    vscodeModule.window.showErrorMessage(`Failed to disable plugin: ${message}`);
    log.error('Failed to disable plugin', error);
  }
}

/**
 * Refreshes the plugin list by triggering a tree view refresh.
 * The PluginTreeProvider subscribes to ConfigService changes,
 * so we just need to emit a refresh event.
 */
export function refreshPlugins(vscodeModule: typeof vscode): void {
  // Trigger a refresh by commanding the tree view to refresh
  // The PluginTreeProvider listens to ConfigService changes,
  // but we can explicitly execute the refresh command
  vscodeModule.commands.executeCommand('workbench.actions.treeView.agency.plugins.refresh');
  vscodeModule.window.showInformationMessage('Plugins refreshed.');
  log.info('Plugins refreshed');
}

/**
 * Registers all plugin commands with VS Code.
 * Returns disposables for cleanup.
 */
export function registerPluginCommands(
  vscodeModule: typeof vscode
): vscode.Disposable[] {
  const disposables: vscode.Disposable[] = [];

  // Configure Plugin command
  disposables.push(
    vscodeModule.commands.registerCommand(
      COMMANDS.CONFIGURE_PLUGIN,
      (plugin?: PluginConfig) => configurePlugin(vscodeModule, plugin)
    )
  );

  // Enable Plugin command
  disposables.push(
    vscodeModule.commands.registerCommand(
      COMMANDS.ENABLE_PLUGIN,
      (plugin?: PluginConfig) => enablePlugin(vscodeModule, plugin)
    )
  );

  // Disable Plugin command
  disposables.push(
    vscodeModule.commands.registerCommand(
      COMMANDS.DISABLE_PLUGIN,
      (plugin?: PluginConfig) => disablePlugin(vscodeModule, plugin)
    )
  );

  // Refresh Plugins command
  disposables.push(
    vscodeModule.commands.registerCommand(
      COMMANDS.REFRESH_PLUGINS,
      () => refreshPlugins(vscodeModule)
    )
  );

  log.debug('Plugin commands registered');
  return disposables;
}
