import type * as vscode from 'vscode';
import { createScopedLogger, DisposableManager } from '../utils';

const log = createScopedLogger('WebviewBase');

/**
 * Message types for webview communication.
 */
export interface WebviewMessage<T = unknown> {
  type: string;
  payload?: T;
}

/**
 * Options for creating a webview panel.
 */
export interface WebviewPanelOptions {
  /** Panel view type identifier */
  viewType: string;
  /** Panel title */
  title: string;
  /** Column to show panel in */
  column?: vscode.ViewColumn;
  /** Enable scripts in the webview */
  enableScripts?: boolean;
  /** Retain context when hidden */
  retainContextWhenHidden?: boolean;
  /** Local resource roots for the webview */
  localResourceRoots?: vscode.Uri[];
}

/**
 * Abstract base class for VS Code webview panels.
 *
 * Provides common functionality for webview panels:
 * - Panel lifecycle management (create, reveal, dispose)
 * - Bidirectional message passing between extension and webview
 * - HTML content generation with security nonce
 * - Resource URI resolution for local files
 * - Theme-aware styling support
 *
 * Subclasses must implement:
 * - getHtmlContent(): Returns the webview HTML content
 * - handleMessage(): Processes messages from the webview
 *
 * @example
 * ```typescript
 * class MyPanel extends WebviewBase {
 *   protected getHtmlContent(webview: vscode.Webview): string {
 *     return `<!DOCTYPE html>...`;
 *   }
 *
 *   protected handleMessage(message: WebviewMessage): void {
 *     if (message.type === 'save') {
 *       // Handle save
 *     }
 *   }
 * }
 * ```
 */
export abstract class WebviewBase {
  protected readonly _vscodeModule: typeof vscode;
  protected readonly _extensionUri: vscode.Uri;
  protected readonly _disposables = new DisposableManager();

  private _panel: vscode.WebviewPanel | null = null;
  private readonly _viewType: string;
  private readonly _title: string;
  private readonly _column: vscode.ViewColumn;
  private readonly _enableScripts: boolean;
  private readonly _retainContextWhenHidden: boolean;
  private readonly _localResourceRoots: vscode.Uri[];
  private _messageQueue: WebviewMessage[] = [];
  private _flushTimeout: ReturnType<typeof setTimeout> | null = null;

  /**
   * Create a new WebviewBase instance.
   *
   * @param vscodeModule The VS Code module
   * @param extensionUri The extension's URI for resource resolution
   * @param options Panel options
   */
  constructor(
    vscodeModule: typeof vscode,
    extensionUri: vscode.Uri,
    options: WebviewPanelOptions
  ) {
    this._vscodeModule = vscodeModule;
    this._extensionUri = extensionUri;
    this._viewType = options.viewType;
    this._title = options.title;
    this._column = options.column ?? vscodeModule.ViewColumn.One;
    this._enableScripts = options.enableScripts ?? true;
    this._retainContextWhenHidden = options.retainContextWhenHidden ?? true;
    this._localResourceRoots = options.localResourceRoots ?? [extensionUri];
  }

  /**
   * Get the underlying webview panel.
   * Returns null if the panel hasn't been created or has been disposed.
   */
  get panel(): vscode.WebviewPanel | null {
    return this._panel;
  }

  /**
   * Check if the panel is currently visible.
   */
  get isVisible(): boolean {
    return this._panel?.visible ?? false;
  }

  /**
   * Show the webview panel.
   * Creates a new panel if one doesn't exist, or reveals the existing panel.
   */
  show(): void {
    if (this._panel) {
      this._panel.reveal(this._column);
      return;
    }

    this._createPanel();
  }

  /**
   * Update the panel title.
   */
  setTitle(title: string): void {
    if (this._panel) {
      this._panel.title = title;
    }
  }

  /**
   * Refresh the webview content.
   * Useful when underlying data has changed.
   */
  refresh(): void {
    if (this._panel) {
      this._panel.webview.html = this.getHtmlContent(this._panel.webview);
    }
  }

  /**
   * Post a message to the webview.
   * Messages are batched and sent on the next tick for better performance.
   *
   * @param message The message to send
   * @returns Promise that resolves when the message is posted
   */
  async postMessage(message: WebviewMessage): Promise<boolean> {
    if (!this._panel) {
      log.warn('Cannot post message: panel not created');
      return false;
    }

    // Add message to queue
    this._messageQueue.push(message);

    // Schedule flush if not already scheduled
    if (this._flushTimeout === null) {
      this._flushTimeout = setTimeout(() => this._flushMessages(), 0);
    }

    return true;
  }

  /**
   * Flush all queued messages to the webview.
   * Sends messages in a single batch for better performance.
   */
  private async _flushMessages(): Promise<void> {
    this._flushTimeout = null;

    if (this._messageQueue.length === 0 || !this._panel) {
      return;
    }

    // Take all queued messages
    const messages = this._messageQueue.splice(0);

    // Send as a batch if multiple messages, or single message if only one
    if (messages.length === 1) {
      await this._panel.webview.postMessage(messages[0]);
    } else {
      await this._panel.webview.postMessage({
        type: 'batch',
        payload: { messages },
      });
    }
  }

  /**
   * Dispose of the webview panel and clean up resources.
   */
  dispose(): void {
    // Clear any pending message flush
    if (this._flushTimeout !== null) {
      clearTimeout(this._flushTimeout);
      this._flushTimeout = null;
    }
    this._messageQueue = [];

    this._panel?.dispose();
    this._panel = null;
    this._disposables.dispose();
    log.debug(`WebviewBase disposed: ${this._viewType}`);
  }

  /**
   * Get the HTML content for the webview.
   * Subclasses must implement this method.
   *
   * @param webview The webview to get content for
   * @returns HTML string for the webview
   */
  protected abstract getHtmlContent(webview: vscode.Webview): string;

  /**
   * Handle a message from the webview.
   * Subclasses must implement this method.
   *
   * @param message The message received from the webview
   */
  protected abstract handleMessage(message: WebviewMessage): void;

  /**
   * Called when the panel is disposed.
   * Subclasses can override to perform cleanup.
   */
  protected onDispose(): void {
    // Subclasses can override
  }

  /**
   * Create the webview panel.
   */
  private _createPanel(): void {
    const { window } = this._vscodeModule;

    this._panel = window.createWebviewPanel(
      this._viewType,
      this._title,
      this._column,
      {
        enableScripts: this._enableScripts,
        retainContextWhenHidden: this._retainContextWhenHidden,
        localResourceRoots: this._localResourceRoots,
      }
    );

    // Set initial HTML content
    this._panel.webview.html = this.getHtmlContent(this._panel.webview);

    // Handle messages from the webview
    this._disposables.add(
      this._panel.webview.onDidReceiveMessage(
        (message: WebviewMessage) => {
          log.debug(`Received message: ${message.type}`);
          this.handleMessage(message);
        },
        undefined
      )
    );

    // Handle panel disposal
    this._disposables.add(
      this._panel.onDidDispose(() => {
        this._panel = null;
        this.onDispose();
        log.debug(`Panel disposed: ${this._viewType}`);
      })
    );

    log.debug(`Panel created: ${this._viewType}`);
  }

  /**
   * Generate a nonce for Content Security Policy.
   * @returns A random 32-character nonce string
   */
  protected getNonce(): string {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
      text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
  }

  /**
   * Get a webview URI for a local resource.
   *
   * @param webview The webview to get URI for
   * @param pathSegments Path segments relative to extension root
   * @returns URI that can be used in the webview
   */
  protected getWebviewUri(webview: vscode.Webview, ...pathSegments: string[]): vscode.Uri {
    return webview.asWebviewUri(
      this._vscodeModule.Uri.joinPath(this._extensionUri, ...pathSegments)
    );
  }

  /**
   * Generate the base HTML template with security headers and common styles.
   *
   * @param webview The webview
   * @param options Template options
   * @returns HTML string
   */
  protected getBaseHtml(
    webview: vscode.Webview,
    options: {
      title: string;
      body: string;
      scripts?: string;
      styles?: string;
    }
  ): string {
    const nonce = this.getNonce();
    const styleUri = this.getWebviewUri(webview, 'media', 'styles', 'webview.css');
    const cspSource = webview.cspSource;

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; font-src ${cspSource};">
  <link href="${styleUri}" rel="stylesheet">
  ${options.styles ?? ''}
  <title>${options.title}</title>
</head>
<body>
  ${options.body}
  <script nonce="${nonce}">
    // VS Code API access
    const vscode = acquireVsCodeApi();

    // Helper to post message to extension
    function postMessage(type, payload) {
      vscode.postMessage({ type, payload });
    }

    // Helper to restore state
    function getState() {
      return vscode.getState() || {};
    }

    // Helper to save state
    function setState(state) {
      vscode.setState(state);
    }

    ${options.scripts ?? ''}
  </script>
</body>
</html>`;
  }
}
