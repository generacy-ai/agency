/**
 * Tests for get_ticket tool
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createGetTicketTool } from '../src/tools/get-ticket.js';
import { parseConfig } from '../src/config.js';
import type { BacklogProvider, Ticket } from '../src/providers/types.js';
import { NotFoundError } from '../src/providers/errors.js';

describe('createGetTicketTool', () => {
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
    title: 'Test Issue',
    body: 'This is a test issue body',
    state: 'open',
    labels: ['bug', 'priority:high'],
    url: 'https://github.com/owner/repo/issues/123',
    meta: {
      assignees: ['developer'],
    },
  };

  beforeEach(() => {
    mockProvider = {
      name: 'github',
      getTicket: vi.fn().mockResolvedValue(mockTicket),
      createTicket: vi.fn(),
      updateTicket: vi.fn(),
      checkAuth: vi.fn().mockResolvedValue({ ok: true }),
      getTicketUrl: vi.fn().mockReturnValue('https://github.com/owner/repo/issues/123'),
      parseRef: vi.fn().mockReturnValue({
        provider: 'github',
        id: '123',
        raw: '#123',
      }),
    };

    getProvider = vi.fn().mockReturnValue(mockProvider);
  });

  describe('tool metadata', () => {
    it('should have correct name', () => {
      const tool = createGetTicketTool(config, getProvider);
      expect(tool.name).toBe('spec_kit.get_ticket');
    });

    it('should have correct namespace', () => {
      const tool = createGetTicketTool(config, getProvider);
      expect(tool.namespace).toBe('spec_kit');
    });

    it('should have correct output pattern', () => {
      const tool = createGetTicketTool(config, getProvider);
      expect(tool.outputPattern).toBe('terse');
    });

    it('should have correct modes', () => {
      const tool = createGetTicketTool(config, getProvider);
      expect(tool.modes).toContain('coding');
      expect(tool.modes).toContain('research');
    });

    it('should have input schema with ref property', () => {
      const tool = createGetTicketTool(config, getProvider);
      expect(tool.inputSchema.type).toBe('object');
      expect(tool.inputSchema.properties?.ref).toBeDefined();
      expect(tool.inputSchema.required).toContain('ref');
    });
  });

  describe('execute', () => {
    it('should fetch ticket successfully', async () => {
      const tool = createGetTicketTool(config, getProvider);

      const result = await tool.execute({ ref: '#123' });

      expect(result.isError).toBeFalsy();
      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe('text');

      const parsed = JSON.parse((result.content[0] as { text: string }).text);
      expect(parsed.title).toBe('Test Issue');
      expect(parsed.state).toBe('open');
    });

    it('should auto-detect provider from reference', async () => {
      const tool = createGetTicketTool(config, getProvider);

      await tool.execute({ ref: '#123' });

      expect(getProvider).toHaveBeenCalledWith('github');
    });

    it('should detect Jira provider from PROJ-123 format', async () => {
      const jiraProvider: BacklogProvider = {
        ...mockProvider,
        name: 'jira',
      };
      const multiGetProvider = vi.fn((name?: string) => {
        if (name === 'jira') return jiraProvider;
        return mockProvider;
      });

      const tool = createGetTicketTool(config, multiGetProvider);

      await tool.execute({ ref: 'PROJ-123' });

      expect(multiGetProvider).toHaveBeenCalledWith('jira');
    });

    it('should return error for empty ref', async () => {
      const tool = createGetTicketTool(config, getProvider);

      const result = await tool.execute({ ref: '' });

      expect(result.isError).toBe(true);
      const parsed = JSON.parse((result.content[0] as { text: string }).text);
      expect(parsed.error).toBe('Invalid input');
    });

    it('should return error for missing ref', async () => {
      const tool = createGetTicketTool(config, getProvider);

      const result = await tool.execute({});

      expect(result.isError).toBe(true);
      const parsed = JSON.parse((result.content[0] as { text: string }).text);
      expect(parsed.error).toBe('Invalid input');
    });

    it('should return error for invalid reference format', async () => {
      const tool = createGetTicketTool(config, getProvider);

      const result = await tool.execute({ ref: 'invalid-ref' });

      expect(result.isError).toBe(true);
      const parsed = JSON.parse((result.content[0] as { text: string }).text);
      expect(parsed.error).toBe('Invalid reference');
    });

    it('should propagate provider errors', async () => {
      const errorProvider: BacklogProvider = {
        ...mockProvider,
        getTicket: vi.fn().mockRejectedValue(
          new NotFoundError('Issue #999 not found', 'github', '#999')
        ),
      };
      const errorGetProvider = vi.fn().mockReturnValue(errorProvider);

      const tool = createGetTicketTool(config, errorGetProvider);

      await expect(tool.execute({ ref: '#999' })).rejects.toThrow(NotFoundError);
    });

    it('should return compact JSON output', async () => {
      const tool = createGetTicketTool(config, getProvider);

      const result = await tool.execute({ ref: '#123' });

      const text = (result.content[0] as { text: string }).text;
      // Compact single-line JSON (tickets carry full issue bodies; no indent)
      expect(text).not.toContain('\n');
      expect(JSON.parse(text)).toMatchObject({ title: 'Test Issue' });
    });
  });

  describe('provider selection', () => {
    it('should use GitHub provider for GitHub URLs', async () => {
      const tool = createGetTicketTool(config, getProvider);

      await tool.execute({ ref: 'https://github.com/owner/repo/issues/123' });

      expect(getProvider).toHaveBeenCalledWith('github');
    });

    it('should use Shortcut provider for sc-123 format', async () => {
      const shortcutProvider: BacklogProvider = {
        ...mockProvider,
        name: 'shortcut',
      };
      const multiGetProvider = vi.fn((name?: string) => {
        if (name === 'shortcut') return shortcutProvider;
        return mockProvider;
      });

      const tool = createGetTicketTool(config, multiGetProvider);

      await tool.execute({ ref: 'sc-456' });

      expect(multiGetProvider).toHaveBeenCalledWith('shortcut');
    });

    it('should use default provider for bare numbers', async () => {
      const tool = createGetTicketTool(config, getProvider);

      await tool.execute({ ref: '123' });

      // Default provider is 'github' from config
      expect(getProvider).toHaveBeenCalledWith('github');
    });
  });
});
