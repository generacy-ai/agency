import { describe, it, expect } from 'vitest';
import {
  ApiKeySchema,
  ApiKey,
  ApiKeyIdSchema,
  generateApiKeyId,
  ApiKeyOwnerTypeSchema,
  parseApiKey,
  safeParseApiKey,
} from '../api-key.js';

describe('ApiKeyIdSchema', () => {
  const validUlid = '01ARZ3NDEKTSV4RRFFQ69G5FAV';

  it('accepts valid ULID', () => {
    const result = ApiKeyIdSchema.safeParse(validUlid);
    expect(result.success).toBe(true);
  });

  it('rejects invalid ULID (too short)', () => {
    const result = ApiKeyIdSchema.safeParse('01ARZ3NDEKTSV4RRFFQ69G5FA');
    expect(result.success).toBe(false);
  });

  it('rejects invalid ULID (invalid characters)', () => {
    const result = ApiKeyIdSchema.safeParse('01ARZ3NDEKTSV4RRFFQ69G5FAL');
    expect(result.success).toBe(false);
  });
});

describe('generateApiKeyId', () => {
  it('generates valid ULID', () => {
    const id = generateApiKeyId();
    const result = ApiKeyIdSchema.safeParse(id);
    expect(result.success).toBe(true);
  });

  it('generates unique IDs', () => {
    const ids = new Set([
      generateApiKeyId(),
      generateApiKeyId(),
      generateApiKeyId(),
    ]);
    expect(ids.size).toBe(3);
  });
});

describe('ApiKeyOwnerTypeSchema', () => {
  it('accepts valid owner types', () => {
    expect(ApiKeyOwnerTypeSchema.safeParse('user').success).toBe(true);
    expect(ApiKeyOwnerTypeSchema.safeParse('organization').success).toBe(true);
    expect(ApiKeyOwnerTypeSchema.safeParse('service').success).toBe(true);
  });

  it('rejects invalid owner types', () => {
    expect(ApiKeyOwnerTypeSchema.safeParse('invalid').success).toBe(false);
    expect(ApiKeyOwnerTypeSchema.safeParse('USER').success).toBe(false);
  });
});

describe('ApiKeySchema', () => {
  const validApiKey = {
    id: '01ARZ3NDEKTSV4RRFFQ69G5FAV',
    name: 'CI/CD Pipeline',
    prefix: 'gk_live_',
    hashedKey: 'sha256:' + 'a'.repeat(64),
    scopes: ['repo:read', 'workflow:write'],
    ownerId: '01ARZ3NDEKTSV4RRFFQ69G5FAV',
    ownerType: 'user',
    createdAt: '2024-01-15T10:30:00Z',
  };

  describe('valid API keys', () => {
    it('accepts valid API key', () => {
      const result = ApiKeySchema.safeParse(validApiKey);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.name).toBe('CI/CD Pipeline');
        expect(result.data.prefix).toBe('gk_live_');
        expect(result.data.revoked).toBe(false); // default
      }
    });

    it('accepts test prefix', () => {
      const key = { ...validApiKey, prefix: 'gk_test_' };
      const result = ApiKeySchema.safeParse(key);
      expect(result.success).toBe(true);
    });

    it('accepts optional lastUsedAt', () => {
      const key = { ...validApiKey, lastUsedAt: '2024-01-16T10:30:00Z' };
      const result = ApiKeySchema.safeParse(key);
      expect(result.success).toBe(true);
    });

    it('accepts optional expiresAt', () => {
      const key = { ...validApiKey, expiresAt: '2025-01-15T10:30:00Z' };
      const result = ApiKeySchema.safeParse(key);
      expect(result.success).toBe(true);
    });

    it('accepts explicit revoked flag', () => {
      const key = { ...validApiKey, revoked: true };
      const result = ApiKeySchema.safeParse(key);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.revoked).toBe(true);
      }
    });

    it('accepts organization owner type', () => {
      const key = { ...validApiKey, ownerType: 'organization' };
      const result = ApiKeySchema.safeParse(key);
      expect(result.success).toBe(true);
    });

    it('accepts service owner type', () => {
      const key = { ...validApiKey, ownerType: 'service' };
      const result = ApiKeySchema.safeParse(key);
      expect(result.success).toBe(true);
    });
  });

  describe('invalid API keys', () => {
    it('rejects empty name', () => {
      const key = { ...validApiKey, name: '' };
      const result = ApiKeySchema.safeParse(key);
      expect(result.success).toBe(false);
    });

    it('rejects name too long', () => {
      const key = { ...validApiKey, name: 'a'.repeat(101) };
      const result = ApiKeySchema.safeParse(key);
      expect(result.success).toBe(false);
    });

    it('rejects invalid prefix', () => {
      const key = { ...validApiKey, prefix: 'gk_staging_' };
      const result = ApiKeySchema.safeParse(key);
      expect(result.success).toBe(false);
    });

    it('rejects invalid hashedKey format', () => {
      const key = { ...validApiKey, hashedKey: 'md5:' + 'a'.repeat(32) };
      const result = ApiKeySchema.safeParse(key);
      expect(result.success).toBe(false);
    });

    it('rejects hashedKey with wrong length', () => {
      const key = { ...validApiKey, hashedKey: 'sha256:' + 'a'.repeat(32) };
      const result = ApiKeySchema.safeParse(key);
      expect(result.success).toBe(false);
    });

    it('rejects empty scopes', () => {
      const key = { ...validApiKey, scopes: [] };
      const result = ApiKeySchema.safeParse(key);
      expect(result.success).toBe(false);
    });

    it('rejects invalid scope format', () => {
      const key = { ...validApiKey, scopes: ['invalid'] };
      const result = ApiKeySchema.safeParse(key);
      expect(result.success).toBe(false);
    });

    it('rejects invalid ownerId', () => {
      const key = { ...validApiKey, ownerId: 'not-a-ulid' };
      const result = ApiKeySchema.safeParse(key);
      expect(result.success).toBe(false);
    });

    it('rejects invalid ownerType', () => {
      const key = { ...validApiKey, ownerType: 'admin' };
      const result = ApiKeySchema.safeParse(key);
      expect(result.success).toBe(false);
    });

    it('rejects invalid id', () => {
      const key = { ...validApiKey, id: 'not-a-ulid' };
      const result = ApiKeySchema.safeParse(key);
      expect(result.success).toBe(false);
    });
  });

  describe('versioned namespace', () => {
    it('supports V1 schema access', () => {
      const result = ApiKey.V1.safeParse(validApiKey);
      expect(result.success).toBe(true);
    });

    it('supports getVersion helper', () => {
      const schema = ApiKey.getVersion('v1');
      const result = schema.safeParse(validApiKey);
      expect(result.success).toBe(true);
    });

    it('Latest points to V1', () => {
      expect(ApiKey.Latest).toBe(ApiKey.V1);
    });
  });

  describe('parse helpers', () => {
    it('parseApiKey returns valid API key', () => {
      const key = parseApiKey(validApiKey);
      expect(key.name).toBe(validApiKey.name);
    });

    it('parseApiKey throws on invalid data', () => {
      expect(() => parseApiKey({})).toThrow();
    });

    it('safeParseApiKey returns success result', () => {
      const result = safeParseApiKey(validApiKey);
      expect(result.success).toBe(true);
    });

    it('safeParseApiKey returns failure result', () => {
      const result = safeParseApiKey({});
      expect(result.success).toBe(false);
    });
  });
});
