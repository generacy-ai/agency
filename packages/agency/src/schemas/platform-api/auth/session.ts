import { z } from 'zod';
import { ISOTimestampSchema } from '../../common/timestamps.js';
import { SessionIdSchema, generateSessionId, ULID_REGEX } from '../../common/ids.js';
import type { SessionId } from '../../common/ids.js';

// Re-export SessionId types from common/ids for convenience
export { SessionIdSchema, generateSessionId };
export type { SessionId };

/**
 * Versioned Session schema namespace.
 *
 * Server-side session management for authenticated users.
 * Sessions are linked to OAuth2 refresh tokens.
 *
 * @example
 * ```typescript
 * // Use latest version
 * const session = Session.Latest.parse({
 *   id: '01ARZ3NDEKTSV4RRFFQ69G5FAV',
 *   userId: '01ARZ3NDEKTSV4RRFFQ69G5FAV',
 *   refreshTokenHash: 'sha256:xxxxxxxx',
 *   userAgent: 'Mozilla/5.0...',
 *   ipAddress: '192.168.1.1',
 *   createdAt: '2024-01-15T10:30:00Z',
 *   expiresAt: '2024-02-15T10:30:00Z',
 * });
 *
 * // Use specific version
 * const v1Session = Session.getVersion('v1').parse(data);
 * ```
 */
export namespace Session {
  /**
   * V1: Original session schema.
   * Supports server-side session tracking with security metadata.
   */
  export const V1 = z.object({
    /** Unique session identifier (ULID) */
    id: SessionIdSchema,

    /** User ID this session belongs to */
    userId: z.string().regex(ULID_REGEX, 'Invalid ULID format for userId'),

    /** SHA-256 hash of the refresh token (for validation without storing plaintext) */
    refreshTokenHash: z.string().regex(
      /^sha256:[a-f0-9]{64}$/,
      'Refresh token hash must be SHA-256 format'
    ),

    /** User agent string from the client */
    userAgent: z.string().max(500, 'User agent too long').optional(),

    /** IP address of the client */
    ipAddress: z.string().ip({ message: 'Invalid IP address' }).optional(),

    /** ISO 8601 timestamp when the session was created */
    createdAt: ISOTimestampSchema,

    /** ISO 8601 timestamp when the session was last accessed */
    lastAccessedAt: ISOTimestampSchema.optional(),

    /** ISO 8601 timestamp when the session expires */
    expiresAt: ISOTimestampSchema,

    /** Whether the session has been explicitly revoked */
    revoked: z.boolean().default(false),
  });

  /** Type inference for V1 schema */
  export type V1 = z.infer<typeof V1>;

  /** Latest stable schema - always point to the newest version */
  export const Latest = V1;

  /** Type inference for latest schema */
  export type Latest = V1;

  /**
   * Version registry mapping version keys to their schemas.
   * Use this with getVersion() for dynamic version selection.
   */
  export const VERSIONS = {
    v1: V1,
  } as const;

  /**
   * Get the schema for a specific version.
   * @param version - Version key (e.g., 'v1')
   * @returns The schema for that version
   */
  export function getVersion(version: keyof typeof VERSIONS) {
    return VERSIONS[version];
  }
}

/** Backward-compatible alias for Session schema */
export const SessionSchema = Session.Latest;

/** Backward-compatible alias for Session type */
export type Session = Session.Latest;

// Validation functions
export const parseSession = (data: unknown): Session =>
  SessionSchema.parse(data);

export const safeParseSession = (data: unknown) =>
  SessionSchema.safeParse(data);
