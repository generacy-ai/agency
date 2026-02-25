import { z } from 'zod';
import { ISOTimestampSchema } from '../../common/timestamps.js';

/**
 * OAuth2 token types supported by the platform.
 */
export const TokenTypeSchema = z.enum(['Bearer']);
export type TokenType = z.infer<typeof TokenTypeSchema>;

/**
 * OAuth2 scope for access control.
 * Scopes follow the pattern: resource:action (e.g., "repo:read", "workflow:write")
 */
export const OAuth2ScopeSchema = z.string().regex(
  /^[a-z][a-z0-9_-]*:[a-z][a-z0-9_-]*$/,
  'Scope must follow pattern: resource:action (e.g., "repo:read")'
);
export type OAuth2Scope = z.infer<typeof OAuth2ScopeSchema>;

/**
 * Versioned AuthToken schema namespace.
 *
 * OAuth2 access/refresh token pair for session management.
 * GitHub OAuth is the identity provider.
 *
 * @example
 * ```typescript
 * // Use latest version
 * const token = AuthToken.Latest.parse({
 *   accessToken: 'gho_xxxxxxxxxxxx',
 *   refreshToken: 'ghr_xxxxxxxxxxxx',
 *   tokenType: 'Bearer',
 *   expiresIn: 3600,
 *   scope: ['repo:read', 'user:read'],
 *   issuedAt: '2024-01-15T10:30:00Z',
 * });
 *
 * // Use specific version
 * const v1Token = AuthToken.getVersion('v1').parse(data);
 * ```
 */
export namespace AuthToken {
  /**
   * V1: Original OAuth2 token schema.
   * Supports access/refresh tokens with expiration and scopes.
   */
  export const V1 = z.object({
    /** OAuth2 access token (opaque string from GitHub) */
    accessToken: z.string().min(1, 'Access token is required'),

    /** OAuth2 refresh token for obtaining new access tokens */
    refreshToken: z.string().min(1, 'Refresh token is required'),

    /** Token type (always "Bearer" for OAuth2) */
    tokenType: TokenTypeSchema,

    /** Access token lifetime in seconds */
    expiresIn: z.number().int().positive('Expiration must be positive'),

    /** OAuth2 scopes granted to this token */
    scope: z.array(OAuth2ScopeSchema).min(1, 'At least one scope is required'),

    /** ISO 8601 timestamp when the token was issued */
    issuedAt: ISOTimestampSchema,
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

/** Backward-compatible alias for AuthToken schema */
export const AuthTokenSchema = AuthToken.Latest;

/** Backward-compatible alias for AuthToken type */
export type AuthToken = AuthToken.Latest;

// Validation functions
export const parseAuthToken = (data: unknown): AuthToken =>
  AuthTokenSchema.parse(data);

export const safeParseAuthToken = (data: unknown) =>
  AuthTokenSchema.safeParse(data);
