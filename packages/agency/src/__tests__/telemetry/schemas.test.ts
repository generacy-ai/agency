import { describe, it, expect } from 'vitest';
import {
  ToolCallEventV1,
  ToolCallEvent,
  TelemetryFilterSchema,
  StatsFilterSchema,
  ToolStatsSchema,
  ToolStatsApiSchema,
  TimeWindow,
  TimeWindowSchema,
  ErrorCategory,
  ErrorCategorySchema,
  generateEventId,
  ULID_REGEX,
} from '../../telemetry/schemas.js';

describe('ToolCallEventV1', () => {
  const validEvent = {
    id: '01ARZ3NDEKTSV4RRFFQ69G5FAV',
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
      errorCategory: 'validation',
      errorType: 'InvalidInput',
      workflowId: 'workflow-123',
      issueNumber: 42,
      phase: 'implement',
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

  it('should reject invalid ULID', () => {
    const invalidEvent = { ...validEvent, id: 'not-a-ulid' };
    const result = ToolCallEventV1.safeParse(invalidEvent);
    expect(result.success).toBe(false);
  });

  it('should reject a UUID (old format)', () => {
    const uuidEvent = { ...validEvent, id: '550e8400-e29b-41d4-a716-446655440000' };
    const result = ToolCallEventV1.safeParse(uuidEvent);
    expect(result.success).toBe(false);
  });

  it('should reject a lowercase ULID', () => {
    const id = generateEventId().toLowerCase();
    const result = ToolCallEventV1.safeParse({ ...validEvent, id });
    expect(result.success).toBe(false);
  });

  it('should accept a generated event ID', () => {
    const eventWithGeneratedId = { ...validEvent, id: generateEventId() };
    const result = ToolCallEventV1.safeParse(eventWithGeneratedId);
    expect(result.success).toBe(true);
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

  it('should accept zero durationMs', () => {
    const result = ToolCallEventV1.safeParse({ ...validEvent, durationMs: 0 });
    expect(result.success).toBe(true);
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

  describe('optional fields from contracts', () => {
    it('should accept errorCategory', () => {
      const result = ToolCallEventV1.safeParse({
        ...validEvent,
        errorCategory: 'timeout',
      });
      expect(result.success).toBe(true);
    });

    it('should accept errorType', () => {
      const result = ToolCallEventV1.safeParse({
        ...validEvent,
        errorType: 'ConnectionRefused',
      });
      expect(result.success).toBe(true);
    });

    it('should accept workflowId', () => {
      const result = ToolCallEventV1.safeParse({
        ...validEvent,
        workflowId: 'wf-abc-123',
      });
      expect(result.success).toBe(true);
    });

    it('should accept issueNumber', () => {
      const result = ToolCallEventV1.safeParse({
        ...validEvent,
        issueNumber: 42,
      });
      expect(result.success).toBe(true);
    });

    it('should accept phase', () => {
      const result = ToolCallEventV1.safeParse({
        ...validEvent,
        phase: 'implement',
      });
      expect(result.success).toBe(true);
    });

    it('should accept all optional fields together', () => {
      const result = ToolCallEventV1.safeParse({
        ...validEvent,
        success: false,
        error: 'Connection refused',
        errorCategory: 'network',
        errorType: 'ConnectionRefused',
        workflowId: 'wf-abc-123',
        issueNumber: 99,
        phase: 'test',
      });
      expect(result.success).toBe(true);
    });

    it('should reject non-integer issueNumber', () => {
      const result = ToolCallEventV1.safeParse({
        ...validEvent,
        issueNumber: 1.5,
      });
      expect(result.success).toBe(false);
    });
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

describe('ToolStatsApiSchema', () => {
  const validApiStats = {
    version: '1.0.0',
    server: 'mcp-server-test',
    tool: 'test_tool',
    timeWindow: 'last_24h' as const,
    totalCalls: 1000,
    successRate: 0.95,
    avgDurationMs: 150,
  };

  it('should validate stats with required fields only', () => {
    const result = ToolStatsApiSchema.safeParse(validApiStats);
    expect(result.success).toBe(true);
  });

  it('should validate stats with all optional fields', () => {
    const fullStats = {
      ...validApiStats,
      p50DurationMs: 120,
      p95DurationMs: 450,
      errorBreakdown: {
        validation: 20,
        timeout: 15,
        network: 10,
        internal: 5,
      },
    };
    const result = ToolStatsApiSchema.safeParse(fullStats);
    expect(result.success).toBe(true);
  });

  it('should accept all valid time windows', () => {
    for (const window of Object.values(TimeWindow)) {
      const result = ToolStatsApiSchema.safeParse({
        ...validApiStats,
        timeWindow: window,
      });
      expect(result.success).toBe(true);
    }
  });

  it('should reject invalid time window', () => {
    const result = ToolStatsApiSchema.safeParse({
      ...validApiStats,
      timeWindow: 'last_1h',
    });
    expect(result.success).toBe(false);
  });

  it('should accept successRate at boundary values', () => {
    const result0 = ToolStatsApiSchema.safeParse({ ...validApiStats, successRate: 0 });
    expect(result0.success).toBe(true);

    const result1 = ToolStatsApiSchema.safeParse({ ...validApiStats, successRate: 1 });
    expect(result1.success).toBe(true);
  });

  it('should reject successRate below 0', () => {
    const result = ToolStatsApiSchema.safeParse({ ...validApiStats, successRate: -0.1 });
    expect(result.success).toBe(false);
  });

  it('should reject successRate above 1', () => {
    const result = ToolStatsApiSchema.safeParse({ ...validApiStats, successRate: 1.1 });
    expect(result.success).toBe(false);
  });

  it('should accept empty errorBreakdown', () => {
    const result = ToolStatsApiSchema.safeParse({
      ...validApiStats,
      errorBreakdown: {},
    });
    expect(result.success).toBe(true);
  });

  it('should accept errorBreakdown with all valid categories', () => {
    const fullBreakdown = Object.values(ErrorCategory).reduce(
      (acc, cat) => ({ ...acc, [cat]: 10 }),
      {} as Record<string, number>,
    );
    const result = ToolStatsApiSchema.safeParse({
      ...validApiStats,
      errorBreakdown: fullBreakdown,
    });
    expect(result.success).toBe(true);
  });

  it('should reject errorBreakdown with invalid category', () => {
    const result = ToolStatsApiSchema.safeParse({
      ...validApiStats,
      errorBreakdown: { invalid_category: 5 },
    });
    expect(result.success).toBe(false);
  });

  it('should reject negative totalCalls', () => {
    const result = ToolStatsApiSchema.safeParse({ ...validApiStats, totalCalls: -1 });
    expect(result.success).toBe(false);
  });

  it('should reject non-integer totalCalls', () => {
    const result = ToolStatsApiSchema.safeParse({ ...validApiStats, totalCalls: 1000.5 });
    expect(result.success).toBe(false);
  });

  it('should reject negative duration values', () => {
    const result = ToolStatsApiSchema.safeParse({ ...validApiStats, avgDurationMs: -1 });
    expect(result.success).toBe(false);

    const result2 = ToolStatsApiSchema.safeParse({ ...validApiStats, p50DurationMs: -1 });
    expect(result2.success).toBe(false);

    const result3 = ToolStatsApiSchema.safeParse({ ...validApiStats, p95DurationMs: -1 });
    expect(result3.success).toBe(false);
  });

  it('should accept decimal duration values', () => {
    const result = ToolStatsApiSchema.safeParse({
      ...validApiStats,
      avgDurationMs: 150.5,
      p50DurationMs: 120.3,
      p95DurationMs: 450.7,
    });
    expect(result.success).toBe(true);
  });

  it('should reject missing required fields', () => {
    const { version, ...statsWithoutVersion } = validApiStats;
    const result = ToolStatsApiSchema.safeParse(statsWithoutVersion);
    expect(result.success).toBe(false);
  });

  it('should reject empty server name', () => {
    const result = ToolStatsApiSchema.safeParse({ ...validApiStats, server: '' });
    expect(result.success).toBe(false);
  });

  it('should reject empty tool name', () => {
    const result = ToolStatsApiSchema.safeParse({ ...validApiStats, tool: '' });
    expect(result.success).toBe(false);
  });

  it('should reject negative error counts in breakdown', () => {
    const result = ToolStatsApiSchema.safeParse({
      ...validApiStats,
      errorBreakdown: { validation: -1 },
    });
    expect(result.success).toBe(false);
  });
});

describe('ErrorCategory', () => {
  it('has all expected error categories', () => {
    expect(ErrorCategory.VALIDATION).toBe('validation');
    expect(ErrorCategory.TIMEOUT).toBe('timeout');
    expect(ErrorCategory.PERMISSION).toBe('permission');
    expect(ErrorCategory.NETWORK).toBe('network');
    expect(ErrorCategory.INTERNAL).toBe('internal');
    expect(ErrorCategory.UNKNOWN).toBe('unknown');
  });

  it('has exactly 6 categories', () => {
    expect(Object.keys(ErrorCategory)).toHaveLength(6);
  });
});

describe('ErrorCategorySchema', () => {
  it('accepts all valid error categories', () => {
    for (const category of Object.values(ErrorCategory)) {
      const result = ErrorCategorySchema.safeParse(category);
      expect(result.success).toBe(true);
    }
  });

  it('rejects invalid error category', () => {
    expect(ErrorCategorySchema.safeParse('INVALID_CATEGORY').success).toBe(false);
  });

  it('rejects empty string', () => {
    expect(ErrorCategorySchema.safeParse('').success).toBe(false);
  });

  it('rejects uppercase variants', () => {
    expect(ErrorCategorySchema.safeParse('VALIDATION').success).toBe(false);
  });

  it('rejects non-string values', () => {
    expect(ErrorCategorySchema.safeParse(123).success).toBe(false);
    expect(ErrorCategorySchema.safeParse(null).success).toBe(false);
    expect(ErrorCategorySchema.safeParse(undefined).success).toBe(false);
  });
});

describe('TimeWindow', () => {
  it('has all expected time windows', () => {
    expect(TimeWindow.LAST_24H).toBe('last_24h');
    expect(TimeWindow.LAST_7D).toBe('last_7d');
    expect(TimeWindow.LAST_30D).toBe('last_30d');
    expect(TimeWindow.ALL_TIME).toBe('all_time');
  });

  it('has exactly 4 time windows', () => {
    expect(Object.keys(TimeWindow)).toHaveLength(4);
  });
});

describe('TimeWindowSchema', () => {
  it('accepts all valid time windows', () => {
    for (const window of Object.values(TimeWindow)) {
      const result = TimeWindowSchema.safeParse(window);
      expect(result.success).toBe(true);
    }
  });

  it('rejects invalid time window', () => {
    expect(TimeWindowSchema.safeParse('INVALID_WINDOW').success).toBe(false);
  });

  it('rejects empty string', () => {
    expect(TimeWindowSchema.safeParse('').success).toBe(false);
  });

  it('rejects uppercase variants', () => {
    expect(TimeWindowSchema.safeParse('LAST_24H').success).toBe(false);
  });

  it('rejects non-string values', () => {
    expect(TimeWindowSchema.safeParse(123).success).toBe(false);
    expect(TimeWindowSchema.safeParse(null).success).toBe(false);
    expect(TimeWindowSchema.safeParse(undefined).success).toBe(false);
  });
});

describe('generateEventId', () => {
  it('should return a valid ULID', () => {
    const id = generateEventId();
    expect(id).toMatch(ULID_REGEX);
  });

  it('should return a 26-character string', () => {
    const id = generateEventId();
    expect(id).toHaveLength(26);
  });

  it('should generate unique IDs across calls', () => {
    const ids = new Set(Array.from({ length: 100 }, () => generateEventId()));
    expect(ids.size).toBe(100);
  });
});
