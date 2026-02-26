import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type * as vscode from 'vscode';
import type { ToolCallEvent, ActivityStats, ActivityFilter } from '../../types';

/**
 * Tests for ActivityFeedPanel webview.
 *
 * These tests verify:
 * - Panel creation and singleton behavior
 * - Message handling (filter, clear, export)
 * - ActivityService integration
 * - Filter state persistence
 */

// Mock VS Code module
const mockWebview = {
  html: '',
  onDidReceiveMessage: vi.fn(() => ({ dispose: vi.fn() })),
  postMessage: vi.fn().mockResolvedValue(true),
  asWebviewUri: vi.fn((uri: any) => uri),
  cspSource: 'https://test',
};

const mockPanel = {
  webview: mockWebview,
  onDidDispose: vi.fn(() => ({ dispose: vi.fn() })),
  reveal: vi.fn(),
  dispose: vi.fn(),
  visible: true,
  title: '',
};

const mockVscode = {
  window: {
    createWebviewPanel: vi.fn(() => mockPanel),
    showWarningMessage: vi.fn(),
    showErrorMessage: vi.fn(),
    showInformationMessage: vi.fn(),
    showSaveDialog: vi.fn(),
  },
  workspace: {
    fs: {
      writeFile: vi.fn(),
    },
  },
  ViewColumn: {
    One: 1,
    Two: 2,
  },
  Uri: {
    joinPath: vi.fn((...args: unknown[]) => args.join('/')),
    file: vi.fn((path: string) => ({ fsPath: path })),
  },
} as unknown as typeof vscode;

// Mock ActivityService
const mockActivityService = {
  onToolCall: vi.fn(() => ({ dispose: vi.fn() })),
  onBatch: vi.fn(() => ({ dispose: vi.fn() })),
  getEvents: vi.fn(() => []),
  getEventById: vi.fn(),
  getStats: vi.fn(() => ({
    totalCalls: 0,
    successCount: 0,
    errorCount: 0,
    timeoutCount: 0,
    pendingCount: 0,
    averageDuration: 0,
    callsPerMinute: 0,
    topTools: [],
    timeRange: { start: Date.now(), end: Date.now() },
  })),
  getEventCount: vi.fn(() => 0),
  clearEvents: vi.fn(),
};

vi.mock('../../services', () => ({
  ActivityService: {
    getInstance: vi.fn(() => mockActivityService),
  },
}));

// Mock logger
vi.mock('../../utils', async () => {
  const actual = await vi.importActual('../../utils');
  return {
    ...actual,
    createScopedLogger: vi.fn(() => ({
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    })),
  };
});

describe('ActivityFeedPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockWebview.html = '';
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Panel Creation and Singleton Behavior', () => {
    it('should create panel with correct title and view type', async () => {
      const { ActivityFeedPanel, _clearPanel } = await import('../../views/activity/ActivityFeedPanel');
      _clearPanel();

      const extensionUri = { fsPath: '/test' } as vscode.Uri;
      const panel = ActivityFeedPanel.createOrShow(mockVscode, extensionUri);

      expect(mockVscode.window.createWebviewPanel).toHaveBeenCalledWith(
        'agency.activityFeed',
        'Activity Feed',
        mockVscode.ViewColumn.Two,
        expect.objectContaining({
          enableScripts: true,
          retainContextWhenHidden: true,
        })
      );

      panel.dispose();
    });

    it('should reuse existing panel (singleton behavior)', async () => {
      const { ActivityFeedPanel, _clearPanel } = await import('../../views/activity/ActivityFeedPanel');
      _clearPanel();

      const extensionUri = { fsPath: '/test' } as vscode.Uri;

      const panel1 = ActivityFeedPanel.createOrShow(mockVscode, extensionUri);
      const createCallCount = (mockVscode.window.createWebviewPanel as any).mock.calls.length;

      const panel2 = ActivityFeedPanel.createOrShow(mockVscode, extensionUri);

      // Should not create a new panel
      expect((mockVscode.window.createWebviewPanel as any).mock.calls.length).toBe(createCallCount);
      // Should reveal existing panel
      expect(mockPanel.reveal).toHaveBeenCalled();

      expect(panel1).toBe(panel2);

      panel1.dispose();
    });

    it('should subscribe to ActivityService events on creation', async () => {
      const { ActivityFeedPanel, _clearPanel } = await import('../../views/activity/ActivityFeedPanel');
      _clearPanel();

      const extensionUri = { fsPath: '/test' } as vscode.Uri;
      const panel = ActivityFeedPanel.createOrShow(mockVscode, extensionUri);

      expect(mockActivityService.onToolCall).toHaveBeenCalled();
      expect(mockActivityService.onBatch).toHaveBeenCalled();

      panel.dispose();
    });
  });

  describe('HTML Content Generation', () => {
    it('should include statistics summary bar', async () => {
      const { ActivityFeedPanel, _clearPanel } = await import('../../views/activity/ActivityFeedPanel');
      _clearPanel();

      const extensionUri = { fsPath: '/test' } as vscode.Uri;
      const panel = ActivityFeedPanel.createOrShow(mockVscode, extensionUri);

      expect(mockWebview.html).toContain('stats-bar');
      expect(mockWebview.html).toContain('statTotal');
      expect(mockWebview.html).toContain('statSuccess');
      expect(mockWebview.html).toContain('statError');
      expect(mockWebview.html).toContain('statTimeout');
      expect(mockWebview.html).toContain('statPending');
      expect(mockWebview.html).toContain('statAvgDuration');
      expect(mockWebview.html).toContain('statCallsPerMin');

      panel.dispose();
    });

    it('should include filter controls', async () => {
      const { ActivityFeedPanel, _clearPanel } = await import('../../views/activity/ActivityFeedPanel');
      _clearPanel();

      const extensionUri = { fsPath: '/test' } as vscode.Uri;
      const panel = ActivityFeedPanel.createOrShow(mockVscode, extensionUri);

      // Tool name filter
      expect(mockWebview.html).toContain('filterTool');
      expect(mockWebview.html).toContain('Filter by tool name');

      // Namespace dropdown
      expect(mockWebview.html).toContain('filterNamespace');
      expect(mockWebview.html).toContain('All Namespaces');

      // Status checkboxes
      expect(mockWebview.html).toContain('filterSuccess');
      expect(mockWebview.html).toContain('filterError');
      expect(mockWebview.html).toContain('filterTimeout');
      expect(mockWebview.html).toContain('filterPending');

      // Time range dropdown
      expect(mockWebview.html).toContain('filterTimeRange');
      expect(mockWebview.html).toContain('Last 5 min');
      expect(mockWebview.html).toContain('Last 15 min');
      expect(mockWebview.html).toContain('Last 1 hour');

      panel.dispose();
    });

    it('should include event list container', async () => {
      const { ActivityFeedPanel, _clearPanel } = await import('../../views/activity/ActivityFeedPanel');
      _clearPanel();

      const extensionUri = { fsPath: '/test' } as vscode.Uri;
      const panel = ActivityFeedPanel.createOrShow(mockVscode, extensionUri);

      expect(mockWebview.html).toContain('event-list-container');
      expect(mockWebview.html).toContain('eventList');
      expect(mockWebview.html).toContain('virtual-scroll-wrapper');

      panel.dispose();
    });

    it('should include clear and export buttons', async () => {
      const { ActivityFeedPanel, _clearPanel } = await import('../../views/activity/ActivityFeedPanel');
      _clearPanel();

      const extensionUri = { fsPath: '/test' } as vscode.Uri;
      const panel = ActivityFeedPanel.createOrShow(mockVscode, extensionUri);

      expect(mockWebview.html).toContain('clearBtn');
      expect(mockWebview.html).toContain('Clear');
      expect(mockWebview.html).toContain('exportJsonBtn');
      expect(mockWebview.html).toContain('Export JSON');
      expect(mockWebview.html).toContain('exportCsvBtn');
      expect(mockWebview.html).toContain('Export CSV');

      panel.dispose();
    });

    it('should include event detail overlay', async () => {
      const { ActivityFeedPanel, _clearPanel } = await import('../../views/activity/ActivityFeedPanel');
      _clearPanel();

      const extensionUri = { fsPath: '/test' } as vscode.Uri;
      const panel = ActivityFeedPanel.createOrShow(mockVscode, extensionUri);

      expect(mockWebview.html).toContain('eventDetailOverlay');
      expect(mockWebview.html).toContain('eventDetailPanel');
      expect(mockWebview.html).toContain('detailContent');

      panel.dispose();
    });

    it('should include empty state', async () => {
      const { ActivityFeedPanel, _clearPanel } = await import('../../views/activity/ActivityFeedPanel');
      _clearPanel();

      const extensionUri = { fsPath: '/test' } as vscode.Uri;
      const panel = ActivityFeedPanel.createOrShow(mockVscode, extensionUri);

      expect(mockWebview.html).toContain('emptyState');
      expect(mockWebview.html).toContain('No Activity Yet');

      panel.dispose();
    });

    it('should include load more button', async () => {
      const { ActivityFeedPanel, _clearPanel } = await import('../../views/activity/ActivityFeedPanel');
      _clearPanel();

      const extensionUri = { fsPath: '/test' } as vscode.Uri;
      const panel = ActivityFeedPanel.createOrShow(mockVscode, extensionUri);

      expect(mockWebview.html).toContain('loadMoreBtn');
      expect(mockWebview.html).toContain('Load More');

      panel.dispose();
    });
  });

  describe('Message Handling', () => {
    it('should call getEvents on init message', async () => {
      const { ActivityFeedPanel, _clearPanel } = await import('../../views/activity/ActivityFeedPanel');
      _clearPanel();

      const extensionUri = { fsPath: '/test' } as vscode.Uri;
      const panel = ActivityFeedPanel.createOrShow(mockVscode, extensionUri);

      // Get the message handler
      const onMessageCallback = mockWebview.onDidReceiveMessage.mock.calls[0][0];

      // Simulate init message
      onMessageCallback({ type: 'init' });

      expect(mockActivityService.getEvents).toHaveBeenCalled();
      expect(mockActivityService.getStats).toHaveBeenCalled();

      panel.dispose();
    });

    it('should handle filterChange message', async () => {
      const { ActivityFeedPanel, _clearPanel } = await import('../../views/activity/ActivityFeedPanel');
      _clearPanel();

      const extensionUri = { fsPath: '/test' } as vscode.Uri;
      const panel = ActivityFeedPanel.createOrShow(mockVscode, extensionUri);

      // Get the message handler
      const onMessageCallback = mockWebview.onDidReceiveMessage.mock.calls[0][0];

      const filter: ActivityFilter = { toolName: 'test' };
      onMessageCallback({ type: 'filterChange', payload: filter });

      expect(mockActivityService.getEvents).toHaveBeenCalledWith(
        expect.objectContaining({ toolName: 'test' })
      );

      panel.dispose();
    });

    it('should handle clearEvents message', async () => {
      const { ActivityFeedPanel, _clearPanel } = await import('../../views/activity/ActivityFeedPanel');
      _clearPanel();

      const extensionUri = { fsPath: '/test' } as vscode.Uri;
      const panel = ActivityFeedPanel.createOrShow(mockVscode, extensionUri);

      // Get the message handler
      const onMessageCallback = mockWebview.onDidReceiveMessage.mock.calls[0][0];

      onMessageCallback({ type: 'clearEvents' });

      expect(mockActivityService.clearEvents).toHaveBeenCalled();

      panel.dispose();
    });

    it('should handle expandEvent message', async () => {
      const { ActivityFeedPanel, _clearPanel } = await import('../../views/activity/ActivityFeedPanel');
      _clearPanel();

      const mockEvent: ToolCallEvent = {
        id: 'test-1',
        toolName: 'test_tool',
        input: {},
        output: null,
        isError: false,
        status: 'success',
        startedAt: Date.now(),
      };

      mockActivityService.getEventById.mockReturnValue(mockEvent);

      const extensionUri = { fsPath: '/test' } as vscode.Uri;
      const panel = ActivityFeedPanel.createOrShow(mockVscode, extensionUri);

      // Get the message handler
      const onMessageCallback = mockWebview.onDidReceiveMessage.mock.calls[0][0];

      onMessageCallback({ type: 'expandEvent', payload: { eventId: 'test-1' } });

      expect(mockActivityService.getEventById).toHaveBeenCalledWith('test-1');
      expect(mockWebview.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'eventDetail',
          payload: { event: mockEvent },
        })
      );

      panel.dispose();
    });
  });

  describe('ActivityService Integration', () => {
    it('should send eventsUpdated message with stats', async () => {
      const { ActivityFeedPanel, _clearPanel } = await import('../../views/activity/ActivityFeedPanel');
      _clearPanel();

      const mockStats: ActivityStats = {
        totalCalls: 10,
        successCount: 8,
        errorCount: 1,
        timeoutCount: 1,
        pendingCount: 0,
        averageDuration: 150,
        callsPerMinute: 2.5,
        topTools: [],
        timeRange: { start: Date.now() - 60000, end: Date.now() },
      };

      const mockEvents: ToolCallEvent[] = [
        {
          id: 'event-1',
          toolName: 'test_tool',
          input: {},
          output: null,
          isError: false,
          status: 'success',
          startedAt: Date.now(),
        },
      ];

      mockActivityService.getStats.mockReturnValue(mockStats);
      mockActivityService.getEvents.mockReturnValue(mockEvents);
      mockActivityService.getEventCount.mockReturnValue(1);

      const extensionUri = { fsPath: '/test' } as vscode.Uri;
      const panel = ActivityFeedPanel.createOrShow(mockVscode, extensionUri);

      // Trigger init to send events
      const onMessageCallback = mockWebview.onDidReceiveMessage.mock.calls[0][0];
      onMessageCallback({ type: 'init' });

      expect(mockWebview.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'eventsUpdated',
          payload: expect.objectContaining({
            events: mockEvents,
            stats: mockStats,
          }),
        })
      );

      panel.dispose();
    });
  });

  describe('Filter Logic', () => {
    it('should apply status filter correctly', async () => {
      const { ActivityFeedPanel, _clearPanel } = await import('../../views/activity/ActivityFeedPanel');
      _clearPanel();

      const extensionUri = { fsPath: '/test' } as vscode.Uri;
      const panel = ActivityFeedPanel.createOrShow(mockVscode, extensionUri);

      // Get the message handler
      const onMessageCallback = mockWebview.onDidReceiveMessage.mock.calls[0][0];

      // Filter for only success status
      onMessageCallback({
        type: 'filterChange',
        payload: { status: ['success'] },
      });

      expect(mockActivityService.getEvents).toHaveBeenCalledWith(
        expect.objectContaining({ status: ['success'] })
      );

      panel.dispose();
    });

    it('should apply time range filter correctly', async () => {
      const { ActivityFeedPanel, _clearPanel } = await import('../../views/activity/ActivityFeedPanel');
      _clearPanel();

      const extensionUri = { fsPath: '/test' } as vscode.Uri;
      const panel = ActivityFeedPanel.createOrShow(mockVscode, extensionUri);

      // Get the message handler
      const onMessageCallback = mockWebview.onDidReceiveMessage.mock.calls[0][0];

      const now = Date.now();
      const fiveMinutesAgo = now - 5 * 60 * 1000;

      onMessageCallback({
        type: 'filterChange',
        payload: { startTime: fiveMinutesAgo },
      });

      expect(mockActivityService.getEvents).toHaveBeenCalledWith(
        expect.objectContaining({
          startTime: expect.any(Number),
        })
      );

      panel.dispose();
    });
  });

  describe('Debounce Behavior', () => {
    it('should debounce rapid updates', async () => {
      vi.useFakeTimers();

      const { ActivityFeedPanel, _clearPanel } = await import('../../views/activity/ActivityFeedPanel');
      _clearPanel();

      const extensionUri = { fsPath: '/test' } as vscode.Uri;
      const panel = ActivityFeedPanel.createOrShow(mockVscode, extensionUri);

      // Get the onToolCall callback
      const onToolCallCallback = mockActivityService.onToolCall.mock.calls[0][0];

      // Clear any initial calls
      mockActivityService.getEvents.mockClear();
      mockWebview.postMessage.mockClear();

      // Trigger multiple rapid events
      onToolCallCallback({});
      onToolCallCallback({});
      onToolCallCallback({});

      // Should not have called getEvents yet due to debounce
      expect(mockActivityService.getEvents).not.toHaveBeenCalled();

      // Fast forward past debounce timer (100ms)
      vi.advanceTimersByTime(150);

      // Now should have called getEvents once (debounced)
      expect(mockActivityService.getEvents).toHaveBeenCalledTimes(1);

      panel.dispose();
      vi.useRealTimers();
    });
  });
});
