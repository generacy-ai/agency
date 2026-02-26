import { describe, it, expect } from 'vitest';
import {
  AuthTokenSchema,
  AuthToken,
  TokenTypeSchema,
  OAuth2ScopeSchema,
  parseAuthToken,
  safeParseAuthToken,
} from '../auth-token.js';

describe('OAuth2ScopeSchema', () => {
  it('accepts valid scope format', () => {
    expect(OAuth2ScopeSchema.safeParse('repo:read').success).toBe(true);
    expect(OAuth2ScopeSchema.safeParse('workflow:write').success).toBe(true);
    expect(OAuth2ScopeSchema.safeParse('user:manage').success).toBe(true);
  });

  it('rejects invalid scope formats', () => {
    expect(OAuth2ScopeSchema.safeParse('invalid').success).toBe(false);
    expect(OAuth2ScopeSchema.safeParse('Repo:Read').success).toBe(false);
    expect(OAuth2ScopeSchema.safeParse(':read').success).toBe(false);
    expect(OAuth2ScopeSchema.safeParse('repo:').success).toBe(false);
  });
});

describe('TokenTypeSchema', () => {
  it('accepts Bearer token type', () => {
    expect(TokenTypeSchema.safeParse('Bearer').success).toBe(true);
  });

  it('rejects invalid token types', () => {
    expect(TokenTypeSchema.safeParse('Basic').success).toBe(false);
    expect(TokenTypeSchema.safeParse('bearer').success).toBe(false);
  });
});

describe('AuthTokenSchema', () => {
  const validToken = {
    accessToken: 'gho_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
    refreshToken: 'ghr_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
    tokenType: 'Bearer',
    expiresIn: 3600,
    scope: ['repo:read', 'user:read'],
    issuedAt: '2024-01-15T10:30:00Z',
  };

  describe('valid tokens', () => {
    it('accepts valid OAuth2 token', () => {
      const result = AuthTokenSchema.safeParse(validToken);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.accessToken).toBe(validToken.accessToken);
        expect(result.data.tokenType).toBe('Bearer');
        expect(result.data.scope).toHaveLength(2);
      }
    });

    it('accepts token with millisecond precision timestamp', () => {
      const token = { ...validToken, issuedAt: '2024-01-15T10:30:00.123Z' };
      const result = AuthTokenSchema.safeParse(token);
      expect(result.success).toBe(true);
    });

    it('accepts token with timezone offset', () => {
      const token = { ...validToken, issuedAt: '2024-01-15T10:30:00+05:30' };
      const result = AuthTokenSchema.safeParse(token);
      expect(result.success).toBe(true);
    });
  });

  describe('invalid tokens', () => {
    it('rejects empty access token', () => {
      const token = { ...validToken, accessToken: '' };
      const result = AuthTokenSchema.safeParse(token);
      expect(result.success).toBe(false);
    });

    it('rejects empty refresh token', () => {
      const token = { ...validToken, refreshToken: '' };
      const result = AuthTokenSchema.safeParse(token);
      expect(result.success).toBe(false);
    });

    it('rejects invalid token type', () => {
      const token = { ...validToken, tokenType: 'Basic' };
      const result = AuthTokenSchema.safeParse(token);
      expect(result.success).toBe(false);
    });

    it('rejects negative expiration', () => {
      const token = { ...validToken, expiresIn: -1 };
      const result = AuthTokenSchema.safeParse(token);
      expect(result.success).toBe(false);
    });

    it('rejects zero expiration', () => {
      const token = { ...validToken, expiresIn: 0 };
      const result = AuthTokenSchema.safeParse(token);
      expect(result.success).toBe(false);
    });

    it('rejects empty scope array', () => {
      const token = { ...validToken, scope: [] };
      const result = AuthTokenSchema.safeParse(token);
      expect(result.success).toBe(false);
    });

    it('rejects invalid scope format', () => {
      const token = { ...validToken, scope: ['invalid-scope'] };
      const result = AuthTokenSchema.safeParse(token);
      expect(result.success).toBe(false);
    });

    it('rejects invalid timestamp format', () => {
      const token = { ...validToken, issuedAt: '2024-01-15' };
      const result = AuthTokenSchema.safeParse(token);
      expect(result.success).toBe(false);
    });

    it('rejects missing required fields', () => {
      expect(AuthTokenSchema.safeParse({}).success).toBe(false);
      expect(AuthTokenSchema.safeParse({ accessToken: 'test' }).success).toBe(false);
    });
  });

  describe('versioned namespace', () => {
    it('supports V1 schema access', () => {
      const result = AuthToken.V1.safeParse(validToken);
      expect(result.success).toBe(true);
    });

    it('supports getVersion helper', () => {
      const schema = AuthToken.getVersion('v1');
      const result = schema.safeParse(validToken);
      expect(result.success).toBe(true);
    });

    it('Latest points to V1', () => {
      expect(AuthToken.Latest).toBe(AuthToken.V1);
    });
  });

  describe('parse helpers', () => {
    it('parseAuthToken returns valid token', () => {
      const token = parseAuthToken(validToken);
      expect(token.accessToken).toBe(validToken.accessToken);
    });

    it('parseAuthToken throws on invalid data', () => {
      expect(() => parseAuthToken({})).toThrow();
    });

    it('safeParseAuthToken returns success result', () => {
      const result = safeParseAuthToken(validToken);
      expect(result.success).toBe(true);
    });

    it('safeParseAuthToken returns failure result', () => {
      const result = safeParseAuthToken({});
      expect(result.success).toBe(false);
    });
  });
});
