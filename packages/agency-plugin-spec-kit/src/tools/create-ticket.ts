/**
 * spec_kit.create_ticket tool
 *
 * Creates a new ticket in the configured backlog provider.
 * Supports GitHub Issues, Jira, Shortcut, and local providers.
 *
 * @example
 * ```typescript
 * import { createCreateTicketTool } from './create-ticket.js';
 *
 * const tool = createCreateTicketTool(config, () => registry.getProvider());
 *
 * // Execute via MCP
 * const result = await tool.execute({ title: 'New feature', body: 'Description...' });
 * ```
 */

import type { AgencyTool, ToolResult } from '@generacy-ai/agency';
import type { BacklogProvider } from '../providers/types.js';
import type { SpecKitConfig } from '../config.js';

/**
 * Input parameters for create_ticket tool.
 */
interface CreateTicketParams {
  /**
   * Ticket title (required).
   * Should be concise and descriptive.
   */
  title: string;

  /**
   * Ticket body/description (optional).
   * Supports markdown formatting.
   */
  body?: string;

  /**
   * Labels to add to the ticket (optional).
   */
  labels?: string[];
}

/**
 * Create the spec_kit.create_ticket tool.
 *
 * This tool creates a new ticket in the configured backlog system.
 * It uses the default provider from config (unlike get_ticket which
 * auto-detects provider from reference format).
 *
 * @param _config - SpecKit plugin configuration (unused, kept for consistency)
 * @param getProvider - Factory function to get the default provider
 * @returns AgencyTool instance
 *
 * @example
 * ```typescript
 * const registry = new ProviderRegistry(config);
 * const tool = createCreateTicketTool(config, () => registry.getProvider());
 *
 * // Create a GitHub issue
 * const result = await tool.execute({
 *   title: 'Add user authentication',
 *   body: '## Description\nImplement OAuth2 login...',
 *   labels: ['feature', 'auth'],
 * });
 * ```
 */
export function createCreateTicketTool(
  _config: SpecKitConfig,
  getProvider: () => BacklogProvider
): AgencyTool {
  return {
    name: 'spec_kit.create_ticket',
    description: 'Create a new ticket in the configured backlog system',
    namespace: 'spec_kit',
    outputPattern: 'terse',
    modes: ['coding'],
    inputSchema: {
      type: 'object',
      properties: {
        title: {
          type: 'string',
          description: 'Ticket title',
        },
        body: {
          type: 'string',
          description: 'Ticket body/description (markdown supported)',
        },
        labels: {
          type: 'array',
          items: { type: 'string' },
          description: 'Labels to add to the ticket',
        },
      },
      required: ['title'],
    },

    async execute(params: unknown): Promise<ToolResult> {
      const { title, body, labels } = params as CreateTicketParams;

      // Validate title is provided
      if (!title || typeof title !== 'string') {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                error: 'Invalid input',
                message: 'Title is required',
              }),
            },
          ],
          isError: true,
        };
      }

      // Validate title is non-empty after trimming
      if (title.trim() === '') {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                error: 'Invalid input',
                message: 'Title cannot be empty',
              }),
            },
          ],
          isError: true,
        };
      }

      // Get the default provider
      const provider = getProvider();

      // Create ticket - let provider exceptions propagate (per clarification Q3 in get-ticket)
      const ticket = await provider.createTicket({ title, body, labels });

      // Return terse JSON response
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              created: true,
              id: ticket.ref.id,
              url: ticket.url,
            }),
          },
        ],
      };
    },
  };
}
