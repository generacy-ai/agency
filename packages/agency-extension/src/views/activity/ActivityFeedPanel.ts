import type * as vscode from 'vscode';
import type {
  ToolCallEvent,
  ActivityFilter,
  ActivityStats,
  ToolCallStatus,
} from '../../types';
import { WebviewBase, type WebviewMessage } from '../webview-base';
import { ActivityService } from '../../services';
import { createScopedLogger } from '../../utils';

const log = createScopedLogger('ActivityFeedPanel');

/**
 * View type identifier for the activity feed panel.
 */
const VIEW_TYPE = 'agency.activityFeed';

// ─────────────────────────────────────────────────────────────────────────────
// Message Types (Extension ↔ Webview)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Message sent when filter changes in the webview.
 */
interface FilterChangeMessage {
  type: 'filterChange';
  payload: ActivityFilter;
}

/**
 * Message sent to request more events (pagination).
 */
interface LoadMoreMessage {
  type: 'loadMore';
  payload: { offset: number; limit: number };
}

/**
 * Message sent when an event is expanded to show details.
 */
interface ExpandEventMessage {
  type: 'expandEvent';
  payload: { eventId: string };
}

/**
 * Message sent to clear all events.
 */
interface ClearEventsMessage {
  type: 'clearEvents';
}

/**
 * Message sent to export events.
 */
interface ExportEventsMessage {
  type: 'exportEvents';
  payload: { format: 'json' | 'csv' };
}

/**
 * Message sent to initialize the webview.
 */
interface InitMessage {
  type: 'init';
}

/**
 * All incoming message types.
 */
type IncomingMessage =
  | FilterChangeMessage
  | LoadMoreMessage
  | ExpandEventMessage
  | ClearEventsMessage
  | ExportEventsMessage
  | InitMessage;

/**
 * Message sent when events are updated.
 */
interface EventsUpdatedMessage {
  type: 'eventsUpdated';
  payload: {
    events: ToolCallEvent[];
    stats: ActivityStats;
    hasMore: boolean;
  };
}

/**
 * Message sent with event detail.
 */
interface EventDetailMessage {
  type: 'eventDetail';
  payload: {
    event: ToolCallEvent;
  };
}

/**
 * All outgoing message types.
 */
type OutgoingMessage = EventsUpdatedMessage | EventDetailMessage;

// ─────────────────────────────────────────────────────────────────────────────
// Panel Tracking
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Singleton panel instance (one per workspace).
 */
let panelInstance: ActivityFeedPanel | undefined;

/**
 * Clear the panel instance (for testing).
 * @internal
 */
export function _clearPanel(): void {
  if (panelInstance) {
    panelInstance.dispose();
    panelInstance = undefined;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// ActivityFeedPanel Class
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Webview panel for displaying the activity feed.
 *
 * Features:
 * - Real-time updating list with virtual scrolling
 * - Filter controls (by tool, namespace, status, time)
 * - Expandable details with syntax highlighting
 * - Activity statistics summary
 * - Clear and export functionality
 *
 * @example
 * ```typescript
 * const panel = ActivityFeedPanel.createOrShow(vscode, extensionUri);
 * ```
 */
export class ActivityFeedPanel extends WebviewBase {
  private readonly _activityService: ActivityService;
  private _currentFilter: ActivityFilter = {};
  private _pageSize = 50;
  private _currentOffset = 0;
  private _updateDebounceTimer: ReturnType<typeof setTimeout> | null = null;

  private constructor(vscodeModule: typeof vscode, extensionUri: vscode.Uri) {
    super(vscodeModule, extensionUri, {
      viewType: VIEW_TYPE,
      title: 'Activity Feed',
      column: vscodeModule.ViewColumn.Two,
      enableScripts: true,
      retainContextWhenHidden: true,
    });

    this._activityService = ActivityService.getInstance();

    // Subscribe to activity service events
    this._disposables.add(
      this._activityService.onToolCall(() => {
        this._debouncedUpdate();
      })
    );

    this._disposables.add(
      this._activityService.onBatch(() => {
        this._debouncedUpdate();
      })
    );
  }

  /**
   * Create or show the activity feed panel.
   * Uses singleton pattern - only one panel per workspace.
   *
   * @param vscodeModule The VS Code module
   * @param extensionUri The extension's URI
   * @returns The panel instance
   */
  static createOrShow(
    vscodeModule: typeof vscode,
    extensionUri: vscode.Uri
  ): ActivityFeedPanel {
    // Return existing panel if available
    if (panelInstance) {
      panelInstance.show();
      return panelInstance;
    }

    // Create new panel
    panelInstance = new ActivityFeedPanel(vscodeModule, extensionUri);
    panelInstance.show();

    log.info('Created activity feed panel');
    return panelInstance;
  }

  /**
   * Dispose of the panel and clean up resources.
   */
  override dispose(): void {
    if (this._updateDebounceTimer) {
      clearTimeout(this._updateDebounceTimer);
    }
    panelInstance = undefined;
    super.dispose();
  }

  /**
   * Handle when panel is disposed (e.g., user closes it).
   */
  protected override onDispose(): void {
    panelInstance = undefined;
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

      case 'filterChange':
        this._handleFilterChange(msg.payload);
        break;

      case 'loadMore':
        this._handleLoadMore(msg.payload);
        break;

      case 'expandEvent':
        this._handleExpandEvent(msg.payload);
        break;

      case 'clearEvents':
        this._handleClearEvents();
        break;

      case 'exportEvents':
        this._handleExportEvents(msg.payload);
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
    this._sendEventsUpdate();
  }

  /**
   * Handle filter change from webview.
   */
  private _handleFilterChange(filter: ActivityFilter): void {
    this._currentFilter = filter;
    this._currentOffset = 0;
    this._sendEventsUpdate();

    // Persist filter state
    this._saveState({ filter });
    log.debug('Filter changed', filter);
  }

  /**
   * Handle load more request (pagination).
   */
  private _handleLoadMore(payload: LoadMoreMessage['payload']): void {
    this._currentOffset = payload.offset;
    this._sendEventsUpdate();
  }

  /**
   * Handle expand event request.
   */
  private _handleExpandEvent(payload: ExpandEventMessage['payload']): void {
    const event = this._activityService.getEventById(payload.eventId);
    if (event) {
      this.postMessage({
        type: 'eventDetail',
        payload: { event },
      } as EventDetailMessage);
    }
  }

  /**
   * Handle clear events request.
   */
  private _handleClearEvents(): void {
    this._activityService.clearEvents();
    this._currentOffset = 0;
    this._sendEventsUpdate();
    log.info('Events cleared');
  }

  /**
   * Handle export events request.
   */
  private async _handleExportEvents(
    payload: ExportEventsMessage['payload']
  ): Promise<void> {
    const { window, Uri, workspace } = this._vscodeModule;

    // Get filtered events (all, not paginated)
    const filter: ActivityFilter = { ...this._currentFilter };
    delete filter.limit;
    delete filter.offset;
    const events = this._activityService.getEvents(filter);

    if (events.length === 0) {
      window.showInformationMessage('No events to export');
      return;
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const defaultFileName = `activity-export-${timestamp}.${payload.format}`;

    const saveUri = await window.showSaveDialog({
      defaultUri: Uri.file(defaultFileName),
      filters:
        payload.format === 'json'
          ? { JSON: ['json'] }
          : { CSV: ['csv'] },
    });

    if (!saveUri) {
      return;
    }

    try {
      let content: string;

      if (payload.format === 'json') {
        content = JSON.stringify(events, null, 2);
      } else {
        content = this._eventsToCSV(events);
      }

      await workspace.fs.writeFile(saveUri, Buffer.from(content, 'utf-8'));
      window.showInformationMessage(`Exported ${events.length} events to ${saveUri.fsPath}`);
      log.info(`Exported ${events.length} events to ${saveUri.fsPath}`);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      window.showErrorMessage(`Failed to export: ${errorMsg}`);
      log.error('Export failed', error);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Helper Methods
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Debounced update to prevent UI thrashing on rapid events.
   */
  private _debouncedUpdate(): void {
    if (this._updateDebounceTimer) {
      clearTimeout(this._updateDebounceTimer);
    }

    this._updateDebounceTimer = setTimeout(() => {
      this._sendEventsUpdate();
      this._updateDebounceTimer = null;
    }, 100);
  }

  /**
   * Send events update to webview.
   */
  private _sendEventsUpdate(): void {
    const filter: ActivityFilter = {
      ...this._currentFilter,
      offset: this._currentOffset,
      limit: this._pageSize,
    };

    const events = this._activityService.getEvents(filter);
    const stats = this._activityService.getStats(this._currentFilter);
    const totalCount = this._activityService.getEventCount();
    const hasMore = this._currentOffset + events.length < totalCount;

    this.postMessage({
      type: 'eventsUpdated',
      payload: {
        events,
        stats,
        hasMore,
      },
    } as EventsUpdatedMessage);
  }

  /**
   * Save state to VS Code webview state API.
   */
  private _saveState(state: { filter?: ActivityFilter }): void {
    // State is saved via webview postMessage to trigger setState
    this.postMessage({
      type: 'saveState',
      payload: state,
    });
  }

  /**
   * Convert events to CSV format.
   */
  private _eventsToCSV(events: ToolCallEvent[]): string {
    const headers = [
      'id',
      'toolName',
      'namespace',
      'pluginId',
      'agentId',
      'status',
      'isError',
      'errorMessage',
      'startedAt',
      'completedAt',
      'duration',
      'input',
      'output',
    ];

    const escapeCSV = (value: unknown): string => {
      if (value === null || value === undefined) {
        return '';
      }
      const str =
        typeof value === 'object' ? JSON.stringify(value) : String(value);
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    const rows = events.map((event) => [
      escapeCSV(event.id),
      escapeCSV(event.toolName),
      escapeCSV(event.namespace),
      escapeCSV(event.pluginId),
      escapeCSV(event.agentId),
      escapeCSV(event.status),
      escapeCSV(event.isError),
      escapeCSV(event.errorMessage),
      escapeCSV(event.startedAt),
      escapeCSV(event.completedAt),
      escapeCSV(event.duration),
      escapeCSV(event.input),
      escapeCSV(event.output),
    ]);

    return [headers.join(','), ...rows.map((row) => row.join(','))].join('\n');
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // HTML Content Generation
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Generate HTML for the webview.
   */
  protected getHtmlContent(webview: vscode.Webview): string {
    const body = `
      <div class="activity-feed-container">
        <!-- Header with title and actions -->
        <header class="feed-header">
          <h1>Activity Feed</h1>
          <div class="header-actions">
            <button type="button" id="clearBtn" class="secondary" title="Clear all events">
              Clear
            </button>
            <button type="button" id="exportJsonBtn" class="secondary" title="Export as JSON">
              Export JSON
            </button>
            <button type="button" id="exportCsvBtn" class="secondary" title="Export as CSV">
              Export CSV
            </button>
          </div>
        </header>

        <!-- Statistics Summary Bar -->
        <section class="stats-bar" id="statsBar">
          <div class="stat-item">
            <span class="stat-value" id="statTotal">0</span>
            <span class="stat-label">Total</span>
          </div>
          <div class="stat-item stat-success">
            <span class="stat-value" id="statSuccess">0</span>
            <span class="stat-label">Success</span>
          </div>
          <div class="stat-item stat-error">
            <span class="stat-value" id="statError">0</span>
            <span class="stat-label">Error</span>
          </div>
          <div class="stat-item stat-timeout">
            <span class="stat-value" id="statTimeout">0</span>
            <span class="stat-label">Timeout</span>
          </div>
          <div class="stat-item stat-pending">
            <span class="stat-value" id="statPending">0</span>
            <span class="stat-label">Pending</span>
          </div>
          <div class="stat-item">
            <span class="stat-value" id="statAvgDuration">0ms</span>
            <span class="stat-label">Avg Duration</span>
          </div>
          <div class="stat-item">
            <span class="stat-value" id="statCallsPerMin">0</span>
            <span class="stat-label">Calls/min</span>
          </div>
        </section>

        <!-- Filter Controls -->
        <section class="filter-bar">
          <div class="filter-group">
            <input type="text" id="filterTool" placeholder="Filter by tool name..." class="filter-input" />
          </div>
          <div class="filter-group">
            <select id="filterNamespace" class="filter-select">
              <option value="">All Namespaces</option>
            </select>
          </div>
          <div class="filter-group filter-checkboxes">
            <label class="checkbox-label">
              <input type="checkbox" id="filterSuccess" checked />
              <span class="status-icon success">✓</span> Success
            </label>
            <label class="checkbox-label">
              <input type="checkbox" id="filterError" checked />
              <span class="status-icon error">✗</span> Error
            </label>
            <label class="checkbox-label">
              <input type="checkbox" id="filterTimeout" checked />
              <span class="status-icon timeout">⏱</span> Timeout
            </label>
            <label class="checkbox-label">
              <input type="checkbox" id="filterPending" checked />
              <span class="status-icon pending">⟳</span> Pending
            </label>
          </div>
          <div class="filter-group">
            <select id="filterTimeRange" class="filter-select">
              <option value="">All Time</option>
              <option value="5">Last 5 min</option>
              <option value="15">Last 15 min</option>
              <option value="60">Last 1 hour</option>
            </select>
          </div>
        </section>

        <!-- Event List with Virtual Scrolling -->
        <section class="event-list-container" id="eventListContainer">
          <div class="virtual-scroll-wrapper" id="virtualScrollWrapper">
            <div class="event-list" id="eventList">
              <!-- Events will be rendered here -->
            </div>
          </div>
          <div class="load-more-container" id="loadMoreContainer">
            <button type="button" id="loadMoreBtn" class="secondary">Load More</button>
          </div>
          <div class="empty-state hidden" id="emptyState">
            <div class="empty-state-icon">📊</div>
            <div class="empty-state-title">No Activity Yet</div>
            <div class="empty-state-description">Tool invocations will appear here in real-time.</div>
          </div>
        </section>

        <!-- Event Detail Panel (shown when expanded) -->
        <div class="event-detail-overlay hidden" id="eventDetailOverlay">
          <div class="event-detail-panel" id="eventDetailPanel">
            <div class="detail-header">
              <h3 id="detailTitle">Event Details</h3>
              <button type="button" class="icon-button" id="closeDetailBtn" title="Close">✕</button>
            </div>
            <div class="detail-content" id="detailContent">
              <!-- Detail content will be rendered here -->
            </div>
          </div>
        </div>
      </div>
    `;

    const scripts = `
      // State
      let events = [];
      let stats = {};
      let namespaces = new Set();
      let expandedEventId = null;
      let filterDebounceTimer = null;

      // DOM Elements
      const statsBar = document.getElementById('statsBar');
      const eventList = document.getElementById('eventList');
      const emptyState = document.getElementById('emptyState');
      const loadMoreContainer = document.getElementById('loadMoreContainer');
      const loadMoreBtn = document.getElementById('loadMoreBtn');
      const clearBtn = document.getElementById('clearBtn');
      const exportJsonBtn = document.getElementById('exportJsonBtn');
      const exportCsvBtn = document.getElementById('exportCsvBtn');
      const filterTool = document.getElementById('filterTool');
      const filterNamespace = document.getElementById('filterNamespace');
      const filterSuccess = document.getElementById('filterSuccess');
      const filterError = document.getElementById('filterError');
      const filterTimeout = document.getElementById('filterTimeout');
      const filterPending = document.getElementById('filterPending');
      const filterTimeRange = document.getElementById('filterTimeRange');
      const eventDetailOverlay = document.getElementById('eventDetailOverlay');
      const eventDetailPanel = document.getElementById('eventDetailPanel');
      const detailTitle = document.getElementById('detailTitle');
      const detailContent = document.getElementById('detailContent');
      const closeDetailBtn = document.getElementById('closeDetailBtn');

      // Event Listeners
      clearBtn.addEventListener('click', () => {
        if (confirm('Are you sure you want to clear all events?')) {
          postMessage('clearEvents');
        }
      });

      exportJsonBtn.addEventListener('click', () => {
        postMessage('exportEvents', { format: 'json' });
      });

      exportCsvBtn.addEventListener('click', () => {
        postMessage('exportEvents', { format: 'csv' });
      });

      loadMoreBtn.addEventListener('click', () => {
        postMessage('loadMore', { offset: events.length, limit: 50 });
      });

      closeDetailBtn.addEventListener('click', () => {
        hideEventDetail();
      });

      eventDetailOverlay.addEventListener('click', (e) => {
        if (e.target === eventDetailOverlay) {
          hideEventDetail();
        }
      });

      // Filter event listeners with debouncing
      filterTool.addEventListener('input', debounceFilter);
      filterNamespace.addEventListener('change', sendFilterChange);
      filterSuccess.addEventListener('change', sendFilterChange);
      filterError.addEventListener('change', sendFilterChange);
      filterTimeout.addEventListener('change', sendFilterChange);
      filterPending.addEventListener('change', sendFilterChange);
      filterTimeRange.addEventListener('change', sendFilterChange);

      function debounceFilter() {
        if (filterDebounceTimer) {
          clearTimeout(filterDebounceTimer);
        }
        filterDebounceTimer = setTimeout(sendFilterChange, 300);
      }

      function sendFilterChange() {
        const filter = buildFilter();
        postMessage('filterChange', filter);
      }

      function buildFilter() {
        const filter = {};

        // Tool name filter
        const toolName = filterTool.value.trim();
        if (toolName) {
          filter.toolName = toolName;
        }

        // Namespace filter
        const namespace = filterNamespace.value;
        if (namespace) {
          filter.namespace = namespace;
        }

        // Status filter
        const statuses = [];
        if (filterSuccess.checked) statuses.push('success');
        if (filterError.checked) statuses.push('error');
        if (filterTimeout.checked) statuses.push('timeout');
        if (filterPending.checked) {
          statuses.push('pending');
          statuses.push('running');
        }
        if (statuses.length < 5) {
          filter.status = statuses;
        }

        // Time range filter
        const timeRange = parseInt(filterTimeRange.value, 10);
        if (timeRange > 0) {
          filter.startTime = Date.now() - (timeRange * 60 * 1000);
        }

        return filter;
      }

      // Message Handler
      window.addEventListener('message', (event) => {
        const message = event.data;

        switch (message.type) {
          case 'eventsUpdated':
            handleEventsUpdated(message.payload);
            break;

          case 'eventDetail':
            showEventDetail(message.payload.event);
            break;

          case 'saveState':
            setState(message.payload);
            break;
        }
      });

      function handleEventsUpdated(payload) {
        events = payload.events;
        stats = payload.stats;

        // Update statistics
        updateStats(stats);

        // Update namespace dropdown
        updateNamespaceDropdown(events);

        // Render events
        renderEvents(events);

        // Toggle load more button
        loadMoreContainer.classList.toggle('hidden', !payload.hasMore);

        // Toggle empty state
        emptyState.classList.toggle('hidden', events.length > 0);
        eventList.classList.toggle('hidden', events.length === 0);
      }

      function updateStats(stats) {
        document.getElementById('statTotal').textContent = stats.totalCalls || 0;
        document.getElementById('statSuccess').textContent = stats.successCount || 0;
        document.getElementById('statError').textContent = stats.errorCount || 0;
        document.getElementById('statTimeout').textContent = stats.timeoutCount || 0;
        document.getElementById('statPending').textContent = stats.pendingCount || 0;
        document.getElementById('statAvgDuration').textContent = formatDuration(stats.averageDuration || 0);
        document.getElementById('statCallsPerMin').textContent = (stats.callsPerMinute || 0).toFixed(1);
      }

      function updateNamespaceDropdown(events) {
        const newNamespaces = new Set();
        events.forEach(e => {
          if (e.namespace) newNamespaces.add(e.namespace);
        });

        // Only update if namespaces changed
        if (newNamespaces.size !== namespaces.size ||
            ![...newNamespaces].every(ns => namespaces.has(ns))) {
          namespaces = newNamespaces;
          const currentValue = filterNamespace.value;

          filterNamespace.innerHTML = '<option value="">All Namespaces</option>';
          [...namespaces].sort().forEach(ns => {
            const option = document.createElement('option');
            option.value = ns;
            option.textContent = ns;
            filterNamespace.appendChild(option);
          });

          // Restore selected value if still valid
          if (namespaces.has(currentValue)) {
            filterNamespace.value = currentValue;
          }
        }
      }

      function renderEvents(events) {
        const html = events.map(event => renderEventRow(event)).join('');
        eventList.innerHTML = html;

        // Add click handlers
        eventList.querySelectorAll('.event-row').forEach(row => {
          row.addEventListener('click', () => {
            const eventId = row.dataset.id;
            postMessage('expandEvent', { eventId });
          });
        });
      }

      function renderEventRow(event) {
        const statusIcon = getStatusIcon(event.status);
        const statusClass = event.status;
        const relativeTime = formatRelativeTime(event.startedAt);
        const duration = event.duration !== undefined ? formatDuration(event.duration) : '...';

        return \`
          <div class="event-row \${statusClass}" data-id="\${escapeHtml(event.id)}">
            <span class="event-status-icon">\${statusIcon}</span>
            <div class="event-info">
              <span class="event-tool-name">\${escapeHtml(event.toolName)}</span>
              \${event.namespace ? \`<span class="event-namespace">\${escapeHtml(event.namespace)}</span>\` : ''}
            </div>
            <span class="event-duration badge">\${duration}</span>
            <span class="event-time">\${relativeTime}</span>
            <span class="event-expand-icon">›</span>
          </div>
        \`;
      }

      function getStatusIcon(status) {
        switch (status) {
          case 'success': return '✓';
          case 'error': return '✗';
          case 'timeout': return '⏱';
          case 'pending':
          case 'running': return '⟳';
          default: return '?';
        }
      }

      function showEventDetail(event) {
        expandedEventId = event.id;
        detailTitle.textContent = event.toolName;

        const html = \`
          <div class="detail-section">
            <h4>Status</h4>
            <div class="detail-status \${event.status}">
              <span class="status-icon">\${getStatusIcon(event.status)}</span>
              <span>\${event.status}</span>
              \${event.errorMessage ? \`<span class="error-message">: \${escapeHtml(event.errorMessage)}</span>\` : ''}
            </div>
          </div>

          <div class="detail-section">
            <h4>Timing</h4>
            <div class="detail-timing">
              <div><strong>Started:</strong> \${new Date(event.startedAt).toLocaleString()}</div>
              \${event.completedAt ? \`<div><strong>Completed:</strong> \${new Date(event.completedAt).toLocaleString()}</div>\` : ''}
              \${event.duration !== undefined ? \`<div><strong>Duration:</strong> \${formatDuration(event.duration)}</div>\` : ''}
            </div>
          </div>

          <div class="detail-section">
            <h4>Context</h4>
            <div class="detail-context">
              \${event.namespace ? \`<div><strong>Namespace:</strong> \${escapeHtml(event.namespace)}</div>\` : ''}
              \${event.pluginId ? \`<div><strong>Plugin:</strong> \${escapeHtml(event.pluginId)}</div>\` : ''}
              \${event.agentId ? \`<div><strong>Agent:</strong> \${escapeHtml(event.agentId)}</div>\` : ''}
              \${event.containerId ? \`<div><strong>Container:</strong> \${escapeHtml(event.containerId)}</div>\` : ''}
            </div>
          </div>

          <div class="detail-section">
            <h4>Input</h4>
            <pre class="json-content">\${syntaxHighlightJson(JSON.stringify(event.input, null, 2))}</pre>
          </div>

          \${event.output ? \`
            <div class="detail-section">
              <h4>Output</h4>
              <pre class="json-content">\${syntaxHighlightJson(JSON.stringify(event.output, null, 2))}</pre>
            </div>
          \` : ''}
        \`;

        detailContent.innerHTML = html;
        eventDetailOverlay.classList.remove('hidden');
      }

      function hideEventDetail() {
        expandedEventId = null;
        eventDetailOverlay.classList.add('hidden');
      }

      // Utility Functions
      function formatDuration(ms) {
        if (ms < 1000) return ms.toFixed(0) + 'ms';
        if (ms < 60000) return (ms / 1000).toFixed(1) + 's';
        return (ms / 60000).toFixed(1) + 'm';
      }

      function formatRelativeTime(timestamp) {
        const diff = Date.now() - timestamp;
        const seconds = Math.floor(diff / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);

        if (seconds < 60) return seconds + 's ago';
        if (minutes < 60) return minutes + 'm ago';
        if (hours < 24) return hours + 'h ago';
        return new Date(timestamp).toLocaleDateString();
      }

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

      function escapeHtml(text) {
        if (text === null || text === undefined) return '';
        const div = document.createElement('div');
        div.textContent = String(text);
        return div.innerHTML;
      }

      // Restore state and initialize
      const savedState = getState();
      if (savedState.filter) {
        // Restore filter values
        if (savedState.filter.toolName) filterTool.value = savedState.filter.toolName;
        if (savedState.filter.namespace) filterNamespace.value = savedState.filter.namespace;
        // Status filters would need more complex restoration
      }

      // Request initial data
      postMessage('init');
    `;

    const styles = `
      <style>
        .activity-feed-container {
          display: flex;
          flex-direction: column;
          height: 100vh;
          overflow: hidden;
        }

        /* Header */
        .feed-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 12px 16px;
          border-bottom: 1px solid var(--vscode-panel-border);
          flex-shrink: 0;
        }

        .feed-header h1 {
          margin: 0;
          font-size: 1.2em;
          border: none;
          padding: 0;
        }

        .header-actions {
          display: flex;
          gap: 8px;
        }

        /* Statistics Bar */
        .stats-bar {
          display: flex;
          gap: 16px;
          padding: 12px 16px;
          background-color: var(--vscode-sideBar-background);
          border-bottom: 1px solid var(--vscode-panel-border);
          flex-shrink: 0;
          flex-wrap: wrap;
        }

        .stat-item {
          display: flex;
          flex-direction: column;
          align-items: center;
          min-width: 60px;
        }

        .stat-value {
          font-size: 1.4em;
          font-weight: 600;
          line-height: 1.2;
        }

        .stat-label {
          font-size: 0.75em;
          color: var(--vscode-descriptionForeground);
          text-transform: uppercase;
        }

        .stat-success .stat-value { color: var(--vscode-testing-iconPassed); }
        .stat-error .stat-value { color: var(--vscode-testing-iconFailed); }
        .stat-timeout .stat-value { color: var(--vscode-editorWarning-foreground); }
        .stat-pending .stat-value { color: var(--vscode-progressBar-background); }

        /* Filter Bar */
        .filter-bar {
          display: flex;
          gap: 12px;
          padding: 12px 16px;
          border-bottom: 1px solid var(--vscode-panel-border);
          flex-shrink: 0;
          flex-wrap: wrap;
          align-items: center;
        }

        .filter-group {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .filter-input {
          width: 200px;
        }

        .filter-select {
          min-width: 120px;
        }

        .filter-checkboxes {
          display: flex;
          gap: 12px;
        }

        .checkbox-label {
          display: flex;
          align-items: center;
          gap: 4px;
          cursor: pointer;
          font-size: 0.9em;
        }

        .checkbox-label input {
          margin: 0;
        }

        .status-icon {
          font-size: 0.9em;
        }

        .status-icon.success { color: var(--vscode-testing-iconPassed); }
        .status-icon.error { color: var(--vscode-testing-iconFailed); }
        .status-icon.timeout { color: var(--vscode-editorWarning-foreground); }
        .status-icon.pending { color: var(--vscode-progressBar-background); }

        /* Event List */
        .event-list-container {
          flex: 1;
          overflow: hidden;
          display: flex;
          flex-direction: column;
          position: relative;
        }

        .virtual-scroll-wrapper {
          flex: 1;
          overflow-y: auto;
          padding: 8px 0;
        }

        .event-list {
          display: flex;
          flex-direction: column;
        }

        .event-row {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 10px 16px;
          border-bottom: 1px solid var(--vscode-panel-border);
          cursor: pointer;
          transition: background-color 0.1s;
        }

        .event-row:hover {
          background-color: var(--vscode-list-hoverBackground);
        }

        .event-status-icon {
          flex-shrink: 0;
          width: 20px;
          text-align: center;
          font-size: 1.1em;
        }

        .event-row.success .event-status-icon { color: var(--vscode-testing-iconPassed); }
        .event-row.error .event-status-icon { color: var(--vscode-testing-iconFailed); }
        .event-row.timeout .event-status-icon { color: var(--vscode-editorWarning-foreground); }
        .event-row.pending .event-status-icon,
        .event-row.running .event-status-icon { color: var(--vscode-progressBar-background); }

        .event-info {
          flex: 1;
          min-width: 0;
          display: flex;
          flex-direction: column;
          gap: 2px;
        }

        .event-tool-name {
          font-weight: 500;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .event-namespace {
          font-size: 0.85em;
          color: var(--vscode-descriptionForeground);
        }

        .event-duration {
          flex-shrink: 0;
          font-size: 0.85em;
          padding: 2px 8px;
          background-color: var(--vscode-badge-background);
          color: var(--vscode-badge-foreground);
          border-radius: 10px;
        }

        .event-time {
          flex-shrink: 0;
          font-size: 0.85em;
          color: var(--vscode-descriptionForeground);
          min-width: 60px;
          text-align: right;
        }

        .event-expand-icon {
          flex-shrink: 0;
          color: var(--vscode-descriptionForeground);
          transition: transform 0.2s;
        }

        .event-row:hover .event-expand-icon {
          transform: translateX(3px);
        }

        /* Load More */
        .load-more-container {
          padding: 12px 16px;
          text-align: center;
          border-top: 1px solid var(--vscode-panel-border);
        }

        .load-more-container.hidden {
          display: none;
        }

        /* Empty State */
        .empty-state {
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
        }

        .empty-state.hidden {
          display: none;
        }

        /* Event Detail Overlay */
        .event-detail-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background-color: rgba(0, 0, 0, 0.5);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
        }

        .event-detail-overlay.hidden {
          display: none;
        }

        .event-detail-panel {
          width: 90%;
          max-width: 700px;
          max-height: 80vh;
          background-color: var(--vscode-editor-background);
          border: 1px solid var(--vscode-panel-border);
          border-radius: 6px;
          overflow: hidden;
          display: flex;
          flex-direction: column;
        }

        .detail-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 12px 16px;
          border-bottom: 1px solid var(--vscode-panel-border);
          background-color: var(--vscode-sideBar-background);
        }

        .detail-header h3 {
          margin: 0;
          font-size: 1.1em;
        }

        .detail-content {
          flex: 1;
          overflow-y: auto;
          padding: 16px;
        }

        .detail-section {
          margin-bottom: 20px;
        }

        .detail-section:last-child {
          margin-bottom: 0;
        }

        .detail-section h4 {
          margin: 0 0 8px 0;
          font-size: 0.9em;
          text-transform: uppercase;
          color: var(--vscode-descriptionForeground);
        }

        .detail-status {
          display: flex;
          align-items: center;
          gap: 8px;
          font-weight: 500;
        }

        .detail-status.success { color: var(--vscode-testing-iconPassed); }
        .detail-status.error { color: var(--vscode-testing-iconFailed); }
        .detail-status.timeout { color: var(--vscode-editorWarning-foreground); }
        .detail-status.pending,
        .detail-status.running { color: var(--vscode-progressBar-background); }

        .detail-status .error-message {
          color: var(--vscode-testing-iconFailed);
          font-weight: normal;
        }

        .detail-timing div,
        .detail-context div {
          margin-bottom: 4px;
        }

        .detail-timing div:last-child,
        .detail-context div:last-child {
          margin-bottom: 0;
        }

        .json-content {
          margin: 0;
          padding: 12px;
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

        /* Responsive */
        @media (max-width: 600px) {
          .stats-bar {
            gap: 12px;
          }

          .stat-item {
            min-width: 50px;
          }

          .filter-bar {
            flex-direction: column;
            align-items: stretch;
          }

          .filter-input {
            width: 100%;
          }

          .filter-checkboxes {
            flex-wrap: wrap;
          }
        }
      </style>
    `;

    return this.getBaseHtml(webview, {
      title: 'Activity Feed',
      body,
      scripts,
      styles,
    });
  }
}
