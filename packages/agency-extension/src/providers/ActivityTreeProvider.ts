import type * as vscode from 'vscode';
import type { ToolCallEvent, ToolCallStatus } from '../types';
import { ActivityService } from '../services/ActivityService';
import { VIEW_IDS } from '../constants';
import { createScopedLogger, DisposableManager } from '../utils';

const log = createScopedLogger('ActivityTreeProvider');

/**
 * Context values for activity tree items.
 * Used for context menu targeting in package.json.
 */
const CONTEXT_VALUES = {
  TIME_GROUP: 'activityTimeGroup',
  ACTIVITY_SUCCESS: 'activitySuccess',
  ACTIVITY_ERROR: 'activityError',
  ACTIVITY_PENDING: 'activityPending',
  ACTIVITY_RUNNING: 'activityRunning',
} as const;

/**
 * Tree item types for the activity view.
 */
type ActivityTreeItemType = 'timeGroup' | 'activity';

/**
 * Base data structure for activity tree items.
 */
interface ActivityTreeItemData {
  type: ActivityTreeItemType;
  id: string;
}

/**
 * Time group item data.
 */
interface TimeGroupItemData extends ActivityTreeItemData {
  type: 'timeGroup';
  groupName: 'lastMinute' | 'lastFiveMinutes' | 'older';
  label: string;
  eventCount: number;
}

/**
 * Activity (tool call) item data.
 */
interface ActivityItemData extends ActivityTreeItemData {
  type: 'activity';
  event: ToolCallEvent;
}

/**
 * Union of all tree item data types.
 */
type TreeItemData = TimeGroupItemData | ActivityItemData;

/**
 * Get status display information.
 */
function getStatusInfo(status: ToolCallStatus): {
  icon: string;
  color: string;
  label: string;
} {
  switch (status) {
    case 'success':
      return { icon: 'check', color: 'charts.green', label: 'Success' };
    case 'error':
      return { icon: 'error', color: 'errorForeground', label: 'Error' };
    case 'timeout':
      return { icon: 'clock', color: 'editorWarning.foreground', label: 'Timeout' };
    case 'running':
      return { icon: 'loading~spin', color: 'foreground', label: 'Running' };
    case 'pending':
      return { icon: 'circle-outline', color: 'disabledForeground', label: 'Pending' };
    default:
      return { icon: 'question', color: 'disabledForeground', label: 'Unknown' };
  }
}

/**
 * Format a timestamp as a relative time string.
 */
function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;

  if (diff < 1000) {
    return 'just now';
  } else if (diff < 60 * 1000) {
    const seconds = Math.floor(diff / 1000);
    return `${seconds}s ago`;
  } else if (diff < 60 * 60 * 1000) {
    const minutes = Math.floor(diff / (60 * 1000));
    return `${minutes}m ago`;
  } else if (diff < 24 * 60 * 60 * 1000) {
    const hours = Math.floor(diff / (60 * 60 * 1000));
    return `${hours}h ago`;
  } else {
    const days = Math.floor(diff / (24 * 60 * 60 * 1000));
    return `${days}d ago`;
  }
}

/**
 * Format duration in milliseconds to a human-readable string.
 */
function formatDuration(ms: number | undefined): string {
  if (ms === undefined) {
    return '';
  }
  if (ms < 1000) {
    return `${ms}ms`;
  } else if (ms < 60 * 1000) {
    return `${(ms / 1000).toFixed(1)}s`;
  } else {
    const minutes = Math.floor(ms / (60 * 1000));
    const seconds = Math.floor((ms % (60 * 1000)) / 1000);
    return `${minutes}m ${seconds}s`;
  }
}

/**
 * Creates a time group item.
 */
function createTimeGroupItem(
  vscodeModule: typeof vscode,
  groupName: TimeGroupItemData['groupName'],
  label: string,
  eventCount: number
): vscode.TreeItem {
  const item = new vscodeModule.TreeItem(
    label,
    eventCount > 0
      ? vscodeModule.TreeItemCollapsibleState.Expanded
      : vscodeModule.TreeItemCollapsibleState.Collapsed
  );

  item.description = `${eventCount} call${eventCount !== 1 ? 's' : ''}`;
  item.contextValue = CONTEXT_VALUES.TIME_GROUP;

  // Use different icons based on recency
  switch (groupName) {
    case 'lastMinute':
      item.iconPath = new vscodeModule.ThemeIcon('pulse');
      break;
    case 'lastFiveMinutes':
      item.iconPath = new vscodeModule.ThemeIcon('history');
      break;
    case 'older':
      item.iconPath = new vscodeModule.ThemeIcon('archive');
      break;
  }

  item.tooltip = `${label}: ${eventCount} tool call${eventCount !== 1 ? 's' : ''}`;

  return item;
}

/**
 * Creates an activity (tool call) item.
 */
function createActivityItem(
  vscodeModule: typeof vscode,
  event: ToolCallEvent
): vscode.TreeItem {
  const statusInfo = getStatusInfo(event.status);
  const item = new vscodeModule.TreeItem(
    event.toolName,
    vscodeModule.TreeItemCollapsibleState.None
  );

  // Show timestamp as description
  const timeStr = formatRelativeTime(event.startedAt);
  const durationStr = formatDuration(event.duration);
  item.description = durationStr ? `${timeStr} (${durationStr})` : timeStr;

  // Set icon based on status
  item.iconPath = new vscodeModule.ThemeIcon(
    statusInfo.icon,
    new vscodeModule.ThemeColor(statusInfo.color)
  );

  // Set context value based on status
  switch (event.status) {
    case 'success':
      item.contextValue = CONTEXT_VALUES.ACTIVITY_SUCCESS;
      break;
    case 'error':
    case 'timeout':
      item.contextValue = CONTEXT_VALUES.ACTIVITY_ERROR;
      break;
    case 'running':
      item.contextValue = CONTEXT_VALUES.ACTIVITY_RUNNING;
      break;
    case 'pending':
      item.contextValue = CONTEXT_VALUES.ACTIVITY_PENDING;
      break;
  }

  // Build detailed tooltip
  const tooltipLines: string[] = [
    `Tool: ${event.toolName}`,
    `Status: ${statusInfo.label}`,
    `Started: ${new Date(event.startedAt).toLocaleTimeString()}`,
  ];

  if (event.namespace) {
    tooltipLines.push(`Namespace: ${event.namespace}`);
  }

  if (event.pluginId) {
    tooltipLines.push(`Plugin: ${event.pluginId}`);
  }

  if (event.duration !== undefined) {
    tooltipLines.push(`Duration: ${formatDuration(event.duration)}`);
  }

  if (event.isError && event.errorMessage) {
    tooltipLines.push(`\nError: ${event.errorMessage}`);
  }

  // Add input preview (first few keys)
  const inputKeys = Object.keys(event.input);
  if (inputKeys.length > 0) {
    const preview = inputKeys.slice(0, 3).join(', ');
    const ellipsis = inputKeys.length > 3 ? '...' : '';
    tooltipLines.push(`\nInput: {${preview}${ellipsis}}`);
  }

  item.tooltip = tooltipLines.join('\n');

  // Command to show details (for inline expand)
  item.command = {
    command: 'agency.showActivityDetails',
    title: 'Show Details',
    arguments: [event],
  };

  return item;
}

/**
 * TreeDataProvider for the Activity view.
 * Displays recent tool calls grouped by time (last minute, last 5 minutes, older).
 * Listens to ActivityService for real-time updates.
 */
export class ActivityTreeProvider implements vscode.TreeDataProvider<TreeItemData> {
  private _onDidChangeTreeData = new (class {
    private _emitter: vscode.EventEmitter<TreeItemData | undefined | void> | null = null;

    initialize(vscodeModule: typeof vscode): void {
      this._emitter = new vscodeModule.EventEmitter<TreeItemData | undefined | void>();
    }

    get event(): vscode.Event<TreeItemData | undefined | void> | undefined {
      return this._emitter?.event;
    }

    fire(element?: TreeItemData): void {
      this._emitter?.fire(element);
    }

    dispose(): void {
      this._emitter?.dispose();
    }
  })();

  private readonly _disposables = new DisposableManager();
  private _vscodeModule: typeof vscode | null = null;
  private _activityService: ActivityService | null = null;
  private _eventsByGroup: {
    lastMinute: ToolCallEvent[];
    lastFiveMinutes: ToolCallEvent[];
    older: ToolCallEvent[];
  } = {
    lastMinute: [],
    lastFiveMinutes: [],
    older: [],
  };

  /**
   * Event that fires when the tree data changes.
   */
  get onDidChangeTreeData(): vscode.Event<TreeItemData | undefined | void> | undefined {
    return this._onDidChangeTreeData.event;
  }

  /**
   * Initialize the provider with VS Code module and ActivityService.
   * Must be called before the provider can be used.
   */
  async initialize(vscodeModule: typeof vscode): Promise<void> {
    this._vscodeModule = vscodeModule;
    this._onDidChangeTreeData.initialize(vscodeModule);

    // Get ActivityService instance
    this._activityService = ActivityService.getInstance();

    // Subscribe to individual tool call events
    const toolCallSubscription = this._activityService.onToolCall((event: ToolCallEvent) => {
      log.debug(`Tool call: ${event.toolName}`);
      this._refreshEventGroups();
      this.refresh();
    });
    this._disposables.add(toolCallSubscription);

    // Subscribe to batch events
    const batchSubscription = this._activityService.onBatch(() => {
      log.debug('Batch update received');
      this._refreshEventGroups();
      this.refresh();
    });
    this._disposables.add(batchSubscription);

    // Initial load of events
    this._refreshEventGroups();

    log.debug('ActivityTreeProvider initialized');
  }

  /**
   * Refresh the event groupings from the activity service.
   * Groups events by time: last minute, last 5 minutes, older.
   */
  private _refreshEventGroups(): void {
    if (!this._activityService) {
      return;
    }

    // Get all events from the service (newest first)
    const events = this._activityService.getEvents();
    const now = Date.now();
    const oneMinuteAgo = now - 60 * 1000;
    const fiveMinutesAgo = now - 5 * 60 * 1000;

    // Reset groups
    this._eventsByGroup = {
      lastMinute: [],
      lastFiveMinutes: [],
      older: [],
    };

    // Group events by time
    for (const event of events) {
      if (event.startedAt >= oneMinuteAgo) {
        this._eventsByGroup.lastMinute.push(event);
      } else if (event.startedAt >= fiveMinutesAgo) {
        this._eventsByGroup.lastFiveMinutes.push(event);
      } else {
        this._eventsByGroup.older.push(event);
      }
    }
  }

  /**
   * Get the tree item for an element.
   */
  getTreeItem(element: TreeItemData): vscode.TreeItem {
    if (!this._vscodeModule) {
      throw new Error('ActivityTreeProvider not initialized');
    }

    switch (element.type) {
      case 'timeGroup':
        return createTimeGroupItem(
          this._vscodeModule,
          element.groupName,
          element.label,
          element.eventCount
        );
      case 'activity':
        return createActivityItem(this._vscodeModule, element.event);
      default:
        throw new Error('Unknown tree item type');
    }
  }

  /**
   * Get the children of a tree element.
   */
  getChildren(element?: TreeItemData): TreeItemData[] {
    // Root level: show time groups
    if (!element) {
      const children: TreeItemData[] = [];

      // Last Minute group
      children.push({
        type: 'timeGroup',
        id: 'group:lastMinute',
        groupName: 'lastMinute',
        label: 'Last Minute',
        eventCount: this._eventsByGroup.lastMinute.length,
      });

      // Last 5 Minutes group
      children.push({
        type: 'timeGroup',
        id: 'group:lastFiveMinutes',
        groupName: 'lastFiveMinutes',
        label: 'Last 5 Minutes',
        eventCount: this._eventsByGroup.lastFiveMinutes.length,
      });

      // Older group
      children.push({
        type: 'timeGroup',
        id: 'group:older',
        groupName: 'older',
        label: 'Older',
        eventCount: this._eventsByGroup.older.length,
      });

      return children;
    }

    // Children of time group: activities in that group
    if (element.type === 'timeGroup') {
      const events = this._eventsByGroup[element.groupName] || [];
      return events.map((event) => ({
        type: 'activity' as const,
        id: `activity:${event.id}`,
        event,
      }));
    }

    // Activity items have no children
    return [];
  }

  /**
   * Get the parent of a tree element.
   */
  getParent(element: TreeItemData): TreeItemData | undefined {
    // Time groups are at root
    if (element.type === 'timeGroup') {
      return undefined;
    }

    // Find which group the activity belongs to
    if (element.type === 'activity') {
      const event = element.event;
      const now = Date.now();
      const oneMinuteAgo = now - 60 * 1000;
      const fiveMinutesAgo = now - 5 * 60 * 1000;

      let groupName: TimeGroupItemData['groupName'];
      let label: string;

      if (event.startedAt >= oneMinuteAgo) {
        groupName = 'lastMinute';
        label = 'Last Minute';
      } else if (event.startedAt >= fiveMinutesAgo) {
        groupName = 'lastFiveMinutes';
        label = 'Last 5 Minutes';
      } else {
        groupName = 'older';
        label = 'Older';
      }

      return {
        type: 'timeGroup',
        id: `group:${groupName}`,
        groupName,
        label,
        eventCount: this._eventsByGroup[groupName].length,
      };
    }

    return undefined;
  }

  /**
   * Refresh the entire tree.
   */
  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  /**
   * Refresh a specific activity in the tree.
   */
  refreshActivity(event: ToolCallEvent): void {
    this._refreshEventGroups();
    this._onDidChangeTreeData.fire({
      type: 'activity',
      id: `activity:${event.id}`,
      event,
    });
  }

  /**
   * Get total event count across all groups.
   */
  getTotalEventCount(): number {
    return (
      this._eventsByGroup.lastMinute.length +
      this._eventsByGroup.lastFiveMinutes.length +
      this._eventsByGroup.older.length
    );
  }

  /**
   * Dispose of provider resources.
   */
  dispose(): void {
    this._disposables.dispose();
    this._onDidChangeTreeData.dispose();
    this._vscodeModule = null;
    this._activityService = null;
    this._eventsByGroup = {
      lastMinute: [],
      lastFiveMinutes: [],
      older: [],
    };
    log.debug('ActivityTreeProvider disposed');
  }
}

/**
 * Register the ActivityTreeProvider with VS Code.
 * Creates the tree view and returns disposables for cleanup.
 *
 * @param vscodeModule The VS Code module
 * @returns Disposable for cleanup
 */
export async function registerActivityTreeView(
  vscodeModule: typeof vscode
): Promise<vscode.Disposable> {
  const provider = new ActivityTreeProvider();
  await provider.initialize(vscodeModule);

  const treeView = vscodeModule.window.createTreeView(VIEW_IDS.ACTIVITY, {
    treeDataProvider: provider,
    showCollapseAll: true,
  });

  log.info('Activity tree view registered');

  // Return combined disposable
  return {
    dispose: () => {
      treeView.dispose();
      provider.dispose();
    },
  };
}
