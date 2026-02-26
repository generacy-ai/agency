import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TelemetryBus } from '../../telemetry/bus.js';
import type { TelemetryStorageProvider } from '../../telemetry/types.js';
import { generateEventId, type ToolCallEvent } from '../../telemetry/schemas.js';

function createMockProvider(name: string): TelemetryStorageProvider & {
  recordedEvents: ToolCallEvent[];
} {
  const recordedEvents: ToolCallEvent[] = [];
  return {
    name,
    recordedEvents,
    initialize: vi.fn().mockResolvedValue(undefined),
    shutdown: vi.fn().mockResolvedValue(undefined),
    record: vi.fn().mockImplementation(async (event: ToolCallEvent) => {
      recordedEvents.push(event);
    }),
  };
}

function createTestEvent(overrides: Partial<ToolCallEvent> = {}): ToolCallEvent {
  return {
    id: generateEventId(),
    timestamp: '2026-01-17T12:00:00.000Z',
    toolName: 'test-tool',
    serverName: 'test-server',
    durationMs: 100,
    success: true,
    ...overrides,
  };
}

describe('TelemetryBus', () => {
  let bus: TelemetryBus;

  beforeEach(() => {
    bus = new TelemetryBus();
  });

  describe('subscribe', () => {
    it('should subscribe a provider', () => {
      const provider = createMockProvider('test-provider');
      bus.subscribe(provider);

      expect(bus.hasProvider('test-provider')).toBe(true);
      expect(bus.getProviderNames()).toContain('test-provider');
    });

    it('should not duplicate subscription for same provider', () => {
      const provider = createMockProvider('test-provider');
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      bus.subscribe(provider);
      bus.subscribe(provider);

      expect(bus.getProviderNames()).toHaveLength(1);
      expect(warnSpy).toHaveBeenCalledWith(
        '[telemetry] Provider "test-provider" is already subscribed'
      );

      warnSpy.mockRestore();
    });

    it('should support multiple providers', () => {
      const provider1 = createMockProvider('provider-1');
      const provider2 = createMockProvider('provider-2');

      bus.subscribe(provider1);
      bus.subscribe(provider2);

      expect(bus.getProviderNames()).toHaveLength(2);
      expect(bus.hasProvider('provider-1')).toBe(true);
      expect(bus.hasProvider('provider-2')).toBe(true);
    });
  });

  describe('unsubscribe', () => {
    it('should unsubscribe a provider', () => {
      const provider = createMockProvider('test-provider');
      bus.subscribe(provider);
      bus.unsubscribe('test-provider');

      expect(bus.hasProvider('test-provider')).toBe(false);
    });

    it('should warn when unsubscribing non-existent provider', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      bus.unsubscribe('non-existent');

      expect(warnSpy).toHaveBeenCalledWith(
        '[telemetry] Provider "non-existent" is not subscribed'
      );

      warnSpy.mockRestore();
    });

    it('should stop receiving events after unsubscribe', async () => {
      const provider = createMockProvider('test-provider');
      bus.subscribe(provider);

      const event1Id = generateEventId();
      const event1 = createTestEvent({ id: event1Id });
      bus.emit(event1);

      // Wait for async record
      await new Promise((resolve) => setTimeout(resolve, 10));

      bus.unsubscribe('test-provider');

      const event2 = createTestEvent({ id: generateEventId() });
      bus.emit(event2);

      // Wait again
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(provider.recordedEvents).toHaveLength(1);
      expect(provider.recordedEvents[0]?.id).toBe(event1Id);
    });
  });

  describe('emit', () => {
    it('should emit event to subscribed provider', async () => {
      const provider = createMockProvider('test-provider');
      bus.subscribe(provider);

      const event = createTestEvent();
      bus.emit(event);

      // Wait for async record
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(provider.record).toHaveBeenCalledWith(event);
      expect(provider.recordedEvents).toHaveLength(1);
    });

    it('should emit event to all subscribed providers', async () => {
      const provider1 = createMockProvider('provider-1');
      const provider2 = createMockProvider('provider-2');

      bus.subscribe(provider1);
      bus.subscribe(provider2);

      const event = createTestEvent();
      bus.emit(event);

      // Wait for async record
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(provider1.recordedEvents).toHaveLength(1);
      expect(provider2.recordedEvents).toHaveLength(1);
    });

    it('should not throw when no providers are subscribed', () => {
      const event = createTestEvent();
      expect(() => bus.emit(event)).not.toThrow();
    });

    it('should emit multiple events in order', async () => {
      const provider = createMockProvider('test-provider');
      bus.subscribe(provider);

      const events = [
        createTestEvent({ toolName: 'tool-1' }),
        createTestEvent({ toolName: 'tool-2' }),
        createTestEvent({ toolName: 'tool-3' }),
      ];

      events.forEach((event) => bus.emit(event));

      // Wait for async records
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(provider.recordedEvents).toHaveLength(3);
      expect(provider.recordedEvents[0]?.toolName).toBe('tool-1');
      expect(provider.recordedEvents[1]?.toolName).toBe('tool-2');
      expect(provider.recordedEvents[2]?.toolName).toBe('tool-3');
    });
  });

  describe('error isolation', () => {
    it('should catch and log provider errors', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const failingProvider: TelemetryStorageProvider = {
        name: 'failing-provider',
        initialize: vi.fn().mockResolvedValue(undefined),
        shutdown: vi.fn().mockResolvedValue(undefined),
        record: vi.fn().mockRejectedValue(new Error('Storage error')),
      };

      bus.subscribe(failingProvider);

      const event = createTestEvent();
      bus.emit(event);

      // Wait for async error handling
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(warnSpy).toHaveBeenCalledWith(
        '[telemetry] Provider "failing-provider" failed to record event:',
        'Storage error'
      );

      warnSpy.mockRestore();
    });

    it('should not affect other providers when one fails', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const successProvider = createMockProvider('success-provider');
      const failingProvider: TelemetryStorageProvider = {
        name: 'failing-provider',
        initialize: vi.fn().mockResolvedValue(undefined),
        shutdown: vi.fn().mockResolvedValue(undefined),
        record: vi.fn().mockRejectedValue(new Error('Storage error')),
      };

      bus.subscribe(successProvider);
      bus.subscribe(failingProvider);

      const event = createTestEvent();
      bus.emit(event);

      // Wait for async operations
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Success provider should still receive events
      expect(successProvider.recordedEvents).toHaveLength(1);

      warnSpy.mockRestore();
    });

    it('should handle non-Error throw values', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const failingProvider: TelemetryStorageProvider = {
        name: 'failing-provider',
        initialize: vi.fn().mockResolvedValue(undefined),
        shutdown: vi.fn().mockResolvedValue(undefined),
        record: vi.fn().mockRejectedValue('string error'),
      };

      bus.subscribe(failingProvider);
      bus.emit(createTestEvent());

      // Wait for async error handling
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(warnSpy).toHaveBeenCalledWith(
        '[telemetry] Provider "failing-provider" failed to record event:',
        'string error'
      );

      warnSpy.mockRestore();
    });
  });

  describe('getProvider', () => {
    it('should return provider by name', () => {
      const provider = createMockProvider('test-provider');
      bus.subscribe(provider);

      const retrieved = bus.getProvider('test-provider');
      expect(retrieved).toBe(provider);
    });

    it('should return undefined for non-existent provider', () => {
      const retrieved = bus.getProvider('non-existent');
      expect(retrieved).toBeUndefined();
    });
  });
});
