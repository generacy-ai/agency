/**
 * HumancyHttpClient - HTTP client for humancy-cloud REST API
 *
 * Provides REST API communication with retry logic and authentication.
 */

import {
  type HttpClientConfig,
  type CreateDecisionApiRequest,
  type DecisionCreatedResponse,
  type DecisionApiResponse,
  DEFAULT_HTTP_CONFIG,
  HttpError,
  decisionCreatedResponseSchema,
  decisionApiResponseSchema,
} from './types.js';

/**
 * HTTP client for communicating with humancy-cloud API
 */
export class HumancyHttpClient {
  private readonly config: HttpClientConfig;

  constructor(config: Partial<HttpClientConfig> = {}) {
    this.config = {
      ...DEFAULT_HTTP_CONFIG,
      ...config,
    };
  }

  /**
   * Create a new decision request
   *
   * POST /decisions
   */
  async createDecision(
    request: CreateDecisionApiRequest
  ): Promise<DecisionCreatedResponse> {
    const url = `${this.config.baseUrl}/decisions`;

    const response = await this.withRetry(() =>
      this.fetchWithTimeout(url, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify(request),
      })
    );

    const data = await response.json();
    const parsed = decisionCreatedResponseSchema.safeParse(data);

    if (!parsed.success) {
      throw new Error(`Invalid API response: ${parsed.error.message}`);
    }

    return parsed.data;
  }

  /**
   * Get decision details by ID
   *
   * GET /decisions/:id
   */
  async getDecision(id: string): Promise<DecisionApiResponse> {
    const url = `${this.config.baseUrl}/decisions/${encodeURIComponent(id)}`;

    const response = await this.withRetry(() =>
      this.fetchWithTimeout(url, {
        method: 'GET',
        headers: this.getHeaders(),
      })
    );

    const data = await response.json();
    const parsed = decisionApiResponseSchema.safeParse(data);

    if (!parsed.success) {
      throw new Error(`Invalid API response: ${parsed.error.message}`);
    }

    return parsed.data;
  }

  /**
   * Get the SSE events URL for a decision
   * Includes token as query parameter since SSE endpoints use query-based auth
   */
  getEventsUrl(decisionId: string): string {
    const base = `${this.config.baseUrl}/decisions/${encodeURIComponent(decisionId)}/events`;
    if (this.config.apiKey) {
      return `${base}?token=${encodeURIComponent(this.config.apiKey)}`;
    }
    return base;
  }

  /**
   * Get the base URL
   */
  getBaseUrl(): string {
    return this.config.baseUrl;
  }

  /**
   * Check if client is authenticated
   */
  isAuthenticated(): boolean {
    return this.config.apiKey !== undefined && this.config.apiKey.length > 0;
  }

  /**
   * Get authorization headers
   */
  getAuthHeaders(): Record<string, string> {
    if (this.config.apiKey) {
      return { Authorization: `Bearer ${this.config.apiKey}` };
    }
    return {};
  }

  /**
   * Get common request headers
   */
  private getHeaders(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...this.getAuthHeaders(),
    };
  }

  /**
   * Fetch with timeout using AbortController
   */
  private async fetchWithTimeout(
    url: string,
    options: RequestInit
  ): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(
      () => controller.abort(),
      this.config.timeout
    );

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });

      if (!response.ok) {
        let body: unknown;
        try {
          body = await response.json();
        } catch {
          // Body is not JSON
        }
        throw new HttpError(response.status, response.statusText, body);
      }

      return response;
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(
          `Request timeout after ${this.config.timeout}ms: ${url}`
        );
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Retry logic with exponential backoff for transient failures
   */
  private async withRetry<T>(fn: () => Promise<T>): Promise<T> {
    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // Don't retry if this is a non-retriable error
        if (!this.isRetryable(error)) {
          throw error;
        }

        // Don't sleep after the last attempt
        if (attempt < this.config.maxRetries) {
          const delay =
            this.config.retryBaseDelayMs * Math.pow(2, attempt);
          await this.sleep(delay);
        }
      }
    }

    throw lastError ?? new Error('Retry failed with unknown error');
  }

  /**
   * Check if an error is retriable
   */
  private isRetryable(error: unknown): boolean {
    // Network errors are retriable
    if (error instanceof TypeError) {
      return true;
    }

    // 5xx server errors are retriable
    if (error instanceof HttpError && error.isRetryable) {
      return true;
    }

    return false;
  }

  /**
   * Sleep for specified milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
