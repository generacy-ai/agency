import { describe, it, expect, beforeEach } from 'vitest';
import { MemoryStorageProvider } from '../../telemetry/providers/memory.js';
import type { ToolCallEvent } from '../../telemetry/schemas.js';

function createTestEvent(overrides: Partial<ToolCallEvent> = {}): ToolCallEvent {
  return {
    id: globalThis.crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    toolName: 'test-tool',
    serverName: 'test-server',
    durationMs: 100,
    success: true,
    ...overrides,
  };
}

describe('MemoryStorageProvider', () => {
  let provider: MemoryStorageProvider;

  beforeEach(() => {
    provider = new MemoryStorageProvider();
  });

  describe('lifecycle', () => {
    it('should initialize successfully', async () => {
      expect(provider.isInitialized()).toBe(false);
      await provider.initialize();
      expect(provider.isInitialized()).toBe(true);
    });

    it('should shutdown and clear events', async () => {
      await provider.initialize();
      await provider.record(createTestEvent());
      expect(provider.getEventCount()).toBe(1);

      await provider.shutdown();
      expect(provider.getEventCount()).toBe(0);
      expect(provider.isInitialized()).toBe(false);
    });
  });

  describe('record', () => {
    it('should record an event', async () => {
      const event = createTestEvent();
      await provider.record(event);

      expect(provider.getEventCount()).toBe(1);
      const events = provider.getAllEvents();
      expect(events[0]).toEqual(event);
    });

    it('should record multiple events', async () => {
      const events = [
        createTestEvent({ toolName: 'tool-1' }),
        createTestEvent({ toolName: 'tool-2' }),
        createTestEvent({ toolName: 'tool-3' }),
      ];

      for (const event of events) {
        await provider.record(event);
      }

      expect(provider.getEventCount()).toBe(3);
    });

    it('should evict oldest events when maxEvents reached', async () => {
      const smallProvider = new MemoryStorageProvider({ maxEvents: 3 });

      const events = [
        createTestEvent({ toolName: 'tool-1' }),
        createTestEvent({ toolName: 'tool-2' }),
        createTestEvent({ toolName: 'tool-3' }),
        createTestEvent({ toolName: 'tool-4' }),
      ];

      for (const event of events) {
        await smallProvider.record(event);
      }

      expect(smallProvider.getEventCount()).toBe(3);
      const stored = smallProvider.getAllEvents();
      expect(stored[0]?.toolName).toBe('tool-2');
      expect(stored[1]?.toolName).toBe('tool-3');
      expect(stored[2]?.toolName).toBe('tool-4');
    });

    it('should not evict when maxEvents is 0 (unlimited)', async () => {
      const unlimitedProvider = new MemoryStorageProvider({ maxEvents: 0 });

      for (let i = 0; i < 100; i++) {
        await unlimitedProvider.record(createTestEvent());
      }

      expect(unlimitedProvider.getEventCount()).toBe(100);
    });
  });

  describe('query', () => {
    beforeEach(async () => {
      const events = [
        createTestEvent({
          toolName: 'tool-a',
          serverName: 'server-1',
          sessionId: 'session-1',
          success: true,
          durationMs: 50,
          timestamp: '2026-01-15T10:00:00.000Z',
        }),
        createTestEvent({
          toolName: 'tool-b',
          serverName: 'server-1',
          sessionId: 'session-1',
          success: false,
          durationMs: 100,
          timestamp: '2026-01-16T10:00:00.000Z',
        }),
        createTestEvent({
          toolName: 'tool-a',
          serverName: 'server-2',
          sessionId: 'session-2',
          success: true,
          durationMs: 150,
          timestamp: '2026-01-17T10:00:00.000Z',
        }),
      ];

      for (const event of events) {
        await provider.record(event);
      }
    });

    it('should return all events with empty filter', async () => {
      const results = await provider.query({});
      expect(results).toHaveLength(3);
    });

    it('should filter by toolName', async () => {
      const results = await provider.query({ toolName: 'tool-a' });
      expect(results).toHaveLength(2);
      expect(results.every((e) => e.toolName === 'tool-a')).toBe(true);
    });

    it('should filter by serverName', async () => {
      const results = await provider.query({ serverName: 'server-1' });
      expect(results).toHaveLength(2);
      expect(results.every((e) => e.serverName === 'server-1')).toBe(true);
    });

    it('should filter by sessionId', async () => {
      const results = await provider.query({ sessionId: 'session-2' });
      expect(results).toHaveLength(1);
      expect(results[0]?.sessionId).toBe('session-2');
    });

    it('should filter by success status', async () => {
      const successResults = await provider.query({ success: true });
      expect(successResults).toHaveLength(2);

      const failureResults = await provider.query({ success: false });
      expect(failureResults).toHaveLength(1);
    });

    it('should filter by startTime', async () => {
      const results = await provider.query({
        startTime: '2026-01-16T00:00:00.000Z',
      });
      expect(results).toHaveLength(2);
    });

    it('should filter by endTime', async () => {
      const results = await provider.query({
        endTime: '2026-01-16T00:00:00.000Z',
      });
      expect(results).toHaveLength(1);
    });

    it('should filter by time range', async () => {
      const results = await provider.query({
        startTime: '2026-01-15T12:00:00.000Z',
        endTime: '2026-01-16T12:00:00.000Z',
      });
      expect(results).toHaveLength(1);
      expect(results[0]?.toolName).toBe('tool-b');
    });

    it('should apply limit', async () => {
      const results = await provider.query({ limit: 2 });
      expect(results).toHaveLength(2);
    });

    it('should apply offset', async () => {
      const results = await provider.query({ offset: 1 });
      expect(results).toHaveLength(2);
      expect(results[0]?.toolName).toBe('tool-b');
    });

    it('should apply limit and offset together', async () => {
      const results = await provider.query({ offset: 1, limit: 1 });
      expect(results).toHaveLength(1);
      expect(results[0]?.toolName).toBe('tool-b');
    });

    it('should combine multiple filters', async () => {
      const results = await provider.query({
        toolName: 'tool-a',
        success: true,
      });
      expect(results).toHaveLength(2);
    });
  });

  describe('getStats', () => {
    it('should return zero stats for empty provider', async () => {
      const stats = await provider.getStats({});
      expect(stats).toEqual({
        totalCalls: 0,
        successCount: 0,
        errorCount: 0,
        avgDurationMs: 0,
        minDurationMs: 0,
        maxDurationMs: 0,
      });
    });

    it('should calculate basic statistics', async () => {
      const events = [
        createTestEvent({ success: true, durationMs: 50 }),
        createTestEvent({ success: true, durationMs: 100 }),
        createTestEvent({ success: false, durationMs: 150 }),
      ];

      for (const event of events) {
        await provider.record(event);
      }

      const stats = await provider.getStats({});

      expect(stats.totalCalls).toBe(3);
      expect(stats.successCount).toBe(2);
      expect(stats.errorCount).toBe(1);
      expect(stats.avgDurationMs).toBe(100);
      expect(stats.minDurationMs).toBe(50);
      expect(stats.maxDurationMs).toBe(150);
    });

    it('should calculate percentiles', async () => {
      // Add 100 events with durations 1-100
      for (let i = 1; i <= 100; i++) {
        await provider.record(createTestEvent({ durationMs: i }));
      }

      const stats = await provider.getStats({});

      expect(stats.p50DurationMs).toBeCloseTo(50.5, 1);
      expect(stats.p95DurationMs).toBeCloseTo(95.05, 1);
      expect(stats.p99DurationMs).toBeCloseTo(99.01, 1);
    });

    it('should filter stats by toolName', async () => {
      await provider.record(createTestEvent({ toolName: 'tool-a', durationMs: 50 }));
      await provider.record(createTestEvent({ toolName: 'tool-b', durationMs: 100 }));
      await provider.record(createTestEvent({ toolName: 'tool-a', durationMs: 150 }));

      const stats = await provider.getStats({ toolName: 'tool-a' });

      expect(stats.totalCalls).toBe(2);
      expect(stats.avgDurationMs).toBe(100);
    });

    it('should filter stats by serverName', async () => {
      await provider.record(createTestEvent({ serverName: 'server-1', durationMs: 50 }));
      await provider.record(createTestEvent({ serverName: 'server-2', durationMs: 100 }));

      const stats = await provider.getStats({ serverName: 'server-1' });

      expect(stats.totalCalls).toBe(1);
      expect(stats.avgDurationMs).toBe(50);
    });

    it('should filter stats by time range', async () => {
      await provider.record(
        createTestEvent({
          durationMs: 50,
          timestamp: '2026-01-15T10:00:00.000Z',
        })
      );
      await provider.record(
        createTestEvent({
          durationMs: 100,
          timestamp: '2026-01-16T10:00:00.000Z',
        })
      );

      const stats = await provider.getStats({
        startTime: '2026-01-16T00:00:00.000Z',
      });

      expect(stats.totalCalls).toBe(1);
      expect(stats.avgDurationMs).toBe(100);
    });
  });

  describe('utility methods', () => {
    it('should clear all events', async () => {
      await provider.record(createTestEvent());
      await provider.record(createTestEvent());
      expect(provider.getEventCount()).toBe(2);

      provider.clear();
      expect(provider.getEventCount()).toBe(0);
    });

    it('should return a copy of events, not the original array', async () => {
      const event = createTestEvent();
      await provider.record(event);

      const events = provider.getAllEvents();
      events.pop();

      expect(provider.getEventCount()).toBe(1);
    });
  });
});
