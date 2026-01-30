/**
 * Provider-specific error types for BacklogProvider implementations.
 *
 * These error classes provide a consistent error hierarchy for all
 * backlog provider implementations (GitHub, Jira, Shortcut, local).
 *
 * Error Hierarchy:
 * ```
 * ProviderError (base)
 * ├── AuthError     (authentication failures)
 * └── NotFoundError (resource not found)
 * ```
 *
 * @example
 * ```typescript
 * // Throwing provider errors
 * throw new AuthError('Invalid GitHub token', 'github');
 * throw new NotFoundError('Issue #123 not found', 'github', '#123');
 *
 * // Catching with instanceof
 * try {
 *   await provider.getTicket('#123');
 * } catch (error) {
 *   if (error instanceof NotFoundError) {
 *     console.log(`Ticket ${error.ref} not found in ${error.provider}`);
 *   } else if (error instanceof AuthError) {
 *     console.log(`Auth failed for ${error.provider}: ${error.message}`);
 *   }
 * }
 * ```
 */

/**
 * Base error class for all provider-related errors.
 *
 * Extends the native Error class with a `provider` property
 * to identify which provider generated the error.
 *
 * @example
 * ```typescript
 * throw new ProviderError('Operation failed', 'github');
 * ```
 */
export class ProviderError extends Error {
  /**
   * The provider that generated this error.
   * @example 'github', 'jira', 'shortcut', 'local'
   */
  readonly provider: string;

  /**
   * Creates a new ProviderError.
   *
   * @param message - Human-readable error message
   * @param provider - Provider identifier (e.g., 'github', 'jira')
   */
  constructor(message: string, provider: string) {
    super(message);
    this.name = 'ProviderError';
    this.provider = provider;

    // Maintains proper stack trace for where error was thrown (V8 engines)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, ProviderError);
    }
  }
}

/**
 * Error thrown when authentication or authorization fails.
 *
 * Use this error for:
 * - Missing API tokens
 * - Expired credentials
 * - Insufficient permissions
 * - Invalid authentication configuration
 *
 * @example
 * ```typescript
 * // Missing token
 * throw new AuthError('GITHUB_TOKEN environment variable not set', 'github');
 *
 * // Expired credentials
 * throw new AuthError('API token has expired', 'jira');
 *
 * // Permission denied
 * throw new AuthError('Insufficient permissions to create issues', 'github');
 * ```
 */
export class AuthError extends ProviderError {
  /**
   * Creates a new AuthError.
   *
   * @param message - Human-readable error message describing the auth failure
   * @param provider - Provider identifier (e.g., 'github', 'jira')
   */
  constructor(message: string, provider: string) {
    super(message, provider);
    this.name = 'AuthError';

    // Maintains proper stack trace for where error was thrown (V8 engines)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, AuthError);
    }
  }
}

/**
 * Error thrown when a requested resource is not found.
 *
 * Use this error for:
 * - Ticket/issue doesn't exist
 * - Repository/project not found
 * - Label doesn't exist
 * - Any 404-equivalent response from the provider
 *
 * Includes an optional `ref` property to identify which resource
 * was not found.
 *
 * @example
 * ```typescript
 * // Ticket not found
 * throw new NotFoundError('Issue #123 not found', 'github', '#123');
 *
 * // Repository not found
 * throw new NotFoundError('Repository owner/repo not found', 'github');
 *
 * // Label not found
 * throw new NotFoundError('Label "priority:high" does not exist', 'github', 'priority:high');
 * ```
 */
export class NotFoundError extends ProviderError {
  /**
   * The reference that was not found.
   *
   * This is optional because some not-found errors may not have
   * a specific reference (e.g., project not found).
   *
   * @example '#123', 'PROJ-456', 'owner/repo'
   */
  readonly ref?: string;

  /**
   * Creates a new NotFoundError.
   *
   * @param message - Human-readable error message
   * @param provider - Provider identifier (e.g., 'github', 'jira')
   * @param ref - Optional reference that was not found
   */
  constructor(message: string, provider: string, ref?: string) {
    super(message, provider);
    this.name = 'NotFoundError';
    this.ref = ref;

    // Maintains proper stack trace for where error was thrown (V8 engines)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, NotFoundError);
    }
  }
}

/**
 * Error thrown when a provider is not found in the registry.
 *
 * Use this error for:
 * - Unknown provider name in factory function
 * - Provider not registered/cached when using getProvider
 *
 * @example
 * ```typescript
 * // Unknown provider type
 * throw new ProviderNotFoundError('unknown');
 *
 * // Provider not in cache
 * throw new ProviderNotFoundError('github');
 * ```
 */
export class ProviderNotFoundError extends ProviderError {
  /**
   * Creates a new ProviderNotFoundError.
   *
   * @param providerName - The provider name that was not found
   */
  constructor(providerName: string) {
    super(`Provider '${providerName}' not found`, providerName);
    this.name = 'ProviderNotFoundError';

    // Maintains proper stack trace for where error was thrown (V8 engines)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, ProviderNotFoundError);
    }
  }
}
