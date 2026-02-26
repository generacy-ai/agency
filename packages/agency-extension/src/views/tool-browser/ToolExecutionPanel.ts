import type * as vscode from 'vscode';
import type {
  ToolInfo,
  ToolResult,
  ToolExecutionRecord,
  JsonSchema,
  JsonSchemaItem,
} from '../../types';
import { WebviewBase, type WebviewMessage } from '../webview-base';
import { McpClientService } from '../../services';
import { createScopedLogger } from '../../utils';

const log = createScopedLogger('ToolExecutionPanel');

/**
 * View type identifier for the tool execution panel.
 */
const VIEW_TYPE = 'agency.toolExecution';

/**
 * Message types sent from the webview to the extension.
 */
interface ExecuteToolMessage {
  type: 'executeTool';
  payload: {
    parameters: Record<string, unknown>;
  };
}

interface ClearHistoryMessage {
  type: 'clearHistory';
}

interface RerunExecutionMessage {
  type: 'rerunExecution';
  payload: {
    executionId: string;
  };
}

interface LoadHistoryMessage {
  type: 'loadHistory';
}

type IncomingMessage =
  | ExecuteToolMessage
  | ClearHistoryMessage
  | RerunExecutionMessage
  | LoadHistoryMessage;

/**
 * Message types sent from the extension to the webview.
 */
interface ToolLoadedMessage {
  type: 'toolLoaded';
  payload: {
    tool: ToolInfo;
    connectionStatus: string;
  };
}

interface ExecutionStartedMessage {
  type: 'executionStarted';
  payload: {
    executionId: string;
  };
}

interface ExecutionCompleteMessage {
  type: 'executionComplete';
  payload: {
    record: ToolExecutionRecord;
  };
}

interface HistoryUpdatedMessage {
  type: 'historyUpdated';
  payload: {
    history: ToolExecutionRecord[];
  };
}

type _OutgoingMessage =
  | ToolLoadedMessage
  | ExecutionStartedMessage
  | ExecutionCompleteMessage
  | HistoryUpdatedMessage;

/**
 * Panel instances tracked by tool name.
 */
const panels = new Map<string, ToolExecutionPanel>();

/**
 * Clear all tracked panels.
 * @internal Used for testing only.
 */
export function _clearPanels(): void {
  for (const panel of panels.values()) {
    panel.dispose();
  }
  panels.clear();
}

/**
 * Generate a unique execution ID.
 */
function generateExecutionId(): string {
  return `exec_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Webview panel for executing and testing MCP tools.
 *
 * Features:
 * - Dynamic parameter form generation from JSON Schema
 * - Tool execution with loading state
 * - Result display with syntax highlighting
 * - Execution history with rerun capability
 * - Theme-aware styling using VS Code CSS variables
 *
 * @example
 * ```typescript
 * const panel = ToolExecutionPanel.createOrShow(vscode, extensionUri, toolInfo);
 * ```
 */
export class ToolExecutionPanel extends WebviewBase {
  private _tool: ToolInfo;
  private readonly _mcpService: McpClientService;
  private _executionHistory: ToolExecutionRecord[] = [];
  private _isExecuting = false;
  private _lastResult: ToolResult | null = null;

  private constructor(
    vscodeModule: typeof vscode,
    extensionUri: vscode.Uri,
    tool: ToolInfo
  ) {
    super(vscodeModule, extensionUri, {
      viewType: VIEW_TYPE,
      title: `Test: ${tool.name}`,
      column: vscodeModule.ViewColumn.Two,
      enableScripts: true,
      retainContextWhenHidden: true,
    });

    this._tool = tool;
    this._mcpService = McpClientService.getInstance();

    // Subscribe to connection status changes
    this._disposables.add(
      this._mcpService.onConnectionStatusChange(() => {
        this.refresh();
      })
    );
  }

  /**
   * Create or show a tool execution panel.
   * If a panel for this tool already exists, reveal it.
   *
   * @param vscodeModule The VS Code module
   * @param extensionUri The extension's URI
   * @param tool The tool to execute
   * @returns The panel instance
   */
  static createOrShow(
    vscodeModule: typeof vscode,
    extensionUri: vscode.Uri,
    tool: ToolInfo
  ): ToolExecutionPanel {
    // Check for existing panel
    const existingPanel = panels.get(tool.name);
    if (existingPanel) {
      existingPanel._tool = tool;
      existingPanel.show();
      existingPanel.refresh();
      return existingPanel;
    }

    // Create new panel
    const panel = new ToolExecutionPanel(vscodeModule, extensionUri, tool);
    panels.set(tool.name, panel);
    panel.show();

    log.info(`Created execution panel for tool: ${tool.name}`);
    return panel;
  }

  /**
   * Dispose of the panel and remove from tracking.
   */
  override dispose(): void {
    panels.delete(this._tool.name);
    super.dispose();
  }

  /**
   * Handle when panel is disposed (e.g., user closes it).
   */
  protected override onDispose(): void {
    panels.delete(this._tool.name);
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

    // Ignore VS Code internal messages (they appear as "[object Object]")
    if (message.type.includes('object') || message.type.startsWith('vscode')) {
      return;
    }

    const msg = message as IncomingMessage;

    switch (msg.type) {
      case 'executeTool':
        this._handleExecuteTool(msg.payload);
        break;

      case 'clearHistory':
        this._handleClearHistory();
        break;

      case 'rerunExecution':
        this._handleRerunExecution(msg.payload);
        break;

      case 'loadHistory':
        this._handleLoadHistory();
        break;

      default:
        log.debug(`Ignoring unknown message type: ${(msg as { type: string }).type}`);
    }
  }

  /**
   * Handle tool execution request.
   */
  private async _handleExecuteTool(
    payload: ExecuteToolMessage['payload']
  ): Promise<void> {
    if (this._isExecuting) {
      log.warn('Execution already in progress');
      return;
    }

    const executionId = generateExecutionId();
    this._isExecuting = true;

    // Notify webview that execution started (may not work in remote scenarios)
    await this.postMessage({
      type: 'executionStarted',
      payload: { executionId },
    } as ExecutionStartedMessage);

    const startTime = Date.now();

    // Create initial execution record
    const record: ToolExecutionRecord = {
      id: executionId,
      request: {
        name: this._tool.name,
        arguments: payload.parameters,
        requestId: executionId,
      },
      result: null,
      status: 'running',
      startedAt: startTime,
    };

    try {
      // Check connection status
      if (!this._mcpService.isConnected()) {
        throw new Error('Not connected to MCP server. Please connect first.');
      }

      // Execute the tool
      const result = await this._mcpService.executeTool(
        this._tool.name,
        payload.parameters
      );

      // Update record with result
      record.result = result;
      record.status = result.isError ? 'error' : 'success';
      record.completedAt = Date.now();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      log.error(`Tool execution failed: ${this._tool.name}`, error);

      // Create error result
      record.result = {
        isError: true,
        content: [{ type: 'text', text: errorMessage }],
        errorMessage,
        duration: Date.now() - startTime,
        timestamp: Date.now(),
      };
      record.status = errorMessage.includes('timed out') ? 'timeout' : 'error';
      record.completedAt = Date.now();
    } finally {
      this._isExecuting = false;
    }

    // Add to history
    this._addToHistory(record);

    // Store the result and refresh HTML to display it (workaround for postMessage issue)
    this._lastResult = record.result;
    log.info(`Tool execution complete: ${this._tool.name} - ${record.status}`);

    // Refresh the webview to show the result
    this.refresh();
  }

  /**
   * Handle clear history request.
   */
  private async _handleClearHistory(): Promise<void> {
    this._executionHistory = [];
    await this._sendHistoryUpdate();
    log.debug('Execution history cleared');
  }

  /**
   * Handle rerun execution request.
   */
  private async _handleRerunExecution(
    payload: RerunExecutionMessage['payload']
  ): Promise<void> {
    const previousExecution = this._executionHistory.find(
      (e) => e.id === payload.executionId
    );

    if (!previousExecution) {
      log.warn(`Execution not found: ${payload.executionId}`);
      return;
    }

    // Re-execute with same parameters
    await this._handleExecuteTool({
      parameters: previousExecution.request.arguments,
    });
  }

  /**
   * Handle load history request.
   */
  private async _handleLoadHistory(): Promise<void> {
    await this._sendHistoryUpdate();
  }

  /**
   * Add execution record to history.
   */
  private _addToHistory(record: ToolExecutionRecord): void {
    // Add to beginning (most recent first)
    this._executionHistory.unshift(record);

    // Limit history size
    const maxHistory = 50;
    if (this._executionHistory.length > maxHistory) {
      this._executionHistory = this._executionHistory.slice(0, maxHistory);
    }
  }

  /**
   * Send history update to webview.
   */
  private async _sendHistoryUpdate(): Promise<void> {
    await this.postMessage({
      type: 'historyUpdated',
      payload: { history: this._executionHistory },
    } as HistoryUpdatedMessage);
  }

  /**
   * Generate HTML for the webview.
   */
  protected getHtmlContent(webview: vscode.Webview): string {
    const tool = this._tool;
    const connectionStatus = this._mcpService.getConnectionStatus();
    const isConnected = connectionStatus === 'connected';

    // Generate parameter form fields
    const parameterFields = this._generateParameterForm(tool.inputSchema);

    const body = `
      <div class="container">
        <header class="card-header">
          <div class="tool-header">
            <h1 class="card-title">${this._escapeHtml(tool.name)}</h1>
            <span class="connection-status ${isConnected ? 'connected' : 'disconnected'}">
              ${isConnected ? '● Connected' : '○ Disconnected'}
            </span>
          </div>
          ${tool.description ? `<p class="text-muted">${this._escapeHtml(tool.description)}</p>` : ''}
          ${tool.namespace ? `<p class="text-small text-muted">Namespace: ${this._escapeHtml(tool.namespace)}</p>` : ''}
        </header>

        <section class="section">
          <h2 class="section-title">Parameters</h2>
          <form id="executeForm">
            ${parameterFields || '<p class="text-muted">This tool has no parameters.</p>'}

            <div class="form-actions flex gap-sm mt-md">
              <button type="submit" id="executeBtn" ${!isConnected ? 'disabled' : ''}>
                Execute
              </button>
            </div>
          </form>
        </section>

        <section class="section">
          <div class="section-header">
            <h2 class="section-title">Result</h2>
            <span id="executionTime" class="execution-time">${this._lastResult?.duration ? `Duration: ${this._lastResult.duration}ms` : ''}</span>
          </div>
          <div id="resultContainer" class="result-container">
            <div id="loadingIndicator" class="loading hidden">
              <span class="spinner"></span>
              <span>Executing...</span>
            </div>
            <div id="resultContent" class="result-content">
              ${this._lastResult ? this._renderResult(this._lastResult) : '<p class="text-muted">Execute the tool to see results.</p>'}
            </div>
          </div>
        </section>

        <section class="section">
          <div class="section-header">
            <h2 class="section-title">History</h2>
            <button type="button" id="clearHistoryBtn" class="secondary small">Clear</button>
          </div>
          <div id="historyList" class="history-list">
            <p class="text-muted">No execution history yet.</p>
          </div>
        </section>
      </div>
    `;

    const scripts = `
      // Current tool state
      const toolName = ${JSON.stringify(tool.name)};
      let isExecuting = false;
      let executionHistory = [];

      // DOM elements
      const form = document.getElementById('executeForm');
      const executeBtn = document.getElementById('executeBtn');
      const loadingIndicator = document.getElementById('loadingIndicator');
      const resultContent = document.getElementById('resultContent');
      const executionTime = document.getElementById('executionTime');
      const historyList = document.getElementById('historyList');
      const clearHistoryBtn = document.getElementById('clearHistoryBtn');

      // Handle form submission
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        if (isExecuting) return;
        executeCurrentTool();
      });

      // Handle clear history
      clearHistoryBtn.addEventListener('click', () => {
        postMessage('clearHistory');
      });

      // Execute the tool with current form values
      function executeCurrentTool() {
        const parameters = collectFormData();

        // Client-side validation
        const errors = validateParameters(parameters);
        if (errors.length > 0) {
          showResult({
            isError: true,
            content: [{ type: 'text', text: 'Validation errors:\\n' + errors.join('\\n') }],
            timestamp: Date.now()
          });
          return;
        }

        postMessage('executeTool', { parameters });
      }

      // Collect form data into parameters object
      function collectFormData() {
        const parameters = {};
        const inputs = form.querySelectorAll('input, select, textarea');

        for (const input of inputs) {
          const name = input.name;
          if (!name) continue;

          let value;
          if (input.type === 'checkbox') {
            value = input.checked;
          } else if (input.type === 'number') {
            value = input.value === '' ? undefined : Number(input.value);
          } else if (input.dataset.type === 'json') {
            try {
              value = input.value.trim() ? JSON.parse(input.value) : undefined;
            } catch {
              value = input.value; // Let server-side validation catch it
            }
          } else {
            value = input.value || undefined;
          }

          if (value !== undefined) {
            parameters[name] = value;
          }
        }

        return parameters;
      }

      // Client-side validation
      function validateParameters(parameters) {
        const errors = [];
        const requiredInputs = form.querySelectorAll('input[required], textarea[required]');

        for (const input of requiredInputs) {
          const name = input.name;
          if (parameters[name] === undefined || parameters[name] === '') {
            errors.push(name + ' is required');
            input.classList.add('input-error');
          } else {
            input.classList.remove('input-error');
          }
        }

        return errors;
      }

      // Show result in the result container
      function showResult(result) {
        const statusClass = result.isError ? 'error' : 'success';
        const statusIcon = result.isError ? '✗' : '✓';

        let contentHtml = '';
        for (const item of result.content || []) {
          if (item.type === 'text') {
            contentHtml += formatTextContent(item.text);
          } else if (item.type === 'image') {
            contentHtml += '<div class="image-content"><img src="data:' + item.mimeType + ';base64,' + item.data + '" /></div>';
          } else if (item.type === 'resource') {
            contentHtml += '<div class="resource-content"><code>' + escapeHtml(item.resource.uri) + '</code></div>';
          }
        }

        resultContent.innerHTML = '<div class="result ' + statusClass + '">' +
          '<span class="status-icon">' + statusIcon + '</span>' +
          '<div class="result-body">' + contentHtml + '</div>' +
          '</div>';

        if (result.duration !== undefined) {
          executionTime.textContent = 'Duration: ' + result.duration + 'ms';
        }
      }

      // Format text content with JSON syntax highlighting
      function formatTextContent(text) {
        // Try to detect and highlight JSON
        try {
          const parsed = JSON.parse(text);
          return '<pre class="json-content">' + syntaxHighlightJson(JSON.stringify(parsed, null, 2)) + '</pre>';
        } catch {
          // Not JSON, show as plain text
          return '<pre class="text-content">' + escapeHtml(text) + '</pre>';
        }
      }

      // Simple JSON syntax highlighting
      function syntaxHighlightJson(json) {
        return json
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/("(\\\\u[a-zA-Z0-9]{4}|\\\\[^u]|[^\\\\"])*"(\\s*:)?|\\b(true|false|null)\\b|-?\\d+(?:\\.\\d*)?(?:[eE][+\\-]?\\d+)?)/g, (match) => {
            let cls = 'json-number';
            if (/^"/.test(match)) {
              if (/:$/.test(match)) {
                cls = 'json-key';
              } else {
                cls = 'json-string';
              }
            } else if (/true|false/.test(match)) {
              cls = 'json-boolean';
            } else if (/null/.test(match)) {
              cls = 'json-null';
            }
            return '<span class="' + cls + '">' + match + '</span>';
          });
      }

      // Escape HTML
      function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
      }

      // Update history list
      function updateHistoryList(history) {
        executionHistory = history;

        if (history.length === 0) {
          historyList.innerHTML = '<p class="text-muted">No execution history yet.</p>';
          return;
        }

        const items = history.map((record) => {
          const statusIcon = record.status === 'success' ? '✓' : record.status === 'running' ? '⟳' : '✗';
          const statusClass = record.status;
          const time = new Date(record.startedAt).toLocaleTimeString();
          const duration = record.result?.duration ? record.result.duration + 'ms' : '...';

          return '<div class="history-item ' + statusClass + '">' +
            '<span class="status-icon">' + statusIcon + '</span>' +
            '<span class="history-info">' + escapeHtml(record.request.name) + ' - ' + duration + ' - ' + time + '</span>' +
            '<button type="button" class="rerun-btn small" data-id="' + record.id + '" title="Rerun">⟳</button>' +
            '</div>';
        }).join('');

        historyList.innerHTML = items;

        // Add click handlers for rerun buttons
        historyList.querySelectorAll('.rerun-btn').forEach((btn) => {
          btn.addEventListener('click', () => {
            const executionId = btn.dataset.id;
            postMessage('rerunExecution', { executionId });
          });
        });
      }

      // Handle messages from extension (note: postMessage may not work reliably in remote scenarios)
      window.addEventListener('message', (event) => {
        const message = event.data;

        switch (message.type) {
          case 'toolLoaded':
            // Tool info loaded, could refresh UI if needed
            break;

          case 'executionStarted':
            isExecuting = true;
            executeBtn.disabled = true;
            executeBtn.textContent = 'Executing...';
            loadingIndicator.classList.remove('hidden');
            resultContent.innerHTML = '';
            executionTime.textContent = '';
            break;

          case 'executionComplete':
            isExecuting = false;
            executeBtn.disabled = false;
            executeBtn.textContent = 'Execute';
            loadingIndicator.classList.add('hidden');
            try {
              showResult(message.payload.record.result);
            } catch (err) {
              console.error('showResult error:', err);
              resultContent.innerHTML = '<pre class="error">Error displaying result: ' + err.message + '</pre>';
            }
            break;

          case 'historyUpdated':
            updateHistoryList(message.payload.history);
            break;
        }
      });

      // Request initial history
      postMessage('loadHistory');

      // Clear validation errors on input
      form.addEventListener('input', (e) => {
        e.target.classList.remove('input-error');
      });
    `;

    const styles = `
      <style>
        .tool-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 16px;
        }

        .connection-status {
          font-size: 0.85em;
          padding: 4px 8px;
          border-radius: 4px;
        }

        .connection-status.connected {
          color: var(--vscode-testing-iconPassed);
        }

        .connection-status.disconnected {
          color: var(--vscode-testing-iconFailed);
        }

        .section {
          margin-top: 24px;
          padding-top: 16px;
          border-top: 1px solid var(--vscode-panel-border);
        }

        .section-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 12px;
        }

        .section-title {
          font-size: 1.1em;
          font-weight: 600;
          margin: 0;
        }

        .form-actions {
          padding-top: 16px;
        }

        .result-container {
          background: var(--vscode-editor-background);
          border: 1px solid var(--vscode-panel-border);
          border-radius: 4px;
          padding: 12px;
          min-height: 100px;
        }

        .loading {
          display: flex;
          align-items: center;
          gap: 8px;
          color: var(--vscode-descriptionForeground);
        }

        .loading.hidden {
          display: none;
        }

        .spinner {
          display: inline-block;
          width: 16px;
          height: 16px;
          border: 2px solid var(--vscode-progressBar-background);
          border-radius: 50%;
          border-top-color: transparent;
          animation: spin 1s linear infinite;
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        .result {
          display: flex;
          gap: 8px;
        }

        .result .status-icon {
          flex-shrink: 0;
          font-size: 1.2em;
        }

        .result.success .status-icon {
          color: var(--vscode-testing-iconPassed);
        }

        .result.error .status-icon {
          color: var(--vscode-testing-iconFailed);
        }

        .result-body {
          flex: 1;
          overflow: auto;
        }

        .json-content, .text-content {
          margin: 0;
          padding: 8px;
          background: var(--vscode-textCodeBlock-background);
          border-radius: 4px;
          overflow-x: auto;
          font-family: var(--vscode-editor-font-family);
          font-size: var(--vscode-editor-font-size);
          white-space: pre-wrap;
          word-break: break-word;
        }

        .json-key { color: var(--vscode-symbolIcon-propertyForeground, #9cdcfe); }
        .json-string { color: var(--vscode-symbolIcon-stringForeground, #ce9178); }
        .json-number { color: var(--vscode-symbolIcon-numberForeground, #b5cea8); }
        .json-boolean { color: var(--vscode-symbolIcon-booleanForeground, #569cd6); }
        .json-null { color: var(--vscode-symbolIcon-nullForeground, #569cd6); }

        .execution-time {
          font-size: 0.85em;
          color: var(--vscode-descriptionForeground);
        }

        .history-list {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .history-item {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 8px;
          background: var(--vscode-editor-background);
          border: 1px solid var(--vscode-panel-border);
          border-radius: 4px;
        }

        .history-item .status-icon {
          flex-shrink: 0;
        }

        .history-item.success .status-icon {
          color: var(--vscode-testing-iconPassed);
        }

        .history-item.error .status-icon,
        .history-item.timeout .status-icon {
          color: var(--vscode-testing-iconFailed);
        }

        .history-item.running .status-icon {
          color: var(--vscode-progressBar-background);
        }

        .history-info {
          flex: 1;
          font-size: 0.9em;
        }

        .rerun-btn {
          padding: 2px 8px;
          font-size: 0.9em;
        }

        button.small {
          padding: 4px 8px;
          font-size: 0.85em;
        }

        .input-error {
          border-color: var(--vscode-inputValidation-errorBorder) !important;
        }

        .field-description {
          font-size: 0.85em;
          color: var(--vscode-descriptionForeground);
          margin-top: 2px;
        }

        .required-marker {
          color: var(--vscode-errorForeground);
        }

        textarea {
          min-height: 80px;
          resize: vertical;
          font-family: var(--vscode-editor-font-family);
        }
      </style>
    `;

    return this.getBaseHtml(webview, {
      title: `Test: ${tool.name}`,
      body,
      scripts,
      styles,
    });
  }

  /**
   * Generate parameter form fields from JSON Schema.
   */
  private _generateParameterForm(schema: JsonSchema): string {
    if (!schema.properties || Object.keys(schema.properties).length === 0) {
      return '';
    }

    const requiredFields = new Set(schema.required || []);
    const fields: string[] = [];

    for (const [name, propSchema] of Object.entries(schema.properties)) {
      const isRequired = requiredFields.has(name);
      const field = this._generateFieldFromSchema(name, propSchema, isRequired);
      fields.push(field);
    }

    return fields.join('');
  }

  /**
   * Generate a single form field from a JSON Schema property.
   */
  private _generateFieldFromSchema(
    name: string,
    schema: JsonSchemaItem,
    isRequired: boolean
  ): string {
    const requiredMarker = isRequired ? '<span class="required-marker">*</span>' : '';
    const requiredAttr = isRequired ? 'required' : '';
    const description = schema.description
      ? `<span class="field-description">${this._escapeHtml(schema.description)}</span>`
      : '';

    let input: string;

    // Handle enum as select
    if (schema.enum && schema.enum.length > 0) {
      const options = schema.enum
        .map((opt) => {
          const value = String(opt);
          const selected = opt === schema.default ? 'selected' : '';
          return `<option value="${this._escapeHtml(value)}" ${selected}>${this._escapeHtml(value)}</option>`;
        })
        .join('');
      input = `<select name="${name}" id="${name}" ${requiredAttr}>
        <option value="">Select...</option>
        ${options}
      </select>`;
    }
    // Handle boolean as checkbox
    else if (schema.type === 'boolean') {
      const checked = schema.default === true ? 'checked' : '';
      input = `<label class="checkbox-label">
        <input type="checkbox" name="${name}" id="${name}" ${checked}>
        <span>${this._escapeHtml(name)}</span>
      </label>`;
      return `<div class="form-group">${input}${description}</div>`;
    }
    // Handle number
    else if (schema.type === 'number') {
      const attrs: string[] = [requiredAttr];
      if (schema.minimum !== undefined) attrs.push(`min="${schema.minimum}"`);
      if (schema.maximum !== undefined) attrs.push(`max="${schema.maximum}"`);
      const defaultValue = schema.default !== undefined ? String(schema.default) : '';
      input = `<input type="number" name="${name}" id="${name}" value="${defaultValue}" ${attrs.join(' ')}>`;
    }
    // Handle array or object as JSON textarea
    else if (schema.type === 'array' || schema.type === 'object') {
      const defaultValue = schema.default !== undefined
        ? JSON.stringify(schema.default, null, 2)
        : '';
      input = `<textarea name="${name}" id="${name}" data-type="json" ${requiredAttr} placeholder="Enter JSON ${schema.type}">${defaultValue}</textarea>`;
    }
    // Handle string (default)
    else {
      const attrs: string[] = [requiredAttr];
      if (schema.minLength !== undefined) attrs.push(`minlength="${schema.minLength}"`);
      if (schema.maxLength !== undefined) attrs.push(`maxlength="${schema.maxLength}"`);
      if (schema.pattern !== undefined) attrs.push(`pattern="${this._escapeHtml(schema.pattern)}"`);
      const defaultValue = schema.default !== undefined ? String(schema.default) : '';
      input = `<input type="text" name="${name}" id="${name}" value="${this._escapeHtml(defaultValue)}" ${attrs.join(' ')}>`;
    }

    return `
      <div class="form-group">
        <label for="${name}">${this._escapeHtml(name)} ${requiredMarker}</label>
        ${input}
        ${description}
      </div>
    `;
  }

  /**
   * Escape HTML special characters.
   */
  private _escapeHtml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  /**
   * Render a tool result as HTML.
   */
  private _renderResult(result: ToolResult): string {
    const statusClass = result.isError ? 'error' : 'success';
    const statusIcon = result.isError ? '✗' : '✓';

    let contentHtml = '';
    for (const item of result.content || []) {
      if (item.type === 'text') {
        // Try to format as JSON if possible
        let text = item.text;
        try {
          const parsed = JSON.parse(text);
          text = JSON.stringify(parsed, null, 2);
          contentHtml += `<pre class="json-content">${this._escapeHtml(text)}</pre>`;
        } catch {
          contentHtml += `<pre class="text-content">${this._escapeHtml(text)}</pre>`;
        }
      }
    }

    return `<div class="result ${statusClass}">
      <span class="status-icon">${statusIcon}</span>
      <div class="result-body">${contentHtml}</div>
    </div>`;
  }
}
