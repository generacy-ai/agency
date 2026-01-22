import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type * as vscode from 'vscode';

// Mock vscode module
const mockOutputChannel = {
  appendLine: vi.fn(),
  show: vi.fn(),
  dispose: vi.fn(),
};

const mockCommands = {
  registerCommand: vi.fn((command: string, callback: () => void) => ({
    dispose: vi.fn(),
  })),
};

const mockTreeView = {
  dispose: vi.fn(),
};

const mockWindow = {
  createOutputChannel: vi.fn(() => mockOutputChannel),
  showInformationMessage: vi.fn(),
  createTreeView: vi.fn(() => mockTreeView),
};

const mockWorkspace = {
  workspaceFolders: [
    {
      uri: { fsPath: '/workspace', path: '/workspace' },
      name: 'workspace',
      index: 0,
    },
  ],
};

vi.mock('vscode', () => ({
  window: mockWindow,
  commands: mockCommands,
  workspace: mockWorkspace,
  TreeItemCollapsibleState: { None: 0, Collapsed: 1, Expanded: 2 },
  TreeItem: class {},
  ThemeIcon: class { constructor(public id: string, public color?: unknown) {} },
  ThemeColor: class { constructor(public id: string) {} },
  EventEmitter: class {
    private _listeners = new Set<(data: unknown) => void>();
    get event() {
      return ((listener: (data: unknown) => void) => {
        this._listeners.add(listener);
        return { dispose: () => this._listeners.delete(listener) };
      });
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
}));

// Mock services
vi.mock('../services', () => ({
  ConfigService: {
    getInstance: vi.fn(() => ({
      initialize: vi.fn().mockResolvedValue(undefined),
      getPlugins: vi.fn(() => []),
      onConfigChange: vi.fn(() => ({ dispose: vi.fn() })),
    })),
    reset: vi.fn(),
  },
  McpClientService: {
    getInstance: vi.fn(() => ({
      initialize: vi.fn().mockResolvedValue(undefined),
      getConnectionStatus: vi.fn(() => 'disconnected'),
      onConnectionStatusChange: vi.fn(() => ({ dispose: vi.fn() })),
    })),
    reset: vi.fn(),
  },
  ActivityService: {
    getInstance: vi.fn(() => ({
      initialize: vi.fn().mockResolvedValue(undefined),
      onActivityUpdate: vi.fn(() => ({ dispose: vi.fn() })),
      getEventsByTimePeriod: vi.fn(() => ({
        lastMinute: [],
        lastFiveMinutes: [],
        older: [],
      })),
    })),
    reset: vi.fn(),
  },
  ContainerService: {
    getInstance: vi.fn(() => ({
      initialize: vi.fn().mockResolvedValue(undefined),
      listContainers: vi.fn(() => []),
      onContainerChange: vi.fn(() => ({ dispose: vi.fn() })),
    })),
    reset: vi.fn(),
  },
  ModeService: {
    getInstance: vi.fn(() => ({
      getModes: vi.fn(() => []),
      onModeChange: vi.fn(() => ({ dispose: vi.fn() })),
    })),
    reset: vi.fn(),
  },
}));

// Mock providers
vi.mock('../providers', () => ({
  registerPluginTreeView: vi.fn().mockResolvedValue({ dispose: vi.fn() }),
}));

// Import after mocking
import { activate, deactivate, getExtensionState } from '../extension';

describe('Extension', () => {
  let mockContext: vscode.ExtensionContext;

  beforeEach(() => {
    // Reset mocks
    vi.clearAllMocks();

    // Create mock context
    mockContext = {
      subscriptions: [],
      extensionPath: '/test/extension/path',
      extensionUri: { fsPath: '/test/extension/path' } as vscode.Uri,
      globalState: {
        get: vi.fn(),
        update: vi.fn(),
        keys: vi.fn(() => []),
        setKeysForSync: vi.fn(),
      },
      workspaceState: {
        get: vi.fn(),
        update: vi.fn(),
        keys: vi.fn(() => []),
      },
      secrets: {
        get: vi.fn(),
        store: vi.fn(),
        delete: vi.fn(),
        onDidChange: vi.fn(),
      },
      storageUri: undefined,
      globalStorageUri: { fsPath: '/test/global/storage' } as vscode.Uri,
      logUri: { fsPath: '/test/logs' } as vscode.Uri,
      extensionMode: 1, // ExtensionMode.Test
      environmentVariableCollection: {} as vscode.EnvironmentVariableCollection,
      asAbsolutePath: vi.fn((path) => `/test/extension/path/${path}`),
      storagePath: undefined,
      globalStoragePath: '/test/global/storage',
      logPath: '/test/logs',
      extension: {} as vscode.Extension<unknown>,
      languageModelAccessInformation: {} as vscode.LanguageModelAccessInformation,
    } as unknown as vscode.ExtensionContext;
  });

  afterEach(() => {
    // Ensure extension is deactivated between tests
    deactivate();
  });

  describe('activate', () => {
    it('should create an output channel', async () => {
      await activate(mockContext);

      expect(mockWindow.createOutputChannel).toHaveBeenCalledWith('Agency');
    });

    it('should register disposables with context subscriptions', async () => {
      await activate(mockContext);

      // Should have at least one disposable (the DisposableManager)
      expect(mockContext.subscriptions.length).toBeGreaterThan(0);
    });

    it('should register all stub commands', async () => {
      await activate(mockContext);

      const expectedCommands = [
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

      expect(mockCommands.registerCommand).toHaveBeenCalledTimes(expectedCommands.length);

      for (const command of expectedCommands) {
        expect(mockCommands.registerCommand).toHaveBeenCalledWith(
          command,
          expect.any(Function)
        );
      }
    });

    it('should set extension state after activation', async () => {
      expect(getExtensionState()).toBeNull();

      await activate(mockContext);

      const state = getExtensionState();
      expect(state).not.toBeNull();
      expect(state?.context).toBe(mockContext);
      expect(state?.outputChannel).toBe(mockOutputChannel);
    });

    it('should log activation messages', async () => {
      await activate(mockContext);

      // Output channel should have received log messages
      expect(mockOutputChannel.appendLine).toHaveBeenCalled();

      // Check for activation message
      const calls = mockOutputChannel.appendLine.mock.calls;
      const activatingCall = calls.find((call: string[]) =>
        call[0].includes('is activating')
      );
      const activatedCall = calls.find((call: string[]) =>
        call[0].includes('activated successfully')
      );

      expect(activatingCall).toBeDefined();
      expect(activatedCall).toBeDefined();
    });
  });

  describe('deactivate', () => {
    it('should clear extension state', async () => {
      await activate(mockContext);
      expect(getExtensionState()).not.toBeNull();

      deactivate();
      expect(getExtensionState()).toBeNull();
    });

    it('should be safe to call multiple times', () => {
      // Should not throw when called without activation
      expect(() => deactivate()).not.toThrow();
      expect(() => deactivate()).not.toThrow();
    });

    it('should log deactivation messages', async () => {
      await activate(mockContext);
      vi.clearAllMocks(); // Clear activation logs

      deactivate();

      const calls = mockOutputChannel.appendLine.mock.calls;
      const deactivatingCall = calls.find((call: string[]) =>
        call[0].includes('is deactivating')
      );
      const deactivatedCall = calls.find((call: string[]) =>
        call[0].includes('deactivated')
      );

      expect(deactivatingCall).toBeDefined();
      expect(deactivatedCall).toBeDefined();
    });
  });

  describe('getExtensionState', () => {
    it('should return null before activation', () => {
      expect(getExtensionState()).toBeNull();
    });

    it('should return state after activation', async () => {
      await activate(mockContext);

      const state = getExtensionState();
      expect(state).not.toBeNull();
      expect(state?.context).toBe(mockContext);
    });

    it('should return null after deactivation', async () => {
      await activate(mockContext);
      deactivate();

      expect(getExtensionState()).toBeNull();
    });
  });
});
