/**
 * Tests for update_ticket tool
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createUpdateTicketTool } from '../src/tools/update-ticket.js';
import { parseConfig } from '../src/config.js';
import type { BacklogProvider, Ticket } from '../src/providers/types.js';
import { AuthError, NotFoundError, ProviderError } from '../src/providers/errors.js';

describe('createUpdateTicketTool', () => {
  const config = parseConfig();
  let mockProvider: BacklogProvider;
  let getProvider: (name?: string) => BacklogProvider;

  const mockTicket: Ticket = {
    ref: {
      provider: 'github',
      id: '123',
      url: 'https://github.com/owner/repo/issues/123',
      raw: '#123',
    },
    title: 'Original Title',
    body: 'Original body',
    state: 'open',
    labels: ['bug', 'priority:low'],
    url: 'https://github.com/owner/repo/issues/123',
  };

  beforeEach(() => {
    mockProvider = {
      name: 'github',
      getTicket: vi.fn().mockResolvedValue(mockTicket),
      createTicket: vi.fn(),
      updateTicket: vi.fn().mockResolvedValue(mockTicket),
      checkAuth: vi.fn().mockResolvedValue({ ok: true }),
      getTicketUrl: vi.fn().mockReturnValue('https://github.com/owner/repo/issues/123'),
      parseRef: vi.fn(),
      getLabels: vi.fn().mockResolvedValue(['bug', 'priority:low']),
      setLabels: vi.fn(),
    };

    getProvider = vi.fn().mockReturnValue(mockProvider);
  });

  describe('tool metadata', () => {
    it('should have correct name', () => {
      const tool = createUpdateTicketTool(config, getProvider);
      expect(tool.name).toBe('spec_kit.update_ticket');
    });

    it('should have correct namespace', () => {
      const tool = createUpdateTicketTool(config, getProvider);
      expect(tool.namespace).toBe('spec_kit');
    });

    it('should have correct output pattern', () => {
      const tool = createUpdateTicketTool(config, getProvider);
      expect(tool.outputPattern).toBe('terse');
    });

    it('should have coding mode only', () => {
      const tool = createUpdateTicketTool(config, getProvider);
      expect(tool.modes).toContain('coding');
      expect(tool.modes).not.toContain('research');
    });

    it('should have input schema with ref as required property', () => {
      const tool = createUpdateTicketTool(config, getProvider);
      expect(tool.inputSchema.type).toBe('object');
      expect(tool.inputSchema.properties?.ref).toBeDefined();
      expect(tool.inputSchema.required).toContain('ref');
    });

    it('should have optional title, body, state, add_labels, remove_labels in schema', () => {
      const tool = createUpdateTicketTool(config, getProvider);
      expect(tool.inputSchema.properties?.title).toBeDefined();
      expect(tool.inputSchema.properties?.body).toBeDefined();
      expect(tool.inputSchema.properties?.state).toBeDefined();
      expect(tool.inputSchema.properties?.add_labels).toBeDefined();
      expect(tool.inputSchema.properties?.remove_labels).toBeDefined();
      expect(tool.inputSchema.required).not.toContain('title');
      expect(tool.inputSchema.required).not.toContain('body');
      expect(tool.inputSchema.required).not.toContain('state');
    });
  });

  describe('execute - input validation', () => {
    it('should return error for missing ref', async () => {
      const tool = createUpdateTicketTool(config, getProvider);

      const result = await tool.execute({});

      expect(result.isError).toBe(true);
      const parsed = JSON.parse((result.content[0] as { text: string }).text);
      expect(parsed.error).toBe('invalid_input');
      expect(parsed.message).toBe('Ticket reference is required');
    });

    it('should return error for null ref', async () => {
      const tool = createUpdateTicketTool(config, getProvider);

      const result = await tool.execute({ ref: null });

      expect(result.isError).toBe(true);
      const parsed = JSON.parse((result.content[0] as { text: string }).text);
      expect(parsed.error).toBe('invalid_input');
    });

    it('should return error for empty ref', async () => {
      const tool = createUpdateTicketTool(config, getProvider);

      const result = await tool.execute({ ref: '' });

      expect(result.isError).toBe(true);
      const parsed = JSON.parse((result.content[0] as { text: string }).text);
      expect(parsed.error).toBe('invalid_input');
    });

    it('should return error for whitespace-only ref', async () => {
      const tool = createUpdateTicketTool(config, getProvider);

      const result = await tool.execute({ ref: '   ' });

      expect(result.isError).toBe(true);
      const parsed = JSON.parse((result.content[0] as { text: string }).text);
      expect(parsed.error).toBe('invalid_input');
      expect(parsed.message).toBe('Ticket reference cannot be empty');
    });

    it('should return error for empty title (if provided)', async () => {
      const tool = createUpdateTicketTool(config, getProvider);

      const result = await tool.execute({ ref: '#123', title: '' });

      expect(result.isError).toBe(true);
      const parsed = JSON.parse((result.content[0] as { text: string }).text);
      expect(parsed.error).toBe('invalid_input');
      expect(parsed.message).toBe('Title cannot be empty');
    });

    it('should return error for whitespace-only title', async () => {
      const tool = createUpdateTicketTool(config, getProvider);

      const result = await tool.execute({ ref: '#123', title: '   ' });

      expect(result.isError).toBe(true);
      const parsed = JSON.parse((result.content[0] as { text: string }).text);
      expect(parsed.error).toBe('invalid_input');
      expect(parsed.message).toBe('Title cannot be empty');
    });

    it('should return error for non-string title', async () => {
      const tool = createUpdateTicketTool(config, getProvider);

      const result = await tool.execute({ ref: '#123', title: 123 });

      expect(result.isError).toBe(true);
      const parsed = JSON.parse((result.content[0] as { text: string }).text);
      expect(parsed.error).toBe('invalid_input');
      expect(parsed.message).toBe('Title must be a string');
    });

    it('should return error for invalid state value', async () => {
      const tool = createUpdateTicketTool(config, getProvider);

      const result = await tool.execute({ ref: '#123', state: 'invalid' });

      expect(result.isError).toBe(true);
      const parsed = JSON.parse((result.content[0] as { text: string }).text);
      expect(parsed.error).toBe('invalid_input');
      expect(parsed.message).toBe("State must be 'open' or 'closed'");
      expect(parsed.hint).toBe("Valid values: 'open', 'closed'");
    });

    it('should return error for invalid ref format', async () => {
      const tool = createUpdateTicketTool(config, getProvider);

      const result = await tool.execute({ ref: 'not-a-valid-ref' });

      expect(result.isError).toBe(true);
      const parsed = JSON.parse((result.content[0] as { text: string }).text);
      expect(parsed.error).toBe('invalid_input');
      expect(parsed.message).toContain('Could not parse ticket reference');
      expect(parsed.hint).toBeDefined();
    });
  });

  describe('execute - label calculation logic', () => {
    it('should add labels without removing any', async () => {
      const tool = createUpdateTicketTool(config, getProvider);
      const updatedTicket = {
        ...mockTicket,
        labels: ['bug', 'priority:low', 'feature'],
      };
      vi.mocked(mockProvider.updateTicket).mockResolvedValue(updatedTicket);

      await tool.execute({ ref: '#123', add_labels: ['feature'] });

      expect(mockProvider.getLabels).toHaveBeenCalledWith('#123');
      expect(mockProvider.updateTicket).toHaveBeenCalledWith(
        '#123',
        expect.objectContaining({
          labels: expect.arrayContaining(['bug', 'priority:low', 'feature']),
        })
      );
    });

    it('should remove labels without adding any', async () => {
      const tool = createUpdateTicketTool(config, getProvider);
      const updatedTicket = {
        ...mockTicket,
        labels: ['priority:low'],
      };
      vi.mocked(mockProvider.updateTicket).mockResolvedValue(updatedTicket);

      await tool.execute({ ref: '#123', remove_labels: ['bug'] });

      expect(mockProvider.getLabels).toHaveBeenCalledWith('#123');
      expect(mockProvider.updateTicket).toHaveBeenCalledWith(
        '#123',
        expect.objectContaining({
          labels: ['priority:low'],
        })
      );
    });

    it('should handle combined add and remove labels', async () => {
      const tool = createUpdateTicketTool(config, getProvider);
      const updatedTicket = {
        ...mockTicket,
        labels: ['priority:low', 'feature'],
      };
      vi.mocked(mockProvider.updateTicket).mockResolvedValue(updatedTicket);

      await tool.execute({
        ref: '#123',
        add_labels: ['feature'],
        remove_labels: ['bug'],
      });

      expect(mockProvider.updateTicket).toHaveBeenCalledWith(
        '#123',
        expect.objectContaining({
          labels: expect.arrayContaining(['priority:low', 'feature']),
        })
      );
      // Should not contain 'bug'
      const call = vi.mocked(mockProvider.updateTicket).mock.calls[0];
      expect(call[1].labels).not.toContain('bug');
    });

    it('should not include labels in updates if no label changes', async () => {
      const tool = createUpdateTicketTool(config, getProvider);

      await tool.execute({ ref: '#123', title: 'New title' });

      expect(mockProvider.getLabels).not.toHaveBeenCalled();
      expect(mockProvider.updateTicket).toHaveBeenCalledWith(
        '#123',
        expect.not.objectContaining({ labels: expect.anything() })
      );
    });

    it('should handle case-insensitive label removal', async () => {
      const tool = createUpdateTicketTool(config, getProvider);
      vi.mocked(mockProvider.getLabels).mockResolvedValue(['Bug', 'Priority:Low']);
      const updatedTicket = {
        ...mockTicket,
        labels: ['Priority:Low'],
      };
      vi.mocked(mockProvider.updateTicket).mockResolvedValue(updatedTicket);

      await tool.execute({ ref: '#123', remove_labels: ['bug'] });

      expect(mockProvider.updateTicket).toHaveBeenCalledWith(
        '#123',
        expect.objectContaining({
          labels: ['Priority:Low'],
        })
      );
    });

    it('should avoid duplicate labels when adding', async () => {
      const tool = createUpdateTicketTool(config, getProvider);
      vi.mocked(mockProvider.getLabels).mockResolvedValue(['bug', 'feature']);

      await tool.execute({ ref: '#123', add_labels: ['Bug', 'new-label'] });

      expect(mockProvider.updateTicket).toHaveBeenCalledWith(
        '#123',
        expect.objectContaining({
          labels: expect.arrayContaining(['bug', 'feature', 'new-label']),
        })
      );
      const call = vi.mocked(mockProvider.updateTicket).mock.calls[0];
      // Should have 3 labels, not 4 (no duplicate Bug)
      expect(call[1].labels).toHaveLength(3);
    });
  });

  describe('execute - successful updates', () => {
    it('should update title only', async () => {
      const tool = createUpdateTicketTool(config, getProvider);
      const updatedTicket = { ...mockTicket, title: 'New Title' };
      vi.mocked(mockProvider.updateTicket).mockResolvedValue(updatedTicket);

      const result = await tool.execute({ ref: '#123', title: 'New Title' });

      expect(result.isError).toBeFalsy();
      const parsed = JSON.parse((result.content[0] as { text: string }).text);
      expect(parsed.updated).toBe(true);
      expect(parsed.id).toBe('123');
      expect(parsed.url).toBe('https://github.com/owner/repo/issues/123');
      expect(parsed.changes).toContain('title');
      expect(mockProvider.updateTicket).toHaveBeenCalledWith('#123', { title: 'New Title' });
    });

    it('should update body only', async () => {
      const tool = createUpdateTicketTool(config, getProvider);
      const updatedTicket = { ...mockTicket, body: 'New body content' };
      vi.mocked(mockProvider.updateTicket).mockResolvedValue(updatedTicket);

      const result = await tool.execute({ ref: '#123', body: 'New body content' });

      expect(result.isError).toBeFalsy();
      const parsed = JSON.parse((result.content[0] as { text: string }).text);
      expect(parsed.changes).toContain('body');
      expect(mockProvider.updateTicket).toHaveBeenCalledWith('#123', { body: 'New body content' });
    });

    it('should update multiple fields at once', async () => {
      const tool = createUpdateTicketTool(config, getProvider);
      const updatedTicket = {
        ...mockTicket,
        title: 'New Title',
        body: 'New body',
        labels: ['new-label'],
      };
      vi.mocked(mockProvider.updateTicket).mockResolvedValue(updatedTicket);

      const result = await tool.execute({
        ref: '#123',
        title: 'New Title',
        body: 'New body',
        add_labels: ['new-label'],
        remove_labels: ['bug', 'priority:low'],
      });

      expect(result.isError).toBeFalsy();
      const parsed = JSON.parse((result.content[0] as { text: string }).text);
      expect(parsed.changes).toContain('title');
      expect(parsed.changes).toContain('body');
      expect(parsed.changes).toContain('labels');
    });

    it('should return correct response format', async () => {
      const tool = createUpdateTicketTool(config, getProvider);
      const updatedTicket = { ...mockTicket, title: 'Updated' };
      vi.mocked(mockProvider.updateTicket).mockResolvedValue(updatedTicket);

      const result = await tool.execute({ ref: '#123', title: 'Updated' });

      const text = (result.content[0] as { text: string }).text;
      const parsed = JSON.parse(text);

      // Should have terse format with only these keys
      expect(Object.keys(parsed)).toEqual(['updated', 'id', 'url', 'changes']);
      expect(parsed.updated).toBe(true);
      expect(typeof parsed.id).toBe('string');
      expect(typeof parsed.url).toBe('string');
      expect(Array.isArray(parsed.changes)).toBe(true);
    });

    it('should allow empty body to clear description', async () => {
      const tool = createUpdateTicketTool(config, getProvider);
      const updatedTicket = { ...mockTicket, body: '' };
      vi.mocked(mockProvider.updateTicket).mockResolvedValue(updatedTicket);

      const result = await tool.execute({ ref: '#123', body: '' });

      expect(result.isError).toBeFalsy();
      expect(mockProvider.updateTicket).toHaveBeenCalledWith('#123', { body: '' });
    });
  });

  describe('execute - state changes', () => {
    it('should track state change when closing open ticket', async () => {
      const tool = createUpdateTicketTool(config, getProvider);

      const result = await tool.execute({ ref: '#123', state: 'closed' });

      expect(result.isError).toBeFalsy();
      const parsed = JSON.parse((result.content[0] as { text: string }).text);
      expect(parsed.changes).toContain('state');
    });

    it('should track state change when reopening closed ticket', async () => {
      const tool = createUpdateTicketTool(config, getProvider);
      const closedTicket = { ...mockTicket, state: 'closed' as const };
      vi.mocked(mockProvider.getTicket).mockResolvedValue(closedTicket);
      vi.mocked(mockProvider.updateTicket).mockResolvedValue(closedTicket);

      const result = await tool.execute({ ref: '#123', state: 'open' });

      expect(result.isError).toBeFalsy();
      const parsed = JSON.parse((result.content[0] as { text: string }).text);
      expect(parsed.changes).toContain('state');
    });

    it('should not track state change when state is already correct', async () => {
      const tool = createUpdateTicketTool(config, getProvider);
      // mockTicket has state: 'open'

      const result = await tool.execute({ ref: '#123', state: 'open' });

      expect(result.isError).toBeFalsy();
      const parsed = JSON.parse((result.content[0] as { text: string }).text);
      expect(parsed.changes).not.toContain('state');
    });

    it('should combine state change with other updates', async () => {
      const tool = createUpdateTicketTool(config, getProvider);
      const updatedTicket = { ...mockTicket, title: 'New Title' };
      vi.mocked(mockProvider.updateTicket).mockResolvedValue(updatedTicket);

      const result = await tool.execute({
        ref: '#123',
        title: 'New Title',
        state: 'closed',
      });

      expect(result.isError).toBeFalsy();
      const parsed = JSON.parse((result.content[0] as { text: string }).text);
      expect(parsed.changes).toContain('title');
      expect(parsed.changes).toContain('state');
    });
  });

  describe('execute - error handling', () => {
    it('should return user-friendly error for NotFoundError', async () => {
      const errorProvider: BacklogProvider = {
        ...mockProvider,
        getTicket: vi.fn().mockRejectedValue(
          new NotFoundError('Issue #999 not found', 'github', '#999')
        ),
      };
      const errorGetProvider = vi.fn().mockReturnValue(errorProvider);

      const tool = createUpdateTicketTool(config, errorGetProvider);
      const result = await tool.execute({ ref: '#999', title: 'New Title' });

      expect(result.isError).toBe(true);
      const parsed = JSON.parse((result.content[0] as { text: string }).text);
      expect(parsed.error).toBe('not_found');
      expect(parsed.message).toBe('Issue #999 not found');
      expect(parsed.ref).toBe('#999');
    });

    it('should propagate AuthError from provider', async () => {
      const errorProvider: BacklogProvider = {
        ...mockProvider,
        getTicket: vi.fn().mockRejectedValue(
          new AuthError('Not authenticated', 'github')
        ),
      };
      const errorGetProvider = vi.fn().mockReturnValue(errorProvider);

      const tool = createUpdateTicketTool(config, errorGetProvider);

      await expect(tool.execute({ ref: '#123', title: 'Test' })).rejects.toThrow(AuthError);
    });

    it('should propagate ProviderError from provider', async () => {
      const errorProvider: BacklogProvider = {
        ...mockProvider,
        updateTicket: vi.fn().mockRejectedValue(
          new ProviderError('Rate limit exceeded', 'github')
        ),
      };
      const errorGetProvider = vi.fn().mockReturnValue(errorProvider);

      const tool = createUpdateTicketTool(config, errorGetProvider);

      await expect(tool.execute({ ref: '#123', title: 'Test' })).rejects.toThrow(ProviderError);
    });

    it('should handle NotFoundError from updateTicket', async () => {
      const errorProvider: BacklogProvider = {
        ...mockProvider,
        updateTicket: vi.fn().mockRejectedValue(
          new NotFoundError('Issue #123 not found', 'github', '#123')
        ),
      };
      const errorGetProvider = vi.fn().mockReturnValue(errorProvider);

      const tool = createUpdateTicketTool(config, errorGetProvider);
      const result = await tool.execute({ ref: '#123', title: 'Test' });

      expect(result.isError).toBe(true);
      const parsed = JSON.parse((result.content[0] as { text: string }).text);
      expect(parsed.error).toBe('not_found');
    });
  });

  describe('provider integration', () => {
    it('should auto-detect GitHub provider from URL', async () => {
      const tool = createUpdateTicketTool(config, getProvider);

      await tool.execute({
        ref: 'https://github.com/owner/repo/issues/123',
        title: 'Test',
      });

      expect(getProvider).toHaveBeenCalledWith('github');
    });

    it('should auto-detect GitHub provider from shorthand', async () => {
      const tool = createUpdateTicketTool(config, getProvider);

      await tool.execute({ ref: '#123', title: 'Test' });

      expect(getProvider).toHaveBeenCalledWith('github');
    });

    it('should auto-detect Jira provider from format', async () => {
      const jiraTicket: Ticket = {
        ref: {
          provider: 'jira',
          id: 'PROJ-123',
          url: 'https://company.atlassian.net/browse/PROJ-123',
          raw: 'PROJ-123',
        },
        title: 'Jira Issue',
        state: 'open',
        labels: [],
        url: 'https://company.atlassian.net/browse/PROJ-123',
      };

      const jiraProvider: BacklogProvider = {
        ...mockProvider,
        name: 'jira',
        getTicket: vi.fn().mockResolvedValue(jiraTicket),
        updateTicket: vi.fn().mockResolvedValue(jiraTicket),
      };
      const jiraGetProvider = vi.fn().mockReturnValue(jiraProvider);

      const tool = createUpdateTicketTool(config, jiraGetProvider);
      await tool.execute({ ref: 'PROJ-123', title: 'Test' });

      expect(jiraGetProvider).toHaveBeenCalledWith('jira');
    });

    it('should auto-detect Shortcut provider from format', async () => {
      const shortcutTicket: Ticket = {
        ref: {
          provider: 'shortcut',
          id: '456',
          url: 'https://app.shortcut.com/team/story/456',
          raw: 'sc-456',
        },
        title: 'Shortcut Story',
        state: 'open',
        labels: [],
        url: 'https://app.shortcut.com/team/story/456',
      };

      const shortcutProvider: BacklogProvider = {
        ...mockProvider,
        name: 'shortcut',
        getTicket: vi.fn().mockResolvedValue(shortcutTicket),
        updateTicket: vi.fn().mockResolvedValue(shortcutTicket),
      };
      const shortcutGetProvider = vi.fn().mockReturnValue(shortcutProvider);

      const tool = createUpdateTicketTool(config, shortcutGetProvider);
      await tool.execute({ ref: 'sc-456', title: 'Test' });

      expect(shortcutGetProvider).toHaveBeenCalledWith('shortcut');
    });

    it('should handle provider without getLabels method', async () => {
      const noLabelsProvider: BacklogProvider = {
        ...mockProvider,
        getLabels: undefined,
        setLabels: undefined,
      };
      const noLabelsGetProvider = vi.fn().mockReturnValue(noLabelsProvider);

      const tool = createUpdateTicketTool(config, noLabelsGetProvider);

      // With only add_labels and no getLabels support, should use add_labels as replacement
      await tool.execute({ ref: '#123', add_labels: ['new-label'] });

      expect(noLabelsProvider.updateTicket).toHaveBeenCalledWith(
        '#123',
        expect.objectContaining({
          labels: ['new-label'],
        })
      );
    });

    it('should skip labels if provider has no getLabels and remove_labels specified', async () => {
      const noLabelsProvider: BacklogProvider = {
        ...mockProvider,
        getLabels: undefined,
        setLabels: undefined,
      };
      const noLabelsGetProvider = vi.fn().mockReturnValue(noLabelsProvider);

      const tool = createUpdateTicketTool(config, noLabelsGetProvider);

      // With remove_labels but no getLabels, can't calculate new labels
      await tool.execute({ ref: '#123', remove_labels: ['bug'] });

      // Should not include labels in update since we can't calculate them
      expect(noLabelsProvider.updateTicket).not.toHaveBeenCalled();
    });
  });
});
