import type * as vscode from 'vscode';
import type { ModeInfo, ModeTreeNode } from '../types/mode';
import { ModeService } from '../services';
import { createScopedLogger, DisposableManager } from '../utils';

const log = createScopedLogger('ModeTreeProvider');

/**
 * Tree item representing a mode in the tree view.
 */
export class ModeTreeItem {
  constructor(
    public readonly label: string,
    public readonly modeId: string,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly isActive: boolean,
    public readonly toolCount: number,
    public readonly addedToolCount: number,
    public readonly inheritedToolCount: number,
    public readonly excludedToolCount: number,
    public readonly description?: string
  ) {}
}

/**
 * Tree provider for the modes view.
 *
 * Shows modes in a tree hierarchy with inheritance relationships.
 * Highlights the currently active mode and displays tool counts.
 */
export class ModeTreeProvider implements vscode.TreeDataProvider<ModeTreeItem> {
  private _onDidChangeTreeData = new EventEmitter<ModeTreeItem | undefined | null | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private _modeService: ModeService;
  private _disposables = new DisposableManager();
  private _vscodeModule: typeof vscode;
  private _cachedTree: ModeInfo[] | null = null;

  constructor(vscodeModule: typeof vscode, modeService: ModeService) {
    this._vscodeModule = vscodeModule;
    this._modeService = modeService;

    // Listen for mode changes
    const modeDisposable = this._modeService.onModeStateChange(() => {
      this.refresh();
    });
    this._disposables.add(modeDisposable);
  }

  /**
   * Get tree item representation.
   */
  getTreeItem(element: ModeTreeItem): vscode.TreeItem | Thenable<vscode.TreeItem> {
    const { TreeItem, TreeItemCollapsibleState, ThemeIcon } = this._vscodeModule;

    const item = new TreeItem(element.label, element.collapsibleState);
    item.id = element.modeId;
    item.description = this._buildDescription(element);
    item.tooltip = this._buildTooltip(element);
    item.contextValue = element.isActive ? 'modeActive' : 'modeInactive';

    // Icon
    if (element.isActive) {
      item.iconPath = new ThemeIcon('circle-filled', new this._vscodeModule.ThemeColor('charts.green'));
    } else {
      item.iconPath = new ThemeIcon('circle-outline');
    }

    // Commands
    item.command = {
      command: 'agency.viewModeTools',
      title: 'View Mode Tools',
      arguments: [element.modeId],
    };

    return item;
  }

  /**
   * Get children for a tree item.
   * Uses cached tree to avoid rebuilding on every access.
   */
  getChildren(element?: ModeTreeItem): vscode.ProviderResult<ModeTreeItem[]> {
    try {
      // Lazy-load tree on first access
      if (!this._cachedTree) {
        this._cachedTree = this._modeService.buildModeTree();
      }

      if (!element) {
        // Root level: get all root modes
        return this._cachedTree.map((modeInfo) => this._createTreeItem(modeInfo));
      } else {
        // Get children of a specific mode
        const modeInfo = this._findModeInfo(element.modeId);
        if (modeInfo) {
          return modeInfo.children.map((child) => this._createTreeItem(child));
        }
        return [];
      }
    } catch (error) {
      log.error('Error getting tree children', error);
      return [];
    }
  }

  /**
   * Get parent of a tree item.
   */
  getParent(element: ModeTreeItem): vscode.ProviderResult<ModeTreeItem> {
    const modeInfo = this._findModeInfo(element.modeId);
    if (modeInfo?.parent) {
      return this._createTreeItem(modeInfo.parent);
    }
    return undefined;
  }

  /**
   * Refresh the tree view.
   * Invalidates cache to force rebuild on next access.
   */
  refresh(): void {
    log.debug('Refreshing mode tree');
    this._cachedTree = null;
    this._onDidChangeTreeData.fire();
  }

  /**
   * Dispose of resources.
   */
  dispose(): void {
    this._disposables.dispose();
    this._onDidChangeTreeData.dispose();
  }

  /**
   * Create a tree item from mode info.
   */
  private _createTreeItem(modeInfo: ModeInfo): ModeTreeItem {
    const { TreeItemCollapsibleState } = this._vscodeModule;

    const hasChildren = modeInfo.children.length > 0;
    const collapsibleState = hasChildren
      ? TreeItemCollapsibleState.Collapsed
      : TreeItemCollapsibleState.None;

    // Calculate tool counts
    const effectiveToolCount = modeInfo.effectiveTools.length;
    const parentToolCount = modeInfo.parent?.effectiveTools.length ?? 0;
    const inheritedToolCount = parentToolCount;

    // Calculate added tools (tools in this mode but not in parent)
    const parentTools = new Set(modeInfo.parent?.effectiveTools ?? []);
    const currentTools = new Set(modeInfo.effectiveTools);
    const addedTools = [...currentTools].filter(t => !parentTools.has(t));
    const addedToolCount = addedTools.length;

    // Excluded tools not supported in current schema
    const excludedToolCount = 0;

    return new ModeTreeItem(
      modeInfo.config.name,
      modeInfo.config.id,
      collapsibleState,
      modeInfo.isActive,
      effectiveToolCount,
      addedToolCount,
      inheritedToolCount,
      excludedToolCount,
      modeInfo.config.description
    );
  }

  /**
   * Find mode info by ID.
   * Uses cached tree to avoid rebuilding.
   */
  private _findModeInfo(modeId: string): ModeInfo | undefined {
    // Ensure tree is loaded
    if (!this._cachedTree) {
      this._cachedTree = this._modeService.buildModeTree();
    }

    const search = (modes: ModeInfo[]): ModeInfo | undefined => {
      for (const mode of modes) {
        if (mode.config.id === modeId) {
          return mode;
        }
        const found = search(mode.children);
        if (found) {
          return found;
        }
      }
      return undefined;
    };

    return search(this._cachedTree);
  }

  /**
   * Build description text for a tree item.
   */
  private _buildDescription(item: ModeTreeItem): string {
    const parts: string[] = [];

    // Tool count
    parts.push(`${item.toolCount} tools`);

    // Show inheritance info if applicable
    if (item.inheritedToolCount > 0) {
      parts.push(`(${item.inheritedToolCount} inherited`);
      if (item.addedToolCount > 0) {
        parts.push(`+${item.addedToolCount}`);
      }
      if (item.excludedToolCount > 0) {
        parts.push(`-${item.excludedToolCount}`);
      }
      parts.push(')');
    } else if (item.addedToolCount > 0) {
      parts.push(`(+${item.addedToolCount})`);
    }

    return parts.join(' ');
  }

  /**
   * Build tooltip text for a tree item.
   */
  private _buildTooltip(item: ModeTreeItem): string {
    const lines: string[] = [];

    lines.push(`Mode: ${item.label}`);
    if (item.description) {
      lines.push(`Description: ${item.description}`);
    }

    lines.push('');
    lines.push(`Total tools: ${item.toolCount}`);

    if (item.inheritedToolCount > 0) {
      lines.push(`Inherited tools: ${item.inheritedToolCount}`);
    }
    if (item.addedToolCount > 0) {
      lines.push(`Added tools: ${item.addedToolCount}`);
    }
    if (item.excludedToolCount > 0) {
      lines.push(`Excluded tools: ${item.excludedToolCount}`);
    }

    if (item.isActive) {
      lines.push('');
      lines.push('✓ Currently active mode');
    }

    return lines.join('\n');
  }
}

/**
 * Simple event emitter for tree data changes.
 */
class EventEmitter<T> {
  private _listeners: Set<(value: T) => void> = new Set();

  get event(): (listener: (value: T) => void) => vscode.Disposable {
    return (listener: (value: T) => void): vscode.Disposable => {
      this._listeners.add(listener);
      return {
        dispose: () => {
          this._listeners.delete(listener);
        },
      };
    };
  }

  fire(value: T): void {
    for (const listener of this._listeners) {
      listener(value);
    }
  }

  dispose(): void {
    this._listeners.clear();
  }
}

/**
 * Register the mode tree view with VS Code.
 *
 * @param vscodeModule The VS Code module
 * @returns Disposable for cleanup
 */
export function registerModeTreeView(vscodeModule: typeof vscode): vscode.Disposable {
  const modeService = ModeService.getInstance();
  const provider = new ModeTreeProvider(vscodeModule, modeService);

  const treeView = vscodeModule.window.createTreeView('agency.modes', {
    treeDataProvider: provider,
    showCollapseAll: true,
  });

  return {
    dispose: () => {
      provider.dispose();
      treeView.dispose();
    },
  };
}
