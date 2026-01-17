import { describe, it, expect, beforeEach } from 'vitest';
import { TelemetryManager } from '../../telemetry/manager.js';
import { MemoryStorageProvider } from '../../telemetry/providers/memory.js';

describe('Performance', () => {
  let manager: TelemetryManager;
  let provider: MemoryStorageProvider;

  beforeEach(async () => {
    manager = new TelemetryManager();
    provider = new MemoryStorageProvider();
    await manager.registerProvider(provider);
  });

  it('should have less than 5ms overhead per call', async () => {
    // Create a baseline handler that takes ~1ms
    const baselineHandler = async (params: { value: number }) => {
      // Simulate minimal work
      await Promise.resolve();
      return { result: params.value * 2 };
    };

    // Measure baseline time (no telemetry)
    const baselineIterations = 100;
    const baselineStart = globalThis.performance.now();
    for (let i = 0; i < baselineIterations; i++) {
      await baselineHandler({ value: i });
    }
    const baselineEnd = globalThis.performance.now();
    const baselineAvg = (baselineEnd - baselineStart) / baselineIterations;

    // Wrap the handler with telemetry
    const wrappedHandler = manager.wrapHandler(
      baselineHandler,
      'benchmark-tool',
      'benchmark-server'
    );

    // Measure wrapped time (with telemetry)
    const wrappedIterations = 100;
    const wrappedStart = globalThis.performance.now();
    for (let i = 0; i < wrappedIterations; i++) {
      await wrappedHandler({ value: i });
    }
    const wrappedEnd = globalThis.performance.now();
    const wrappedAvg = (wrappedEnd - wrappedStart) / wrappedIterations;

    // Calculate overhead
    const overhead = wrappedAvg - baselineAvg;

    // Log results for debugging
    console.log(`Baseline avg: ${baselineAvg.toFixed(3)}ms`);
    console.log(`Wrapped avg: ${wrappedAvg.toFixed(3)}ms`);
    console.log(`Overhead: ${overhead.toFixed(3)}ms`);

    // Verify overhead is less than 5ms
    // Note: We allow some margin for test environment variability
    expect(overhead).toBeLessThan(5);

    // Wait for async event recording
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Verify all events were recorded
    expect(provider.getEventCount()).toBe(wrappedIterations);
  });

  it('should not block on provider recording', async () => {
    // Create a slow provider that takes 50ms to record
    const slowProvider = {
      name: 'slow-provider',
      initialize: async () => {},
      shutdown: async () => {},
      record: async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
      },
    };

    const slowManager = new TelemetryManager();
    await slowManager.registerProvider(slowProvider);

    const handler = async (params: { value: number }) => {
      return { result: params.value };
    };

    const wrappedHandler = slowManager.wrapHandler(handler, 'test-tool', 'test-server');

    // Time the wrapped call - it should NOT wait for the 50ms recording
    const start = globalThis.performance.now();
    await wrappedHandler({ value: 42 });
    const elapsed = globalThis.performance.now() - start;

    // The call should complete much faster than 50ms
    // (fire-and-forget recording)
    expect(elapsed).toBeLessThan(20);
  });

  it('should handle high-frequency calls without memory issues', async () => {
    // Use a provider with bounded memory
    const boundedProvider = new MemoryStorageProvider({ maxEvents: 1000 });
    const boundedManager = new TelemetryManager();
    await boundedManager.registerProvider(boundedProvider);

    const handler = async (params: { value: number }) => {
      return { result: params.value };
    };

    const wrappedHandler = boundedManager.wrapHandler(handler, 'test-tool', 'test-server');

    // Make 2000 calls (exceeds maxEvents)
    const iterations = 2000;
    for (let i = 0; i < iterations; i++) {
      await wrappedHandler({ value: i });
    }

    // Wait for async recording
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Verify memory is bounded
    expect(boundedProvider.getEventCount()).toBeLessThanOrEqual(1000);

    // Verify FIFO - oldest events were evicted
    const events = boundedProvider.getAllEvents();
    const firstEventInput = events[0]?.inputs as { value: number } | undefined;
    expect(firstEventInput?.value).toBeGreaterThanOrEqual(1000);
  });

  it('should handle concurrent calls correctly', async () => {
    const handler = async (params: { value: number }) => {
      // Simulate async work
      await new Promise((resolve) => setTimeout(resolve, 1));
      return { result: params.value * 2 };
    };

    const wrappedHandler = manager.wrapHandler(handler, 'concurrent-tool', 'test-server');

    // Launch 50 concurrent calls
    const concurrentCalls = 50;
    const promises = Array.from({ length: concurrentCalls }, (_, i) =>
      wrappedHandler({ value: i })
    );

    const results = await Promise.all(promises);

    // Verify all calls completed correctly
    expect(results).toHaveLength(concurrentCalls);
    results.forEach((result, i) => {
      expect(result).toEqual({ result: i * 2 });
    });

    // Wait for async recording
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Verify all events were recorded
    expect(provider.getEventCount()).toBe(concurrentCalls);
  });
});
