import { z } from 'zod';
import { ulid } from 'ulid';
import { ISOTimestampSchema } from '../../common/timestamps.js';
import { ULID_REGEX } from '../../common/ids.js';
import { OAuth2ScopeSchema } from './auth-token.js';

// Branded type for API key IDs
export type ApiKeyId = string & { readonly __brand: 'ApiKeyId' };

// Zod schema with ULID validation for ApiKeyId
export const ApiKeyIdSchema = z
  .string()
  .regex(ULID_REGEX, 'Invalid ULID format for ApiKeyId')
  .transform((val) => val as ApiKeyId);

// ID generation utility
export function generateApiKeyId(): ApiKeyId {
  return ulid() as ApiKeyId;
}

/**
 * Owner type for API keys - who created and owns the key.
 */
export const ApiKeyOwnerTypeSchema = z.enum(['user', 'organization', 'service']);
export type ApiKeyOwnerType = z.infer<typeof ApiKeyOwnerTypeSchema>;

/**
 * Versioned ApiKey schema namespace.
 *
 * API keys provide programmatic access for MCP servers, CI/CD pipelines,
 * and other automated systems.
 *
 * @example
 * ```typescript
 * // Use latest version
 * const apiKey = ApiKey.Latest.parse({
 *   id: '01ARZ3NDEKTSV4RRFFQ69G5FAV',
 *   name: 'CI/CD Pipeline',
 *   prefix: 'gk_test_',
 *   hashedKey: 'sha256:xxxxxxxx',
 *   scopes: ['repo:read', 'workflow:write'],
 *   ownerId: '01ARZ3NDEKTSV4RRFFQ69G5FAV',
 *   ownerType: 'user',
 *   createdAt: '2024-01-15T10:30:00Z',
 *   lastUsedAt: '2024-01-15T10:30:00Z',
 * });
 *
 * // Use specific version
 * const v1Key = ApiKey.getVersion('v1').parse(data);
 * ```
 */
export namespace ApiKey {
  /**
   * V1: Original API key schema.
   * Supports scoped access for programmatic use.
   */
  export const V1 = z.object({
    /** Unique identifier for the API key */
    id: ApiKeyIdSchema,

    /** Human-readable name for the key */
    name: z.string().min(1, 'Name is required').max(100, 'Name too long'),

    /** Public prefix for key identification (e.g., "gk_live_", "gk_test_") */
    prefix: z.string().regex(
      /^gk_(live|test)_$/,
      'Prefix must be "gk_live_" or "gk_test_"'
    ),

    /** SHA-256 hash of the full key (never store plaintext) */
    hashedKey: z.string().regex(
      /^sha256:[a-f0-9]{64}$/,
      'Hashed key must be SHA-256 format'
    ),

    /** OAuth2 scopes granted to this API key */
    scopes: z.array(OAuth2ScopeSchema).min(1, 'At least one scope is required'),

    /** ID of the owner (user, org, or service) */
    ownerId: z.string().regex(ULID_REGEX, 'Invalid ULID format for ownerId'),

    /** Type of the owner */
    ownerType: ApiKeyOwnerTypeSchema,

    /** ISO 8601 timestamp when the key was created */
    createdAt: ISOTimestampSchema,

    /** ISO 8601 timestamp when the key was last used (optional) */
    lastUsedAt: ISOTimestampSchema.optional(),

    /** ISO 8601 timestamp when the key expires (optional, null = never) */
    expiresAt: ISOTimestampSchema.optional(),

    /** Whether the key has been revoked */
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

/** Backward-compatible alias for ApiKey schema */
export const ApiKeySchema = ApiKey.Latest;

/** Backward-compatible alias for ApiKey type */
export type ApiKey = ApiKey.Latest;

// Validation functions
export const parseApiKey = (data: unknown): ApiKey =>
  ApiKeySchema.parse(data);

export const safeParseApiKey = (data: unknown) =>
  ApiKeySchema.safeParse(data);
