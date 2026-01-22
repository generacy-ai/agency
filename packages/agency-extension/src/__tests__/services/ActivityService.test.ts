import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type * as vscode from 'vscode';
import { ActivityService, type ActivityServiceEvent } from '../../services/ActivityService';
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

describe('ActivityService', () => {
  let mockVscode: typeof vscode;

  beforeEach(() => {
    vi.clearAllMocks();
    ActivityService.reset();

    // Create mock VS Code module
    mockVscode = {
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
    } as unknown as typeof vscode;
  });

  afterEach(() => {
    ActivityService.reset();
    vi.clearAllMocks();
  });

  describe('singleton', () => {
    it('should return the same instance', () => {
      const instance1 = ActivityService.getInstance();
      const instance2 = ActivityService.getInstance();

      expect(instance1).toBe(instance2);
    });

    it('should reset instance on reset()', async () => {
      const instance1 = ActivityService.getInstance();
      await instance1.initialize(mockVscode);

      ActivityService.reset();

      const instance2 = ActivityService.getInstance();
      expect(instance1).not.toBe(instance2);
    });
  });

  describe('initialization', () => {
    it('should initialize successfully', async () => {
      const service = ActivityService.getInstance();
      await service.initialize(mockVscode);

      expect(service.onActivityUpdate).toBeDefined();
    });

    it('should warn if already initialized', async () => {
      const service = ActivityService.getInstance();
      await service.initialize(mockVscode);
      await service.initialize(mockVscode); // Second call should warn

      // Should not throw
      expect(service.onActivityUpdate).toBeDefined();
    });
  });

  describe('addEvent', () => {
    it('should add event to the buffer', async () => {
      const service = ActivityService.getInstance();
      await service.initialize(mockVscode);

      const event = createMockEvent({ toolName: 'myTool' });
      service.addEvent(event);

      const events = service.getEvents();
      expect(events).toHaveLength(1);
      expect(events[0].toolName).toBe('myTool');
    });

    it('should add events in reverse chronological order (newest first)', async () => {
      const service = ActivityService.getInstance();
      await service.initialize(mockVscode);

      const event1 = createMockEvent({ id: 'event-1', toolName: 'tool1' });
      const event2 = createMockEvent({ id: 'event-2', toolName: 'tool2' });

      service.addEvent(event1);
      service.addEvent(event2);

      const events = service.getEvents();
      expect(events[0].id).toBe('event-2'); // Newest first
      expect(events[1].id).toBe('event-1');
    });

    it('should enforce maxEvents limit', async () => {
      const service = ActivityService.getInstance();
      await service.initialize(mockVscode);
      service.setConfig({ maxEvents: 3 });

      for (let i = 0; i < 5; i++) {
        service.addEvent(createMockEvent({ id: `event-${i}` }));
      }

      const events = service.getEvents();
      expect(events).toHaveLength(3);
      expect(events[0].id).toBe('event-4'); // Most recent
      expect(events[2].id).toBe('event-2'); // Oldest (after trim)
    });

    it('should emit tool_call event', async () => {
      const service = ActivityService.getInstance();
      await service.initialize(mockVscode);

      const receivedEvents: ActivityServiceEvent[] = [];
      service.onActivityUpdate?.((event) => {
        receivedEvents.push(event);
      });

      const toolEvent = createMockEvent({ toolName: 'emittedTool' });
      service.addEvent(toolEvent);

      expect(receivedEvents).toHaveLength(1);
      expect(receivedEvents[0].type).toBe('tool_call');
      expect(receivedEvents[0].event?.toolName).toBe('emittedTool');
    });
  });

  describe('updateEvent', () => {
    it('should update an existing event', async () => {
      const service = ActivityService.getInstance();
      await service.initialize(mockVscode);

      const event = createMockEvent({ id: 'update-me', status: 'pending' });
      service.addEvent(event);

      service.updateEvent('update-me', { status: 'success', duration: 100 });

      const events = service.getEvents();
      expect(events[0].status).toBe('success');
      expect(events[0].duration).toBe(100);
    });

    it('should emit tool_call event on update', async () => {
      const service = ActivityService.getInstance();
      await service.initialize(mockVscode);

      const event = createMockEvent({ id: 'update-me' });
      service.addEvent(event);

      const receivedEvents: ActivityServiceEvent[] = [];
      service.onActivityUpdate?.((evt) => {
        receivedEvents.push(evt);
      });

      service.updateEvent('update-me', { status: 'error' });

      expect(receivedEvents).toHaveLength(1);
      expect(receivedEvents[0].type).toBe('tool_call');
    });

    it('should warn if event not found', async () => {
      const service = ActivityService.getInstance();
      await service.initialize(mockVscode);

      // Should not throw, just warn
      service.updateEvent('non-existent', { status: 'error' });
    });
  });

  describe('addBatch', () => {
    it('should add batch of events', async () => {
      const service = ActivityService.getInstance();
      await service.initialize(mockVscode);

      const events = [
        createMockEvent({ id: 'batch-1' }),
        createMockEvent({ id: 'batch-2' }),
      ];

      service.addBatch(events);

      const allEvents = service.getEvents();
      expect(allEvents).toHaveLength(2);
    });

    it('should replace all events on full refresh', async () => {
      const service = ActivityService.getInstance();
      await service.initialize(mockVscode);

      service.addEvent(createMockEvent({ id: 'existing' }));

      const newEvents = [
        createMockEvent({ id: 'new-1' }),
        createMockEvent({ id: 'new-2' }),
      ];

      service.addBatch(newEvents, true);

      const allEvents = service.getEvents();
      expect(allEvents).toHaveLength(2);
      expect(allEvents.find((e) => e.id === 'existing')).toBeUndefined();
    });

    it('should emit batch_update event', async () => {
      const service = ActivityService.getInstance();
      await service.initialize(mockVscode);

      const receivedEvents: ActivityServiceEvent[] = [];
      service.onActivityUpdate?.((event) => {
        receivedEvents.push(event);
      });

      service.addBatch([createMockEvent()], false);

      expect(receivedEvents).toHaveLength(1);
      expect(receivedEvents[0].type).toBe('batch_update');
      expect(receivedEvents[0].batch?.isFullRefresh).toBe(false);
    });
  });

  describe('getEvents', () => {
    it('should filter by toolName', async () => {
      const service = ActivityService.getInstance();
      await service.initialize(mockVscode);

      service.addEvent(createMockEvent({ toolName: 'toolA' }));
      service.addEvent(createMockEvent({ toolName: 'toolB' }));
      service.addEvent(createMockEvent({ toolName: 'toolAB' }));

      const filtered = service.getEvents({ toolName: 'toolA' });
      expect(filtered).toHaveLength(2); // toolA and toolAB (partial match)
    });

    it('should filter by status', async () => {
      const service = ActivityService.getInstance();
      await service.initialize(mockVscode);

      service.addEvent(createMockEvent({ status: 'success' }));
      service.addEvent(createMockEvent({ status: 'error' }));
      service.addEvent(createMockEvent({ status: 'success' }));

      const filtered = service.getEvents({ status: 'error' });
      expect(filtered).toHaveLength(1);
    });

    it('should filter by multiple statuses', async () => {
      const service = ActivityService.getInstance();
      await service.initialize(mockVscode);

      service.addEvent(createMockEvent({ status: 'success' }));
      service.addEvent(createMockEvent({ status: 'error' }));
      service.addEvent(createMockEvent({ status: 'timeout' }));

      const filtered = service.getEvents({ status: ['error', 'timeout'] });
      expect(filtered).toHaveLength(2);
    });

    it('should filter by time range', async () => {
      const service = ActivityService.getInstance();
      await service.initialize(mockVscode);

      const now = Date.now();
      service.addEvent(createMockEvent({ startedAt: now - 5000 }));
      service.addEvent(createMockEvent({ startedAt: now - 3000 }));
      service.addEvent(createMockEvent({ startedAt: now - 1000 }));

      const filtered = service.getEvents({ startTime: now - 4000 });
      expect(filtered).toHaveLength(2);
    });

    it('should apply limit and offset', async () => {
      const service = ActivityService.getInstance();
      await service.initialize(mockVscode);

      for (let i = 0; i < 10; i++) {
        service.addEvent(createMockEvent({ id: `event-${i}` }));
      }

      const filtered = service.getEvents({ offset: 2, limit: 3 });
      expect(filtered).toHaveLength(3);
      expect(filtered[0].id).toBe('event-7'); // After offset
    });
  });

  describe('getEventsByTimePeriod', () => {
    it('should group events by time period', async () => {
      const service = ActivityService.getInstance();
      await service.initialize(mockVscode);

      const now = Date.now();

      // Last minute
      service.addEvent(createMockEvent({ startedAt: now - 30 * 1000 }));
      service.addEvent(createMockEvent({ startedAt: now - 45 * 1000 }));

      // Last 5 minutes (but not last minute)
      service.addEvent(createMockEvent({ startedAt: now - 2 * 60 * 1000 }));
      service.addEvent(createMockEvent({ startedAt: now - 3 * 60 * 1000 }));

      // Older
      service.addEvent(createMockEvent({ startedAt: now - 10 * 60 * 1000 }));

      const grouped = service.getEventsByTimePeriod();

      expect(grouped.lastMinute).toHaveLength(2);
      expect(grouped.lastFiveMinutes).toHaveLength(2);
      expect(grouped.older).toHaveLength(1);
    });
  });

  describe('getStats', () => {
    it('should calculate basic statistics', async () => {
      const service = ActivityService.getInstance();
      await service.initialize(mockVscode);

      service.addEvent(createMockEvent({ status: 'success', duration: 100 }));
      service.addEvent(createMockEvent({ status: 'success', duration: 200 }));
      service.addEvent(createMockEvent({ status: 'error', duration: 50 }));

      const stats = service.getStats();

      expect(stats.totalCalls).toBe(3);
      expect(stats.successCount).toBe(2);
      expect(stats.errorCount).toBe(1);
      expect(stats.averageDuration).toBeCloseTo(116.67, 1);
    });

    it('should calculate top tools', async () => {
      const service = ActivityService.getInstance();
      await service.initialize(mockVscode);

      service.addEvent(createMockEvent({ toolName: 'tool1' }));
      service.addEvent(createMockEvent({ toolName: 'tool1' }));
      service.addEvent(createMockEvent({ toolName: 'tool1' }));
      service.addEvent(createMockEvent({ toolName: 'tool2' }));
      service.addEvent(createMockEvent({ toolName: 'tool2' }));

      const stats = service.getStats();

      expect(stats.topTools[0].toolName).toBe('tool1');
      expect(stats.topTools[0].callCount).toBe(3);
      expect(stats.topTools[1].toolName).toBe('tool2');
      expect(stats.topTools[1].callCount).toBe(2);
    });
  });

  describe('clear', () => {
    it('should clear all events', async () => {
      const service = ActivityService.getInstance();
      await service.initialize(mockVscode);

      service.addEvent(createMockEvent());
      service.addEvent(createMockEvent());

      expect(service.getEventCount()).toBe(2);

      service.clear();

      expect(service.getEventCount()).toBe(0);
    });

    it('should emit clear event', async () => {
      const service = ActivityService.getInstance();
      await service.initialize(mockVscode);

      const receivedEvents: ActivityServiceEvent[] = [];
      service.onActivityUpdate?.((event) => {
        receivedEvents.push(event);
      });

      service.clear();

      expect(receivedEvents).toHaveLength(1);
      expect(receivedEvents[0].type).toBe('clear');
    });
  });

  describe('config', () => {
    it('should update configuration', async () => {
      const service = ActivityService.getInstance();
      await service.initialize(mockVscode);

      service.setConfig({ maxEvents: 500 });

      const config = service.getConfig();
      expect(config.maxEvents).toBe(500);
    });

    it('should merge with existing config', async () => {
      const service = ActivityService.getInstance();
      await service.initialize(mockVscode);

      service.setConfig({ maxEvents: 500 });
      service.setConfig({ autoScroll: false });

      const config = service.getConfig();
      expect(config.maxEvents).toBe(500);
      expect(config.autoScroll).toBe(false);
    });
  });

  describe('dispose', () => {
    it('should clean up resources', async () => {
      const service = ActivityService.getInstance();
      await service.initialize(mockVscode);

      service.addEvent(createMockEvent());

      service.dispose();

      expect(service.getEventCount()).toBe(0);
    });
  });
});
