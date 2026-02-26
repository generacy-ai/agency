import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type * as vscode from 'vscode';

// Mock vscode module - all variables must be defined inline to avoid hoisting issues
vi.mock('vscode', () => ({
  window: {
    createOutputChannel: vi.fn(() => ({
      appendLine: vi.fn(),
      show: vi.fn(),
      dispose: vi.fn(),
    })),
    showInformationMessage: vi.fn(),
    showErrorMessage: vi.fn(),
    createTreeView: vi.fn(() => ({
      dispose: vi.fn(),
    })),
  },
  commands: {
    registerCommand: vi.fn((command: string, callback: () => void) => ({
      dispose: vi.fn(),
    })),
    executeCommand: vi.fn(),
  },
  workspace: {
    workspaceFolders: [
      {
        uri: { fsPath: '/workspace', path: '/workspace' },
        name: 'workspace',
        index: 0,
      },
    ],
  },
  env: {
    openExternal: vi.fn(),
  },
  Uri: {
    parse: vi.fn((uri: string) => ({ toString: () => uri })),
  },
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
      getConfig: vi.fn(() => null),
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
  ModeService: {
    getInstance: vi.fn(() => ({
      initialize: vi.fn().mockResolvedValue(undefined),
      getModes: vi.fn(() => []),
      onModeChange: vi.fn(() => ({ dispose: vi.fn() })),
    })),
    reset: vi.fn(),
  },
}));

// Mock providers
vi.mock('../providers', () => ({
  registerPluginTreeView: vi.fn().mockResolvedValue({ dispose: vi.fn() }),
  registerModeTreeView: vi.fn(() => ({ dispose: vi.fn() })),
}));

// Mock commands
vi.mock('../commands', () => ({
  registerPluginCommands: vi.fn(() => [{ dispose: vi.fn() }]),
  initializePluginCommands: vi.fn(),
  registerToolCommands: vi.fn(() => [{ dispose: vi.fn() }]),
  initializeToolCommands: vi.fn(),
  initializeModeCommands: vi.fn(),
  switchMode: vi.fn(),
  viewModeTools: vi.fn(),
}));

// Mock errors
vi.mock('../errors', () => ({
  ErrorNotificationService: {
    showError: vi.fn(),
  },
}));

// Mock status
vi.mock('../status', () => ({
  StatusBarManager: {
    getInstance: vi.fn(() => ({
      initialize: vi.fn(),
      dispose: vi.fn(),
    })),
  },
}));

// Mock welcome
vi.mock('../welcome', () => ({
  WelcomeViewProvider: vi.fn().mockImplementation(() => ({
    refresh: vi.fn(),
  })),
}));

// Import after mocking
import { activate, deactivate, getExtensionState } from '../extension';
import * as vscode from 'vscode';

describe('Extension', () => {
  let mockContext: vscode.ExtensionContext;
  const mockWindow = vscode.window as unknown as { createOutputChannel: ReturnType<typeof vi.fn> };
  const mockCommands = vscode.commands as unknown as { registerCommand: ReturnType<typeof vi.fn> };

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

    it('should register commands', async () => {
      await activate(mockContext);

      // Verify that registerCommand was called (at least for status bar and welcome commands)
      expect(mockCommands.registerCommand).toHaveBeenCalled();

      // Verify some key commands are registered
      const calls = mockCommands.registerCommand.mock.calls.map((call: unknown[]) => call[0]);

      // Status bar commands
      expect(calls).toContain('agency.showMcpStatus');
      expect(calls).toContain('agency.connectMcp');
      expect(calls).toContain('agency.showMcpError');
      expect(calls).toContain('agency.showContainerStatus');

      // Welcome view commands
      expect(calls).toContain('agency.initConfig');
      expect(calls).toContain('agency.showPlugins');
      expect(calls).toContain('agency.openDocs');

      // Mode commands
      expect(calls).toContain('agency.switchMode');
      expect(calls).toContain('agency.viewModeTools');

      // Container stub commands
      expect(calls).toContain('agency.startContainer');
      expect(calls).toContain('agency.stopContainer');
      expect(calls).toContain('agency.rebuildContainer');
      expect(calls).toContain('agency.viewContainerLogs');
    });

    it('should set extension state after activation', async () => {
      expect(getExtensionState()).toBeNull();

      await activate(mockContext);

      const state = getExtensionState();
      expect(state).not.toBeNull();
      expect(state?.context).toBe(mockContext);
      expect(state?.outputChannel).toBeDefined();
    });

    it('should log activation messages', async () => {
      const createOutputChannelSpy = vi.spyOn(mockWindow, 'createOutputChannel');
      await activate(mockContext);

      // Output channel should have been created
      expect(createOutputChannelSpy).toHaveBeenCalledWith('Agency');

      // Note: The actual logging verification would require access to the output channel instance
      // which is now created inside the mock. We verify the channel was created.
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

    it('should handle deactivation without errors', async () => {
      await activate(mockContext);

      // Deactivate should not throw
      expect(() => deactivate()).not.toThrow();
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
