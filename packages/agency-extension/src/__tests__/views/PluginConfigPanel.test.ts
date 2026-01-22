import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type * as vscode from 'vscode';
import type { PluginConfig, PluginManifest } from '../../types';
import { PluginConfigPanel, _clearPanels } from '../../views/plugins/PluginConfigPanel';
import { ConfigService } from '../../services';

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
vi.mock('../../services', () => ({
  ConfigService: {
    getInstance: vi.fn(),
  },
}));

describe('PluginConfigPanel', () => {
  let mockVscode: typeof vscode;
  let mockExtensionUri: vscode.Uri;
  let mockPanel: vscode.WebviewPanel;
  let mockWebview: vscode.Webview;
  let mockConfigService: Partial<ConfigService>;

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
      },
    } as unknown as typeof vscode;

    // Create mock ConfigService
    mockConfigService = {
      getPlugin: vi.fn().mockReturnValue(samplePlugin),
      getPlugins: vi.fn().mockReturnValue([samplePlugin]),
      savePluginConfig: vi.fn().mockResolvedValue(undefined),
      onConfigChange: vi.fn().mockReturnValue({ dispose: vi.fn() }),
    };

    (ConfigService.getInstance as ReturnType<typeof vi.fn>).mockReturnValue(mockConfigService);
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

    it('should show empty state when plugin has no settings and no schema', () => {
      const emptyPlugin: PluginConfig = { id: 'empty-plugin', enabled: true, settings: {} };
      PluginConfigPanel.createOrShow(mockVscode, mockExtensionUri, emptyPlugin);

      expect(mockWebview.html).toContain('No Settings');
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
});
