import { describe, it, expect } from 'vitest';
import { ulid } from 'ulid';
import {
  ULID_REGEX,
  createPrefixedIdSchema,
  UserIdSchema,
  CorrelationIdSchema,
  RequestIdSchema,
  SessionIdSchema,
  OrganizationIdSchema,
  MembershipIdSchema,
  InviteIdSchema,
  WorkItemIdSchema,
  AgentIdSchema,
  generateCorrelationId,
  generateRequestId,
  generateSessionId,
  generateOrganizationId,
  generateMembershipId,
  generateInviteId,
  generateWorkItemId,
  generateAgentId,
} from '../ids.js';
import {
  ISOTimestampSchema,
  createTimestamp,
  TimestampSchema,
  OptionalTimestampSchema,
} from '../timestamps.js';

// =============================================================================
// ULID_REGEX
// =============================================================================

describe('ULID_REGEX', () => {
  it('should match a valid ULID', () => {
    const id = ulid();
    expect(ULID_REGEX.test(id)).toBe(true);
  });

  it('should match a known valid ULID string', () => {
    expect(ULID_REGEX.test('01ARZ3NDEKTSV4RRFFQ69G5FAV')).toBe(true);
  });

  it('should reject strings shorter than 26 characters', () => {
    expect(ULID_REGEX.test('01ARZ3NDEKTSV4RRFFQ69G5FA')).toBe(false);
  });

  it('should reject strings longer than 26 characters', () => {
    expect(ULID_REGEX.test('01ARZ3NDEKTSV4RRFFQ69G5FAVX')).toBe(false);
  });

  it('should reject empty string', () => {
    expect(ULID_REGEX.test('')).toBe(false);
  });

  it('should reject lowercase letters', () => {
    expect(ULID_REGEX.test('01arz3ndektsv4rrffq69g5fav')).toBe(false);
  });

  it('should reject excluded Crockford Base32 characters (I, L, O, U)', () => {
    // 'I' is excluded from Crockford Base32
    expect(ULID_REGEX.test('0IARZ3NDEKTSV4RRFFQ69G5FAV')).toBe(false);
    // 'L' is excluded
    expect(ULID_REGEX.test('0LARZ3NDEKTSV4RRFFQ69G5FAV')).toBe(false);
    // 'O' is excluded
    expect(ULID_REGEX.test('0OARZ3NDEKTSV4RRFFQ69G5FAV')).toBe(false);
    // 'U' is excluded
    expect(ULID_REGEX.test('0UARZ3NDEKTSV4RRFFQ69G5FAV')).toBe(false);
  });

  it('should reject strings with special characters', () => {
    expect(ULID_REGEX.test('01ARZ3NDEKTSV4RRFFQ69G5FA!')).toBe(false);
    expect(ULID_REGEX.test('01ARZ3NDEKTSV4RRFFQ69G5F_V')).toBe(false);
  });
});

// =============================================================================
// createPrefixedIdSchema
// =============================================================================

describe('createPrefixedIdSchema', () => {
  it('should accept a valid prefixed ID', () => {
    const schema = createPrefixedIdSchema('phi');
    const result = schema.safeParse('phi_abc12345');

    expect(result.success).toBe(true);
  });

  it('should accept IDs with exactly 8 chars after prefix', () => {
    const schema = createPrefixedIdSchema('phi');
    const result = schema.safeParse('phi_abcd1234');

    expect(result.success).toBe(true);
  });

  it('should accept IDs with more than 8 chars after prefix', () => {
    const schema = createPrefixedIdSchema('phi');
    const result = schema.safeParse('phi_abcdef123456');

    expect(result.success).toBe(true);
  });

  it('should reject IDs with fewer than 8 chars after prefix', () => {
    const schema = createPrefixedIdSchema('phi');
    const result = schema.safeParse('phi_abc1234');

    expect(result.success).toBe(false);
  });

  it('should reject IDs with wrong prefix', () => {
    const schema = createPrefixedIdSchema('phi');
    const result = schema.safeParse('val_abc12345');

    expect(result.success).toBe(false);
  });

  it('should reject IDs without underscore separator', () => {
    const schema = createPrefixedIdSchema('phi');
    const result = schema.safeParse('phiabc12345');

    expect(result.success).toBe(false);
  });

  it('should reject IDs with uppercase characters after prefix', () => {
    const schema = createPrefixedIdSchema('phi');
    const result = schema.safeParse('phi_ABC12345');

    expect(result.success).toBe(false);
  });

  it('should reject empty string', () => {
    const schema = createPrefixedIdSchema('phi');
    const result = schema.safeParse('');

    expect(result.success).toBe(false);
  });

  it('should work with different prefixes', () => {
    const prefixes = ['bio', 'session', 'org', 'mem', 'inv', 'wi', 'agent'];

    for (const prefix of prefixes) {
      const schema = createPrefixedIdSchema(prefix);
      const valid = schema.safeParse(`${prefix}_abcd1234`);
      expect(valid.success).toBe(true);

      const invalid = schema.safeParse(`other_abcd1234`);
      expect(invalid.success).toBe(false);
    }
  });

  it('should include prefix in error message', () => {
    const schema = createPrefixedIdSchema('phi');
    const result = schema.safeParse('bad');

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toContain('phi');
    }
  });
});

// =============================================================================
// UserIdSchema
// =============================================================================

describe('UserIdSchema', () => {
  it('should accept any non-empty string', () => {
    expect(UserIdSchema.safeParse('user123').success).toBe(true);
    expect(UserIdSchema.safeParse('a').success).toBe(true);
    expect(UserIdSchema.safeParse('user@example.com').success).toBe(true);
  });

  it('should reject empty string', () => {
    expect(UserIdSchema.safeParse('').success).toBe(false);
  });

  it('should reject non-string types', () => {
    expect(UserIdSchema.safeParse(123).success).toBe(false);
    expect(UserIdSchema.safeParse(null).success).toBe(false);
    expect(UserIdSchema.safeParse(undefined).success).toBe(false);
  });
});

// =============================================================================
// ULID-based Branded ID Schemas
// =============================================================================

describe('branded ID schemas', () => {
  const validUlid = ulid();

  const schemas = [
    { name: 'CorrelationIdSchema', schema: CorrelationIdSchema },
    { name: 'RequestIdSchema', schema: RequestIdSchema },
    { name: 'SessionIdSchema', schema: SessionIdSchema },
    { name: 'OrganizationIdSchema', schema: OrganizationIdSchema },
    { name: 'MembershipIdSchema', schema: MembershipIdSchema },
    { name: 'InviteIdSchema', schema: InviteIdSchema },
    { name: 'WorkItemIdSchema', schema: WorkItemIdSchema },
    { name: 'AgentIdSchema', schema: AgentIdSchema },
  ] as const;

  it.each(schemas)('$name should accept a valid ULID', ({ schema }) => {
    const result = schema.safeParse(validUlid);
    expect(result.success).toBe(true);
  });

  it.each(schemas)('$name should reject an invalid ULID', ({ schema }) => {
    const result = schema.safeParse('not-a-ulid');
    expect(result.success).toBe(false);
  });

  it.each(schemas)('$name should reject empty string', ({ schema }) => {
    const result = schema.safeParse('');
    expect(result.success).toBe(false);
  });

  it.each(schemas)(
    '$name should include schema name in error message',
    ({ name, schema }) => {
      const result = schema.safeParse('invalid');
      expect(result.success).toBe(false);
      if (!result.success) {
        // Error message should mention the specific ID type
        const typeName = name.replace('Schema', '');
        expect(result.error.issues[0].message).toContain(typeName);
      }
    }
  );

  it.each(schemas)(
    '$name should transform to branded type on parse',
    ({ schema }) => {
      const result = schema.safeParse(validUlid);
      expect(result.success).toBe(true);
      if (result.success) {
        // The output should be the same string value
        expect(result.data).toBe(validUlid);
        // It's still a string at runtime
        expect(typeof result.data).toBe('string');
      }
    }
  );
});

// =============================================================================
// ID Generation Utilities
// =============================================================================

describe('ID generation utilities', () => {
  const generators = [
    { name: 'generateCorrelationId', fn: generateCorrelationId, schema: CorrelationIdSchema },
    { name: 'generateRequestId', fn: generateRequestId, schema: RequestIdSchema },
    { name: 'generateSessionId', fn: generateSessionId, schema: SessionIdSchema },
    { name: 'generateOrganizationId', fn: generateOrganizationId, schema: OrganizationIdSchema },
    { name: 'generateMembershipId', fn: generateMembershipId, schema: MembershipIdSchema },
    { name: 'generateInviteId', fn: generateInviteId, schema: InviteIdSchema },
    { name: 'generateWorkItemId', fn: generateWorkItemId, schema: WorkItemIdSchema },
    { name: 'generateAgentId', fn: generateAgentId, schema: AgentIdSchema },
  ] as const;

  it.each(generators)(
    '$name should return a valid ULID',
    ({ fn }) => {
      const id = fn();
      expect(ULID_REGEX.test(id)).toBe(true);
    }
  );

  it.each(generators)(
    '$name should pass its own schema validation',
    ({ fn, schema }) => {
      const id = fn();
      const result = schema.safeParse(id);
      expect(result.success).toBe(true);
    }
  );

  it.each(generators)(
    '$name should return unique IDs on successive calls',
    ({ fn }) => {
      const id1 = fn();
      const id2 = fn();
      expect(id1).not.toBe(id2);
    }
  );
});

// =============================================================================
// ISOTimestampSchema
// =============================================================================

describe('ISOTimestampSchema', () => {
  describe('valid formats', () => {
    it('should accept UTC format with Z suffix', () => {
      const result = ISOTimestampSchema.safeParse('2024-01-15T10:30:00Z');
      expect(result.success).toBe(true);
    });

    it('should accept format with milliseconds', () => {
      const result = ISOTimestampSchema.safeParse('2024-01-15T10:30:00.000Z');
      expect(result.success).toBe(true);
    });

    it('should accept format with timezone offset', () => {
      const result = ISOTimestampSchema.safeParse('2024-01-15T10:30:00+00:00');
      expect(result.success).toBe(true);
    });

    it('should accept format with positive timezone offset', () => {
      const result = ISOTimestampSchema.safeParse('2024-01-15T10:30:00+05:30');
      expect(result.success).toBe(true);
    });

    it('should accept format with negative timezone offset', () => {
      const result = ISOTimestampSchema.safeParse('2024-01-15T10:30:00-08:00');
      expect(result.success).toBe(true);
    });

    it('should accept format with 1-digit milliseconds', () => {
      const result = ISOTimestampSchema.safeParse('2024-01-15T10:30:00.5Z');
      expect(result.success).toBe(true);
    });

    it('should transform to branded ISOTimestamp type', () => {
      const result = ISOTimestampSchema.safeParse('2024-01-15T10:30:00Z');
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe('2024-01-15T10:30:00Z');
        expect(typeof result.data).toBe('string');
      }
    });
  });

  describe('invalid formats', () => {
    it('should reject date-only strings', () => {
      const result = ISOTimestampSchema.safeParse('2024-01-15');
      expect(result.success).toBe(false);
    });

    it('should reject timestamps without timezone', () => {
      const result = ISOTimestampSchema.safeParse('2024-01-15T10:30:00');
      expect(result.success).toBe(false);
    });

    it('should reject plain text', () => {
      const result = ISOTimestampSchema.safeParse('not a date');
      expect(result.success).toBe(false);
    });

    it('should reject empty string', () => {
      const result = ISOTimestampSchema.safeParse('');
      expect(result.success).toBe(false);
    });

    it('should reject invalid month (month 13 produces NaN)', () => {
      const result = ISOTimestampSchema.safeParse('2024-13-15T10:30:00Z');
      expect(result.success).toBe(false);
    });

    it('should reject malformed date that produces NaN', () => {
      const result = ISOTimestampSchema.safeParse('0000-00-00T00:00:00Z');
      expect(result.success).toBe(false);
    });

    it('should reject non-string types', () => {
      expect(ISOTimestampSchema.safeParse(123).success).toBe(false);
      expect(ISOTimestampSchema.safeParse(null).success).toBe(false);
    });
  });
});

// =============================================================================
// createTimestamp
// =============================================================================

describe('createTimestamp', () => {
  it('should return a valid ISO timestamp', () => {
    const ts = createTimestamp();
    const result = ISOTimestampSchema.safeParse(ts);
    expect(result.success).toBe(true);
  });

  it('should return current time (within 1 second)', () => {
    const before = Date.now();
    const ts = createTimestamp();
    const after = Date.now();

    const tsTime = new Date(ts).getTime();
    expect(tsTime).toBeGreaterThanOrEqual(before);
    expect(tsTime).toBeLessThanOrEqual(after);
  });
});

// =============================================================================
// TimestampSchema
// =============================================================================

describe('TimestampSchema', () => {
  it('should coerce a valid date string to Date', () => {
    const result = TimestampSchema.safeParse('2024-01-15T10:30:00Z');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toBeInstanceOf(Date);
      expect(result.data.toISOString()).toBe('2024-01-15T10:30:00.000Z');
    }
  });

  it('should accept a Date object', () => {
    const date = new Date('2024-01-15T10:30:00Z');
    const result = TimestampSchema.safeParse(date);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toBeInstanceOf(Date);
    }
  });

  it('should reject invalid date strings', () => {
    const result = TimestampSchema.safeParse('not-a-date');
    expect(result.success).toBe(false);
  });
});

// =============================================================================
// OptionalTimestampSchema
// =============================================================================

describe('OptionalTimestampSchema', () => {
  it('should accept undefined', () => {
    const result = OptionalTimestampSchema.safeParse(undefined);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toBeUndefined();
    }
  });

  it('should accept a valid date string', () => {
    const result = OptionalTimestampSchema.safeParse('2024-01-15T10:30:00Z');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toBeInstanceOf(Date);
    }
  });

  it('should reject invalid date strings', () => {
    const result = OptionalTimestampSchema.safeParse('garbage');
    expect(result.success).toBe(false);
  });
});
