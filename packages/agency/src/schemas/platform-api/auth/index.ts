// Platform API Authentication Schemas
// Re-exports all auth-related schemas

// Auth Token (OAuth2)
export {
  AuthToken,
  AuthTokenSchema,
  type AuthToken as AuthTokenType,
  TokenTypeSchema,
  type TokenType,
  OAuth2ScopeSchema,
  type OAuth2Scope,
  parseAuthToken,
  safeParseAuthToken,
} from './auth-token.js';

// API Keys
export {
  ApiKey,
  ApiKeySchema,
  type ApiKey as ApiKeyType,
  ApiKeyIdSchema,
  type ApiKeyId,
  generateApiKeyId,
  ApiKeyOwnerTypeSchema,
  type ApiKeyOwnerType,
  parseApiKey,
  safeParseApiKey,
} from './api-key.js';

// Sessions
export {
  Session,
  SessionSchema,
  type Session as SessionType,
  SessionIdSchema,
  generateSessionId,
  parseSession,
  safeParseSession,
} from './session.js';

// Re-export SessionId type from common for convenience
export type { SessionId } from '../../common/ids.js';
