import type * as vscode from 'vscode';
import type { ContainerInfo, ContainerLogEntry, ContainerLogOptions } from '../../types';
import { WebviewBase, type WebviewMessage } from '../webview-base';
import { ContainerService } from '../../services';
import { createScopedLogger } from '../../utils';

const log = createScopedLogger('ContainerDetailPanel');

/**
 * View type identifier for the container detail panel.
 */
const VIEW_TYPE = 'agency.containerDetail';

// ─────────────────────────────────────────────────────────────────────────────
// Message Types (Extension ↔ Webview)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Message sent when the webview is initialized.
 */
interface InitMessage {
  type: 'init';
}

/**
 * Message sent to start a container.
 */
interface StartContainerMessage {
  type: 'startContainer';
}

/**
 * Message sent to stop a container.
 */
interface StopContainerMessage {
  type: 'stopContainer';
}

/**
 * Message sent to rebuild a container.
 */
interface RebuildContainerMessage {
  type: 'rebuildContainer';
}

/**
 * Message sent when log filter changes.
 */
interface FilterLogsMessage {
  type: 'filterLogs';
  payload: {
    filter: string;
    streamFilter?: 'all' | 'stdout' | 'stderr';
  };
}

/**
 * All incoming message types.
 */
type IncomingMessage =
  | InitMessage
  | StartContainerMessage
  | StopContainerMessage
  | RebuildContainerMessage
  | FilterLogsMessage;

/**
 * Message sent with container data.
 */
interface ContainerDataMessage {
  type: 'containerData';
  payload: {
    container: ContainerInfo;
  };
}

/**
 * Message sent with log entries.
 */
interface LogDataMessage {
  type: 'logData';
  payload: {
    logs: Array<{ content: string; timestamp: number; stream: 'stdout' | 'stderr' }>;
    append: boolean;
  };
}

/**
 * Message sent with action result.
 */
interface ActionResultMessage {
  type: 'actionResult';
  payload: {
    action: string;
    success: boolean;
    error?: string;
  };
}

/**
 * All outgoing message types.
 */
type _OutgoingMessage = ContainerDataMessage | LogDataMessage | ActionResultMessage;

// ─────────────────────────────────────────────────────────────────────────────
// Panel Tracking
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Active panel instances (one per container).
 */
const panelInstances = new Map<string, ContainerDetailPanel>();

/**
 * Clear all panel instances (for testing).
 * @internal
 */
export function _clearPanels(): void {
  for (const panel of panelInstances.values()) {
    panel.dispose();
  }
  panelInstances.clear();
}

// ─────────────────────────────────────────────────────────────────────────────
// ContainerDetailPanel Class
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Webview panel for displaying container details and logs.
 *
 * Features:
 * - Container metadata display (image, ports, workspace path)
 * - Real-time log streaming
 * - Log filtering and search
 * - Action buttons (start/stop/rebuild)
 *
 * @example
 * ```typescript
 * const panel = ContainerDetailPanel.createOrShow(vscode, extensionUri, containerId);
 * ```
 */
export class ContainerDetailPanel extends WebviewBase {
  private readonly _containerService: ContainerService;
  private _containerId: string;
  private _container: ContainerInfo | null = null;
  private _logFilter = '';
  private _streamFilter: 'all' | 'stdout' | 'stderr' = 'all';
  private _logStreamProcess: (() => void) | null = null;
  private _logs: ContainerLogEntry[] = [];

  private constructor(
    vscodeModule: typeof vscode,
    extensionUri: vscode.Uri,
    containerId: string
  ) {
    super(vscodeModule, extensionUri, {
      viewType: VIEW_TYPE,
      title: `Container: ${containerId.substring(0, 12)}`,
      column: vscodeModule.ViewColumn.Two,
      enableScripts: true,
      retainContextWhenHidden: true,
    });

    this._containerService = ContainerService.getInstance();
    this._containerId = containerId;

    // Load container data
    this._loadContainer();
  }

  /**
   * Create or show the container detail panel for a specific container.
   * Reuses existing panel if already open for this container.
   *
   * @param vscodeModule The VS Code module
   * @param extensionUri The extension's URI
   * @param containerId The container ID
   * @returns The panel instance
   */
  static createOrShow(
    vscodeModule: typeof vscode,
    extensionUri: vscode.Uri,
    containerId: string
  ): ContainerDetailPanel {
    // Return existing panel if available for this container
    const existingPanel = panelInstances.get(containerId);
    if (existingPanel) {
      existingPanel.show();
      return existingPanel;
    }

    // Create new panel
    const panel = new ContainerDetailPanel(vscodeModule, extensionUri, containerId);
    panel.show();
    panelInstances.set(containerId, panel);

    log.info(`Created container detail panel for ${containerId}`);
    return panel;
  }

  /**
   * Set the container being displayed.
   * Updates the panel with new container data and refreshes logs.
   *
   * @param containerId The container ID
   */
  async setContainer(containerId: string): Promise<void> {
    this._containerId = containerId;
    this._logs = [];
    this._logFilter = '';
    await this._loadContainer();
    this.setTitle(`Container: ${containerId.substring(0, 12)}`);
  }

  /**
   * Dispose of the panel and clean up resources.
   */
  override dispose(): void {
    if (this._logStreamProcess) {
      this._logStreamProcess();
      this._logStreamProcess = null;
    }
    panelInstances.delete(this._containerId);
    super.dispose();
  }

  /**
   * Handle when panel is disposed (e.g., user closes it).
   */
  protected override onDispose(): void {
    if (this._logStreamProcess) {
      this._logStreamProcess();
      this._logStreamProcess = null;
    }
    panelInstances.delete(this._containerId);
  }

  /**
   * Handle messages from the webview.
   */
  protected handleMessage(message: WebviewMessage): void {
    // Validate message structure
    if (!message || typeof message.type !== 'string') {
      log.debug(`Ignoring invalid message: ${JSON.stringify(message)}`);
      return;
    }

    // Ignore VS Code internal messages
    if (message.type.includes('object') || message.type.startsWith('vscode')) {
      return;
    }

    const msg = message as IncomingMessage;

    switch (msg.type) {
      case 'init':
        this._handleInit();
        break;

      case 'startContainer':
        this._handleStartContainer();
        break;

      case 'stopContainer':
        this._handleStopContainer();
        break;

      case 'rebuildContainer':
        this._handleRebuildContainer();
        break;

      case 'filterLogs':
        this._handleFilterLogs(msg.payload.filter, msg.payload.streamFilter);
        break;

      default:
        log.debug(`Ignoring unknown message type: ${(msg as { type: string }).type}`);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Message Handlers
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Handle init message - send initial data to webview.
   */
  private _handleInit(): void {
    if (this._container) {
      this._sendContainerData();
      this._sendLogs(false);
    }
  }

  /**
   * Handle start container request.
   */
  private async _handleStartContainer(): Promise<void> {
    try {
      const result = await this._containerService.startContainer(this._containerId);
      await this.postMessage({
        type: 'actionResult',
        payload: {
          action: 'start',
          success: result.success,
          error: result.error,
        },
      } as ActionResultMessage);

      if (result.success) {
        await this._loadContainer();
      }
    } catch (error) {
      log.error('Failed to start container', error);
      await this.postMessage({
        type: 'actionResult',
        payload: {
          action: 'start',
          success: false,
          error: error instanceof Error ? error.message : String(error),
        },
      } as ActionResultMessage);
    }
  }

  /**
   * Handle stop container request.
   */
  private async _handleStopContainer(): Promise<void> {
    try {
      const result = await this._containerService.stopContainer(this._containerId);
      await this.postMessage({
        type: 'actionResult',
        payload: {
          action: 'stop',
          success: result.success,
          error: result.error,
        },
      } as ActionResultMessage);

      if (result.success) {
        await this._loadContainer();
      }
    } catch (error) {
      log.error('Failed to stop container', error);
      await this.postMessage({
        type: 'actionResult',
        payload: {
          action: 'stop',
          success: false,
          error: error instanceof Error ? error.message : String(error),
        },
      } as ActionResultMessage);
    }
  }

  /**
   * Handle rebuild container request.
   */
  private async _handleRebuildContainer(): Promise<void> {
    try {
      const result = await this._containerService.rebuildContainer(this._containerId);
      await this.postMessage({
        type: 'actionResult',
        payload: {
          action: 'rebuild',
          success: result.success,
          error: result.error,
        },
      } as ActionResultMessage);

      if (result.success) {
        await this._loadContainer();
      }
    } catch (error) {
      log.error('Failed to rebuild container', error);
      await this.postMessage({
        type: 'actionResult',
        payload: {
          action: 'rebuild',
          success: false,
          error: error instanceof Error ? error.message : String(error),
        },
      } as ActionResultMessage);
    }
  }

  /**
   * Handle log filter change.
   */
  private _handleFilterLogs(
    filter: string,
    streamFilter?: 'all' | 'stdout' | 'stderr'
  ): void {
    this._logFilter = filter.toLowerCase();
    if (streamFilter !== undefined) {
      this._streamFilter = streamFilter;
    }
    this._sendLogs(false);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Helper Methods
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Load container data from the service.
   */
  private async _loadContainer(): Promise<void> {
    try {
      this._container = await this._containerService.getContainer(this._containerId) ?? null;
      if (!this._container) {
        log.warn(`Container ${this._containerId} not found`);
        return;
      }

      this._sendContainerData();
      await this._startLogStreaming();
    } catch (error) {
      log.error('Failed to load container', error);
    }
  }

  /**
   * Send container data to the webview.
   */
  private _sendContainerData(): void {
    if (!this._container) return;

    this.postMessage({
      type: 'containerData',
      payload: {
        container: this._container,
      },
    } as ContainerDataMessage);
  }

  /**
   * Start streaming logs from the container.
   */
  private async _startLogStreaming(): Promise<void> {
    // Stop any existing stream
    if (this._logStreamProcess) {
      this._logStreamProcess();
      this._logStreamProcess = null;
    }

    this._logs = [];

    const options: ContainerLogOptions = {
      tail: 100,
      follow: true,
      timestamps: true,
    };

    try {
      const logStream = this._containerService.getContainerLogs(this._containerId, options);

      // Process logs asynchronously
      (async () => {
        try {
          for await (const entry of logStream) {
            this._logs.push(entry);

            // Keep only last 500 logs in memory
            if (this._logs.length > 500) {
              this._logs.shift();
            }

            // Send to webview with filter applied
            this._sendLogs(true);
          }
        } catch (error) {
          log.error('Log streaming error', error);
        }
      })();

      // Store cleanup function
      this._logStreamProcess = () => {
        log.debug('Stopping log stream');
        // Async iterator cleanup happens automatically when we break
      };
    } catch (error) {
      log.error('Failed to start log streaming', error);
    }
  }

  /**
   * Send logs to the webview.
   */
  private _sendLogs(append: boolean): void {
    const filteredLogs = this._logs
      .filter((entry) => {
        // Apply stream filter
        if (this._streamFilter !== 'all' && entry.stream !== this._streamFilter) {
          return false;
        }
        // Apply text filter
        if (this._logFilter && !entry.content.toLowerCase().includes(this._logFilter)) {
          return false;
        }
        return true;
      })
      .map((entry) => ({
        content: entry.content,
        timestamp: entry.timestamp,
        stream: entry.stream,
      }));

    this.postMessage({
      type: 'logData',
      payload: {
        logs: filteredLogs,
        append,
      },
    } as LogDataMessage);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // HTML Content Generation
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Generate HTML for the webview.
   */
  protected getHtmlContent(webview: vscode.Webview): string {
    const body = `
      <div class="container-detail-wrapper">
        <!-- Header -->
        <header class="detail-header">
          <h1 id="containerName">Container Details</h1>
          <div class="header-actions">
            <button type="button" id="startBtn" class="action-btn start" title="Start container">
              Start
            </button>
            <button type="button" id="stopBtn" class="action-btn stop" title="Stop container">
              Stop
            </button>
            <button type="button" id="rebuildBtn" class="action-btn rebuild" title="Rebuild container">
              Rebuild
            </button>
          </div>
        </header>

        <!-- Container Info Section -->
        <section class="container-info" id="containerInfo">
          <div class="info-row">
            <span class="info-label">Status:</span>
            <span class="info-value" id="infoStatus">-</span>
          </div>
          <div class="info-row">
            <span class="info-label">Image:</span>
            <span class="info-value" id="infoImage">-</span>
          </div>
          <div class="info-row">
            <span class="info-label">Ports:</span>
            <span class="info-value" id="infoPorts">-</span>
          </div>
          <div class="info-row">
            <span class="info-label">Workspace:</span>
            <span class="info-value" id="infoWorkspace">-</span>
          </div>
        </section>

        <!-- Log Viewer Section -->
        <section class="log-section">
          <div class="log-controls">
            <input
              type="text"
              id="logFilter"
              placeholder="Filter logs..."
              class="log-filter-input"
            />
            <select id="streamFilter" class="stream-filter-select">
              <option value="all">All streams</option>
              <option value="stdout">stdout only</option>
              <option value="stderr">stderr only</option>
            </select>
          </div>
          <div class="log-viewer" id="logViewer">
            <div class="log-content" id="logContent">
              <!-- Logs will be appended here -->
            </div>
          </div>
        </section>
      </div>
    `;

    const scripts = `
      // State
      let container = null;
      let logs = [];
      let autoScroll = true;

      // DOM Elements
      const containerName = document.getElementById('containerName');
      const startBtn = document.getElementById('startBtn');
      const stopBtn = document.getElementById('stopBtn');
      const rebuildBtn = document.getElementById('rebuildBtn');
      const infoStatus = document.getElementById('infoStatus');
      const infoImage = document.getElementById('infoImage');
      const infoPorts = document.getElementById('infoPorts');
      const infoWorkspace = document.getElementById('infoWorkspace');
      const logFilter = document.getElementById('logFilter');
      const streamFilter = document.getElementById('streamFilter');
      const logViewer = document.getElementById('logViewer');
      const logContent = document.getElementById('logContent');

      // Event Listeners
      startBtn.addEventListener('click', () => {
        postMessage('startContainer');
        startBtn.disabled = true;
      });

      stopBtn.addEventListener('click', () => {
        postMessage('stopContainer');
        stopBtn.disabled = true;
      });

      rebuildBtn.addEventListener('click', () => {
        if (confirm('Are you sure you want to rebuild this container?')) {
          postMessage('rebuildContainer');
          rebuildBtn.disabled = true;
        }
      });

      logFilter.addEventListener('input', () => {
        const filter = logFilter.value;
        const stream = streamFilter.value;
        postMessage('filterLogs', { filter, streamFilter: stream });
      });

      streamFilter.addEventListener('change', () => {
        const filter = logFilter.value;
        const stream = streamFilter.value;
        postMessage('filterLogs', { filter, streamFilter: stream });
      });

      logViewer.addEventListener('scroll', () => {
        const threshold = 50;
        const position = logViewer.scrollHeight - logViewer.scrollTop - logViewer.clientHeight;
        autoScroll = position < threshold;
      });

      // Message Handler
      window.addEventListener('message', (event) => {
        const message = event.data;

        switch (message.type) {
          case 'containerData':
            handleContainerData(message.payload.container);
            break;

          case 'logData':
            handleLogData(message.payload.logs, message.payload.append);
            break;

          case 'actionResult':
            handleActionResult(message.payload);
            break;
        }
      });

      function handleContainerData(data) {
        container = data;
        containerName.textContent = data.name;
        infoStatus.textContent = data.status;
        infoStatus.className = 'info-value status-' + data.status;
        infoImage.textContent = data.image;

        if (data.ports && data.ports.length > 0) {
          infoPorts.textContent = data.ports.map(p => p.host + ':' + p.container).join(', ');
        } else {
          infoPorts.textContent = 'None';
        }

        infoWorkspace.textContent = data.workspacePath || 'N/A';

        // Update button states
        startBtn.disabled = data.status === 'running';
        stopBtn.disabled = data.status !== 'running';
        rebuildBtn.disabled = !data.isDevContainer;
      }

      function handleLogData(newLogs, append) {
        if (!append) {
          logContent.innerHTML = '';
          logs = [];
        }

        logs = logs.concat(newLogs);

        // Render new logs
        for (const log of newLogs) {
          const logLine = document.createElement('div');
          logLine.className = 'log-line log-stream-' + log.stream;

          const timestamp = document.createElement('span');
          timestamp.className = 'log-timestamp';
          timestamp.textContent = formatTime(log.timestamp);

          const streamBadge = document.createElement('span');
          streamBadge.className = 'log-stream-badge log-stream-' + log.stream;
          streamBadge.textContent = log.stream;

          const content = document.createElement('span');
          content.className = 'log-text';
          content.textContent = log.content;

          logLine.appendChild(timestamp);
          logLine.appendChild(streamBadge);
          logLine.appendChild(content);
          logContent.appendChild(logLine);
        }

        // Auto-scroll if enabled
        if (autoScroll) {
          logViewer.scrollTop = logViewer.scrollHeight;
        }
      }

      function handleActionResult(result) {
        // Re-enable buttons
        startBtn.disabled = false;
        stopBtn.disabled = false;
        rebuildBtn.disabled = false;

        if (!result.success) {
          alert('Action failed: ' + (result.error || 'Unknown error'));
        }
      }

      function formatTime(timestamp) {
        const date = new Date(timestamp);
        return date.toLocaleTimeString();
      }

      // Request initial data
      postMessage('init');
    `;

    const styles = `
      <style>
        .container-detail-wrapper {
          display: flex;
          flex-direction: column;
          height: 100vh;
          overflow: hidden;
        }

        /* Header */
        .detail-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 12px 16px;
          border-bottom: 1px solid var(--vscode-panel-border);
          flex-shrink: 0;
        }

        .detail-header h1 {
          margin: 0;
          font-size: 1.2em;
          border: none;
          padding: 0;
        }

        .header-actions {
          display: flex;
          gap: 8px;
        }

        .action-btn {
          padding: 6px 12px;
          border: 1px solid var(--vscode-button-border);
          background: var(--vscode-button-background);
          color: var(--vscode-button-foreground);
          cursor: pointer;
          border-radius: 2px;
        }

        .action-btn:hover:not(:disabled) {
          background: var(--vscode-button-hoverBackground);
        }

        .action-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        /* Container Info */
        .container-info {
          padding: 16px;
          background: var(--vscode-sideBar-background);
          border-bottom: 1px solid var(--vscode-panel-border);
          flex-shrink: 0;
        }

        .info-row {
          display: flex;
          margin-bottom: 8px;
        }

        .info-row:last-child {
          margin-bottom: 0;
        }

        .info-label {
          font-weight: 600;
          width: 100px;
          flex-shrink: 0;
        }

        .info-value {
          flex: 1;
          word-break: break-all;
        }

        .status-running { color: var(--vscode-testing-iconPassed); }
        .status-exited { color: var(--vscode-testing-iconFailed); }
        .status-paused { color: var(--vscode-editorWarning-foreground); }

        /* Log Section */
        .log-section {
          flex: 1;
          display: flex;
          flex-direction: column;
          overflow: hidden;
          padding: 16px;
        }

        .log-controls {
          display: flex;
          gap: 8px;
          margin-bottom: 12px;
          flex-shrink: 0;
        }

        .log-filter-input {
          flex: 1;
          padding: 6px 8px;
        }

        .stream-filter-select {
          padding: 6px 8px;
          min-width: 120px;
        }

        .log-viewer {
          flex: 1;
          overflow-y: auto;
          background: var(--vscode-editor-background);
          border: 1px solid var(--vscode-panel-border);
          border-radius: 2px;
        }

        .log-content {
          padding: 8px;
          font-family: var(--vscode-editor-font-family);
          font-size: var(--vscode-editor-font-size);
        }

        .log-line {
          display: flex;
          margin-bottom: 2px;
          line-height: 1.5;
        }

        .log-timestamp {
          color: var(--vscode-descriptionForeground);
          margin-right: 12px;
          flex-shrink: 0;
          font-size: 0.9em;
        }

        .log-text {
          flex: 1;
          white-space: pre-wrap;
          word-break: break-word;
        }

        .log-stream-badge {
          font-size: 0.75em;
          padding: 1px 4px;
          border-radius: 2px;
          margin-right: 8px;
          font-weight: 600;
          flex-shrink: 0;
        }

        .log-stream-badge.log-stream-stdout {
          background: var(--vscode-terminal-ansiGreen);
          color: var(--vscode-terminal-background);
        }

        .log-stream-badge.log-stream-stderr {
          background: var(--vscode-terminal-ansiRed);
          color: var(--vscode-terminal-background);
        }

        .log-line.log-stream-stderr .log-text {
          color: var(--vscode-errorForeground);
        }
      </style>
    `;

    return this.getBaseHtml(webview, {
      title: 'Container Details',
      body,
      scripts,
      styles,
    });
  }
}
