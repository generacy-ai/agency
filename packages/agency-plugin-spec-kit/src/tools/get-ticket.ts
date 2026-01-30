/**
 * spec_kit.get_ticket tool
 *
 * Fetches ticket details from the configured backlog provider.
 * Supports GitHub Issues, Jira, Shortcut, and local providers.
 *
 * @example
 * ```typescript
 * import { createGetTicketTool } from './get-ticket.js';
 *
 * const tool = createGetTicketTool(config, () => registry.getProvider());
 *
 * // Execute via MCP
 * const result = await tool.execute({ ref: '#123' });
 * ```
 */

import type { AgencyTool, ToolResult } from '@generacy-ai/agency';
import type { BacklogProvider } from '../providers/types.js';
import type { SpecKitConfig } from '../config.js';
import { detectTicketRef } from '../utils/detect-ticket-ref.js';
import { ProviderRegistry } from '../providers/registry.js';

/**
 * Input parameters for get_ticket tool.
 */
interface GetTicketParams {
  /**
   * Ticket reference - URL or identifier.
   *
   * Supported formats:
   * - GitHub URL: https://github.com/owner/repo/issues/123
   * - GitHub shorthand: #123, owner/repo#123
   * - Jira: PROJ-123
   * - Shortcut: sc-123
   * - Bare number: 123 (uses default provider)
   */
  ref: string;
}

/**
 * Create the spec_kit.get_ticket tool.
 *
 * This tool fetches ticket details from the configured backlog system.
 * It auto-detects the provider from the reference format when possible,
 * falling back to the configured default provider.
 *
 * @param config - SpecKit plugin configuration
 * @param getProvider - Factory function to get the appropriate provider
 * @returns AgencyTool instance
 *
 * @example
 * ```typescript
 * const registry = new ProviderRegistry(config);
 * const tool = createGetTicketTool(config, (name) => registry.getProvider(name));
 *
 * // Fetch a GitHub issue
 * const result = await tool.execute({ ref: '#123' });
 *
 * // Fetch a Jira ticket
 * const result = await tool.execute({ ref: 'PROJ-456' });
 * ```
 */
export function createGetTicketTool(
  config: SpecKitConfig,
  getProvider: (name?: string) => BacklogProvider
): AgencyTool {
  return {
    name: 'spec_kit.get_ticket',
    description:
      'Get ticket details from the configured backlog system. ' +
      'Supports GitHub (#123, URLs), Jira (PROJ-123), and Shortcut (sc-123) formats.',
    namespace: 'spec_kit',
    outputPattern: 'terse',
    modes: ['coding', 'research'],
    inputSchema: {
      type: 'object',
      properties: {
        ref: {
          type: 'string',
          description:
            'Ticket reference - URL (https://github.com/owner/repo/issues/123) ' +
            'or identifier (#123, PROJ-123, sc-123)',
        },
      },
      required: ['ref'],
    },

    async execute(params: unknown): Promise<ToolResult> {
      const { ref } = params as GetTicketParams;

      // Validate input
      if (!ref || typeof ref !== 'string') {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                error: 'Invalid input',
                message: 'Ticket reference is required',
              }),
            },
          ],
          isError: true,
        };
      }

      // Auto-detect provider from reference
      const ticketRef = detectTicketRef(ref, config.backlog.provider);
      if (!ticketRef) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                error: 'Invalid reference',
                message: `Could not parse ticket reference: ${ref}`,
                hint: 'Supported formats: #123, owner/repo#123, PROJ-123, sc-123, or full URLs',
              }),
            },
          ],
          isError: true,
        };
      }

      // Get appropriate provider
      const provider = getProvider(ticketRef.provider);

      // Fetch ticket - let provider exceptions propagate (per clarification Q3)
      const ticket = await provider.getTicket(ref);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(ticket, null, 2),
          },
        ],
      };
    },
  };
}

/**
 * Create get_ticket tool with built-in registry.
 *
 * Convenience function that creates a ProviderRegistry internally.
 *
 * @param config - SpecKit plugin configuration
 * @returns AgencyTool instance
 */
export function createGetTicketToolWithRegistry(
  config: SpecKitConfig
): AgencyTool {
  const registry = new ProviderRegistry(config);
  return createGetTicketTool(config, (name) =>
    registry.getProvider(name as Parameters<typeof registry.getProvider>[0])
  );
}
