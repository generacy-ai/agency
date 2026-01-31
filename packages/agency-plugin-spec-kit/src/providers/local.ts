/**
 * Local backlog provider for offline/file-based ticket tracking.
 *
 * Enables spec-kit workflows without any external backlog system (GitHub, Jira, etc.).
 * Useful for offline work, personal projects, testing, and quick prototyping.
 *
 * Tickets are stored in a local JSON file (default: `.specify/local-tickets.json`)
 * with auto-generated IDs (`LOCAL-001`, `LOCAL-002`, etc.).
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve, isAbsolute } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { TicketRef } from '../types/ticket.js';
import type {
  BacklogProvider,
  BacklogProviderName,
  Ticket,
  TicketCreateParams,
  TicketUpdates,
  AuthCheckResult,
  TicketState,
} from './types.js';
import { NotFoundError, ProviderError } from './errors.js';
import type { SpecKitConfig } from '../config.js';
import { registerProviderFactory } from './registry.js';

/**
 * Schema version for the local ticket store.
 * Allows future migrations if the format changes.
 */
const STORE_VERSION = 1;

/**
 * Default path for the local ticket store file.
 */
const DEFAULT_STORE_PATH = '.specify/local-tickets.json';

/**
 * Internal representation of a ticket in the local store.
 */
interface LocalTicket {
  /** Unique ticket ID (e.g., "LOCAL-001", "LOCAL-1000") */
  id: string;
  /** Ticket title (required) */
  title: string;
  /** Ticket description/body (optional, supports markdown) */
  body?: string;
  /** Current state of the ticket */
  state: TicketState;
  /** Labels attached to the ticket */
  labels: string[];
  /** Creation timestamp (ISO 8601 format) */
  createdAt: string;
  /** Last update timestamp (ISO 8601 format) */
  updatedAt: string;
}

/**
 * Root structure stored in the JSON file.
 */
interface LocalTicketStore {
  /** Schema version for future migrations */
  version: number;
  /** Next ID number to use (starts at 1) */
  nextId: number;
  /** Tickets indexed by their ID string (e.g., "LOCAL-001") */
  tickets: Record<string, LocalTicket>;
}

/**
 * Configuration options for LocalProvider.
 */
interface LocalProviderConfig {
  /** Path to the store file (relative to cwd or absolute) */
  storePath?: string;
  /** Working directory for resolving relative paths */
  cwd?: string;
}

/**
 * Local backlog provider for offline/file-based ticket tracking.
 *
 * Implements the BacklogProvider interface for local-only workflows.
 * No authentication required - always succeeds.
 */
export class LocalProvider implements BacklogProvider {
  readonly name: BacklogProviderName = 'local';

  private readonly storePath: string;
  private readonly cwd: string;

  /**
   * Creates a new LocalProvider instance.
   *
   * @param config - SpecKit configuration (for compatibility with registry)
   * @param options - Additional options for the local provider
   */
  constructor(config: SpecKitConfig, options?: LocalProviderConfig) {
    this.cwd = options?.cwd ?? process.cwd();
    const configuredPath = options?.storePath ?? DEFAULT_STORE_PATH;
    this.storePath = isAbsolute(configuredPath)
      ? configuredPath
      : resolve(this.cwd, configuredPath);
  }

  // ==========================================================================
  // Private Helpers
  // ==========================================================================

  /**
   * Load the ticket store from disk.
   * Creates an empty store if the file doesn't exist.
   */
  private async loadStore(): Promise<LocalTicketStore> {
    try {
      const content = await readFile(this.storePath, 'utf-8');
      const store = JSON.parse(content) as LocalTicketStore;

      // Validate store structure
      if (
        typeof store.version !== 'number' ||
        typeof store.nextId !== 'number' ||
        typeof store.tickets !== 'object'
      ) {
        throw new ProviderError(
          `Invalid store format in ${this.storePath}`,
          'local'
        );
      }

      return store;
    } catch (error) {
      // File doesn't exist - return empty store
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return this.createEmptyStore();
      }

      // JSON parse error
      if (error instanceof SyntaxError) {
        throw new ProviderError(
          `Invalid JSON in ${this.storePath}: ${error.message}`,
          'local'
        );
      }

      // Re-throw ProviderError
      if (error instanceof ProviderError) {
        throw error;
      }

      // Other file system errors
      throw new ProviderError(
        `Failed to read store: ${(error as Error).message}`,
        'local'
      );
    }
  }

  /**
   * Save the ticket store to disk using atomic write (temp file + rename).
   */
  private async saveStore(store: LocalTicketStore): Promise<void> {
    try {
      // Ensure directory exists
      const dir = dirname(this.storePath);
      await mkdir(dir, { recursive: true });

      // Write to temp file first for atomic update
      const tempPath = `${this.storePath}.${randomUUID()}.tmp`;
      const content = JSON.stringify(store, null, 2);

      await writeFile(tempPath, content, 'utf-8');

      // Rename temp file to actual path (atomic on POSIX systems)
      const { rename } = await import('node:fs/promises');
      await rename(tempPath, this.storePath);
    } catch (error) {
      throw new ProviderError(
        `Failed to save store: ${(error as Error).message}`,
        'local'
      );
    }
  }

  /**
   * Create an empty ticket store with default values.
   */
  private createEmptyStore(): LocalTicketStore {
    return {
      version: STORE_VERSION,
      nextId: 1,
      tickets: {},
    };
  }

  /**
   * Generate a ticket ID from a number.
   * Format: LOCAL-NNN with minimum 3 digits, naturally extends beyond 999.
   */
  private generateId(num: number): string {
    return `LOCAL-${String(num).padStart(3, '0')}`;
  }

  /**
   * Convert a LocalTicket to the provider-agnostic Ticket interface.
   */
  private toTicket(local: LocalTicket): Ticket {
    return {
      ref: {
        provider: 'local',
        id: local.id,
        raw: local.id,
      },
      title: local.title,
      body: local.body,
      state: local.state,
      labels: local.labels,
      url: this.getTicketUrl(local.id),
      meta: {
        createdAt: local.createdAt,
        updatedAt: local.updatedAt,
      },
    };
  }

  /**
   * Normalize a parsed reference to the canonical ID format.
   * Handles various input formats and returns the LOCAL-NNN format.
   */
  private normalizeRef(ref: string): string {
    const parsed = this.parseRef(ref);
    if (!parsed) {
      throw new NotFoundError(`Invalid ticket reference: ${ref}`, 'local', ref);
    }
    return parsed.id;
  }

  // ==========================================================================
  // BacklogProvider Implementation - CRUD Operations
  // ==========================================================================

  /**
   * Fetch a ticket by reference string.
   *
   * @param ref - Reference string (LOCAL-001, local-1, 001, 1)
   * @returns The ticket data
   * @throws {NotFoundError} If the ticket doesn't exist
   */
  async getTicket(ref: string): Promise<Ticket> {
    const normalizedId = this.normalizeRef(ref);
    const store = await this.loadStore();
    const ticket = store.tickets[normalizedId];

    if (!ticket) {
      throw new NotFoundError(
        `Ticket ${normalizedId} not found`,
        'local',
        normalizedId
      );
    }

    return this.toTicket(ticket);
  }

  /**
   * Create a new ticket.
   *
   * @param params - Ticket creation parameters
   * @returns The created ticket
   */
  async createTicket(params: TicketCreateParams): Promise<Ticket> {
    const store = await this.loadStore();
    const id = this.generateId(store.nextId);
    const now = new Date().toISOString();

    const ticket: LocalTicket = {
      id,
      title: params.title,
      body: params.body,
      state: 'open',
      labels: params.labels ?? [],
      createdAt: now,
      updatedAt: now,
    };

    store.tickets[id] = ticket;
    store.nextId++;

    await this.saveStore(store);
    return this.toTicket(ticket);
  }

  /**
   * Update an existing ticket.
   *
   * @param ref - Reference string
   * @param updates - Fields to update
   * @returns The updated ticket
   * @throws {NotFoundError} If the ticket doesn't exist
   */
  async updateTicket(ref: string, updates: TicketUpdates): Promise<Ticket> {
    const normalizedId = this.normalizeRef(ref);
    const store = await this.loadStore();
    const ticket = store.tickets[normalizedId];

    if (!ticket) {
      throw new NotFoundError(
        `Ticket ${normalizedId} not found`,
        'local',
        normalizedId
      );
    }

    // Apply updates
    if (updates.title !== undefined) {
      ticket.title = updates.title;
    }
    if (updates.body !== undefined) {
      ticket.body = updates.body;
    }
    if (updates.labels !== undefined) {
      ticket.labels = updates.labels;
    }

    ticket.updatedAt = new Date().toISOString();

    await this.saveStore(store);
    return this.toTicket(ticket);
  }

  // ==========================================================================
  // BacklogProvider Implementation - Label Management (Optional)
  // ==========================================================================

  /**
   * Replace all labels on a ticket.
   *
   * @param ref - Reference string
   * @param labels - Labels to set (replaces all existing labels)
   * @throws {NotFoundError} If the ticket doesn't exist
   */
  async setLabels(ref: string, labels: string[]): Promise<void> {
    const normalizedId = this.normalizeRef(ref);
    const store = await this.loadStore();
    const ticket = store.tickets[normalizedId];

    if (!ticket) {
      throw new NotFoundError(
        `Ticket ${normalizedId} not found`,
        'local',
        normalizedId
      );
    }

    ticket.labels = labels;
    ticket.updatedAt = new Date().toISOString();

    await this.saveStore(store);
  }

  /**
   * Get current labels on a ticket.
   *
   * @param ref - Reference string
   * @returns Array of label strings
   * @throws {NotFoundError} If the ticket doesn't exist
   */
  async getLabels(ref: string): Promise<string[]> {
    const normalizedId = this.normalizeRef(ref);
    const store = await this.loadStore();
    const ticket = store.tickets[normalizedId];

    if (!ticket) {
      throw new NotFoundError(
        `Ticket ${normalizedId} not found`,
        'local',
        normalizedId
      );
    }

    return ticket.labels;
  }

  // ==========================================================================
  // BacklogProvider Implementation - Authentication
  // ==========================================================================

  /**
   * Check if authentication is valid.
   * Local provider always succeeds - no auth required.
   *
   * @returns Always returns { ok: true }
   */
  async checkAuth(): Promise<AuthCheckResult> {
    return { ok: true };
  }

  // ==========================================================================
  // BacklogProvider Implementation - URL and Reference Handling
  // ==========================================================================

  /**
   * Generate the URL for a ticket.
   * Returns a local:// pseudo-URL since there's no web interface.
   *
   * @param ref - Reference string
   * @returns Pseudo-URL in the format local://LOCAL-NNN
   */
  getTicketUrl(ref: string): string {
    const parsed = this.parseRef(ref);
    const id = parsed?.id ?? ref;
    return `local://${id}`;
  }

  /**
   * Parse user input to a TicketRef.
   *
   * Handles various input formats:
   * - LOCAL-001, LOCAL-1 (full format, any case)
   * - local-001, local-1 (lowercase prefix)
   * - 001, 1 (bare numbers)
   *
   * @param input - User-provided reference string
   * @returns Parsed TicketRef or null if invalid for this provider
   */
  parseRef(input: string): TicketRef | null {
    // Trim whitespace
    const trimmed = input.trim();
    if (!trimmed) {
      return null;
    }

    // Try to match LOCAL-NNN format (case-insensitive)
    const localMatch = trimmed.match(/^local-(\d+)$/i);
    if (localMatch && localMatch[1]) {
      const num = parseInt(localMatch[1], 10);
      if (num > 0) {
        const normalizedId = this.generateId(num);
        return {
          provider: 'local',
          id: normalizedId,
          raw: input,
        };
      }
      return null;
    }

    // Try to match bare number (001, 1, etc.)
    const numberMatch = trimmed.match(/^(\d+)$/);
    if (numberMatch && numberMatch[1]) {
      const num = parseInt(numberMatch[1], 10);
      if (num > 0) {
        const normalizedId = this.generateId(num);
        return {
          provider: 'local',
          id: normalizedId,
          raw: input,
        };
      }
      return null;
    }

    return null;
  }
}

// Register the provider factory
registerProviderFactory('local', (config) => new LocalProvider(config));
