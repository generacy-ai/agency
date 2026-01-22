import { describe, it, expect, vi, beforeEach } from 'vitest';
import type * as vscode from 'vscode';
import { WebviewBase, type WebviewMessage } from '../../views/webview-base';

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

/**
 * Test implementation of WebviewBase for testing purposes.
 */
class TestWebviewPanel extends WebviewBase {
  public receivedMessages: WebviewMessage[] = [];
  public onDisposeCallCount = 0;

  constructor(vscodeModule: typeof vscode, extensionUri: vscode.Uri) {
    super(vscodeModule, extensionUri, {
      viewType: 'test.webview',
      title: 'Test Panel',
      column: vscodeModule.ViewColumn.One,
      enableScripts: true,
    });
  }

  protected getHtmlContent(webview: vscode.Webview): string {
    return this.getBaseHtml(webview, {
      title: 'Test',
      body: '<div id="test">Hello</div>',
      scripts: 'console.log("test");',
    });
  }

  protected handleMessage(message: WebviewMessage): void {
    this.receivedMessages.push(message);
  }

  protected override onDispose(): void {
    this.onDisposeCallCount++;
  }

  // Expose protected methods for testing
  public testGetNonce(): string {
    return this.getNonce();
  }

  public testGetWebviewUri(webview: vscode.Webview, ...pathSegments: string[]): vscode.Uri {
    return this.getWebviewUri(webview, ...pathSegments);
  }
}

describe('WebviewBase', () => {
  let mockVscode: typeof vscode;
  let mockExtensionUri: vscode.Uri;
  let mockPanel: vscode.WebviewPanel;
  let mockWebview: vscode.Webview;
  let messageHandler: ((message: WebviewMessage) => void) | null = null;
  let disposeHandler: (() => void) | null = null;

  beforeEach(() => {
    vi.clearAllMocks();
    messageHandler = null;
    disposeHandler = null;

    // Create mock webview
    mockWebview = {
      html: '',
      cspSource: 'https://test.com',
      onDidReceiveMessage: vi.fn((handler) => {
        messageHandler = handler;
        return { dispose: vi.fn() };
      }),
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
      onDidDispose: vi.fn((handler) => {
        disposeHandler = handler;
        return { dispose: vi.fn() };
      }),
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
  });

  describe('constructor', () => {
    it('should create instance with correct options', () => {
      const panel = new TestWebviewPanel(mockVscode, mockExtensionUri);

      expect(panel).toBeInstanceOf(WebviewBase);
      expect(panel.panel).toBeNull(); // Panel not created until show()
    });
  });

  describe('show()', () => {
    it('should create panel when first called', () => {
      const panel = new TestWebviewPanel(mockVscode, mockExtensionUri);

      panel.show();

      expect(mockVscode.window.createWebviewPanel).toHaveBeenCalledWith(
        'test.webview',
        'Test Panel',
        1,
        expect.objectContaining({
          enableScripts: true,
          retainContextWhenHidden: true,
        })
      );
    });

    it('should set HTML content on panel creation', () => {
      const panel = new TestWebviewPanel(mockVscode, mockExtensionUri);

      panel.show();

      expect(mockWebview.html).toContain('<!DOCTYPE html>');
      expect(mockWebview.html).toContain('<div id="test">Hello</div>');
    });

    it('should reveal existing panel on subsequent calls', () => {
      const panel = new TestWebviewPanel(mockVscode, mockExtensionUri);

      panel.show();
      panel.show();

      expect(mockVscode.window.createWebviewPanel).toHaveBeenCalledTimes(1);
      expect(mockPanel.reveal).toHaveBeenCalledTimes(1);
    });
  });

  describe('isVisible', () => {
    it('should return false when panel not created', () => {
      const panel = new TestWebviewPanel(mockVscode, mockExtensionUri);

      expect(panel.isVisible).toBe(false);
    });

    it('should return panel visibility state', () => {
      const panel = new TestWebviewPanel(mockVscode, mockExtensionUri);
      panel.show();

      expect(panel.isVisible).toBe(true);
    });
  });

  describe('setTitle()', () => {
    it('should update panel title', () => {
      const panel = new TestWebviewPanel(mockVscode, mockExtensionUri);
      panel.show();

      panel.setTitle('New Title');

      expect(mockPanel.title).toBe('New Title');
    });

    it('should do nothing if panel not created', () => {
      const panel = new TestWebviewPanel(mockVscode, mockExtensionUri);

      // Should not throw
      panel.setTitle('New Title');
    });
  });

  describe('refresh()', () => {
    it('should update webview HTML content', () => {
      const panel = new TestWebviewPanel(mockVscode, mockExtensionUri);
      panel.show();

      const initialHtml = mockWebview.html;
      panel.refresh();

      // HTML should be regenerated (contains a new nonce)
      expect(mockWebview.html).toContain('<!DOCTYPE html>');
      // The HTML may have different nonces, but structure should be same
      expect(mockWebview.html).toContain('<div id="test">Hello</div>');
    });
  });

  describe('postMessage()', () => {
    it('should post message to webview', async () => {
      const panel = new TestWebviewPanel(mockVscode, mockExtensionUri);
      panel.show();

      const message: WebviewMessage = { type: 'test', payload: { data: 'value' } };
      const result = await panel.postMessage(message);

      expect(result).toBe(true);
      expect(mockWebview.postMessage).toHaveBeenCalledWith(message);
    });

    it('should return false if panel not created', async () => {
      const panel = new TestWebviewPanel(mockVscode, mockExtensionUri);

      const message: WebviewMessage = { type: 'test' };
      const result = await panel.postMessage(message);

      expect(result).toBe(false);
      expect(mockWebview.postMessage).not.toHaveBeenCalled();
    });
  });

  describe('message handling', () => {
    it('should receive and process messages from webview', () => {
      const panel = new TestWebviewPanel(mockVscode, mockExtensionUri);
      panel.show();

      const message: WebviewMessage = { type: 'testMessage', payload: { foo: 'bar' } };
      messageHandler?.(message);

      expect(panel.receivedMessages).toHaveLength(1);
      expect(panel.receivedMessages[0]).toEqual(message);
    });
  });

  describe('dispose()', () => {
    it('should dispose panel', () => {
      const panel = new TestWebviewPanel(mockVscode, mockExtensionUri);
      panel.show();

      panel.dispose();

      expect(mockPanel.dispose).toHaveBeenCalled();
      expect(panel.panel).toBeNull();
    });

    it('should be idempotent', () => {
      const panel = new TestWebviewPanel(mockVscode, mockExtensionUri);
      panel.show();

      panel.dispose();
      panel.dispose();

      expect(mockPanel.dispose).toHaveBeenCalledTimes(1);
    });
  });

  describe('onDispose callback', () => {
    it('should call onDispose when panel is disposed by user', () => {
      const panel = new TestWebviewPanel(mockVscode, mockExtensionUri);
      panel.show();

      // Simulate user closing the panel
      disposeHandler?.();

      expect(panel.onDisposeCallCount).toBe(1);
      expect(panel.panel).toBeNull();
    });
  });

  describe('getNonce()', () => {
    it('should return 32-character string', () => {
      const panel = new TestWebviewPanel(mockVscode, mockExtensionUri);

      const nonce = panel.testGetNonce();

      expect(nonce).toHaveLength(32);
      expect(nonce).toMatch(/^[A-Za-z0-9]+$/);
    });

    it('should return different values on each call', () => {
      const panel = new TestWebviewPanel(mockVscode, mockExtensionUri);

      const nonce1 = panel.testGetNonce();
      const nonce2 = panel.testGetNonce();

      expect(nonce1).not.toBe(nonce2);
    });
  });

  describe('getWebviewUri()', () => {
    it('should return webview URI for local resource', () => {
      const panel = new TestWebviewPanel(mockVscode, mockExtensionUri);
      panel.show();

      const uri = panel.testGetWebviewUri(mockWebview, 'media', 'styles', 'webview.css');

      expect(mockVscode.Uri.joinPath).toHaveBeenCalledWith(
        mockExtensionUri,
        'media',
        'styles',
        'webview.css'
      );
    });
  });

  describe('getBaseHtml()', () => {
    it('should generate HTML with CSP headers', () => {
      const panel = new TestWebviewPanel(mockVscode, mockExtensionUri);
      panel.show();

      const html = mockWebview.html;

      expect(html).toContain('Content-Security-Policy');
      expect(html).toContain("default-src 'none'");
      expect(html).toContain('nonce-');
    });

    it('should include VS Code API script', () => {
      const panel = new TestWebviewPanel(mockVscode, mockExtensionUri);
      panel.show();

      const html = mockWebview.html;

      expect(html).toContain('acquireVsCodeApi()');
      expect(html).toContain('postMessage');
      expect(html).toContain('getState');
      expect(html).toContain('setState');
    });

    it('should include custom scripts', () => {
      const panel = new TestWebviewPanel(mockVscode, mockExtensionUri);
      panel.show();

      const html = mockWebview.html;

      expect(html).toContain('console.log("test");');
    });
  });
});
