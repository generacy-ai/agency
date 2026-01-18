/**
 * Error types for @generacy-ai/agency-plugin-git
 */

export { GitError } from './git-error.js';
export { AuthError, isAuthError, AUTH_ERROR_PATTERNS } from './auth-error.js';
export {
  NetworkError,
  isNetworkError,
  extractRemote,
  NETWORK_ERROR_PATTERNS,
} from './network-error.js';
export {
  ConflictError,
  isConflictError,
  CONFLICT_ERROR_PATTERNS,
} from './conflict-error.js';
export {
  DetachedHeadError,
  isDetachedHeadError,
  DETACHED_HEAD_PATTERNS,
} from './detached-head-error.js';
