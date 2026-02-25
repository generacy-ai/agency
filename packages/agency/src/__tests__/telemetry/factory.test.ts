import { describe, it, expect, afterEach } from 'vitest';
import { createTelemetryManager } from '../../telemetry/factory.js';
import { MemoryStorageProvider } from '../../telemetry/providers/memory.js';
import type { TelemetryStorageProvider } from '../../telemetry/types.js';
import { generateEventId, type ToolCallEvent } from '../../telemetry/schemas.js';

describe('createTelemetryManager', () => {
  let manager: Awaited<ReturnType<typeof createTelemetryManager>> | null = null;

  afterEach(async () => {
    if (manager) {
      await manager.shutdown();
      manager = null;
    }
  });

  it('should create a manager with default memory storage', async () => {
    manager = await createTelemetryManager();

    expect(manager).toBeDefined();
    expect(manager.isEnabled()).toBe(true);
    expect(manager.getProviderNames()).toContain('memory');
  });

  it('should create a manager with custom maxEvents', async () => {
    manager = await createTelemetryManager({ maxEvents: 500 });

    const provider = manager.getProvider('memory') as MemoryStorageProvider;
    expect(provider).toBeDefined();

    // Record events to test maxEvents works
    for (let i = 0; i < 600; i++) {
      await provider.record({
        id: generateEventId(),
        timestamp: new Date().toISOString(),
        toolName: 'test',
        serverName: 'test',
        durationMs: 10,
        success: true,
      });
    }

    expect(provider.getEventCount()).toBe(500);
  });

  it('should create a disabled manager without registering providers', async () => {
    manager = await createTelemetryManager({ enabled: false });

    expect(manager.isEnabled()).toBe(false);
    expect(manager.getProviderNames()).toHaveLength(0);
  });

  it('should create a manager with custom storage provider', async () => {
    const events: ToolCallEvent[] = [];

    const customProvider: TelemetryStorageProvider = {
      name: 'custom',
      initialize: async () => {},
      shutdown: async () => {},
      record: async (event) => {
        events.push(event);
      },
    };

    manager = await createTelemetryManager({ storage: customProvider });

    expect(manager.getProviderNames()).toContain('custom');
    expect(manager.getProviderNames()).not.toContain('memory');
  });

  it('should pass telemetry config options to manager', async () => {
    manager = await createTelemetryManager({
      captureInputs: false,
      captureOutputs: false,
    });

    const config = manager.getConfig();
    expect(config.captureInputs).toBe(false);
    expect(config.captureOutputs).toBe(false);
  });

  it('should explicitly specify memory storage', async () => {
    manager = await createTelemetryManager({ storage: 'memory' });

    expect(manager.getProviderNames()).toContain('memory');
    expect(manager.getProvider('memory')).toBeInstanceOf(MemoryStorageProvider);
  });
});
