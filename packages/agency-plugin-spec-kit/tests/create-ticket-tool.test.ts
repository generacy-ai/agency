/**
 * Tests for create_ticket tool
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createCreateTicketTool } from '../src/tools/create-ticket.js';
import { parseConfig } from '../src/config.js';
import type { BacklogProvider, Ticket } from '../src/providers/types.js';
import { AuthError, ProviderError } from '../src/providers/errors.js';

describe('createCreateTicketTool', () => {
  const config = parseConfig();
  let mockProvider: BacklogProvider;
  let getProvider: () => BacklogProvider;

  const mockTicket: Ticket = {
    ref: {
      provider: 'github',
      id: '456',
      url: 'https://github.com/owner/repo/issues/456',
      raw: '#456',
    },
    title: 'New Issue',
    body: 'This is the issue body',
    state: 'open',
    labels: ['feature'],
    url: 'https://github.com/owner/repo/issues/456',
  };

  beforeEach(() => {
    mockProvider = {
      name: 'github',
      getTicket: vi.fn(),
      createTicket: vi.fn().mockResolvedValue(mockTicket),
      updateTicket: vi.fn(),
      checkAuth: vi.fn().mockResolvedValue({ ok: true }),
      getTicketUrl: vi.fn().mockReturnValue('https://github.com/owner/repo/issues/456'),
      parseRef: vi.fn(),
    };

    getProvider = vi.fn().mockReturnValue(mockProvider);
  });

  describe('tool metadata', () => {
    it('should have correct name', () => {
      const tool = createCreateTicketTool(config, getProvider);
      expect(tool.name).toBe('spec_kit.create_ticket');
    });

    it('should have correct namespace', () => {
      const tool = createCreateTicketTool(config, getProvider);
      expect(tool.namespace).toBe('spec_kit');
    });

    it('should have correct output pattern', () => {
      const tool = createCreateTicketTool(config, getProvider);
      expect(tool.outputPattern).toBe('terse');
    });

    it('should have coding mode only', () => {
      const tool = createCreateTicketTool(config, getProvider);
      expect(tool.modes).toContain('coding');
      expect(tool.modes).not.toContain('research');
    });

    it('should have input schema with title property', () => {
      const tool = createCreateTicketTool(config, getProvider);
      expect(tool.inputSchema.type).toBe('object');
      expect(tool.inputSchema.properties?.title).toBeDefined();
      expect(tool.inputSchema.required).toContain('title');
    });

    it('should have optional body and labels in schema', () => {
      const tool = createCreateTicketTool(config, getProvider);
      expect(tool.inputSchema.properties?.body).toBeDefined();
      expect(tool.inputSchema.properties?.labels).toBeDefined();
      expect(tool.inputSchema.required).not.toContain('body');
      expect(tool.inputSchema.required).not.toContain('labels');
    });
  });

  describe('execute - successful creation', () => {
    it('should create ticket with title only', async () => {
      const tool = createCreateTicketTool(config, getProvider);

      const result = await tool.execute({ title: 'New Issue' });

      expect(result.isError).toBeFalsy();
      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe('text');

      const parsed = JSON.parse((result.content[0] as { text: string }).text);
      expect(parsed.created).toBe(true);
      expect(parsed.id).toBe('456');
      expect(parsed.url).toBe('https://github.com/owner/repo/issues/456');
    });

    it('should create ticket with all parameters', async () => {
      const tool = createCreateTicketTool(config, getProvider);

      await tool.execute({
        title: 'New Issue',
        body: 'Issue description',
        labels: ['bug', 'priority:high'],
      });

      expect(mockProvider.createTicket).toHaveBeenCalledWith({
        title: 'New Issue',
        body: 'Issue description',
        labels: ['bug', 'priority:high'],
      });
    });

    it('should return terse JSON response', async () => {
      const tool = createCreateTicketTool(config, getProvider);

      const result = await tool.execute({ title: 'Test' });

      const text = (result.content[0] as { text: string }).text;
      const parsed = JSON.parse(text);

      // Should only contain created, id, url (no extra ticket fields)
      expect(Object.keys(parsed)).toEqual(['created', 'id', 'url']);
    });
  });

  describe('execute - validation errors', () => {
    it('should return error for missing title', async () => {
      const tool = createCreateTicketTool(config, getProvider);

      const result = await tool.execute({});

      expect(result.isError).toBe(true);
      const parsed = JSON.parse((result.content[0] as { text: string }).text);
      expect(parsed.error).toBe('Invalid input');
      expect(parsed.message).toBe('Title is required');
    });

    it('should return error for null title', async () => {
      const tool = createCreateTicketTool(config, getProvider);

      const result = await tool.execute({ title: null });

      expect(result.isError).toBe(true);
      const parsed = JSON.parse((result.content[0] as { text: string }).text);
      expect(parsed.error).toBe('Invalid input');
      expect(parsed.message).toBe('Title is required');
    });

    it('should return error for empty title', async () => {
      const tool = createCreateTicketTool(config, getProvider);

      const result = await tool.execute({ title: '' });

      expect(result.isError).toBe(true);
      const parsed = JSON.parse((result.content[0] as { text: string }).text);
      expect(parsed.error).toBe('Invalid input');
      expect(parsed.message).toBe('Title is required');
    });

    it('should return error for whitespace-only title', async () => {
      const tool = createCreateTicketTool(config, getProvider);

      const result = await tool.execute({ title: '   ' });

      expect(result.isError).toBe(true);
      const parsed = JSON.parse((result.content[0] as { text: string }).text);
      expect(parsed.error).toBe('Invalid input');
      expect(parsed.message).toBe('Title cannot be empty');
    });

    it('should return error for non-string title', async () => {
      const tool = createCreateTicketTool(config, getProvider);

      const result = await tool.execute({ title: 123 });

      expect(result.isError).toBe(true);
      const parsed = JSON.parse((result.content[0] as { text: string }).text);
      expect(parsed.error).toBe('Invalid input');
    });
  });

  describe('execute - provider errors', () => {
    it('should propagate AuthError from provider', async () => {
      const errorProvider: BacklogProvider = {
        ...mockProvider,
        createTicket: vi.fn().mockRejectedValue(
          new AuthError('Not authenticated', 'github')
        ),
      };
      const errorGetProvider = vi.fn().mockReturnValue(errorProvider);

      const tool = createCreateTicketTool(config, errorGetProvider);

      await expect(tool.execute({ title: 'Test' })).rejects.toThrow(AuthError);
    });

    it('should propagate ProviderError from provider', async () => {
      const errorProvider: BacklogProvider = {
        ...mockProvider,
        createTicket: vi.fn().mockRejectedValue(
          new ProviderError('Rate limit exceeded', 'github')
        ),
      };
      const errorGetProvider = vi.fn().mockReturnValue(errorProvider);

      const tool = createCreateTicketTool(config, errorGetProvider);

      await expect(tool.execute({ title: 'Test' })).rejects.toThrow(ProviderError);
    });
  });

  describe('provider integration', () => {
    it('should use the default provider', async () => {
      const tool = createCreateTicketTool(config, getProvider);

      await tool.execute({ title: 'Test' });

      expect(getProvider).toHaveBeenCalled();
      expect(mockProvider.createTicket).toHaveBeenCalled();
    });

    it('should work with Jira provider', async () => {
      const jiraTicket: Ticket = {
        ref: {
          provider: 'jira',
          id: 'PROJ-789',
          url: 'https://company.atlassian.net/browse/PROJ-789',
          raw: 'PROJ-789',
        },
        title: 'Jira Issue',
        state: 'open',
        labels: [],
        url: 'https://company.atlassian.net/browse/PROJ-789',
      };

      const jiraProvider: BacklogProvider = {
        ...mockProvider,
        name: 'jira',
        createTicket: vi.fn().mockResolvedValue(jiraTicket),
      };
      const jiraGetProvider = vi.fn().mockReturnValue(jiraProvider);

      const tool = createCreateTicketTool(config, jiraGetProvider);
      const result = await tool.execute({ title: 'Jira Issue' });

      const parsed = JSON.parse((result.content[0] as { text: string }).text);
      expect(parsed.id).toBe('PROJ-789');
      expect(parsed.url).toBe('https://company.atlassian.net/browse/PROJ-789');
    });

    it('should work with Shortcut provider', async () => {
      const shortcutTicket: Ticket = {
        ref: {
          provider: 'shortcut',
          id: 'sc-101',
          url: 'https://app.shortcut.com/team/story/101',
          raw: 'sc-101',
        },
        title: 'Shortcut Story',
        state: 'open',
        labels: [],
        url: 'https://app.shortcut.com/team/story/101',
      };

      const shortcutProvider: BacklogProvider = {
        ...mockProvider,
        name: 'shortcut',
        createTicket: vi.fn().mockResolvedValue(shortcutTicket),
      };
      const shortcutGetProvider = vi.fn().mockReturnValue(shortcutProvider);

      const tool = createCreateTicketTool(config, shortcutGetProvider);
      const result = await tool.execute({ title: 'Shortcut Story' });

      const parsed = JSON.parse((result.content[0] as { text: string }).text);
      expect(parsed.id).toBe('sc-101');
    });

    it('should work with Local provider', async () => {
      const localTicket: Ticket = {
        ref: {
          provider: 'local',
          id: 'local-1',
          raw: 'local-1',
        },
        title: 'Local Issue',
        state: 'open',
        labels: [],
        url: 'file:///.backlog/issues/local-1.md',
      };

      const localProvider: BacklogProvider = {
        ...mockProvider,
        name: 'local',
        createTicket: vi.fn().mockResolvedValue(localTicket),
      };
      const localGetProvider = vi.fn().mockReturnValue(localProvider);

      const tool = createCreateTicketTool(config, localGetProvider);
      const result = await tool.execute({ title: 'Local Issue' });

      const parsed = JSON.parse((result.content[0] as { text: string }).text);
      expect(parsed.id).toBe('local-1');
    });
  });
});
