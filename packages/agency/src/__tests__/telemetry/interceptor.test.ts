import { describe, it, expect, vi, beforeEach } from 'vitest';
import { wrapToolHandler, createHandlerWrapper } from '../../telemetry/interceptor.js';
import { TelemetryBus } from '../../telemetry/bus.js';
import type { ToolCallEvent } from '../../telemetry/schemas.js';

describe('wrapToolHandler', () => {
  let bus: TelemetryBus;
  let emittedEvents: ToolCallEvent[];

  beforeEach(() => {
    bus = new TelemetryBus();
    emittedEvents = [];

    // Capture emitted events
    const originalEmit = bus.emit.bind(bus);
    bus.emit = (event: ToolCallEvent) => {
      emittedEvents.push(event);
      originalEmit(event);
    };
  });

  describe('successful execution', () => {
    it('should call the original handler and return result', async () => {
      const handler = vi.fn().mockResolvedValue({ result: 'success' });
      const wrapped = wrapToolHandler(handler, bus, {
        toolName: 'test-tool',
        serverName: 'test-server',
      });

      const result = await wrapped({ input: 'test' });

      expect(handler).toHaveBeenCalledWith({ input: 'test' });
      expect(result).toEqual({ result: 'success' });
    });

    it('should emit a telemetry event with success=true', async () => {
      const handler = vi.fn().mockResolvedValue({ result: 'success' });
      const wrapped = wrapToolHandler(handler, bus, {
        toolName: 'test-tool',
        serverName: 'test-server',
      });

      await wrapped({ input: 'test' });

      expect(emittedEvents).toHaveLength(1);
      expect(emittedEvents[0]?.success).toBe(true);
      expect(emittedEvents[0]?.toolName).toBe('test-tool');
      expect(emittedEvents[0]?.serverName).toBe('test-server');
    });

    it('should capture inputs when captureInputs=true', async () => {
      const handler = vi.fn().mockResolvedValue({});
      const wrapped = wrapToolHandler(handler, bus, {
        toolName: 'test-tool',
        serverName: 'test-server',
        captureInputs: true,
      });

      await wrapped({ query: 'test-query', limit: 10 });

      expect(emittedEvents[0]?.inputs).toEqual({ query: 'test-query', limit: 10 });
    });

    it('should not capture inputs when captureInputs=false', async () => {
      const handler = vi.fn().mockResolvedValue({});
      const wrapped = wrapToolHandler(handler, bus, {
        toolName: 'test-tool',
        serverName: 'test-server',
        captureInputs: false,
      });

      await wrapped({ secret: 'password' });

      expect(emittedEvents[0]?.inputs).toBeUndefined();
    });

    it('should capture outputs when captureOutputs=true', async () => {
      const handler = vi.fn().mockResolvedValue({ data: [1, 2, 3] });
      const wrapped = wrapToolHandler(handler, bus, {
        toolName: 'test-tool',
        serverName: 'test-server',
        captureOutputs: true,
      });

      await wrapped({});

      expect(emittedEvents[0]?.outputs).toEqual({ data: [1, 2, 3] });
    });

    it('should not capture outputs when captureOutputs=false', async () => {
      const handler = vi.fn().mockResolvedValue({ data: 'sensitive' });
      const wrapped = wrapToolHandler(handler, bus, {
        toolName: 'test-tool',
        serverName: 'test-server',
        captureOutputs: false,
      });

      await wrapped({});

      expect(emittedEvents[0]?.outputs).toBeUndefined();
    });

    it('should include sessionId when provided', async () => {
      const handler = vi.fn().mockResolvedValue({});
      const wrapped = wrapToolHandler(handler, bus, {
        toolName: 'test-tool',
        serverName: 'test-server',
        sessionId: 'session-123',
      });

      await wrapped({});

      expect(emittedEvents[0]?.sessionId).toBe('session-123');
    });

    it('should not include sessionId when not provided', async () => {
      const handler = vi.fn().mockResolvedValue({});
      const wrapped = wrapToolHandler(handler, bus, {
        toolName: 'test-tool',
        serverName: 'test-server',
      });

      await wrapped({});

      expect(emittedEvents[0]?.sessionId).toBeUndefined();
    });
  });

  describe('error handling', () => {
    it('should rethrow handler errors', async () => {
      const error = new Error('Handler failed');
      const handler = vi.fn().mockRejectedValue(error);
      const wrapped = wrapToolHandler(handler, bus, {
        toolName: 'test-tool',
        serverName: 'test-server',
      });

      await expect(wrapped({})).rejects.toThrow('Handler failed');
    });

    it('should emit event with success=false on error', async () => {
      const handler = vi.fn().mockRejectedValue(new Error('Handler failed'));
      const wrapped = wrapToolHandler(handler, bus, {
        toolName: 'test-tool',
        serverName: 'test-server',
      });

      try {
        await wrapped({});
      } catch {
        // Expected
      }

      expect(emittedEvents).toHaveLength(1);
      expect(emittedEvents[0]?.success).toBe(false);
      expect(emittedEvents[0]?.error).toBe('Handler failed');
    });

    it('should capture error message for non-Error throws', async () => {
      const handler = vi.fn().mockRejectedValue('string error');
      const wrapped = wrapToolHandler(handler, bus, {
        toolName: 'test-tool',
        serverName: 'test-server',
      });

      try {
        await wrapped({});
      } catch {
        // Expected
      }

      expect(emittedEvents[0]?.error).toBe('string error');
    });

    it('should not capture outputs on error even when captureOutputs=true', async () => {
      const handler = vi.fn().mockRejectedValue(new Error('Failed'));
      const wrapped = wrapToolHandler(handler, bus, {
        toolName: 'test-tool',
        serverName: 'test-server',
        captureOutputs: true,
      });

      try {
        await wrapped({});
      } catch {
        // Expected
      }

      expect(emittedEvents[0]?.outputs).toBeUndefined();
      expect(emittedEvents[0]?.error).toBe('Failed');
    });
  });

  describe('timing measurement', () => {
    it('should measure duration in milliseconds', async () => {
      const handler = vi
        .fn()
        .mockImplementation(() => new Promise((resolve) => setTimeout(resolve, 50)));
      const wrapped = wrapToolHandler(handler, bus, {
        toolName: 'test-tool',
        serverName: 'test-server',
      });

      await wrapped({});

      const event = emittedEvents[0];
      expect(event?.durationMs).toBeGreaterThanOrEqual(40);
      expect(event?.durationMs).toBeLessThan(200);
    });

    it('should generate valid UUID for event id', async () => {
      const handler = vi.fn().mockResolvedValue({});
      const wrapped = wrapToolHandler(handler, bus, {
        toolName: 'test-tool',
        serverName: 'test-server',
      });

      await wrapped({});

      const uuidRegex =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      expect(emittedEvents[0]?.id).toMatch(uuidRegex);
    });

    it('should generate valid ISO timestamp', async () => {
      const handler = vi.fn().mockResolvedValue({});
      const wrapped = wrapToolHandler(handler, bus, {
        toolName: 'test-tool',
        serverName: 'test-server',
      });

      await wrapped({});

      const timestamp = emittedEvents[0]?.timestamp;
      expect(timestamp).toBeDefined();
      expect(() => new Date(timestamp!)).not.toThrow();
    });
  });
});

describe('createHandlerWrapper', () => {
  let bus: TelemetryBus;
  let emittedEvents: ToolCallEvent[];

  beforeEach(() => {
    bus = new TelemetryBus();
    emittedEvents = [];

    const originalEmit = bus.emit.bind(bus);
    bus.emit = (event: ToolCallEvent) => {
      emittedEvents.push(event);
      originalEmit(event);
    };
  });

  it('should create a wrapper factory for a server', async () => {
    const wrapHandler = createHandlerWrapper(bus, 'my-server');

    const handler1 = vi.fn().mockResolvedValue({ result: 1 });
    const handler2 = vi.fn().mockResolvedValue({ result: 2 });

    const wrapped1 = wrapHandler(handler1, 'tool-1');
    const wrapped2 = wrapHandler(handler2, 'tool-2');

    await wrapped1({});
    await wrapped2({});

    expect(emittedEvents).toHaveLength(2);
    expect(emittedEvents[0]?.serverName).toBe('my-server');
    expect(emittedEvents[0]?.toolName).toBe('tool-1');
    expect(emittedEvents[1]?.serverName).toBe('my-server');
    expect(emittedEvents[1]?.toolName).toBe('tool-2');
  });

  it('should apply default options to all wrapped handlers', async () => {
    const wrapHandler = createHandlerWrapper(bus, 'my-server', {
      captureInputs: false,
      sessionId: 'default-session',
    });

    const handler = vi.fn().mockResolvedValue({});
    const wrapped = wrapHandler(handler, 'test-tool');

    await wrapped({ secret: 'data' });

    expect(emittedEvents[0]?.inputs).toBeUndefined();
    expect(emittedEvents[0]?.sessionId).toBe('default-session');
  });

  it('should allow per-handler option overrides', async () => {
    const wrapHandler = createHandlerWrapper(bus, 'my-server', {
      captureInputs: false,
    });

    const handler = vi.fn().mockResolvedValue({});
    const wrapped = wrapHandler(handler, 'test-tool', { captureInputs: true });

    await wrapped({ data: 'test' });

    expect(emittedEvents[0]?.inputs).toEqual({ data: 'test' });
  });
});
