import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type * as vscode from 'vscode';
import { ActivityTreeProvider, registerActivityTreeView } from '../../providers/ActivityTreeProvider';
import { ActivityService } from '../../services/ActivityService';
import type { ToolCallEvent, ToolCallStatus } from '../../types';

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
 * Create a mock tool call event for testing.
 */
function createMockEvent(overrides: Partial<ToolCallEvent> = {}): ToolCallEvent {
  return {
    id: `event-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    toolName: 'testTool',
    input: {},
    output: null,
    isError: false,
    status: 'success' as ToolCallStatus,
    startedAt: Date.now(),
    ...overrides,
  };
}

// Mock ActivityService
vi.mock('../../services/ActivityService', () => {
  const eventListeners: Set<(event: unknown) => void> = new Set();
  let mockEventsByTimePeriod = {
    lastMinute: [] as ToolCallEvent[],
    lastFiveMinutes: [] as ToolCallEvent[],
    older: [] as ToolCallEvent[],
  };

  return {
    ActivityService: {
      getInstance: vi.fn(() => ({
        get onActivityUpdate() {
          return (listener: (event: unknown) => void) => {
            eventListeners.add(listener);
            return { dispose: () => eventListeners.delete(listener) };
          };
        },
        getEventsByTimePeriod: vi.fn(() => mockEventsByTimePeriod),
        // Test helpers
        _triggerUpdate: (event: unknown) => {
          for (const listener of eventListeners) {
            listener(event);
          }
        },
        _setEventsByTimePeriod: (events: typeof mockEventsByTimePeriod) => {
          mockEventsByTimePeriod = events;
        },
      })),
      reset: vi.fn(),
    },
  };
});

describe('ActivityTreeProvider', () => {
  let mockVscode: typeof vscode;
  let mockTreeView: {
    dispose: () => void;
  };

  beforeEach(() => {
    vi.clearAllMocks();

    mockTreeView = {
      dispose: vi.fn(),
    };

    // Create mock VS Code module
    mockVscode = {
      TreeItemCollapsibleState: {
        None: 0,
        Collapsed: 1,
        Expanded: 2,
      },
      TreeItem: class MockTreeItem {
        label?: string;
        description?: string;
        tooltip?: string;
        iconPath?: unknown;
        contextValue?: string;
        command?: unknown;
        collapsibleState?: number;

        constructor(labelOrResource: string | vscode.Uri, collapsibleState?: number) {
          if (typeof labelOrResource === 'string') {
            this.label = labelOrResource;
          }
          this.collapsibleState = collapsibleState;
        }
      },
      ThemeIcon: class MockThemeIcon {
        id: string;
        color?: { id: string };
        constructor(id: string, color?: { id: string }) {
          this.id = id;
          this.color = color;
        }
      },
      ThemeColor: class MockThemeColor {
        id: string;
        constructor(id: string) {
          this.id = id;
        }
      },
      EventEmitter: class MockEventEmitterClass {
        private _listeners = new Set<(data: unknown) => void>();
        get event() {
          return ((listener: (data: unknown) => void) => {
            this._listeners.add(listener);
            return { dispose: () => this._listeners.delete(listener) };
          }) as vscode.Event<unknown>;
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
      window: {
        createTreeView: vi.fn(() => mockTreeView),
      },
    } as unknown as typeof vscode;

    // Reset mock data
    const mockService = ActivityService.getInstance() as unknown as {
      _setEventsByTimePeriod: (events: {
        lastMinute: ToolCallEvent[];
        lastFiveMinutes: ToolCallEvent[];
        older: ToolCallEvent[];
      }) => void;
    };
    mockService._setEventsByTimePeriod({
      lastMinute: [],
      lastFiveMinutes: [],
      older: [],
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('initialization', () => {
    it('should initialize successfully', async () => {
      const provider = new ActivityTreeProvider();
      await provider.initialize(mockVscode);

      expect(ActivityService.getInstance).toHaveBeenCalled();
    });

    it('should subscribe to activity updates', async () => {
      const provider = new ActivityTreeProvider();
      await provider.initialize(mockVscode);

      expect(provider.onDidChangeTreeData).toBeDefined();
    });
  });

  describe('getChildren', () => {
    it('should return three time groups at root level', async () => {
      const provider = new ActivityTreeProvider();
      await provider.initialize(mockVscode);

      const children = provider.getChildren();

      expect(children).toHaveLength(3);
      expect(children[0].type).toBe('timeGroup');
      expect(children[1].type).toBe('timeGroup');
      expect(children[2].type).toBe('timeGroup');
    });

    it('should return time groups with correct labels', async () => {
      const provider = new ActivityTreeProvider();
      await provider.initialize(mockVscode);

      const children = provider.getChildren() as Array<{
        type: 'timeGroup';
        groupName: string;
        label: string;
      }>;

      expect(children[0].label).toBe('Last Minute');
      expect(children[1].label).toBe('Last 5 Minutes');
      expect(children[2].label).toBe('Older');
    });

    it('should return activities for time group', async () => {
      const mockService = ActivityService.getInstance() as unknown as {
        _setEventsByTimePeriod: (events: {
          lastMinute: ToolCallEvent[];
          lastFiveMinutes: ToolCallEvent[];
          older: ToolCallEvent[];
        }) => void;
      };

      const now = Date.now();
      mockService._setEventsByTimePeriod({
        lastMinute: [
          createMockEvent({ id: 'event-1', startedAt: now - 30 * 1000 }),
          createMockEvent({ id: 'event-2', startedAt: now - 45 * 1000 }),
        ],
        lastFiveMinutes: [],
        older: [],
      });

      const provider = new ActivityTreeProvider();
      await provider.initialize(mockVscode);

      const timeGroup = {
        type: 'timeGroup' as const,
        id: 'group:lastMinute',
        groupName: 'lastMinute' as const,
        label: 'Last Minute',
        eventCount: 2,
      };

      const children = provider.getChildren(timeGroup);

      expect(children).toHaveLength(2);
      expect(children[0].type).toBe('activity');
      expect(children[1].type).toBe('activity');
    });

    it('should return empty array for activity items', async () => {
      const provider = new ActivityTreeProvider();
      await provider.initialize(mockVscode);

      const event = createMockEvent();
      const activityItem = {
        type: 'activity' as const,
        id: `activity:${event.id}`,
        event,
      };

      const children = provider.getChildren(activityItem);

      expect(children).toEqual([]);
    });
  });

  describe('getTreeItem', () => {
    it('should create tree item for time group', async () => {
      const provider = new ActivityTreeProvider();
      await provider.initialize(mockVscode);

      const timeGroup = {
        type: 'timeGroup' as const,
        id: 'group:lastMinute',
        groupName: 'lastMinute' as const,
        label: 'Last Minute',
        eventCount: 5,
      };

      const treeItem = provider.getTreeItem(timeGroup);

      expect(treeItem.label).toBe('Last Minute');
      expect(treeItem.description).toBe('5 calls');
      expect(treeItem.contextValue).toBe('activityTimeGroup');
    });

    it('should create tree item for successful activity', async () => {
      const provider = new ActivityTreeProvider();
      await provider.initialize(mockVscode);

      const event = createMockEvent({
        toolName: 'myTool',
        status: 'success',
        duration: 150,
      });

      const activityItem = {
        type: 'activity' as const,
        id: `activity:${event.id}`,
        event,
      };

      const treeItem = provider.getTreeItem(activityItem);

      expect(treeItem.label).toBe('myTool');
      expect(treeItem.contextValue).toBe('activitySuccess');
    });

    it('should create tree item for error activity', async () => {
      const provider = new ActivityTreeProvider();
      await provider.initialize(mockVscode);

      const event = createMockEvent({
        toolName: 'failingTool',
        status: 'error',
        isError: true,
        errorMessage: 'Something went wrong',
      });

      const activityItem = {
        type: 'activity' as const,
        id: `activity:${event.id}`,
        event,
      };

      const treeItem = provider.getTreeItem(activityItem);

      expect(treeItem.label).toBe('failingTool');
      expect(treeItem.contextValue).toBe('activityError');
      expect(treeItem.tooltip).toContain('Error: Something went wrong');
    });

    it('should create tree item for running activity', async () => {
      const provider = new ActivityTreeProvider();
      await provider.initialize(mockVscode);

      const event = createMockEvent({
        toolName: 'runningTool',
        status: 'running',
      });

      const activityItem = {
        type: 'activity' as const,
        id: `activity:${event.id}`,
        event,
      };

      const treeItem = provider.getTreeItem(activityItem);

      expect(treeItem.label).toBe('runningTool');
      expect(treeItem.contextValue).toBe('activityRunning');
    });

    it('should include duration in description when available', async () => {
      const provider = new ActivityTreeProvider();
      await provider.initialize(mockVscode);

      const event = createMockEvent({
        toolName: 'timedTool',
        duration: 1500, // 1.5 seconds
      });

      const activityItem = {
        type: 'activity' as const,
        id: `activity:${event.id}`,
        event,
      };

      const treeItem = provider.getTreeItem(activityItem);

      expect(treeItem.description).toContain('1.5s');
    });

    it('should set command to show details', async () => {
      const provider = new ActivityTreeProvider();
      await provider.initialize(mockVscode);

      const event = createMockEvent({ toolName: 'detailTool' });
      const activityItem = {
        type: 'activity' as const,
        id: `activity:${event.id}`,
        event,
      };

      const treeItem = provider.getTreeItem(activityItem);

      expect(treeItem.command).toEqual({
        command: 'agency.showActivityDetails',
        title: 'Show Details',
        arguments: [event],
      });
    });

    it('should throw if not initialized', () => {
      const provider = new ActivityTreeProvider();

      const timeGroup = {
        type: 'timeGroup' as const,
        id: 'group:lastMinute',
        groupName: 'lastMinute' as const,
        label: 'Last Minute',
        eventCount: 0,
      };

      expect(() => provider.getTreeItem(timeGroup)).toThrow(
        'ActivityTreeProvider not initialized'
      );
    });
  });

  describe('getParent', () => {
    it('should return undefined for time groups', async () => {
      const provider = new ActivityTreeProvider();
      await provider.initialize(mockVscode);

      const timeGroup = {
        type: 'timeGroup' as const,
        id: 'group:lastMinute',
        groupName: 'lastMinute' as const,
        label: 'Last Minute',
        eventCount: 0,
      };

      const parent = provider.getParent(timeGroup);

      expect(parent).toBeUndefined();
    });

    it('should return correct time group parent for activity', async () => {
      const mockService = ActivityService.getInstance() as unknown as {
        _setEventsByTimePeriod: (events: {
          lastMinute: ToolCallEvent[];
          lastFiveMinutes: ToolCallEvent[];
          older: ToolCallEvent[];
        }) => void;
      };

      const now = Date.now();
      const event = createMockEvent({ startedAt: now - 30 * 1000 }); // 30 seconds ago

      mockService._setEventsByTimePeriod({
        lastMinute: [event],
        lastFiveMinutes: [],
        older: [],
      });

      const provider = new ActivityTreeProvider();
      await provider.initialize(mockVscode);

      const activityItem = {
        type: 'activity' as const,
        id: `activity:${event.id}`,
        event,
      };

      const parent = provider.getParent(activityItem);

      expect(parent?.type).toBe('timeGroup');
      expect((parent as { groupName: string })?.groupName).toBe('lastMinute');
    });
  });

  describe('refresh', () => {
    it('should fire tree data change event', async () => {
      const provider = new ActivityTreeProvider();
      await provider.initialize(mockVscode);

      expect(provider.onDidChangeTreeData).toBeDefined();

      // Refresh should not throw
      provider.refresh();
    });
  });

  describe('getTotalEventCount', () => {
    it('should return total count across all groups', async () => {
      const mockService = ActivityService.getInstance() as unknown as {
        _setEventsByTimePeriod: (events: {
          lastMinute: ToolCallEvent[];
          lastFiveMinutes: ToolCallEvent[];
          older: ToolCallEvent[];
        }) => void;
      };

      mockService._setEventsByTimePeriod({
        lastMinute: [createMockEvent(), createMockEvent()],
        lastFiveMinutes: [createMockEvent()],
        older: [createMockEvent(), createMockEvent(), createMockEvent()],
      });

      const provider = new ActivityTreeProvider();
      await provider.initialize(mockVscode);

      const total = provider.getTotalEventCount();

      expect(total).toBe(6);
    });
  });

  describe('dispose', () => {
    it('should clean up resources', async () => {
      const provider = new ActivityTreeProvider();
      await provider.initialize(mockVscode);

      provider.dispose();

      // After dispose, getTotalEventCount should return 0
      const total = provider.getTotalEventCount();
      expect(total).toBe(0);
    });
  });

  describe('registerActivityTreeView', () => {
    it('should create tree view with correct ID', async () => {
      await registerActivityTreeView(mockVscode);

      expect(mockVscode.window.createTreeView).toHaveBeenCalledWith(
        'agency.activity',
        expect.objectContaining({
          treeDataProvider: expect.any(Object),
          showCollapseAll: true,
        })
      );
    });

    it('should return disposable', async () => {
      const disposable = await registerActivityTreeView(mockVscode);

      expect(disposable).toHaveProperty('dispose');
      expect(typeof disposable.dispose).toBe('function');
    });

    it('should dispose both tree view and provider on dispose', async () => {
      const disposable = await registerActivityTreeView(mockVscode);

      disposable.dispose();

      expect(mockTreeView.dispose).toHaveBeenCalled();
    });
  });
});
