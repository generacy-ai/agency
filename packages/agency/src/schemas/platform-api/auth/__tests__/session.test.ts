import { describe, it, expect } from 'vitest';
import {
  SessionSchema,
  Session,
  SessionIdSchema,
  generateSessionId,
  parseSession,
  safeParseSession,
} from '../session.js';

describe('SessionIdSchema', () => {
  const validUlid = '01ARZ3NDEKTSV4RRFFQ69G5FAV';

  it('accepts valid ULID', () => {
    const result = SessionIdSchema.safeParse(validUlid);
    expect(result.success).toBe(true);
  });

  it('rejects invalid ULID', () => {
    const result = SessionIdSchema.safeParse('not-a-ulid');
    expect(result.success).toBe(false);
  });
});

describe('generateSessionId', () => {
  it('generates valid ULID', () => {
    const id = generateSessionId();
    const result = SessionIdSchema.safeParse(id);
    expect(result.success).toBe(true);
  });

  it('generates unique IDs', () => {
    const ids = new Set([
      generateSessionId(),
      generateSessionId(),
      generateSessionId(),
    ]);
    expect(ids.size).toBe(3);
  });
});

describe('SessionSchema', () => {
  const validSession = {
    id: '01ARZ3NDEKTSV4RRFFQ69G5FAV',
    userId: '01ARZ3NDEKTSV4RRFFQ69G5FAV',
    refreshTokenHash: 'sha256:' + 'a'.repeat(64),
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    ipAddress: '192.168.1.1',
    createdAt: '2024-01-15T10:30:00Z',
    expiresAt: '2024-02-15T10:30:00Z',
  };

  describe('valid sessions', () => {
    it('accepts valid session', () => {
      const result = SessionSchema.safeParse(validSession);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.userId).toBe(validSession.userId);
        expect(result.data.revoked).toBe(false); // default
      }
    });

    it('accepts session without optional userAgent', () => {
      const session = { ...validSession } as Record<string, unknown>;
      delete session['userAgent'];
      const result = SessionSchema.safeParse(session);
      expect(result.success).toBe(true);
    });

    it('accepts session without optional ipAddress', () => {
      const session = { ...validSession } as Record<string, unknown>;
      delete session['ipAddress'];
      const result = SessionSchema.safeParse(session);
      expect(result.success).toBe(true);
    });

    it('accepts session with lastAccessedAt', () => {
      const session = { ...validSession, lastAccessedAt: '2024-01-16T10:30:00Z' };
      const result = SessionSchema.safeParse(session);
      expect(result.success).toBe(true);
    });

    it('accepts IPv6 addresses', () => {
      const session = { ...validSession, ipAddress: '2001:0db8:85a3:0000:0000:8a2e:0370:7334' };
      const result = SessionSchema.safeParse(session);
      expect(result.success).toBe(true);
    });

    it('accepts localhost addresses', () => {
      const session = { ...validSession, ipAddress: '127.0.0.1' };
      const result = SessionSchema.safeParse(session);
      expect(result.success).toBe(true);
    });

    it('accepts explicit revoked flag', () => {
      const session = { ...validSession, revoked: true };
      const result = SessionSchema.safeParse(session);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.revoked).toBe(true);
      }
    });
  });

  describe('invalid sessions', () => {
    it('rejects invalid session id', () => {
      const session = { ...validSession, id: 'not-a-ulid' };
      const result = SessionSchema.safeParse(session);
      expect(result.success).toBe(false);
    });

    it('rejects invalid userId', () => {
      const session = { ...validSession, userId: 'not-a-ulid' };
      const result = SessionSchema.safeParse(session);
      expect(result.success).toBe(false);
    });

    it('rejects invalid refreshTokenHash format', () => {
      const session = { ...validSession, refreshTokenHash: 'md5:' + 'a'.repeat(32) };
      const result = SessionSchema.safeParse(session);
      expect(result.success).toBe(false);
    });

    it('rejects refreshTokenHash with wrong length', () => {
      const session = { ...validSession, refreshTokenHash: 'sha256:' + 'a'.repeat(32) };
      const result = SessionSchema.safeParse(session);
      expect(result.success).toBe(false);
    });

    it('rejects user agent too long', () => {
      const session = { ...validSession, userAgent: 'a'.repeat(501) };
      const result = SessionSchema.safeParse(session);
      expect(result.success).toBe(false);
    });

    it('rejects invalid IP address', () => {
      const session = { ...validSession, ipAddress: 'not-an-ip' };
      const result = SessionSchema.safeParse(session);
      expect(result.success).toBe(false);
    });

    it('rejects IP address with invalid octets', () => {
      const session = { ...validSession, ipAddress: '192.168.1.256' };
      const result = SessionSchema.safeParse(session);
      expect(result.success).toBe(false);
    });

    it('rejects invalid timestamp format', () => {
      const session = { ...validSession, createdAt: '2024-01-15' };
      const result = SessionSchema.safeParse(session);
      expect(result.success).toBe(false);
    });

    it('rejects missing required fields', () => {
      expect(SessionSchema.safeParse({}).success).toBe(false);
      expect(SessionSchema.safeParse({ id: '01ARZ3NDEKTSV4RRFFQ69G5FAV' }).success).toBe(false);
    });
  });

  describe('versioned namespace', () => {
    it('supports V1 schema access', () => {
      const result = Session.V1.safeParse(validSession);
      expect(result.success).toBe(true);
    });

    it('supports getVersion helper', () => {
      const schema = Session.getVersion('v1');
      const result = schema.safeParse(validSession);
      expect(result.success).toBe(true);
    });

    it('Latest points to V1', () => {
      expect(Session.Latest).toBe(Session.V1);
    });
  });

  describe('parse helpers', () => {
    it('parseSession returns valid session', () => {
      const session = parseSession(validSession);
      expect(session.userId).toBe(validSession.userId);
    });

    it('parseSession throws on invalid data', () => {
      expect(() => parseSession({})).toThrow();
    });

    it('safeParseSession returns success result', () => {
      const result = safeParseSession(validSession);
      expect(result.success).toBe(true);
    });

    it('safeParseSession returns failure result', () => {
      const result = safeParseSession({});
      expect(result.success).toBe(false);
    });
  });
});
