import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type * as vscode from 'vscode';
import type { PluginConfig, PluginManifest, PluginMetadata } from '../../types';
import { PluginConfigPanel, _clearPanels } from '../../views/plugins/PluginConfigPanel';
import { ConfigService, McpClientService } from '../../services';

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

// Mock services
vi.mock('../../services', () => ({
  ConfigService: {
    getInstance: vi.fn(),
  },
  McpClientService: {
    getInstance: vi.fn(),
  },
}));

describe('PluginConfigPanel', () => {
  let mockVscode: typeof vscode;
  let mockExtensionUri: vscode.Uri;
  let mockPanel: vscode.WebviewPanel;
  let mockWebview: vscode.Webview;
  let mockConfigService: Partial<ConfigService>;
  let mockMcpClientService: Partial<McpClientService>;

  const samplePlugin: PluginConfig = {
    id: 'test-plugin',
    enabled: true,
    settings: {
      apiKey: 'secret123',
      timeout: 30,
      debug: false,
    },
  };

  const sampleManifest: PluginManifest = {
    id: 'test-plugin',
    name: 'Test Plugin',
    description: 'A test plugin for testing',
    version: '1.0.0',
    author: 'Test Author',
    tools: ['tool1', 'tool2'],
    settingsSchema: {
      type: 'object',
      properties: {
        apiKey: {
          type: 'string',
          description: 'API key for authentication',
        },
        timeout: {
          type: 'number',
          description: 'Request timeout in seconds',
          minimum: 1,
          maximum: 120,
        },
        debug: {
          type: 'boolean',
          description: 'Enable debug mode',
        },
        mode: {
          type: 'string',
          description: 'Operation mode',
          enum: ['fast', 'balanced', 'thorough'],
        },
      },
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    _clearPanels();

    // Create mock webview
    mockWebview = {
      html: '',
      cspSource: 'https://test.com',
      onDidReceiveMessage: vi.fn().mockReturnValue({ dispose: vi.fn() }),
      postMessage: vi.fn().mockResolvedValue(true),
      asWebviewUri: vi.fn((uri) => uri),
    } as unknown as vscode.Webview;

    // Create mock panel
    mockPanel = {
      webview: mockWebview,
      title: '',
      visible: true,
      reveal: vi.fn(),
      dispose: vi.fn(),
      onDidDispose: vi.fn().mockReturnValue({ dispose: vi.fn() }),
    } as unknown as vscode.WebviewPanel;

    // Create mock extension URI
    mockExtensionUri = {
      fsPath: '/test/extension',
      path: '/test/extension',
    } as vscode.Uri;

    // Create mock VS Code module
    mockVscode = {
      ViewColumn: { One: 1, Two: 2, Three: 3 },
      Uri: {
        joinPath: vi.fn((base, ...segments) => ({
          fsPath: [base.fsPath, ...segments].join('/'),
          path: [base.path, ...segments].join('/'),
        })),
      },
      window: {
        createWebviewPanel: vi.fn(() => mockPanel),
        showWarningMessage: vi.fn().mockResolvedValue(undefined),
      },
    } as unknown as typeof vscode;

    // Create mock ConfigService
    mockConfigService = {
      getPlugin: vi.fn().mockReturnValue(samplePlugin),
      getPlugins: vi.fn().mockReturnValue([samplePlugin]),
      savePluginConfig: vi.fn().mockResolvedValue(undefined),
      onConfigChange: vi.fn().mockReturnValue({ dispose: vi.fn() }),
      onConfigConflict: vi.fn().mockReturnValue({ dispose: vi.fn() }),
      setWebviewDirty: vi.fn(),
    };

    // Create mock McpClientService - defaults to returning empty metadata
    mockMcpClientService = {
      getPluginMetadata: vi.fn().mockResolvedValue([]),
    };

    (ConfigService.getInstance as ReturnType<typeof vi.fn>).mockReturnValue(mockConfigService);
    (McpClientService.getInstance as ReturnType<typeof vi.fn>).mockReturnValue(mockMcpClientService);
  });

  describe('createOrShow()', () => {
    it('should create panel and call createWebviewPanel', () => {
      PluginConfigPanel.createOrShow(
        mockVscode,
        mockExtensionUri,
        samplePlugin,
        sampleManifest
      );

      expect(mockVscode.window.createWebviewPanel).toHaveBeenCalledWith(
        'agency.pluginConfig',
        expect.stringContaining('Configure:'),
        1,
        expect.objectContaining({
          enableScripts: true,
          retainContextWhenHidden: true,
        })
      );
    });

    it('should subscribe to config changes', () => {
      PluginConfigPanel.createOrShow(
        mockVscode,
        mockExtensionUri,
        samplePlugin,
        sampleManifest
      );

      expect(mockConfigService.onConfigChange).toHaveBeenCalled();
    });

    it('should return panel instance', () => {
      const panel = PluginConfigPanel.createOrShow(
        mockVscode,
        mockExtensionUri,
        samplePlugin,
        sampleManifest
      );

      expect(panel).toBeInstanceOf(PluginConfigPanel);
    });

    it('should query McpClientService for plugin metadata on open', () => {
      PluginConfigPanel.createOrShow(
        mockVscode,
        mockExtensionUri,
        samplePlugin,
        sampleManifest
      );

      expect(mockMcpClientService.getPluginMetadata).toHaveBeenCalled();
    });

    it('should query metadata again when showing existing panel', () => {
      PluginConfigPanel.createOrShow(
        mockVscode,
        mockExtensionUri,
        samplePlugin,
        sampleManifest
      );

      // Show again
      PluginConfigPanel.createOrShow(
        mockVscode,
        mockExtensionUri,
        samplePlugin,
        sampleManifest
      );

      expect(mockMcpClientService.getPluginMetadata).toHaveBeenCalledTimes(2);
    });
  });

  describe('metadata-driven forms', () => {
    it('should apply MCP metadata schema and refresh panel', async () => {
      const mcpMetadata: PluginMetadata[] = [{
        id: 'test-plugin',
        name: 'Test Plugin (Server)',
        description: 'Server-provided description',
        version: '2.0.0',
        settingsSchema: {
          type: 'object',
          properties: {
            serverSetting: {
              type: 'string',
              description: 'A setting from the server',
            },
          },
        },
      }];

      (mockMcpClientService.getPluginMetadata as ReturnType<typeof vi.fn>)
        .mockResolvedValue(mcpMetadata);

      PluginConfigPanel.createOrShow(
        mockVscode,
        mockExtensionUri,
        samplePlugin
      );

      // Wait for metadata fetch to complete
      await vi.waitFor(() => {
        // After metadata fetch, the HTML should be refreshed with server schema
        expect(mockWebview.html).toContain('serverSetting');
      });
    });

    it('should use manifest schema as fallback when MCP returns no metadata', async () => {
      (mockMcpClientService.getPluginMetadata as ReturnType<typeof vi.fn>)
        .mockResolvedValue([]);

      PluginConfigPanel.createOrShow(
        mockVscode,
        mockExtensionUri,
        samplePlugin,
        sampleManifest
      );

      // Wait for metadata fetch to complete
      await vi.waitFor(() => {
        // Should still use manifest schema fields
        expect(mockWebview.html).toContain('apiKey');
        expect(mockWebview.html).toContain('timeout');
      });
    });

    it('should handle metadata fetch failure gracefully', async () => {
      (mockMcpClientService.getPluginMetadata as ReturnType<typeof vi.fn>)
        .mockRejectedValue(new Error('Connection failed'));

      PluginConfigPanel.createOrShow(
        mockVscode,
        mockExtensionUri,
        samplePlugin,
        sampleManifest
      );

      // Wait for metadata fetch to resolve (with error)
      await vi.waitFor(() => {
        // Should fall back to manifest schema
        expect(mockWebview.html).toContain('apiKey');
      });
    });

    it('should show JSON editor when no schema and no settings', async () => {
      (mockMcpClientService.getPluginMetadata as ReturnType<typeof vi.fn>)
        .mockResolvedValue([]);

      const emptyPlugin: PluginConfig = { id: 'empty-plugin', enabled: true, settings: {} };
      PluginConfigPanel.createOrShow(mockVscode, mockExtensionUri, emptyPlugin);

      // Wait for metadata fetch to complete
      await vi.waitFor(() => {
        expect(mockWebview.html).toContain('jsonEditor');
        expect(mockWebview.html).toContain('No settings schema available');
      });
    });

    it('should set data-mode attribute on form', async () => {
      (mockMcpClientService.getPluginMetadata as ReturnType<typeof vi.fn>)
        .mockResolvedValue([]);

      PluginConfigPanel.createOrShow(
        mockVscode,
        mockExtensionUri,
        samplePlugin,
        sampleManifest
      );

      await vi.waitFor(() => {
        expect(mockWebview.html).toContain('data-mode="schema"');
      });
    });

    it('should set json-editor mode when no schema is available', async () => {
      (mockMcpClientService.getPluginMetadata as ReturnType<typeof vi.fn>)
        .mockResolvedValue([]);

      const emptyPlugin: PluginConfig = { id: 'no-schema-plugin', enabled: true, settings: {} };
      PluginConfigPanel.createOrShow(mockVscode, mockExtensionUri, emptyPlugin);

      await vi.waitFor(() => {
        expect(mockWebview.html).toContain('data-mode="json-editor"');
      });
    });

    it('should prefer MCP schema over manifest schema', async () => {
      const mcpMetadata: PluginMetadata[] = [{
        id: 'test-plugin',
        name: 'Test Plugin',
        settingsSchema: {
          type: 'object',
          properties: {
            mcpOnlySetting: {
              type: 'string',
              description: 'Only from MCP',
            },
          },
        },
      }];

      (mockMcpClientService.getPluginMetadata as ReturnType<typeof vi.fn>)
        .mockResolvedValue(mcpMetadata);

      // Provide a manifest with different schema
      PluginConfigPanel.createOrShow(
        mockVscode,
        mockExtensionUri,
        samplePlugin,
        sampleManifest
      );

      await vi.waitFor(() => {
        // MCP schema should take precedence
        expect(mockWebview.html).toContain('mcpOnlySetting');
        expect(mockWebview.html).toContain('Only from MCP');
      });
    });

    it('should use settings-inferred form when settings exist but no schema', async () => {
      (mockMcpClientService.getPluginMetadata as ReturnType<typeof vi.fn>)
        .mockResolvedValue([]);

      // Plugin with settings but no manifest/schema
      PluginConfigPanel.createOrShow(
        mockVscode,
        mockExtensionUri,
        samplePlugin
      );

      await vi.waitFor(() => {
        // Should infer form fields from settings values
        expect(mockWebview.html).toContain('data-mode="settings"');
        expect(mockWebview.html).toContain('apiKey');
      });
    });
  });

  describe('HTML content generation', () => {
    it('should set HTML on webview', () => {
      PluginConfigPanel.createOrShow(
        mockVscode,
        mockExtensionUri,
        samplePlugin,
        sampleManifest
      );

      // The HTML should have been set on the webview
      expect(typeof mockWebview.html).toBe('string');
    });

    it('should include CSP headers in HTML', () => {
      PluginConfigPanel.createOrShow(
        mockVscode,
        mockExtensionUri,
        samplePlugin,
        sampleManifest
      );

      expect(mockWebview.html).toContain('Content-Security-Policy');
    });

    it('should include VS Code API script', () => {
      PluginConfigPanel.createOrShow(
        mockVscode,
        mockExtensionUri,
        samplePlugin,
        sampleManifest
      );

      expect(mockWebview.html).toContain('acquireVsCodeApi()');
    });

    it('should include plugin ID', () => {
      PluginConfigPanel.createOrShow(
        mockVscode,
        mockExtensionUri,
        samplePlugin,
        sampleManifest
      );

      expect(mockWebview.html).toContain('test-plugin');
    });

    it('should include enabled toggle', () => {
      PluginConfigPanel.createOrShow(
        mockVscode,
        mockExtensionUri,
        samplePlugin,
        sampleManifest
      );

      expect(mockWebview.html).toContain('enabledToggle');
    });

    it('should include save button', () => {
      PluginConfigPanel.createOrShow(
        mockVscode,
        mockExtensionUri,
        samplePlugin,
        sampleManifest
      );

      expect(mockWebview.html).toContain('saveBtn');
    });

    it('should include settings fields from schema', () => {
      PluginConfigPanel.createOrShow(
        mockVscode,
        mockExtensionUri,
        samplePlugin,
        sampleManifest
      );

      expect(mockWebview.html).toContain('apiKey');
      expect(mockWebview.html).toContain('timeout');
    });

    it('should generate select for enum types', () => {
      PluginConfigPanel.createOrShow(
        mockVscode,
        mockExtensionUri,
        samplePlugin,
        sampleManifest
      );

      expect(mockWebview.html).toContain('<select');
      expect(mockWebview.html).toContain('fast');
      expect(mockWebview.html).toContain('balanced');
    });

    it('should include form reset button', () => {
      PluginConfigPanel.createOrShow(
        mockVscode,
        mockExtensionUri,
        samplePlugin,
        sampleManifest
      );

      expect(mockWebview.html).toContain('resetBtn');
    });

    it('should include JSON editor styles', () => {
      PluginConfigPanel.createOrShow(
        mockVscode,
        mockExtensionUri,
        samplePlugin,
        sampleManifest
      );

      expect(mockWebview.html).toContain('json-editor');
    });
  });

  describe('panel configuration', () => {
    it('should set title with plugin ID', () => {
      PluginConfigPanel.createOrShow(
        mockVscode,
        mockExtensionUri,
        samplePlugin,
        sampleManifest
      );

      expect(mockVscode.window.createWebviewPanel).toHaveBeenCalledWith(
        expect.any(String),
        'Configure: test-plugin',
        expect.any(Number),
        expect.any(Object)
      );
    });

    it('should enable scripts', () => {
      PluginConfigPanel.createOrShow(
        mockVscode,
        mockExtensionUri,
        samplePlugin,
        sampleManifest
      );

      expect(mockVscode.window.createWebviewPanel).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        expect.any(Number),
        expect.objectContaining({
          enableScripts: true,
        })
      );
    });

    it('should retain context when hidden', () => {
      PluginConfigPanel.createOrShow(
        mockVscode,
        mockExtensionUri,
        samplePlugin,
        sampleManifest
      );

      expect(mockVscode.window.createWebviewPanel).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        expect.any(Number),
        expect.objectContaining({
          retainContextWhenHidden: true,
        })
      );
    });
  });

  describe('webview URI resolution', () => {
    it('should resolve stylesheet URI', () => {
      PluginConfigPanel.createOrShow(
        mockVscode,
        mockExtensionUri,
        samplePlugin,
        sampleManifest
      );

      expect(mockVscode.Uri.joinPath).toHaveBeenCalledWith(
        mockExtensionUri,
        'media',
        'styles',
        'webview.css'
      );
    });
  });

  describe('dispose', () => {
    it('should call panel dispose', () => {
      const panel = PluginConfigPanel.createOrShow(
        mockVscode,
        mockExtensionUri,
        samplePlugin,
        sampleManifest
      );

      panel.dispose();

      expect(mockPanel.dispose).toHaveBeenCalled();
    });
  });

  describe('conflict detection', () => {
    it('should subscribe to config conflict events', () => {
      PluginConfigPanel.createOrShow(
        mockVscode,
        mockExtensionUri,
        samplePlugin,
        sampleManifest
      );

      expect(mockConfigService.onConfigConflict).toHaveBeenCalled();
    });

    it('should show warning message on conflict', async () => {
      PluginConfigPanel.createOrShow(
        mockVscode,
        mockExtensionUri,
        samplePlugin,
        sampleManifest
      );

      // Get the conflict callback registered with onConfigConflict
      const conflictCallback = (mockConfigService.onConfigConflict as ReturnType<typeof vi.fn>).mock.calls[0][0];

      // Trigger the conflict
      await conflictCallback({ externalChanges: true, webviewDirty: true });

      expect(mockVscode.window.showWarningMessage).toHaveBeenCalledWith(
        'Config file changed externally. Reload and lose your changes, or keep editing?',
        'Reload',
        'Keep'
      );
    });

    it('should refresh webview when user chooses Reload', async () => {
      const panel = PluginConfigPanel.createOrShow(
        mockVscode,
        mockExtensionUri,
        samplePlugin,
        sampleManifest
      );

      const updatedPlugin: PluginConfig = {
        id: 'test-plugin',
        enabled: false,
        settings: { apiKey: 'updated', timeout: 60 },
      };
      (mockConfigService.getPlugin as ReturnType<typeof vi.fn>).mockReturnValue(updatedPlugin);
      (mockVscode.window.showWarningMessage as ReturnType<typeof vi.fn>).mockResolvedValue('Reload');

      // Get the conflict callback
      const conflictCallback = (mockConfigService.onConfigConflict as ReturnType<typeof vi.fn>).mock.calls[0][0];

      await conflictCallback({ externalChanges: true, webviewDirty: true });

      // Should clear dirty flag
      expect(mockConfigService.setWebviewDirty).toHaveBeenCalledWith(false);
    });

    it('should do nothing when user chooses Keep', async () => {
      PluginConfigPanel.createOrShow(
        mockVscode,
        mockExtensionUri,
        samplePlugin,
        sampleManifest
      );

      (mockVscode.window.showWarningMessage as ReturnType<typeof vi.fn>).mockResolvedValue('Keep');

      // Get the conflict callback
      const conflictCallback = (mockConfigService.onConfigConflict as ReturnType<typeof vi.fn>).mock.calls[0][0];

      await conflictCallback({ externalChanges: true, webviewDirty: true });

      // Should NOT clear dirty flag
      expect(mockConfigService.setWebviewDirty).not.toHaveBeenCalledWith(false);
    });

    it('should mark webview dirty on configEdited message', () => {
      PluginConfigPanel.createOrShow(
        mockVscode,
        mockExtensionUri,
        samplePlugin,
        sampleManifest
      );

      // Get the message handler registered with onDidReceiveMessage
      const messageHandler = (mockWebview.onDidReceiveMessage as ReturnType<typeof vi.fn>).mock.calls[0][0];

      // Send configEdited message
      messageHandler({ type: 'configEdited' });

      expect(mockConfigService.setWebviewDirty).toHaveBeenCalledWith(true);
    });

    it('should include configEdited postMessage in webview scripts', () => {
      PluginConfigPanel.createOrShow(
        mockVscode,
        mockExtensionUri,
        samplePlugin,
        sampleManifest
      );

      expect(mockWebview.html).toContain("postMessage('configEdited')");
    });
  });
});
