import { describe, it, expect } from 'vitest';
import {
  ToolCallEventV1,
  ToolCallEvent,
  TelemetryFilterSchema,
  StatsFilterSchema,
  ToolStatsSchema,
} from '../../telemetry/schemas.js';

describe('ToolCallEventV1', () => {
  const validEvent = {
    id: '550e8400-e29b-41d4-a716-446655440000',
    timestamp: '2026-01-17T12:00:00.000Z',
    toolName: 'test-tool',
    serverName: 'test-server',
    durationMs: 100,
    success: true,
  };

  it('should validate a minimal valid event', () => {
    const result = ToolCallEventV1.safeParse(validEvent);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.toolName).toBe('test-tool');
    }
  });

  it('should validate an event with all optional fields', () => {
    const fullEvent = {
      ...validEvent,
      sessionId: 'session-123',
      inputs: { query: 'test' },
      outputs: { result: 'success' },
      error: undefined,
    };
    const result = ToolCallEventV1.safeParse(fullEvent);
    expect(result.success).toBe(true);
  });

  it('should validate a failed event with error message', () => {
    const failedEvent = {
      ...validEvent,
      success: false,
      error: 'Tool execution failed',
      outputs: undefined,
    };
    const result = ToolCallEventV1.safeParse(failedEvent);
    expect(result.success).toBe(true);
  });

  it('should reject invalid UUID', () => {
    const invalidEvent = { ...validEvent, id: 'not-a-uuid' };
    const result = ToolCallEventV1.safeParse(invalidEvent);
    expect(result.success).toBe(false);
  });

  it('should reject invalid timestamp', () => {
    const invalidEvent = { ...validEvent, timestamp: 'not-a-timestamp' };
    const result = ToolCallEventV1.safeParse(invalidEvent);
    expect(result.success).toBe(false);
  });

  it('should reject empty toolName', () => {
    const invalidEvent = { ...validEvent, toolName: '' };
    const result = ToolCallEventV1.safeParse(invalidEvent);
    expect(result.success).toBe(false);
  });

  it('should reject empty serverName', () => {
    const invalidEvent = { ...validEvent, serverName: '' };
    const result = ToolCallEventV1.safeParse(invalidEvent);
    expect(result.success).toBe(false);
  });

  it('should reject negative durationMs', () => {
    const invalidEvent = { ...validEvent, durationMs: -1 };
    const result = ToolCallEventV1.safeParse(invalidEvent);
    expect(result.success).toBe(false);
  });

  it('should allow extra fields via passthrough', () => {
    const eventWithExtra = {
      ...validEvent,
      customField: 'extra-data',
      anotherField: 42,
    };
    const result = ToolCallEventV1.safeParse(eventWithExtra);
    expect(result.success).toBe(true);
    if (result.success) {
      expect((result.data as Record<string, unknown>)['customField']).toBe('extra-data');
    }
  });
});

describe('TelemetryFilterSchema', () => {
  it('should validate an empty filter', () => {
    const result = TelemetryFilterSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('should validate a filter with all fields', () => {
    const filter = {
      toolName: 'test-tool',
      serverName: 'test-server',
      sessionId: 'session-123',
      success: true,
      startTime: '2026-01-01T00:00:00.000Z',
      endTime: '2026-01-31T23:59:59.999Z',
      limit: 100,
      offset: 0,
    };
    const result = TelemetryFilterSchema.safeParse(filter);
    expect(result.success).toBe(true);
  });

  it('should reject negative offset', () => {
    const filter = { offset: -1 };
    const result = TelemetryFilterSchema.safeParse(filter);
    expect(result.success).toBe(false);
  });

  it('should reject zero or negative limit', () => {
    const zeroLimit = TelemetryFilterSchema.safeParse({ limit: 0 });
    expect(zeroLimit.success).toBe(false);

    const negativeLimit = TelemetryFilterSchema.safeParse({ limit: -1 });
    expect(negativeLimit.success).toBe(false);
  });

  it('should reject invalid timestamp format', () => {
    const filter = { startTime: 'not-a-timestamp' };
    const result = TelemetryFilterSchema.safeParse(filter);
    expect(result.success).toBe(false);
  });
});

describe('StatsFilterSchema', () => {
  it('should validate an empty filter', () => {
    const result = StatsFilterSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('should validate a filter with all fields', () => {
    const filter = {
      toolName: 'test-tool',
      serverName: 'test-server',
      startTime: '2026-01-01T00:00:00.000Z',
      endTime: '2026-01-31T23:59:59.999Z',
    };
    const result = StatsFilterSchema.safeParse(filter);
    expect(result.success).toBe(true);
  });
});

describe('ToolStatsSchema', () => {
  const validStats = {
    totalCalls: 100,
    successCount: 95,
    errorCount: 5,
    avgDurationMs: 50.5,
    minDurationMs: 10,
    maxDurationMs: 200,
  };

  it('should validate minimal stats', () => {
    const result = ToolStatsSchema.safeParse(validStats);
    expect(result.success).toBe(true);
  });

  it('should validate stats with percentiles', () => {
    const statsWithPercentiles = {
      ...validStats,
      p50DurationMs: 45,
      p95DurationMs: 150,
      p99DurationMs: 190,
    };
    const result = ToolStatsSchema.safeParse(statsWithPercentiles);
    expect(result.success).toBe(true);
  });

  it('should reject negative counts', () => {
    const invalidStats = { ...validStats, totalCalls: -1 };
    const result = ToolStatsSchema.safeParse(invalidStats);
    expect(result.success).toBe(false);
  });

  it('should reject negative duration', () => {
    const invalidStats = { ...validStats, minDurationMs: -1 };
    const result = ToolStatsSchema.safeParse(invalidStats);
    expect(result.success).toBe(false);
  });
});
