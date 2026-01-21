import type * as vscode from 'vscode';
import type { PluginConfig } from '../types';
import { ConfigService } from '../services';
import { VIEW_IDS } from '../constants';
import { createScopedLogger, DisposableManager } from '../utils';

const log = createScopedLogger('PluginTreeProvider');

/**
 * Context value for plugin tree items.
 * Used for context menu targeting in package.json.
 */
const CONTEXT_VALUES = {
  PLUGIN_ENABLED: 'pluginEnabled',
  PLUGIN_DISABLED: 'pluginDisabled',
} as const;

/**
 * Creates a PluginItem instance using proper VS Code TreeItem inheritance.
 * This factory function handles the dynamic VS Code module requirement.
 */
function createPluginItem(vscodeModule: typeof vscode, plugin: PluginConfig): vscode.TreeItem {
  const item = new vscodeModule.TreeItem(plugin.id, vscodeModule.TreeItemCollapsibleState.None);

  // Set description (shown after label)
  item.description = plugin.enabled ? 'enabled' : 'disabled';

  // Set tooltip
  const tooltipLines = [`Plugin: ${plugin.id}`];
  tooltipLines.push(`Status: ${plugin.enabled ? 'Enabled' : 'Disabled'}`);
  const settingsCount = Object.keys(plugin.settings).length;
  if (settingsCount > 0) {
    tooltipLines.push(`Settings: ${settingsCount} configured`);
  }
  item.tooltip = tooltipLines.join('\n');

  // Set icon based on state
  if (plugin.enabled) {
    item.iconPath = new vscodeModule.ThemeIcon(
      'plug',
      new vscodeModule.ThemeColor('charts.green')
    );
  } else {
    item.iconPath = new vscodeModule.ThemeIcon(
      'plug',
      new vscodeModule.ThemeColor('disabledForeground')
    );
  }

  // Set context value for command enablement
  item.contextValue = plugin.enabled
    ? CONTEXT_VALUES.PLUGIN_ENABLED
    : CONTEXT_VALUES.PLUGIN_DISABLED;

  // Set command to open plugin config on click
  item.command = {
    command: 'agency.configurePlugin',
    title: 'Configure Plugin',
    arguments: [plugin],
  };

  return item;
}

/**
 * TreeDataProvider for the Plugins view.
 * Displays configured plugins with their enabled/disabled state.
 * Listens to ConfigService changes to refresh automatically.
 */
export class PluginTreeProvider implements vscode.TreeDataProvider<PluginConfig> {
  private _onDidChangeTreeData = new (class {
    private _emitter: vscode.EventEmitter<PluginConfig | undefined | void> | null = null;

    initialize(vscodeModule: typeof vscode): void {
      this._emitter = new vscodeModule.EventEmitter<PluginConfig | undefined | void>();
    }

    get event(): vscode.Event<PluginConfig | undefined | void> | undefined {
      return this._emitter?.event;
    }

    fire(element?: PluginConfig): void {
      this._emitter?.fire(element);
    }

    dispose(): void {
      this._emitter?.dispose();
    }
  })();

  private readonly _disposables = new DisposableManager();
  private _vscodeModule: typeof vscode | null = null;
  private _configService: ConfigService | null = null;

  /**
   * Event that fires when the tree data changes.
   */
  get onDidChangeTreeData(): vscode.Event<PluginConfig | undefined | void> | undefined {
    return this._onDidChangeTreeData.event;
  }

  /**
   * Initialize the provider with VS Code module and ConfigService.
   * Must be called before the provider can be used.
   */
  async initialize(vscodeModule: typeof vscode): Promise<void> {
    this._vscodeModule = vscodeModule;
    this._onDidChangeTreeData.initialize(vscodeModule);

    // Get ConfigService instance
    this._configService = ConfigService.getInstance();

    // Subscribe to config changes
    const configChangeDisposable = this._configService.onConfigChange(() => {
      log.debug('Config changed, refreshing plugin tree');
      this.refresh();
    });
    this._disposables.add(configChangeDisposable);

    log.debug('PluginTreeProvider initialized');
  }

  /**
   * Get the tree item for a plugin.
   */
  getTreeItem(element: PluginConfig): vscode.TreeItem {
    if (!this._vscodeModule) {
      throw new Error('PluginTreeProvider not initialized');
    }
    return createPluginItem(this._vscodeModule, element);
  }

  /**
   * Get the children of a tree element.
   * Returns all plugins at root level (no nesting).
   */
  getChildren(element?: PluginConfig): PluginConfig[] {
    // Only root level has children
    if (element) {
      return [];
    }

    if (!this._configService) {
      log.warn('ConfigService not available');
      return [];
    }

    const plugins = this._configService.getPlugins();
    log.debug(`Returning ${plugins.length} plugins`);
    return plugins;
  }

  /**
   * Get the parent of a tree element.
   * Always returns undefined since plugins are at root level.
   */
  getParent(_element: PluginConfig): PluginConfig | undefined {
    return undefined;
  }

  /**
   * Refresh the entire tree.
   */
  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  /**
   * Refresh a specific plugin in the tree.
   */
  refreshPlugin(plugin: PluginConfig): void {
    this._onDidChangeTreeData.fire(plugin);
  }

  /**
   * Dispose of provider resources.
   */
  dispose(): void {
    this._disposables.dispose();
    this._onDidChangeTreeData.dispose();
    this._vscodeModule = null;
    this._configService = null;
    log.debug('PluginTreeProvider disposed');
  }
}

/**
 * Register the PluginTreeProvider with VS Code.
 * Creates the tree view and returns disposables for cleanup.
 *
 * @param vscodeModule The VS Code module
 * @returns Disposable for cleanup
 */
export async function registerPluginTreeView(
  vscodeModule: typeof vscode
): Promise<vscode.Disposable> {
  const provider = new PluginTreeProvider();
  await provider.initialize(vscodeModule);

  const treeView = vscodeModule.window.createTreeView(VIEW_IDS.PLUGINS, {
    treeDataProvider: provider,
    showCollapseAll: false,
  });

  log.info('Plugin tree view registered');

  // Return combined disposable
  return {
    dispose: () => {
      treeView.dispose();
      provider.dispose();
    },
  };
}
