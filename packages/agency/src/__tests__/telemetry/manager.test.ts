import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TelemetryManager } from '../../telemetry/manager.js';
import { MemoryStorageProvider } from '../../telemetry/providers/memory.js';
import type { TelemetryStorageProvider } from '../../telemetry/types.js';
import type { ToolCallEvent } from '../../telemetry/schemas.js';

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

describe('TelemetryManager', () => {
  let manager: TelemetryManager;

  beforeEach(() => {
    manager = new TelemetryManager();
  });

  describe('constructor', () => {
    it('should use default config when not provided', () => {
      const config = manager.getConfig();
      expect(config.enabled).toBe(true);
      expect(config.captureInputs).toBe(true);
      expect(config.captureOutputs).toBe(true);
    });

    it('should merge provided config with defaults', () => {
      const customManager = new TelemetryManager({
        captureInputs: false,
      });
      const config = customManager.getConfig();
      expect(config.enabled).toBe(true);
      expect(config.captureInputs).toBe(false);
      expect(config.captureOutputs).toBe(true);
    });
  });

  describe('provider registration', () => {
    it('should register a provider', async () => {
      const provider = createMockProvider('test-provider');
      await manager.registerProvider(provider);

      expect(manager.getProviderNames()).toContain('test-provider');
      expect(provider.initialize).toHaveBeenCalled();
    });

    it('should not register when telemetry is disabled', async () => {
      const disabledManager = new TelemetryManager({ enabled: false });
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const provider = createMockProvider('test-provider');
      await disabledManager.registerProvider(provider);

      expect(disabledManager.getProviderNames()).not.toContain('test-provider');
      expect(provider.initialize).not.toHaveBeenCalled();

      warnSpy.mockRestore();
    });

    it('should warn on duplicate registration', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const provider = createMockProvider('test-provider');
      await manager.registerProvider(provider);
      await manager.registerProvider(provider);

      expect(manager.getProviderNames()).toHaveLength(1);
      expect(warnSpy).toHaveBeenCalledWith(
        '[telemetry] Provider "test-provider" is already registered'
      );

      warnSpy.mockRestore();
    });

    it('should handle provider initialization failure', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const failingProvider: TelemetryStorageProvider = {
        name: 'failing-provider',
        initialize: vi.fn().mockRejectedValue(new Error('Init failed')),
        shutdown: vi.fn().mockResolvedValue(undefined),
        record: vi.fn().mockResolvedValue(undefined),
      };

      await manager.registerProvider(failingProvider);

      expect(manager.getProviderNames()).not.toContain('failing-provider');
      expect(warnSpy).toHaveBeenCalledWith(
        '[telemetry] Failed to initialize provider "failing-provider":',
        'Init failed'
      );

      warnSpy.mockRestore();
    });
  });

  describe('provider unregistration', () => {
    it('should unregister a provider', async () => {
      const provider = createMockProvider('test-provider');
      await manager.registerProvider(provider);
      await manager.unregisterProvider('test-provider');

      expect(manager.getProviderNames()).not.toContain('test-provider');
      expect(provider.shutdown).toHaveBeenCalled();
    });

    it('should warn when unregistering non-existent provider', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      await manager.unregisterProvider('non-existent');

      expect(warnSpy).toHaveBeenCalledWith(
        '[telemetry] Provider "non-existent" is not registered'
      );

      warnSpy.mockRestore();
    });

    it('should handle shutdown errors gracefully', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const provider = createMockProvider('test-provider');
      provider.shutdown = vi.fn().mockRejectedValue(new Error('Shutdown failed'));

      await manager.registerProvider(provider);
      await manager.unregisterProvider('test-provider');

      expect(manager.getProviderNames()).not.toContain('test-provider');
      expect(warnSpy).toHaveBeenCalledWith(
        '[telemetry] Error shutting down provider "test-provider":',
        'Shutdown failed'
      );

      warnSpy.mockRestore();
    });
  });

  describe('getProvider', () => {
    it('should return provider by name', async () => {
      const provider = createMockProvider('test-provider');
      await manager.registerProvider(provider);

      const retrieved = manager.getProvider('test-provider');
      expect(retrieved).toBe(provider);
    });

    it('should return undefined for non-existent provider', () => {
      const retrieved = manager.getProvider('non-existent');
      expect(retrieved).toBeUndefined();
    });
  });

  describe('configuration', () => {
    it('should update configuration', () => {
      manager.updateConfig({ captureInputs: false });
      expect(manager.getConfig().captureInputs).toBe(false);
      expect(manager.getConfig().enabled).toBe(true);
    });

    it('should report enabled status', () => {
      expect(manager.isEnabled()).toBe(true);

      const disabledManager = new TelemetryManager({ enabled: false });
      expect(disabledManager.isEnabled()).toBe(false);
    });
  });

  describe('wrapHandler', () => {
    it('should wrap a handler with telemetry', async () => {
      const provider = new MemoryStorageProvider();
      await manager.registerProvider(provider);

      const handler = vi.fn().mockResolvedValue({ result: 'success' });
      const wrapped = manager.wrapHandler(handler, 'test-tool', 'test-server');

      await wrapped({ input: 'test' });

      // Wait for async event recording
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(handler).toHaveBeenCalledWith({ input: 'test' });
      expect(provider.getEventCount()).toBe(1);

      const events = provider.getAllEvents();
      expect(events[0]?.toolName).toBe('test-tool');
      expect(events[0]?.serverName).toBe('test-server');
    });

    it('should return original handler when telemetry disabled', () => {
      const disabledManager = new TelemetryManager({ enabled: false });
      const handler = vi.fn();

      const wrapped = disabledManager.wrapHandler(handler, 'test-tool', 'test-server');

      expect(wrapped).toBe(handler);
    });

    it('should respect captureInputs config', async () => {
      const noInputsManager = new TelemetryManager({ captureInputs: false });
      const provider = new MemoryStorageProvider();
      await noInputsManager.registerProvider(provider);

      const handler = vi.fn().mockResolvedValue({});
      const wrapped = noInputsManager.wrapHandler(handler, 'test-tool', 'test-server');

      await wrapped({ secret: 'data' });
      await new Promise((resolve) => setTimeout(resolve, 10));

      const events = provider.getAllEvents();
      expect(events[0]?.inputs).toBeUndefined();
    });

    it('should include sessionId when provided', async () => {
      const provider = new MemoryStorageProvider();
      await manager.registerProvider(provider);

      const handler = vi.fn().mockResolvedValue({});
      const wrapped = manager.wrapHandler(handler, 'test-tool', 'test-server', 'session-123');

      await wrapped({});
      await new Promise((resolve) => setTimeout(resolve, 10));

      const events = provider.getAllEvents();
      expect(events[0]?.sessionId).toBe('session-123');
    });
  });

  describe('createWrapper', () => {
    it('should create a wrapper factory for a server', async () => {
      const provider = new MemoryStorageProvider();
      await manager.registerProvider(provider);

      const wrapHandler = manager.createWrapper('my-server');

      const handler1 = vi.fn().mockResolvedValue({});
      const handler2 = vi.fn().mockResolvedValue({});

      const wrapped1 = wrapHandler(handler1, 'tool-1');
      const wrapped2 = wrapHandler(handler2, 'tool-2');

      await wrapped1({});
      await wrapped2({});
      await new Promise((resolve) => setTimeout(resolve, 10));

      const events = provider.getAllEvents();
      expect(events).toHaveLength(2);
      expect(events[0]?.serverName).toBe('my-server');
      expect(events[0]?.toolName).toBe('tool-1');
      expect(events[1]?.serverName).toBe('my-server');
      expect(events[1]?.toolName).toBe('tool-2');
    });

    it('should return passthrough wrapper when disabled', () => {
      const disabledManager = new TelemetryManager({ enabled: false });
      const wrapHandler = disabledManager.createWrapper('my-server');

      const handler = vi.fn();
      const wrapped = wrapHandler(handler, 'test-tool');

      expect(wrapped).toBe(handler);
    });
  });

  describe('instrumentServer', () => {
    it('should return a handler wrapper for server instrumentation', async () => {
      const provider = new MemoryStorageProvider();
      await manager.registerProvider(provider);

      const wrapHandler = manager.instrumentServer('instrumented-server');

      const handler = vi.fn().mockResolvedValue({ result: 'ok' });
      const wrapped = wrapHandler(handler, 'my-tool');

      await wrapped({ query: 'test' });
      await new Promise((resolve) => setTimeout(resolve, 10));

      const events = provider.getAllEvents();
      expect(events).toHaveLength(1);
      expect(events[0]?.serverName).toBe('instrumented-server');
      expect(events[0]?.toolName).toBe('my-tool');
    });
  });

  describe('shutdown', () => {
    it('should shutdown all providers', async () => {
      const provider1 = createMockProvider('provider-1');
      const provider2 = createMockProvider('provider-2');

      await manager.registerProvider(provider1);
      await manager.registerProvider(provider2);

      await manager.shutdown();

      expect(manager.getProviderNames()).toHaveLength(0);
      expect(provider1.shutdown).toHaveBeenCalled();
      expect(provider2.shutdown).toHaveBeenCalled();
    });
  });

  describe('integration with MemoryStorageProvider', () => {
    it('should work end-to-end with memory provider', async () => {
      const provider = new MemoryStorageProvider();
      await manager.registerProvider(provider);

      const handler = vi.fn().mockImplementation(async (params: { n: number }) => {
        return { doubled: params.n * 2 };
      });

      const wrapped = manager.wrapHandler(handler, 'doubler', 'math-server');

      // Make several calls
      await wrapped({ n: 5 });
      await wrapped({ n: 10 });
      await wrapped({ n: 15 });

      // Wait for async recording
      await new Promise((resolve) => setTimeout(resolve, 20));

      // Verify events
      const events = provider.getAllEvents();
      expect(events).toHaveLength(3);

      // Check inputs/outputs captured
      expect(events[0]?.inputs).toEqual({ n: 5 });
      expect(events[0]?.outputs).toEqual({ doubled: 10 });

      // Check stats
      const stats = await provider.getStats({ toolName: 'doubler' });
      expect(stats.totalCalls).toBe(3);
      expect(stats.successCount).toBe(3);
      expect(stats.errorCount).toBe(0);
    });
  });
});
