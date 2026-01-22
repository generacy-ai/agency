import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type * as vscode from 'vscode';
import { ActivityService } from '../../services/ActivityService';
import type { ToolCallEvent, ActivityFilter, ToolCallStatus } from '../../types';

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
 * Helper function to create a test ToolCallEvent
 */
function createTestEvent(overrides: Partial<ToolCallEvent> = {}): ToolCallEvent {
  return {
    id: `event-${Math.random().toString(36).substring(7)}`,
    toolName: 'test_tool',
    namespace: 'test',
    pluginId: 'test-plugin',
    agentId: 'agent-1',
    input: { key: 'value' },
    output: null,
    isError: false,
    status: 'success',
    startedAt: Date.now(),
    completedAt: Date.now() + 100,
    duration: 100,
    containerId: 'container-1',
    ...overrides,
  };
}

describe('ActivityService', () => {
  let mockVscode: typeof vscode;

  beforeEach(() => {
    // Reset the singleton before each test
    ActivityService.reset();

    // Reset all mocks
    vi.clearAllMocks();

    // Create mock VS Code module
    mockVscode = {} as typeof vscode;
  });

  afterEach(() => {
    ActivityService.reset();
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Singleton Pattern Tests
  // ─────────────────────────────────────────────────────────────────────────────

  describe('Singleton Pattern', () => {
    it('should return the same instance on multiple calls', () => {
      const instance1 = ActivityService.getInstance();
      const instance2 = ActivityService.getInstance();

      expect(instance1).toBe(instance2);
    });

    it('should create new instance after reset', () => {
      const instance1 = ActivityService.getInstance();
      ActivityService.reset();
      const instance2 = ActivityService.getInstance();

      expect(instance1).not.toBe(instance2);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Initialization Tests
  // ─────────────────────────────────────────────────────────────────────────────

  describe('Initialization', () => {
    it('should initialize successfully', async () => {
      const service = ActivityService.getInstance();

      expect(service.isInitialized()).toBe(false);

      await service.initialize(mockVscode);

      expect(service.isInitialized()).toBe(true);
    });

    it('should skip if already initialized', async () => {
      const service = ActivityService.getInstance();

      await service.initialize(mockVscode);
      await service.initialize(mockVscode); // Should not throw

      expect(service.isInitialized()).toBe(true);
    });

    it('should throw if methods called before initialization', () => {
      const service = ActivityService.getInstance();

      expect(() => service.addEvent(createTestEvent())).toThrow('ActivityService not initialized');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Ring Buffer Tests (T010)
  // ─────────────────────────────────────────────────────────────────────────────

  describe('Ring Buffer', () => {
    let service: ActivityService;

    beforeEach(async () => {
      service = ActivityService.getInstance();
      await service.initialize(mockVscode);
    });

    it('should add events in insertion order', () => {
      const event1 = createTestEvent({ id: 'event-1', startedAt: 1000 });
      const event2 = createTestEvent({ id: 'event-2', startedAt: 2000 });
      const event3 = createTestEvent({ id: 'event-3', startedAt: 3000 });

      service.addEvent(event1);
      service.addEvent(event2);
      service.addEvent(event3);

      const events = service.getEvents();

      // getEvents returns newest first
      expect(events).toHaveLength(3);
      expect(events[0].id).toBe('event-3');
      expect(events[1].id).toBe('event-2');
      expect(events[2].id).toBe('event-1');
    });

    it('should evict oldest events when buffer is full', () => {
      // Set a small buffer size
      service.setBufferSize(100);

      // Add more events than the buffer can hold
      for (let i = 0; i < 105; i++) {
        service.addEvent(createTestEvent({ id: `event-${i}` }));
      }

      const events = service.getEvents();

      expect(events).toHaveLength(100);
      // Oldest events (0-4) should be evicted
      expect(events.some((e) => e.id === 'event-0')).toBe(false);
      expect(events.some((e) => e.id === 'event-4')).toBe(false);
      // Newest events should be present
      expect(events.some((e) => e.id === 'event-104')).toBe(true);
    });

    it('should resize buffer correctly', () => {
      // Add 50 events
      for (let i = 0; i < 50; i++) {
        service.addEvent(createTestEvent({ id: `event-${i}` }));
      }

      expect(service.getEventCount()).toBe(50);

      // Resize to smaller
      service.setBufferSize(200);
      expect(service.getBufferSize()).toBe(200);
      expect(service.getEventCount()).toBe(50); // Events preserved

      // Resize to even smaller (eviction)
      service.setBufferSize(100); // Minimum size
      expect(service.getBufferSize()).toBe(100);
    });

    it('should enforce minimum buffer size', () => {
      service.setBufferSize(50); // Below minimum

      expect(service.getBufferSize()).toBe(100); // Should be minimum
    });

    it('should clear events correctly', () => {
      service.addEvent(createTestEvent());
      service.addEvent(createTestEvent());

      expect(service.getEventCount()).toBe(2);

      service.clearEvents();

      expect(service.getEventCount()).toBe(0);
      expect(service.getEvents()).toHaveLength(0);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Event Filtering Tests (T011)
  // ─────────────────────────────────────────────────────────────────────────────

  describe('Event Filtering', () => {
    let service: ActivityService;

    beforeEach(async () => {
      service = ActivityService.getInstance();
      await service.initialize(mockVscode);

      // Add a variety of test events
      service.addEvent(
        createTestEvent({
          id: 'e1',
          toolName: 'file_read',
          namespace: 'file',
          status: 'success',
          isError: false,
          startedAt: 1000,
        })
      );
      service.addEvent(
        createTestEvent({
          id: 'e2',
          toolName: 'file_write',
          namespace: 'file',
          status: 'error',
          isError: true,
          startedAt: 2000,
        })
      );
      service.addEvent(
        createTestEvent({
          id: 'e3',
          toolName: 'shell_execute',
          namespace: 'shell',
          status: 'running',
          isError: false,
          startedAt: 3000,
        })
      );
      service.addEvent(
        createTestEvent({
          id: 'e4',
          toolName: 'git_commit',
          namespace: 'git',
          pluginId: 'git-plugin',
          status: 'success',
          isError: false,
          startedAt: 4000,
        })
      );
      service.addEvent(
        createTestEvent({
          id: 'e5',
          toolName: 'git_push',
          namespace: 'git',
          pluginId: 'git-plugin',
          status: 'timeout',
          isError: true,
          startedAt: 5000,
        })
      );
    });

    it('should filter by toolName (partial, case-insensitive)', () => {
      const events = service.getEvents({ toolName: 'file' });

      expect(events).toHaveLength(2);
      expect(events.every((e) => e.toolName.toLowerCase().includes('file'))).toBe(true);
    });

    it('should filter by toolName case-insensitively', () => {
      const events = service.getEvents({ toolName: 'FILE' });

      expect(events).toHaveLength(2);
    });

    it('should filter by namespace (exact match)', () => {
      const events = service.getEvents({ namespace: 'git' });

      expect(events).toHaveLength(2);
      expect(events.every((e) => e.namespace === 'git')).toBe(true);
    });

    it('should filter by pluginId (exact match)', () => {
      const events = service.getEvents({ pluginId: 'git-plugin' });

      expect(events).toHaveLength(2);
      expect(events.every((e) => e.pluginId === 'git-plugin')).toBe(true);
    });

    it('should filter by single status', () => {
      const events = service.getEvents({ status: 'success' });

      expect(events).toHaveLength(2);
      expect(events.every((e) => e.status === 'success')).toBe(true);
    });

    it('should filter by multiple statuses', () => {
      const events = service.getEvents({ status: ['success', 'error'] as ToolCallStatus[] });

      expect(events).toHaveLength(3);
      expect(events.every((e) => e.status === 'success' || e.status === 'error')).toBe(true);
    });

    it('should filter by isError', () => {
      const errorEvents = service.getEvents({ isError: true });
      const successEvents = service.getEvents({ isError: false });

      expect(errorEvents).toHaveLength(2);
      expect(successEvents).toHaveLength(3);
    });

    it('should filter by time range', () => {
      const events = service.getEvents({ startTime: 2000, endTime: 4000 });

      expect(events).toHaveLength(3);
      expect(events.every((e) => e.startedAt >= 2000 && e.startedAt <= 4000)).toBe(true);
    });

    it('should filter by startTime only', () => {
      const events = service.getEvents({ startTime: 3000 });

      expect(events).toHaveLength(3);
      expect(events.every((e) => e.startedAt >= 3000)).toBe(true);
    });

    it('should filter by endTime only', () => {
      const events = service.getEvents({ endTime: 3000 });

      expect(events).toHaveLength(3);
      expect(events.every((e) => e.startedAt <= 3000)).toBe(true);
    });

    it('should apply multiple filters together', () => {
      const events = service.getEvents({
        namespace: 'git',
        status: 'success',
      });

      expect(events).toHaveLength(1);
      expect(events[0].id).toBe('e4');
    });

    it('should apply pagination with limit', () => {
      const events = service.getEvents({ limit: 2 });

      expect(events).toHaveLength(2);
    });

    it('should apply pagination with offset', () => {
      const allEvents = service.getEvents();
      const offsetEvents = service.getEvents({ offset: 2 });

      expect(offsetEvents).toHaveLength(3);
      expect(offsetEvents[0].id).toBe(allEvents[2].id);
    });

    it('should apply pagination with limit and offset together', () => {
      const events = service.getEvents({ limit: 2, offset: 1 });

      expect(events).toHaveLength(2);
    });

    it('should return all events with empty filter', () => {
      const events = service.getEvents({});

      expect(events).toHaveLength(5);
    });

    it('should return all events with no filter', () => {
      const events = service.getEvents();

      expect(events).toHaveLength(5);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Statistics Calculation Tests (T012)
  // ─────────────────────────────────────────────────────────────────────────────

  describe('Statistics Calculation', () => {
    let service: ActivityService;

    beforeEach(async () => {
      service = ActivityService.getInstance();
      await service.initialize(mockVscode);
    });

    it('should calculate correct status counts', () => {
      service.addEvent(createTestEvent({ status: 'success' }));
      service.addEvent(createTestEvent({ status: 'success' }));
      service.addEvent(createTestEvent({ status: 'error' }));
      service.addEvent(createTestEvent({ status: 'timeout' }));
      service.addEvent(createTestEvent({ status: 'running' }));
      service.addEvent(createTestEvent({ status: 'pending' }));

      const stats = service.getStats();

      expect(stats.totalCalls).toBe(6);
      expect(stats.successCount).toBe(2);
      expect(stats.errorCount).toBe(1);
      expect(stats.timeoutCount).toBe(1);
      expect(stats.pendingCount).toBe(2);
    });

    it('should calculate average duration correctly', () => {
      service.addEvent(createTestEvent({ duration: 100 }));
      service.addEvent(createTestEvent({ duration: 200 }));
      service.addEvent(createTestEvent({ duration: 300 }));

      const stats = service.getStats();

      expect(stats.averageDuration).toBe(200);
    });

    it('should calculate median duration correctly for odd count', () => {
      service.addEvent(createTestEvent({ duration: 100 }));
      service.addEvent(createTestEvent({ duration: 200 }));
      service.addEvent(createTestEvent({ duration: 300 }));

      const stats = service.getStats();

      expect(stats.medianDuration).toBe(200);
    });

    it('should calculate median duration correctly for even count', () => {
      service.addEvent(createTestEvent({ duration: 100 }));
      service.addEvent(createTestEvent({ duration: 200 }));
      service.addEvent(createTestEvent({ duration: 300 }));
      service.addEvent(createTestEvent({ duration: 400 }));

      const stats = service.getStats();

      expect(stats.medianDuration).toBe(250);
    });

    it('should exclude undefined durations from average', () => {
      service.addEvent(createTestEvent({ duration: 100 }));
      service.addEvent(createTestEvent({ duration: undefined }));
      service.addEvent(createTestEvent({ duration: 300 }));

      const stats = service.getStats();

      expect(stats.averageDuration).toBe(200);
    });

    it('should calculate calls per minute', () => {
      const baseTime = Date.now();
      service.addEvent(createTestEvent({ startedAt: baseTime }));
      service.addEvent(createTestEvent({ startedAt: baseTime + 30000 })); // 30 seconds later
      service.addEvent(createTestEvent({ startedAt: baseTime + 60000 })); // 1 minute later

      const stats = service.getStats();

      // 3 calls over 1 minute = 3 calls per minute
      expect(stats.callsPerMinute).toBeGreaterThan(0);
    });

    it('should generate top tools ranking', () => {
      service.addEvent(createTestEvent({ toolName: 'tool_a', status: 'success' }));
      service.addEvent(createTestEvent({ toolName: 'tool_a', status: 'success' }));
      service.addEvent(createTestEvent({ toolName: 'tool_a', status: 'error' }));
      service.addEvent(createTestEvent({ toolName: 'tool_b', status: 'success' }));

      const stats = service.getStats();

      expect(stats.topTools).toHaveLength(2);
      expect(stats.topTools[0].toolName).toBe('tool_a');
      expect(stats.topTools[0].callCount).toBe(3);
      expect(stats.topTools[0].successRate).toBeCloseTo(2 / 3, 2);
      expect(stats.topTools[1].toolName).toBe('tool_b');
      expect(stats.topTools[1].callCount).toBe(1);
    });

    it('should calculate time range correctly', () => {
      const startTime = 1000;
      const endTime = 5000;

      service.addEvent(createTestEvent({ startedAt: startTime }));
      service.addEvent(createTestEvent({ startedAt: 3000 }));
      service.addEvent(createTestEvent({ startedAt: endTime }));

      const stats = service.getStats();

      expect(stats.timeRange.start).toBe(startTime);
      expect(stats.timeRange.end).toBe(endTime);
    });

    it('should return empty stats for empty buffer', () => {
      const stats = service.getStats();

      expect(stats.totalCalls).toBe(0);
      expect(stats.successCount).toBe(0);
      expect(stats.averageDuration).toBe(0);
      expect(stats.topTools).toHaveLength(0);
    });

    it('should apply filter to statistics', () => {
      service.addEvent(createTestEvent({ toolName: 'tool_a', status: 'success' }));
      service.addEvent(createTestEvent({ toolName: 'tool_a', status: 'error' }));
      service.addEvent(createTestEvent({ toolName: 'tool_b', status: 'success' }));

      const stats = service.getStats({ toolName: 'tool_a' });

      expect(stats.totalCalls).toBe(2);
      expect(stats.successCount).toBe(1);
      expect(stats.errorCount).toBe(1);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Event Emission Tests (T013)
  // ─────────────────────────────────────────────────────────────────────────────

  describe('Event Emission', () => {
    let service: ActivityService;

    beforeEach(async () => {
      service = ActivityService.getInstance();
      await service.initialize(mockVscode);
    });

    it('should fire onToolCall event when addEvent is called', () => {
      const listener = vi.fn();
      service.onToolCall(listener);

      const event = createTestEvent({ id: 'test-event' });
      service.addEvent(event);

      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledWith(event);
    });

    it('should fire onBatch event when addEvents is called', () => {
      const listener = vi.fn();
      service.onBatch(listener);

      const events = [createTestEvent({ id: 'e1' }), createTestEvent({ id: 'e2' })];
      service.addEvents(events);

      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          events,
          isFullRefresh: false,
          timestamp: expect.any(Number),
        })
      );
    });

    it('should fire onBatch with isFullRefresh=true when clearEvents is called', () => {
      const listener = vi.fn();
      service.addEvent(createTestEvent());
      service.onBatch(listener);

      service.clearEvents();

      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          events: [],
          isFullRefresh: true,
        })
      );
    });

    it('should support multiple listeners', () => {
      const listener1 = vi.fn();
      const listener2 = vi.fn();

      service.onToolCall(listener1);
      service.onToolCall(listener2);

      service.addEvent(createTestEvent());

      expect(listener1).toHaveBeenCalledTimes(1);
      expect(listener2).toHaveBeenCalledTimes(1);
    });

    it('should dispose listener correctly', () => {
      const listener = vi.fn();
      const disposable = service.onToolCall(listener);

      service.addEvent(createTestEvent());
      expect(listener).toHaveBeenCalledTimes(1);

      disposable.dispose();

      service.addEvent(createTestEvent());
      expect(listener).toHaveBeenCalledTimes(1); // Still 1, not called again
    });

    it('should not fire event for invalid events', () => {
      const listener = vi.fn();
      service.onToolCall(listener);

      // Event missing required fields
      service.addEvent({ id: '', toolName: '' } as ToolCallEvent);
      service.addEvent({ id: 'valid', toolName: '' } as ToolCallEvent);

      expect(listener).toHaveBeenCalledTimes(0);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // getEventById Tests
  // ─────────────────────────────────────────────────────────────────────────────

  describe('getEventById', () => {
    let service: ActivityService;

    beforeEach(async () => {
      service = ActivityService.getInstance();
      await service.initialize(mockVscode);
    });

    it('should find event by ID', () => {
      const event = createTestEvent({ id: 'unique-id' });
      service.addEvent(event);

      const found = service.getEventById('unique-id');

      expect(found).toBeDefined();
      expect(found?.id).toBe('unique-id');
    });

    it('should return undefined for non-existent ID', () => {
      service.addEvent(createTestEvent({ id: 'some-id' }));

      const found = service.getEventById('non-existent');

      expect(found).toBeUndefined();
    });
  });
});
