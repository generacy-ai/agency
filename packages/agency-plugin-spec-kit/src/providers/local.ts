/**
 * Local backlog provider stub.
 *
 * This is a minimal implementation that throws helpful errors.
 * Full local provider (file-based tickets) will be implemented in a future release.
 */

import type { TicketRef } from '../types/ticket.js';
import type {
  BacklogProvider,
  BacklogProviderName,
  Ticket,
  TicketCreateParams,
  TicketUpdates,
  AuthCheckResult,
} from './types.js';
import { NotFoundError } from './errors.js';
import type { SpecKitConfig } from '../config.js';
import { registerProviderFactory } from './registry.js';

/**
 * Local backlog provider (stub implementation).
 *
 * Intended for offline/testing scenarios with file-based ticket storage.
 * Full implementation pending.
 */
export class LocalProvider implements BacklogProvider {
  readonly name: BacklogProviderName = 'local';

  private readonly config: SpecKitConfig;

  constructor(config: SpecKitConfig) {
    this.config = config;
  }

  async getTicket(_ref: string): Promise<Ticket> {
    throw new NotFoundError(
      'Local provider not yet implemented. To use local tickets:\n' +
        '1. Set backlog.provider to "github" in your config\n' +
        '2. Or wait for local provider support in a future release\n\n' +
        'Local provider will store tickets in .specify/tickets/',
      'local',
      _ref
    );
  }

  async createTicket(_params: TicketCreateParams): Promise<Ticket> {
    throw new NotFoundError(
      'Local provider not yet implemented. Configure GitHub as your backlog provider.',
      'local'
    );
  }

  async updateTicket(_ref: string, _updates: TicketUpdates): Promise<Ticket> {
    throw new NotFoundError(
      'Local provider not yet implemented. Configure GitHub as your backlog provider.',
      'local'
    );
  }

  async checkAuth(): Promise<AuthCheckResult> {
    // Local provider doesn't require auth
    return {
      ok: false,
      message:
        'Local provider not yet implemented. Configure GitHub as your backlog provider.',
    };
  }

  getTicketUrl(ref: string): string {
    // Local tickets don't have URLs
    return `file://.specify/tickets/${ref}.json`;
  }

  parseRef(input: string): TicketRef | null {
    // Local provider accepts bare numbers
    const match = input.match(/^(\d+)$/);
    if (match && match[1]) {
      return {
        provider: 'local',
        id: match[1],
        raw: input,
      };
    }
    return null;
  }
}

// Register the provider factory
registerProviderFactory('local', (config) => new LocalProvider(config));
