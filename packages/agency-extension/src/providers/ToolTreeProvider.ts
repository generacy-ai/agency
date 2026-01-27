import type * as vscode from 'vscode';
import type { ToolInfo, McpConnectionStatus } from '../types';
import { McpClientService } from '../services';
import { VIEW_IDS, COMMANDS } from '../constants';
import { createScopedLogger, DisposableManager } from '../utils';

const log = createScopedLogger('ToolTreeProvider');

/**
 * Context values for tool tree items.
 * Used for context menu targeting in package.json.
 */
const CONTEXT_VALUES = {
  TOOL: 'tool',
  NAMESPACE: 'toolNamespace',
  STATUS_CONNECTED: 'statusConnected',
  STATUS_DISCONNECTED: 'statusDisconnected',
} as const;

/**
 * Tree item types for the tool browser.
 */
type ToolTreeItemType = 'status' | 'namespace' | 'tool';

/**
 * Base data structure for tool tree items.
 */
interface ToolTreeItemData {
  type: ToolTreeItemType;
  id: string;
}

/**
 * Status header item data.
 */
interface StatusItemData extends ToolTreeItemData {
  type: 'status';
  connectionStatus: McpConnectionStatus;
}

/**
 * Namespace group item data.
 */
interface NamespaceItemData extends ToolTreeItemData {
  type: 'namespace';
  namespace: string;
  toolCount: number;
}

/**
 * Tool item data.
 */
interface ToolItemData extends ToolTreeItemData {
  type: 'tool';
  tool: ToolInfo;
}

/**
 * Union of all tree item data types.
 */
type TreeItemData = StatusItemData | NamespaceItemData | ToolItemData;

/**
 * Format a JSON Schema type for display.
 */
function formatSchemaType(schema: ToolInfo['inputSchema']): string {
  if (!schema.properties) {
    return '()';
  }

  const params = Object.entries(schema.properties)
    .slice(0, 3) // Limit to first 3 params for preview
    .map(([name, prop]) => {
      const isRequired = schema.required?.includes(name);
      const suffix = isRequired ? '' : '?';
      return `${name}${suffix}: ${prop.type}`;
    });

  const ellipsis = Object.keys(schema.properties).length > 3 ? ', ...' : '';
  return `(${params.join(', ')}${ellipsis})`;
}

/**
 * Get connection status display info.
 */
function getStatusInfo(status: McpConnectionStatus): {
  label: string;
  icon: string;
  color: string;
} {
  switch (status) {
    case 'connected':
      return { label: 'Connected', icon: 'plug', color: 'charts.green' };
    case 'connecting':
      return { label: 'Connecting...', icon: 'loading~spin', color: 'foreground' };
    case 'reconnecting':
      return { label: 'Reconnecting...', icon: 'loading~spin', color: 'editorWarning.foreground' };
    case 'disconnected':
      return { label: 'Disconnected', icon: 'debug-disconnect', color: 'disabledForeground' };
    case 'error':
      return { label: 'Connection Error', icon: 'error', color: 'errorForeground' };
    default:
      return { label: 'Unknown', icon: 'question', color: 'disabledForeground' };
  }
}

/**
 * Creates a status item for the tree view header.
 */
function createStatusItem(
  vscodeModule: typeof vscode,
  status: McpConnectionStatus
): vscode.TreeItem {
  const statusInfo = getStatusInfo(status);
  const item = new vscodeModule.TreeItem(
    `MCP: ${statusInfo.label}`,
    vscodeModule.TreeItemCollapsibleState.None
  );

  item.iconPath = new vscodeModule.ThemeIcon(
    statusInfo.icon,
    new vscodeModule.ThemeColor(statusInfo.color)
  );

  item.contextValue =
    status === 'connected'
      ? CONTEXT_VALUES.STATUS_CONNECTED
      : CONTEXT_VALUES.STATUS_DISCONNECTED;

  // Set command based on connection state
  if (status === 'connected') {
    item.command = {
      command: COMMANDS.DISCONNECT_MCP,
      title: 'Disconnect from MCP Server',
    };
    item.tooltip = 'Click to disconnect from MCP server';
  } else if (status === 'disconnected' || status === 'error') {
    item.command = {
      command: COMMANDS.CONNECT_MCP,
      title: 'Connect to MCP Server',
    };
    item.tooltip = 'Click to connect to MCP server';
  } else {
    item.tooltip = `MCP connection status: ${statusInfo.label}`;
  }

  return item;
}

/**
 * Creates a namespace group item.
 */
function createNamespaceItem(
  vscodeModule: typeof vscode,
  namespace: string,
  toolCount: number
): vscode.TreeItem {
  const item = new vscodeModule.TreeItem(
    namespace,
    vscodeModule.TreeItemCollapsibleState.Expanded
  );

  item.description = `${toolCount} tool${toolCount !== 1 ? 's' : ''}`;
  item.iconPath = new vscodeModule.ThemeIcon('folder');
  item.contextValue = CONTEXT_VALUES.NAMESPACE;
  item.tooltip = `Namespace: ${namespace}\nTools: ${toolCount}`;

  return item;
}

/**
 * Creates a tool item.
 */
function createToolItem(vscodeModule: typeof vscode, tool: ToolInfo): vscode.TreeItem {
  const item = new vscodeModule.TreeItem(
    tool.name,
    vscodeModule.TreeItemCollapsibleState.None
  );

  // Show parameter schema preview as description
  item.description = formatSchemaType(tool.inputSchema);

  // Build tooltip with full details
  const tooltipLines = [`Tool: ${tool.name}`];
  if (tool.description) {
    tooltipLines.push(`\n${tool.description}`);
  }
  tooltipLines.push(`\nParameters: ${formatSchemaType(tool.inputSchema)}`);
  if (tool.namespace) {
    tooltipLines.push(`Namespace: ${tool.namespace}`);
  }
  item.tooltip = tooltipLines.join('\n');

  item.iconPath = new vscodeModule.ThemeIcon('symbol-method');
  item.contextValue = CONTEXT_VALUES.TOOL;

  // Open tool execution panel on click
  item.command = {
    command: COMMANDS.TEST_TOOL,
    title: 'Test Tool',
    arguments: [tool],
  };

  return item;
}

/**
 * TreeDataProvider for the Tools view.
 * Displays available MCP tools grouped by namespace.
 * Shows connection status in the header.
 */
export class ToolTreeProvider implements vscode.TreeDataProvider<TreeItemData> {
  private _onDidChangeTreeData = new (class {
    private _emitter: vscode.EventEmitter<TreeItemData | undefined | void> | null = null;

    initialize(vscodeModule: typeof vscode): void {
      this._emitter = new vscodeModule.EventEmitter<TreeItemData | undefined | void>();
    }

    get event(): vscode.Event<TreeItemData | undefined | void> | undefined {
      return this._emitter?.event;
    }

    fire(element?: TreeItemData): void {
      this._emitter?.fire(element);
    }

    dispose(): void {
      this._emitter?.dispose();
    }
  })();

  private readonly _disposables = new DisposableManager();
  private _vscodeModule: typeof vscode | null = null;
  private _mcpService: McpClientService | null = null;
  private _tools: ToolInfo[] = [];
  private _namespaces: Map<string, ToolInfo[]> = new Map();
  private _connectionStatus: McpConnectionStatus = 'disconnected';

  /**
   * Event that fires when the tree data changes.
   */
  get onDidChangeTreeData(): vscode.Event<TreeItemData | undefined | void> | undefined {
    return this._onDidChangeTreeData.event;
  }

  /**
   * Initialize the provider with VS Code module and McpClientService.
   * Must be called before the provider can be used.
   */
  async initialize(vscodeModule: typeof vscode): Promise<void> {
    this._vscodeModule = vscodeModule;
    this._onDidChangeTreeData.initialize(vscodeModule);

    // Get McpClientService instance
    this._mcpService = McpClientService.getInstance();

    // Subscribe to connection status changes
    log.info('Subscribing to MCP connection status changes');
    const statusChangeDisposable = this._mcpService.onConnectionStatusChange((event) => {
      log.info(`Connection status changed: ${event.previousStatus} -> ${event.newStatus}`);
      this._connectionStatus = event.newStatus;

      // Refresh tools when connected
      if (event.newStatus === 'connected') {
        this._refreshTools().catch((error) => {
          log.error('Failed to refresh tools on connect', error);
        });
      } else if (event.newStatus === 'disconnected' || event.newStatus === 'error') {
        // Clear tools when disconnected
        this._tools = [];
        this._namespaces.clear();
        this.refresh();
      } else {
        // Just refresh the status for connecting/reconnecting states
        this.refresh();
      }
    });
    this._disposables.add(statusChangeDisposable);

    // Initialize connection status
    this._connectionStatus = this._mcpService.getConnectionStatus();

    // Load tools if already connected
    if (this._connectionStatus === 'connected') {
      await this._refreshTools();
    }

    log.debug('ToolTreeProvider initialized');
  }

  /**
   * Get the tree item for an element.
   */
  getTreeItem(element: TreeItemData): vscode.TreeItem {
    if (!this._vscodeModule) {
      throw new Error('ToolTreeProvider not initialized');
    }

    switch (element.type) {
      case 'status':
        return createStatusItem(this._vscodeModule, element.connectionStatus);
      case 'namespace':
        return createNamespaceItem(this._vscodeModule, element.namespace, element.toolCount);
      case 'tool':
        return createToolItem(this._vscodeModule, element.tool);
      default:
        throw new Error(`Unknown tree item type`);
    }
  }

  /**
   * Get the children of a tree element.
   */
  getChildren(element?: TreeItemData): TreeItemData[] {
    // Root level: status header + namespaces (or ungrouped tools)
    if (!element) {
      const children: TreeItemData[] = [];

      // Always show status header first
      children.push({
        type: 'status',
        id: 'status',
        connectionStatus: this._connectionStatus,
      });

      // If not connected, return just the status
      if (this._connectionStatus !== 'connected') {
        return children;
      }

      // Add namespaces or ungrouped tools
      if (this._namespaces.size > 0) {
        // Group by namespace
        for (const [namespace, tools] of Array.from(this._namespaces.entries())) {
          children.push({
            type: 'namespace',
            id: `namespace:${namespace}`,
            namespace,
            toolCount: tools.length,
          });
        }
      }

      // Add tools without namespace at root level
      const ungroupedTools = this._tools.filter((t) => !t.namespace);
      for (const tool of ungroupedTools) {
        children.push({
          type: 'tool',
          id: `tool:${tool.name}`,
          tool,
        });
      }

      return children;
    }

    // Children of namespace: tools in that namespace
    if (element.type === 'namespace') {
      const tools = this._namespaces.get(element.namespace) || [];
      return tools.map((tool) => ({
        type: 'tool' as const,
        id: `tool:${tool.name}`,
        tool,
      }));
    }

    // Status and tool items have no children
    return [];
  }

  /**
   * Get the parent of a tree element.
   */
  getParent(element: TreeItemData): TreeItemData | undefined {
    // Status and namespace items are at root
    if (element.type === 'status' || element.type === 'namespace') {
      return undefined;
    }

    // Tool items may have a namespace parent
    if (element.type === 'tool' && element.tool.namespace) {
      const tools = this._namespaces.get(element.tool.namespace);
      if (tools) {
        return {
          type: 'namespace',
          id: `namespace:${element.tool.namespace}`,
          namespace: element.tool.namespace,
          toolCount: tools.length,
        };
      }
    }

    return undefined;
  }

  /**
   * Refresh the entire tree.
   */
  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  /**
   * Refresh tools from the MCP server.
   */
  async refreshTools(): Promise<void> {
    await this._refreshTools();
  }

  /**
   * Internal method to refresh tools from the MCP server.
   */
  private async _refreshTools(): Promise<void> {
    log.info('_refreshTools called');
    if (!this._mcpService) {
      log.warn('Cannot refresh tools: mcpService is null');
      return;
    }
    if (!this._mcpService.isConnected()) {
      log.warn(`Cannot refresh tools: not connected (status: ${this._mcpService.getConnectionStatus()})`);
      return;
    }

    try {
      log.info('Fetching tools from MCP server...');
      this._tools = await this._mcpService.listTools();
      log.info(`Received ${this._tools.length} tools from MCP server`);

      // Group tools by namespace
      this._namespaces.clear();
      for (const tool of this._tools) {
        if (tool.namespace) {
          const existing = this._namespaces.get(tool.namespace) || [];
          existing.push(tool);
          this._namespaces.set(tool.namespace, existing);
        }
      }

      log.info(
        `Loaded ${this._tools.length} tools in ${this._namespaces.size} namespaces`
      );
      this.refresh();
    } catch (error) {
      log.error('Failed to refresh tools', error);
      throw error;
    }
  }

  /**
   * Get the current list of tools.
   */
  getTools(): ToolInfo[] {
    return [...this._tools];
  }

  /**
   * Get the current connection status.
   */
  getConnectionStatus(): McpConnectionStatus {
    return this._connectionStatus;
  }

  /**
   * Dispose of provider resources.
   */
  dispose(): void {
    this._disposables.dispose();
    this._onDidChangeTreeData.dispose();
    this._vscodeModule = null;
    this._mcpService = null;
    this._tools = [];
    this._namespaces.clear();
    log.debug('ToolTreeProvider disposed');
  }
}

/**
 * Register the ToolTreeProvider with VS Code.
 * Creates the tree view and returns disposables for cleanup.
 *
 * @param vscodeModule The VS Code module
 * @returns Disposable for cleanup
 */
export async function registerToolTreeView(
  vscodeModule: typeof vscode
): Promise<vscode.Disposable> {
  const provider = new ToolTreeProvider();
  await provider.initialize(vscodeModule);

  const treeView = vscodeModule.window.createTreeView(VIEW_IDS.TOOLS, {
    treeDataProvider: provider,
    showCollapseAll: true,
  });

  log.info('Tool tree view registered');

  // Return combined disposable
  return {
    dispose: () => {
      treeView.dispose();
      provider.dispose();
    },
  };
}
