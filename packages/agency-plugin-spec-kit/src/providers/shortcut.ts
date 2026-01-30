/**
 * Shortcut backlog provider stub.
 *
 * This is a minimal implementation that throws helpful errors.
 * Full Shortcut integration will be implemented in a future release.
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
import { detectTicketRef } from '../utils/detect-ticket-ref.js';

/**
 * Shortcut backlog provider (stub implementation).
 *
 * Provides error messages with setup instructions.
 * Full implementation pending.
 */
export class ShortcutProvider implements BacklogProvider {
  readonly name: BacklogProviderName = 'shortcut';

  private readonly config: SpecKitConfig;

  constructor(config: SpecKitConfig) {
    this.config = config;
  }

  async getTicket(_ref: string): Promise<Ticket> {
    throw new NotFoundError(
      'Shortcut provider not yet implemented. To use Shortcut:\n' +
        '1. Set backlog.provider to "github" in your config\n' +
        '2. Or wait for Shortcut support in a future release\n\n' +
        'Required environment variables for Shortcut:\n' +
        '- SHORTCUT_API_TOKEN',
      'shortcut',
      _ref
    );
  }

  async createTicket(_params: TicketCreateParams): Promise<Ticket> {
    throw new NotFoundError(
      'Shortcut provider not yet implemented. Configure GitHub as your backlog provider.',
      'shortcut'
    );
  }

  async updateTicket(_ref: string, _updates: TicketUpdates): Promise<Ticket> {
    throw new NotFoundError(
      'Shortcut provider not yet implemented. Configure GitHub as your backlog provider.',
      'shortcut'
    );
  }

  async checkAuth(): Promise<AuthCheckResult> {
    return {
      ok: false,
      message:
        'Shortcut provider not yet implemented. Configure GitHub as your backlog provider.',
    };
  }

  getTicketUrl(ref: string): string {
    const parsed = this.parseRef(ref);
    if (!parsed || !this.config.backlog.shortcut?.workspaceSlug) {
      return `https://app.shortcut.com/workspace/story/${ref}`;
    }
    return `https://app.shortcut.com/${this.config.backlog.shortcut.workspaceSlug}/story/${parsed.id}`;
  }

  parseRef(input: string): TicketRef | null {
    const ref = detectTicketRef(input, 'shortcut');
    if (!ref || ref.provider !== 'shortcut') {
      return null;
    }
    return ref;
  }
}

// Register the provider factory
registerProviderFactory('shortcut', (config) => new ShortcutProvider(config));
