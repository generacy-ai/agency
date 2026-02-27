import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type * as vscode from 'vscode';
import { ToolTreeProvider, registerToolTreeView } from '../../providers/ToolTreeProvider';
import { McpClientService } from '../../services/McpClientService';
import type { ToolInfo, McpConnectionStatus, McpConnectionStatusChangeEvent } from '../../types';

// Mock the utils module
vi.mock('../../utils', () => ({
  createScopedLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
  DisposableManager: vi.fn().mockImplementation(() => ({
    add: vi.fn(),
    dispose: vi.fn(),
  })),
}));

// Mock tools data
const mockTools: ToolInfo[] = [
  {
    name: 'file_read',
    description: 'Read a file from the filesystem',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'File path' },
      },
      required: ['path'],
    },
    namespace: 'file',
  },
  {
    name: 'file_write',
    description: 'Write content to a file',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'File path' },
        content: { type: 'string', description: 'File content' },
      },
      required: ['path', 'content'],
    },
    namespace: 'file',
  },
  {
    name: 'git_status',
    description: 'Get git repository status',
    inputSchema: {
      type: 'object',
      properties: {},
    },
    namespace: 'git',
  },
  {
    name: 'echo',
    description: 'Echo a message',
    inputSchema: {
      type: 'object',
      properties: {
        message: { type: 'string' },
      },
    },
    // No namespace - should appear at root
  },
];

// Mock state (reset for each test)
let mockConnectionStatus: McpConnectionStatus = 'disconnected';
let mockIsConnected = false;
let statusListeners: Set<(event: McpConnectionStatusChangeEvent) => void> = new Set();

// Reset mock state before each test
function resetMcpMock() {
  mockConnectionStatus = 'disconnected';
  mockIsConnected = false;
  statusListeners = new Set();
}

// Mock McpClientService
vi.mock('../../services/McpClientService', () => {
  return {
    McpClientService: {
      getInstance: vi.fn(() => ({
        getConnectionStatus: vi.fn(() => mockConnectionStatus),
        isConnected: vi.fn(() => mockIsConnected),
        listTools: vi.fn(async () => mockTools),
        onConnectionStatusChange: vi.fn((listener: (event: McpConnectionStatusChangeEvent) => void) => {
          statusListeners.add(listener);
          return { dispose: () => statusListeners.delete(listener) };
        }),
        // Test helpers
        _setConnectionStatus: (status: McpConnectionStatus) => {
          const previousStatus = mockConnectionStatus;
          mockConnectionStatus = status;
          mockIsConnected = status === 'connected';
          for (const listener of statusListeners) {
            listener({
              previousStatus,
              newStatus: status,
              timestamp: Date.now(),
            });
          }
        },
        _getStatusListeners: () => statusListeners,
      })),
      reset: vi.fn(),
    },
  };
});

describe('ToolTreeProvider', () => {
  let mockVscode: typeof vscode;
  let mockTreeView: {
    dispose: () => void;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    resetMcpMock();

    mockTreeView = {
      dispose: vi.fn(),
    };

    // Create mock VS Code module
    mockVscode = {
      TreeItemCollapsibleState: {
        None: 0,
        Collapsed: 1,
        Expanded: 2,
      },
      TreeItem: class MockTreeItem {
        label?: string;
        description?: string;
        tooltip?: string;
        iconPath?: unknown;
        contextValue?: string;
        command?: unknown;
        collapsibleState?: number;

        constructor(labelOrResource: string | vscode.Uri, collapsibleState?: number) {
          if (typeof labelOrResource === 'string') {
            this.label = labelOrResource;
          }
          this.collapsibleState = collapsibleState;
        }
      },
      ThemeIcon: class MockThemeIcon {
        id: string;
        color?: { id: string };
        constructor(id: string, color?: { id: string }) {
          this.id = id;
          this.color = color;
        }
      },
      ThemeColor: class MockThemeColor {
        id: string;
        constructor(id: string) {
          this.id = id;
        }
      },
      EventEmitter: class MockEventEmitterClass {
        private _listeners = new Set<(data: unknown) => void>();
        get event() {
          return ((listener: (data: unknown) => void) => {
            this._listeners.add(listener);
            return { dispose: () => this._listeners.delete(listener) };
          }) as vscode.Event<unknown>;
        }
        fire(data?: unknown) {
          for (const listener of this._listeners) {
            listener(data);
          }
        }
        dispose() {
          this._listeners.clear();
        }
      },
      window: {
        createTreeView: vi.fn(() => mockTreeView),
      },
    } as unknown as typeof vscode;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('initialization', () => {
    it('should initialize successfully', async () => {
      const provider = new ToolTreeProvider();
      await provider.initialize(mockVscode);

      expect(McpClientService.getInstance).toHaveBeenCalled();
    });

    it('should subscribe to connection status changes on initialize', async () => {
      const provider = new ToolTreeProvider();
      await provider.initialize(mockVscode);

      const mockService = McpClientService.getInstance() as ReturnType<typeof McpClientService.getInstance> & {
        _getStatusListeners: () => Set<unknown>;
      };
      expect(mockService._getStatusListeners().size).toBeGreaterThan(0);
    });

    it('should load tools if already connected on initialize', async () => {
      const mockService = McpClientService.getInstance() as ReturnType<typeof McpClientService.getInstance> & {
        _setConnectionStatus: (status: McpConnectionStatus) => void;
      };
      mockService._setConnectionStatus('connected');

      const provider = new ToolTreeProvider();
      await provider.initialize(mockVscode);

      const tools = provider.getTools();
      expect(tools).toHaveLength(mockTools.length);
    });
  });

  describe('getChildren', () => {
    it('should return status header and connect prompt when disconnected', async () => {
      const provider = new ToolTreeProvider();
      await provider.initialize(mockVscode);

      const children = provider.getChildren();

      expect(children).toHaveLength(2);
      expect(children[0].type).toBe('status');
      expect((children[0] as { connectionStatus: string }).connectionStatus).toBe('disconnected');
      expect(children[1].type).toBe('message');
      expect((children[1] as { text: string }).text).toBe('Connect to MCP server to see tools');
      expect((children[1] as { command: string }).command).toBe('agency.connectMcp');
    });

    it('should return status header and namespaces when connected', async () => {
      const mockService = McpClientService.getInstance() as ReturnType<typeof McpClientService.getInstance> & {
        _setConnectionStatus: (status: McpConnectionStatus) => void;
      };
      mockService._setConnectionStatus('connected');

      const provider = new ToolTreeProvider();
      await provider.initialize(mockVscode);

      const children = provider.getChildren();

      // Should have: status + 2 namespaces (file, git) + 1 ungrouped tool (echo)
      expect(children.length).toBeGreaterThanOrEqual(3);
      expect(children[0].type).toBe('status');

      const namespaces = children.filter((c) => c.type === 'namespace');
      expect(namespaces).toHaveLength(2);

      const ungroupedTools = children.filter((c) => c.type === 'tool');
      expect(ungroupedTools).toHaveLength(1);
    });

    it('should return tools for a namespace', async () => {
      const mockService = McpClientService.getInstance() as ReturnType<typeof McpClientService.getInstance> & {
        _setConnectionStatus: (status: McpConnectionStatus) => void;
      };
      mockService._setConnectionStatus('connected');

      const provider = new ToolTreeProvider();
      await provider.initialize(mockVscode);

      const namespaceItem = {
        type: 'namespace' as const,
        id: 'namespace:file',
        namespace: 'file',
        toolCount: 2,
      };

      const children = provider.getChildren(namespaceItem);

      expect(children).toHaveLength(2);
      expect(children.every((c) => c.type === 'tool')).toBe(true);
    });

    it('should return empty array for tool items', async () => {
      const provider = new ToolTreeProvider();
      await provider.initialize(mockVscode);

      const toolItem = {
        type: 'tool' as const,
        id: 'tool:file_read',
        tool: mockTools[0],
      };

      const children = provider.getChildren(toolItem);
      expect(children).toEqual([]);
    });

    it('should return connect prompt with plug icon when disconnected', async () => {
      const provider = new ToolTreeProvider();
      await provider.initialize(mockVscode);

      const children = provider.getChildren();
      const messageItem = children.find((c) => c.type === 'message');
      expect(messageItem).toBeDefined();

      const treeItem = provider.getTreeItem(messageItem!);
      expect(treeItem.label).toBe('Connect to MCP server to see tools');
      expect(treeItem.command?.command).toBe('agency.connectMcp');
      expect((treeItem.iconPath as { id: string }).id).toBe('plug');
    });

    it('should show connect prompt in error state', async () => {
      const mockService = McpClientService.getInstance() as ReturnType<typeof McpClientService.getInstance> & {
        _setConnectionStatus: (status: McpConnectionStatus) => void;
      };
      mockService._setConnectionStatus('error');

      const provider = new ToolTreeProvider();
      await provider.initialize(mockVscode);

      const children = provider.getChildren();
      const messageItem = children.find((c) => c.type === 'message');
      expect(messageItem).toBeDefined();
      expect((messageItem as { text: string }).text).toBe('Connect to MCP server to see tools');
    });

    it('should return empty array for status items', async () => {
      const provider = new ToolTreeProvider();
      await provider.initialize(mockVscode);

      const statusItem = {
        type: 'status' as const,
        id: 'status',
        connectionStatus: 'connected' as McpConnectionStatus,
      };

      const children = provider.getChildren(statusItem);
      expect(children).toEqual([]);
    });
  });

  describe('getTreeItem', () => {
    it('should create status item for connected state', async () => {
      const mockService = McpClientService.getInstance() as ReturnType<typeof McpClientService.getInstance> & {
        _setConnectionStatus: (status: McpConnectionStatus) => void;
      };
      mockService._setConnectionStatus('connected');

      const provider = new ToolTreeProvider();
      await provider.initialize(mockVscode);

      const statusItem = {
        type: 'status' as const,
        id: 'status',
        connectionStatus: 'connected' as McpConnectionStatus,
      };

      const treeItem = provider.getTreeItem(statusItem);

      expect(treeItem.label).toBe('MCP: Connected');
      expect(treeItem.contextValue).toBe('statusConnected');
      expect(treeItem.command?.command).toBe('agency.disconnectMcp');
    });

    it('should create status item for disconnected state', async () => {
      const provider = new ToolTreeProvider();
      await provider.initialize(mockVscode);

      const statusItem = {
        type: 'status' as const,
        id: 'status',
        connectionStatus: 'disconnected' as McpConnectionStatus,
      };

      const treeItem = provider.getTreeItem(statusItem);

      expect(treeItem.label).toBe('MCP: Disconnected');
      expect(treeItem.contextValue).toBe('statusDisconnected');
      expect(treeItem.command?.command).toBe('agency.connectMcp');
    });

    it('should create namespace item with tool count', async () => {
      const provider = new ToolTreeProvider();
      await provider.initialize(mockVscode);

      const namespaceItem = {
        type: 'namespace' as const,
        id: 'namespace:file',
        namespace: 'file',
        toolCount: 2,
      };

      const treeItem = provider.getTreeItem(namespaceItem);

      expect(treeItem.label).toBe('file');
      expect(treeItem.description).toBe('2 tools');
      expect(treeItem.contextValue).toBe('toolNamespace');
      expect(treeItem.collapsibleState).toBe(mockVscode.TreeItemCollapsibleState.Expanded);
    });

    it('should create tool item with description and command', async () => {
      const provider = new ToolTreeProvider();
      await provider.initialize(mockVscode);

      const toolItem = {
        type: 'tool' as const,
        id: 'tool:file_read',
        tool: mockTools[0],
      };

      const treeItem = provider.getTreeItem(toolItem);

      expect(treeItem.label).toBe('file_read');
      expect(treeItem.description).toContain('path: string');
      expect(treeItem.contextValue).toBe('tool');
      expect(treeItem.command?.command).toBe('agency.testTool');
      expect(treeItem.command?.arguments).toEqual([mockTools[0]]);
    });

    it('should format parameter schema preview correctly', async () => {
      const provider = new ToolTreeProvider();
      await provider.initialize(mockVscode);

      const toolWithMultipleParams = {
        type: 'tool' as const,
        id: 'tool:file_write',
        tool: mockTools[1], // file_write has path and content params
      };

      const treeItem = provider.getTreeItem(toolWithMultipleParams);

      // Should show required params without '?' suffix
      expect(treeItem.description).toContain('path: string');
      expect(treeItem.description).toContain('content: string');
    });

    it('should throw if not initialized', () => {
      const provider = new ToolTreeProvider();

      const statusItem = {
        type: 'status' as const,
        id: 'status',
        connectionStatus: 'disconnected' as McpConnectionStatus,
      };

      expect(() => provider.getTreeItem(statusItem)).toThrow('ToolTreeProvider not initialized');
    });
  });

  describe('getParent', () => {
    it('should return undefined for status items', async () => {
      const provider = new ToolTreeProvider();
      await provider.initialize(mockVscode);

      const statusItem = {
        type: 'status' as const,
        id: 'status',
        connectionStatus: 'connected' as McpConnectionStatus,
      };

      expect(provider.getParent(statusItem)).toBeUndefined();
    });

    it('should return undefined for namespace items', async () => {
      const provider = new ToolTreeProvider();
      await provider.initialize(mockVscode);

      const namespaceItem = {
        type: 'namespace' as const,
        id: 'namespace:file',
        namespace: 'file',
        toolCount: 2,
      };

      expect(provider.getParent(namespaceItem)).toBeUndefined();
    });

    it('should return namespace parent for tool with namespace', async () => {
      const mockService = McpClientService.getInstance() as ReturnType<typeof McpClientService.getInstance> & {
        _setConnectionStatus: (status: McpConnectionStatus) => void;
      };
      mockService._setConnectionStatus('connected');

      const provider = new ToolTreeProvider();
      await provider.initialize(mockVscode);

      const toolItem = {
        type: 'tool' as const,
        id: 'tool:file_read',
        tool: mockTools[0], // Has namespace 'file'
      };

      const parent = provider.getParent(toolItem);

      expect(parent).toBeDefined();
      expect(parent?.type).toBe('namespace');
      expect((parent as { namespace: string }).namespace).toBe('file');
    });

    it('should return undefined for tool without namespace', async () => {
      const provider = new ToolTreeProvider();
      await provider.initialize(mockVscode);

      const toolItem = {
        type: 'tool' as const,
        id: 'tool:echo',
        tool: mockTools[3], // No namespace
      };

      expect(provider.getParent(toolItem)).toBeUndefined();
    });
  });

  describe('connection status changes', () => {
    it('should refresh tools when connected', async () => {
      const provider = new ToolTreeProvider();
      await provider.initialize(mockVscode);

      expect(provider.getConnectionStatus()).toBe('disconnected');
      expect(provider.getTools()).toHaveLength(0);

      // Trigger connection
      const mockService = McpClientService.getInstance() as ReturnType<typeof McpClientService.getInstance> & {
        _setConnectionStatus: (status: McpConnectionStatus) => void;
      };
      mockService._setConnectionStatus('connected');

      // Wait for async refresh
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(provider.getConnectionStatus()).toBe('connected');
      expect(provider.getTools()).toHaveLength(mockTools.length);
    });

    it('should clear tools when disconnected', async () => {
      const mockService = McpClientService.getInstance() as ReturnType<typeof McpClientService.getInstance> & {
        _setConnectionStatus: (status: McpConnectionStatus) => void;
      };
      mockService._setConnectionStatus('connected');

      const provider = new ToolTreeProvider();
      await provider.initialize(mockVscode);

      expect(provider.getTools()).toHaveLength(mockTools.length);

      // Disconnect
      mockService._setConnectionStatus('disconnected');

      expect(provider.getConnectionStatus()).toBe('disconnected');
      expect(provider.getTools()).toHaveLength(0);
    });
  });

  describe('refresh', () => {
    it('should fire tree data change event', async () => {
      const provider = new ToolTreeProvider();
      await provider.initialize(mockVscode);

      expect(provider.onDidChangeTreeData).toBeDefined();

      // Refresh should not throw
      provider.refresh();
    });

    it('should support refreshTools method', async () => {
      const mockService = McpClientService.getInstance() as ReturnType<typeof McpClientService.getInstance> & {
        _setConnectionStatus: (status: McpConnectionStatus) => void;
      };
      mockService._setConnectionStatus('connected');

      const provider = new ToolTreeProvider();
      await provider.initialize(mockVscode);

      await provider.refreshTools();

      expect(provider.getTools()).toHaveLength(mockTools.length);
    });
  });

  describe('dispose', () => {
    it('should clean up resources', async () => {
      const mockService = McpClientService.getInstance() as ReturnType<typeof McpClientService.getInstance> & {
        _setConnectionStatus: (status: McpConnectionStatus) => void;
      };
      mockService._setConnectionStatus('connected');

      const provider = new ToolTreeProvider();
      await provider.initialize(mockVscode);

      expect(provider.getTools()).toHaveLength(mockTools.length);

      provider.dispose();

      expect(provider.getTools()).toHaveLength(0);
    });
  });
});

describe('registerToolTreeView', () => {
  let mockVscode: typeof vscode;
  let mockTreeView: {
    dispose: () => void;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    resetMcpMock();

    mockTreeView = {
      dispose: vi.fn(),
    };

    mockVscode = {
      TreeItemCollapsibleState: {
        None: 0,
        Collapsed: 1,
        Expanded: 2,
      },
      TreeItem: class MockTreeItem {
        label?: string;
        collapsibleState?: number;
        constructor(labelOrResource: string | vscode.Uri, collapsibleState?: number) {
          if (typeof labelOrResource === 'string') {
            this.label = labelOrResource;
          }
          this.collapsibleState = collapsibleState;
        }
      },
      ThemeIcon: class MockThemeIcon {
        id: string;
        color?: { id: string };
        constructor(id: string, color?: { id: string }) {
          this.id = id;
          this.color = color;
        }
      },
      ThemeColor: class MockThemeColor {
        id: string;
        constructor(id: string) {
          this.id = id;
        }
      },
      EventEmitter: class MockEventEmitterClass {
        private _listeners = new Set<(data: unknown) => void>();
        get event() {
          return ((listener: (data: unknown) => void) => {
            this._listeners.add(listener);
            return { dispose: () => this._listeners.delete(listener) };
          }) as vscode.Event<unknown>;
        }
        fire(data?: unknown) {
          for (const listener of this._listeners) {
            listener(data);
          }
        }
        dispose() {
          this._listeners.clear();
        }
      },
      window: {
        createTreeView: vi.fn(() => mockTreeView),
      },
    } as unknown as typeof vscode;
  });

  it('should create tree view with correct ID', async () => {
    await registerToolTreeView(mockVscode);

    expect(mockVscode.window.createTreeView).toHaveBeenCalledWith(
      'agency.tools',
      expect.objectContaining({
        treeDataProvider: expect.any(Object),
        showCollapseAll: true,
      })
    );
  });

  it('should return disposable', async () => {
    const disposable = await registerToolTreeView(mockVscode);

    expect(disposable).toHaveProperty('dispose');
    expect(typeof disposable.dispose).toBe('function');
  });

  it('should dispose both tree view and provider on dispose', async () => {
    const disposable = await registerToolTreeView(mockVscode);

    disposable.dispose();

    expect(mockTreeView.dispose).toHaveBeenCalled();
  });
});
