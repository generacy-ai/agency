/**
 * Jira backlog provider stub.
 *
 * This is a minimal implementation that throws helpful errors.
 * Full Jira integration will be implemented in a future release.
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
 * Jira backlog provider (stub implementation).
 *
 * Provides error messages with setup instructions.
 * Full implementation pending.
 */
export class JiraProvider implements BacklogProvider {
  readonly name: BacklogProviderName = 'jira';

  private readonly config: SpecKitConfig;

  constructor(config: SpecKitConfig) {
    this.config = config;
  }

  async getTicket(_ref: string): Promise<Ticket> {
    throw new NotFoundError(
      'Jira provider not yet implemented. To use Jira:\n' +
        '1. Set backlog.provider to "github" in your config\n' +
        '2. Or wait for Jira support in a future release\n\n' +
        'Required environment variables for Jira:\n' +
        '- JIRA_API_TOKEN\n' +
        '- JIRA_EMAIL\n' +
        '- JIRA_BASE_URL (e.g., https://company.atlassian.net)',
      'jira',
      _ref
    );
  }

  async createTicket(_params: TicketCreateParams): Promise<Ticket> {
    throw new NotFoundError(
      'Jira provider not yet implemented. Configure GitHub as your backlog provider.',
      'jira'
    );
  }

  async updateTicket(_ref: string, _updates: TicketUpdates): Promise<Ticket> {
    throw new NotFoundError(
      'Jira provider not yet implemented. Configure GitHub as your backlog provider.',
      'jira'
    );
  }

  async checkAuth(): Promise<AuthCheckResult> {
    return {
      ok: false,
      message:
        'Jira provider not yet implemented. Configure GitHub as your backlog provider.',
    };
  }

  getTicketUrl(ref: string): string {
    const parsed = this.parseRef(ref);
    if (!parsed || !this.config.backlog.jira?.baseUrl) {
      return `https://jira.example.com/browse/${ref}`;
    }
    return `${this.config.backlog.jira.baseUrl}/browse/${parsed.id}`;
  }

  parseRef(input: string): TicketRef | null {
    const ref = detectTicketRef(input, 'jira');
    if (!ref || ref.provider !== 'jira') {
      return null;
    }
    return ref;
  }
}

// Register the provider factory
registerProviderFactory('jira', (config) => new JiraProvider(config));
