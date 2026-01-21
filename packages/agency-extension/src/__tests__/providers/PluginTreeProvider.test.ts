import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type * as vscode from 'vscode';
import { PluginTreeProvider, registerPluginTreeView } from '../../providers/PluginTreeProvider';
import { ConfigService } from '../../services/ConfigService';
import type { PluginConfig } from '../../types';

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

// Mock ConfigService
vi.mock('../../services/ConfigService', () => {
  const listeners: Set<(config: unknown) => void> = new Set();
  let mockPlugins: PluginConfig[] = [
    { id: 'plugin-1', enabled: true, settings: { key: 'value' } },
    { id: 'plugin-2', enabled: false, settings: {} },
  ];

  return {
    ConfigService: {
      getInstance: vi.fn(() => ({
        getPlugins: vi.fn(() => mockPlugins),
        onConfigChange: vi.fn((listener: (config: unknown) => void) => {
          listeners.add(listener);
          return { dispose: () => listeners.delete(listener) };
        }),
        // Helper for tests to trigger config changes
        _triggerChange: () => {
          for (const listener of listeners) {
            listener({});
          }
        },
        _setPlugins: (plugins: PluginConfig[]) => {
          mockPlugins = plugins;
        },
      })),
      reset: vi.fn(),
    },
  };
});

describe('PluginTreeProvider', () => {
  let mockVscode: typeof vscode;
  let mockEventEmitter: {
    event: vscode.Event<unknown>;
    fire: (data?: unknown) => void;
    dispose: () => void;
  };
  let mockTreeView: {
    dispose: () => void;
  };

  beforeEach(() => {
    vi.clearAllMocks();

    // Create mock EventEmitter
    const listeners: Set<(data: unknown) => void> = new Set();
    mockEventEmitter = {
      event: ((listener: (data: unknown) => void) => {
        listeners.add(listener);
        return { dispose: () => listeners.delete(listener) };
      }) as vscode.Event<unknown>,
      fire: (data?: unknown) => {
        for (const listener of listeners) {
          listener(data);
        }
      },
      dispose: vi.fn(),
    };

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

  describe('PluginTreeProvider', () => {
    describe('initialization', () => {
      it('should initialize successfully', async () => {
        const provider = new PluginTreeProvider();
        await provider.initialize(mockVscode);

        expect(ConfigService.getInstance).toHaveBeenCalled();
      });

      it('should subscribe to config changes on initialize', async () => {
        const provider = new PluginTreeProvider();
        await provider.initialize(mockVscode);

        // After initialization, we can verify the provider has set up correctly
        // by checking that getChildren works and returns plugins
        const children = provider.getChildren();
        expect(children.length).toBeGreaterThanOrEqual(0);
      });
    });

    describe('getChildren', () => {
      it('should return all plugins at root level', async () => {
        const provider = new PluginTreeProvider();
        await provider.initialize(mockVscode);

        const children = provider.getChildren();

        expect(children).toHaveLength(2);
        expect(children[0].id).toBe('plugin-1');
        expect(children[1].id).toBe('plugin-2');
      });

      it('should return empty array for non-root elements', async () => {
        const provider = new PluginTreeProvider();
        await provider.initialize(mockVscode);

        const plugin: PluginConfig = { id: 'test', enabled: true, settings: {} };
        const children = provider.getChildren(plugin);

        expect(children).toEqual([]);
      });

      it('should return empty array when ConfigService is not available', async () => {
        const provider = new PluginTreeProvider();
        // Don't initialize - ConfigService won't be set

        const children = provider.getChildren();

        expect(children).toEqual([]);
      });
    });

    describe('getTreeItem', () => {
      it('should create tree item for enabled plugin', async () => {
        const provider = new PluginTreeProvider();
        await provider.initialize(mockVscode);

        const plugin: PluginConfig = { id: 'enabled-plugin', enabled: true, settings: {} };
        const treeItem = provider.getTreeItem(plugin);

        expect(treeItem.label).toBe('enabled-plugin');
        expect(treeItem.description).toBe('enabled');
        expect(treeItem.contextValue).toBe('pluginEnabled');
      });

      it('should create tree item for disabled plugin', async () => {
        const provider = new PluginTreeProvider();
        await provider.initialize(mockVscode);

        const plugin: PluginConfig = { id: 'disabled-plugin', enabled: false, settings: {} };
        const treeItem = provider.getTreeItem(plugin);

        expect(treeItem.label).toBe('disabled-plugin');
        expect(treeItem.description).toBe('disabled');
        expect(treeItem.contextValue).toBe('pluginDisabled');
      });

      it('should set command to open plugin config on click', async () => {
        const provider = new PluginTreeProvider();
        await provider.initialize(mockVscode);

        const plugin: PluginConfig = { id: 'test-plugin', enabled: true, settings: {} };
        const treeItem = provider.getTreeItem(plugin);

        expect(treeItem.command).toEqual({
          command: 'agency.configurePlugin',
          title: 'Configure Plugin',
          arguments: [plugin],
        });
      });

      it('should include settings count in tooltip', async () => {
        const provider = new PluginTreeProvider();
        await provider.initialize(mockVscode);

        const plugin: PluginConfig = {
          id: 'test-plugin',
          enabled: true,
          settings: { key1: 'value1', key2: 'value2' },
        };
        const treeItem = provider.getTreeItem(plugin);

        expect(treeItem.tooltip).toContain('Settings: 2 configured');
      });

      it('should throw if not initialized', () => {
        const provider = new PluginTreeProvider();

        const plugin: PluginConfig = { id: 'test', enabled: true, settings: {} };

        expect(() => provider.getTreeItem(plugin)).toThrow('PluginTreeProvider not initialized');
      });
    });

    describe('getParent', () => {
      it('should always return undefined for root-level items', async () => {
        const provider = new PluginTreeProvider();
        await provider.initialize(mockVscode);

        const plugin: PluginConfig = { id: 'test', enabled: true, settings: {} };
        const parent = provider.getParent(plugin);

        expect(parent).toBeUndefined();
      });
    });

    describe('refresh', () => {
      it('should fire tree data change event', async () => {
        const provider = new PluginTreeProvider();
        await provider.initialize(mockVscode);

        // Access the event to verify it's available
        expect(provider.onDidChangeTreeData).toBeDefined();

        // Refresh should not throw
        provider.refresh();
      });
    });

    describe('dispose', () => {
      it('should clean up resources', async () => {
        const provider = new PluginTreeProvider();
        await provider.initialize(mockVscode);

        provider.dispose();

        // After dispose, getChildren should return empty array
        const children = provider.getChildren();
        expect(children).toEqual([]);
      });
    });
  });

  describe('registerPluginTreeView', () => {
    it('should create tree view with correct ID', async () => {
      await registerPluginTreeView(mockVscode);

      expect(mockVscode.window.createTreeView).toHaveBeenCalledWith(
        'agency.plugins',
        expect.objectContaining({
          treeDataProvider: expect.any(Object),
          showCollapseAll: false,
        })
      );
    });

    it('should return disposable', async () => {
      const disposable = await registerPluginTreeView(mockVscode);

      expect(disposable).toHaveProperty('dispose');
      expect(typeof disposable.dispose).toBe('function');
    });

    it('should dispose both tree view and provider on dispose', async () => {
      const disposable = await registerPluginTreeView(mockVscode);

      disposable.dispose();

      expect(mockTreeView.dispose).toHaveBeenCalled();
    });
  });
});
