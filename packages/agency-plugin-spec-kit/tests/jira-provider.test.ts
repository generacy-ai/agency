/**
 * Tests for JiraProvider
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { JiraProvider } from '../src/providers/jira.js';
import { NotFoundError, AuthError, ProviderError } from '../src/providers/errors.js';
import { parseConfig } from '../src/config.js';

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

describe('JiraProvider', () => {
  let provider: JiraProvider;
  let originalEmail: string | undefined;
  let originalToken: string | undefined;

  const jiraConfig = parseConfig({
    backlog: {
      provider: 'jira',
      jira: {
        baseUrl: 'https://company.atlassian.net',
        projectKey: 'PROJ',
      },
    },
  });

  beforeEach(() => {
    originalEmail = process.env['JIRA_EMAIL'];
    originalToken = process.env['JIRA_API_TOKEN'];
    process.env['JIRA_EMAIL'] = 'test@example.com';
    process.env['JIRA_API_TOKEN'] = 'test-api-token';
    provider = new JiraProvider(jiraConfig);
    mockFetch.mockReset();
  });

  afterEach(() => {
    if (originalEmail !== undefined) {
      process.env['JIRA_EMAIL'] = originalEmail;
    } else {
      delete process.env['JIRA_EMAIL'];
    }
    if (originalToken !== undefined) {
      process.env['JIRA_API_TOKEN'] = originalToken;
    } else {
      delete process.env['JIRA_API_TOKEN'];
    }
    vi.clearAllMocks();
  });

  describe('name', () => {
    it('should have name "jira"', () => {
      expect(provider.name).toBe('jira');
    });
  });

  describe('constructor', () => {
    it('should throw ProviderError when jira config is missing', () => {
      const configWithoutJira = parseConfig({
        backlog: { provider: 'github' },
      });

      expect(() => new JiraProvider(configWithoutJira)).toThrow(ProviderError);
      expect(() => new JiraProvider(configWithoutJira)).toThrow(
        'Jira configuration missing'
      );
    });

    it('should use config values for auth if provided', () => {
      const configWithAuth = parseConfig({
        backlog: {
          provider: 'jira',
          jira: {
            baseUrl: 'https://company.atlassian.net',
            projectKey: 'PROJ',
            email: 'config@example.com',
            apiToken: 'config-token',
          },
        },
      });

      // Clear env vars
      delete process.env['JIRA_EMAIL'];
      delete process.env['JIRA_API_TOKEN'];

      const providerWithConfig = new JiraProvider(configWithAuth);
      expect(providerWithConfig.name).toBe('jira');
    });

    it('should fall back to env vars when config auth is not provided', () => {
      process.env['JIRA_EMAIL'] = 'env@example.com';
      process.env['JIRA_API_TOKEN'] = 'env-token';

      const providerWithEnv = new JiraProvider(jiraConfig);
      expect(providerWithEnv.name).toBe('jira');
    });

    it('should remove trailing slash from baseUrl', () => {
      const configWithTrailingSlash = parseConfig({
        backlog: {
          provider: 'jira',
          jira: {
            baseUrl: 'https://company.atlassian.net/',
            projectKey: 'PROJ',
          },
        },
      });

      const providerWithSlash = new JiraProvider(configWithTrailingSlash);
      expect(providerWithSlash.getTicketUrl('PROJ-123')).toBe(
        'https://company.atlassian.net/browse/PROJ-123'
      );
    });
  });

  describe('parseRef', () => {
    it('should parse PROJ-123 format', () => {
      const ref = provider.parseRef('PROJ-123');
      expect(ref).toEqual({
        provider: 'jira',
        id: 'PROJ-123',
        raw: 'PROJ-123',
      });
    });

    it('should parse full Jira URL', () => {
      const ref = provider.parseRef(
        'https://company.atlassian.net/browse/PROJ-456'
      );
      expect(ref).toEqual({
        provider: 'jira',
        id: 'PROJ-456',
        url: 'https://company.atlassian.net/browse/PROJ-456',
        raw: 'https://company.atlassian.net/browse/PROJ-456',
      });
    });

    it('should return null for different project key', () => {
      const ref = provider.parseRef('OTHER-123');
      expect(ref).toBeNull();
    });

    it('should return null for non-Jira references', () => {
      expect(provider.parseRef('#123')).toBeNull();
      expect(provider.parseRef('sc-123')).toBeNull();
      expect(provider.parseRef('invalid')).toBeNull();
    });

    it('should return null for invalid issue key format', () => {
      expect(provider.parseRef('proj-123')).toBeNull(); // lowercase
      expect(provider.parseRef('PROJ123')).toBeNull(); // no hyphen
      expect(provider.parseRef('123-PROJ')).toBeNull(); // reversed
    });
  });

  describe('getTicketUrl', () => {
    it('should generate URL for PROJ-123 format', () => {
      const url = provider.getTicketUrl('PROJ-123');
      expect(url).toBe('https://company.atlassian.net/browse/PROJ-123');
    });

    it('should handle URLs that cannot be parsed', () => {
      // When ref cannot be parsed, it falls back to constructing URL with raw ref
      const url = provider.getTicketUrl('OTHER-123');
      expect(url).toBe('https://company.atlassian.net/browse/OTHER-123');
    });
  });

  describe('checkAuth', () => {
    it('should return ok: true when auth succeeds', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () =>
          JSON.stringify({
            self: 'https://company.atlassian.net/rest/api/3/user/12345',
            accountId: '12345',
            displayName: 'Test User',
            emailAddress: 'test@example.com',
            active: true,
          }),
      });

      const result = await provider.checkAuth();
      expect(result.ok).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://company.atlassian.net/rest/api/3/myself',
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: expect.stringMatching(/^Basic /),
          }),
        })
      );
    });

    it('should return ok: false when auth not configured', async () => {
      delete process.env['JIRA_EMAIL'];
      delete process.env['JIRA_API_TOKEN'];

      const providerNoAuth = new JiraProvider(jiraConfig);
      const result = await providerNoAuth.checkAuth();

      expect(result.ok).toBe(false);
      expect(result.message).toContain('not configured');
    });

    it('should return ok: false when auth fails', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({
          errorMessages: ['Authentication failed'],
          errors: {},
        }),
      });

      const result = await provider.checkAuth();
      expect(result.ok).toBe(false);
      expect(result.message).toContain('authentication failed');
    });
  });

  describe('getTicket', () => {
    const mockJiraIssue = {
      id: '10001',
      key: 'PROJ-123',
      self: 'https://company.atlassian.net/rest/api/3/issue/10001',
      fields: {
        summary: 'Test Issue',
        description: {
          type: 'doc',
          version: 1,
          content: [
            {
              type: 'paragraph',
              content: [{ type: 'text', text: 'Issue description' }],
            },
          ],
        },
        status: {
          name: 'In Progress',
          statusCategory: { key: 'indeterminate', name: 'In Progress' },
        },
        labels: ['bug', 'priority-high'],
        issuetype: { name: 'Bug', id: '1' },
        priority: { name: 'High', id: '2' },
        assignee: { displayName: 'Test User', accountId: '12345' },
      },
    };

    it('should fetch and map ticket correctly', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify(mockJiraIssue),
      });

      const ticket = await provider.getTicket('PROJ-123');

      expect(ticket.ref.id).toBe('PROJ-123');
      expect(ticket.ref.provider).toBe('jira');
      expect(ticket.title).toBe('Test Issue');
      expect(ticket.body).toBe('Issue description');
      expect(ticket.state).toBe('in_progress');
      expect(ticket.labels).toEqual(['bug', 'priority-high']);
      expect(ticket.url).toBe('https://company.atlassian.net/browse/PROJ-123');
      expect(ticket.meta).toEqual({
        issueType: 'Bug',
        priority: 'High',
        assignee: 'Test User',
        jiraStatus: 'In Progress',
      });
    });

    it('should throw ProviderError for invalid reference', async () => {
      await expect(provider.getTicket('invalid')).rejects.toThrow(ProviderError);
      await expect(provider.getTicket('invalid')).rejects.toThrow(
        'Invalid Jira reference'
      );
    });

    it('should throw NotFoundError for 404 response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => ({
          errorMessages: ['Issue does not exist'],
          errors: {},
        }),
      });

      await expect(provider.getTicket('PROJ-999')).rejects.toThrow(NotFoundError);
    });

    it('should throw AuthError for 401 response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({
          errorMessages: ['Unauthorized'],
          errors: {},
        }),
      });

      await expect(provider.getTicket('PROJ-123')).rejects.toThrow(AuthError);
    });

    it('should throw AuthError for 403 response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
        json: async () => ({
          errorMessages: ['Forbidden'],
          errors: {},
        }),
      });

      await expect(provider.getTicket('PROJ-123')).rejects.toThrow(AuthError);
    });
  });

  describe('createTicket', () => {
    it('should create ticket with default Story type', async () => {
      // First call: create issue
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () =>
          JSON.stringify({
            id: '10002',
            key: 'PROJ-124',
            self: 'https://company.atlassian.net/rest/api/3/issue/10002',
          }),
      });

      // Second call: fetch created issue
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () =>
          JSON.stringify({
            id: '10002',
            key: 'PROJ-124',
            self: 'https://company.atlassian.net/rest/api/3/issue/10002',
            fields: {
              summary: 'New Issue',
              description: null,
              status: {
                name: 'Open',
                statusCategory: { key: 'new', name: 'To Do' },
              },
              labels: [],
              issuetype: { name: 'Story', id: '2' },
            },
          }),
      });

      const ticket = await provider.createTicket({
        title: 'New Issue',
      });

      expect(ticket.title).toBe('New Issue');
      expect(mockFetch).toHaveBeenCalledTimes(2);

      // Check the create request body
      const createCall = mockFetch.mock.calls[0];
      const body = JSON.parse(createCall[1].body);
      expect(body.fields.issuetype.name).toBe('Story');
      expect(body.fields.project.key).toBe('PROJ');
    });

    it('should include body and labels when provided', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () =>
          JSON.stringify({
            id: '10003',
            key: 'PROJ-125',
            self: 'https://company.atlassian.net/rest/api/3/issue/10003',
          }),
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () =>
          JSON.stringify({
            id: '10003',
            key: 'PROJ-125',
            self: 'https://company.atlassian.net/rest/api/3/issue/10003',
            fields: {
              summary: 'Issue with body',
              description: {
                type: 'doc',
                version: 1,
                content: [
                  {
                    type: 'paragraph',
                    content: [{ type: 'text', text: 'Description text' }],
                  },
                ],
              },
              status: {
                name: 'Open',
                statusCategory: { key: 'new', name: 'To Do' },
              },
              labels: ['feature', 'api'],
              issuetype: { name: 'Story', id: '2' },
            },
          }),
      });

      await provider.createTicket({
        title: 'Issue with body',
        body: 'Description text',
        labels: ['feature', 'api'],
      });

      const createCall = mockFetch.mock.calls[0];
      const body = JSON.parse(createCall[1].body);
      expect(body.fields.description).toBeDefined();
      expect(body.fields.labels).toEqual(['feature', 'api']);
    });
  });

  describe('updateTicket', () => {
    it('should update ticket fields', async () => {
      // First call: update
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => '',
      });

      // Second call: fetch updated issue
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () =>
          JSON.stringify({
            id: '10001',
            key: 'PROJ-123',
            self: 'https://company.atlassian.net/rest/api/3/issue/10001',
            fields: {
              summary: 'Updated Title',
              description: null,
              status: {
                name: 'Open',
                statusCategory: { key: 'new', name: 'To Do' },
              },
              labels: [],
              issuetype: { name: 'Bug', id: '1' },
            },
          }),
      });

      const ticket = await provider.updateTicket('PROJ-123', {
        title: 'Updated Title',
      });

      expect(ticket.title).toBe('Updated Title');
      expect(mockFetch).toHaveBeenCalledTimes(2);

      // Check the update request
      const updateCall = mockFetch.mock.calls[0];
      expect(updateCall[0]).toContain('/issue/PROJ-123');
      expect(updateCall[1].method).toBe('PUT');
    });

    it('should throw ProviderError for invalid reference', async () => {
      await expect(
        provider.updateTicket('invalid', { title: 'New' })
      ).rejects.toThrow(ProviderError);
    });
  });

  describe('setLabels', () => {
    it('should set labels on ticket', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => '',
      });

      await provider.setLabels('PROJ-123', ['bug', 'urgent']);

      expect(mockFetch).toHaveBeenCalledWith(
        'https://company.atlassian.net/rest/api/3/issue/PROJ-123',
        expect.objectContaining({
          method: 'PUT',
          body: JSON.stringify({ fields: { labels: ['bug', 'urgent'] } }),
        })
      );
    });

    it('should throw ProviderError for invalid reference', async () => {
      await expect(provider.setLabels('invalid', ['bug'])).rejects.toThrow(
        ProviderError
      );
    });
  });

  describe('getLabels', () => {
    it('should return labels from ticket', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () =>
          JSON.stringify({
            id: '10001',
            key: 'PROJ-123',
            self: 'https://company.atlassian.net/rest/api/3/issue/10001',
            fields: {
              summary: 'Test',
              description: null,
              status: {
                name: 'Open',
                statusCategory: { key: 'new', name: 'To Do' },
              },
              labels: ['bug', 'priority-high'],
              issuetype: { name: 'Bug', id: '1' },
            },
          }),
      });

      const labels = await provider.getLabels('PROJ-123');
      expect(labels).toEqual(['bug', 'priority-high']);
    });
  });

  describe('mapJiraStatusToTicketState', () => {
    // Access the module-level function indirectly through ticket mapping

    it('should map "Done" to closed', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () =>
          JSON.stringify({
            id: '10001',
            key: 'PROJ-123',
            self: 'https://company.atlassian.net/rest/api/3/issue/10001',
            fields: {
              summary: 'Test',
              description: null,
              status: { name: 'Done', statusCategory: { key: 'done', name: 'Done' } },
              labels: [],
              issuetype: { name: 'Bug', id: '1' },
            },
          }),
      });

      const ticket = await provider.getTicket('PROJ-123');
      expect(ticket.state).toBe('closed');
    });

    it('should map "Closed" to closed', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () =>
          JSON.stringify({
            id: '10001',
            key: 'PROJ-123',
            self: 'https://company.atlassian.net/rest/api/3/issue/10001',
            fields: {
              summary: 'Test',
              description: null,
              status: {
                name: 'Closed',
                statusCategory: { key: 'done', name: 'Done' },
              },
              labels: [],
              issuetype: { name: 'Bug', id: '1' },
            },
          }),
      });

      const ticket = await provider.getTicket('PROJ-123');
      expect(ticket.state).toBe('closed');
    });

    it('should map "Resolved" to closed', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () =>
          JSON.stringify({
            id: '10001',
            key: 'PROJ-123',
            self: 'https://company.atlassian.net/rest/api/3/issue/10001',
            fields: {
              summary: 'Test',
              description: null,
              status: {
                name: 'Resolved',
                statusCategory: { key: 'done', name: 'Done' },
              },
              labels: [],
              issuetype: { name: 'Bug', id: '1' },
            },
          }),
      });

      const ticket = await provider.getTicket('PROJ-123');
      expect(ticket.state).toBe('closed');
    });

    it('should map "In Progress" to in_progress', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () =>
          JSON.stringify({
            id: '10001',
            key: 'PROJ-123',
            self: 'https://company.atlassian.net/rest/api/3/issue/10001',
            fields: {
              summary: 'Test',
              description: null,
              status: {
                name: 'In Progress',
                statusCategory: { key: 'indeterminate', name: 'In Progress' },
              },
              labels: [],
              issuetype: { name: 'Bug', id: '1' },
            },
          }),
      });

      const ticket = await provider.getTicket('PROJ-123');
      expect(ticket.state).toBe('in_progress');
    });

    it('should map "In Review" to in_progress', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () =>
          JSON.stringify({
            id: '10001',
            key: 'PROJ-123',
            self: 'https://company.atlassian.net/rest/api/3/issue/10001',
            fields: {
              summary: 'Test',
              description: null,
              status: {
                name: 'In Review',
                statusCategory: { key: 'indeterminate', name: 'In Progress' },
              },
              labels: [],
              issuetype: { name: 'Bug', id: '1' },
            },
          }),
      });

      const ticket = await provider.getTicket('PROJ-123');
      expect(ticket.state).toBe('in_progress');
    });

    it('should map "Testing" to in_progress', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () =>
          JSON.stringify({
            id: '10001',
            key: 'PROJ-123',
            self: 'https://company.atlassian.net/rest/api/3/issue/10001',
            fields: {
              summary: 'Test',
              description: null,
              status: {
                name: 'Testing',
                statusCategory: { key: 'indeterminate', name: 'In Progress' },
              },
              labels: [],
              issuetype: { name: 'Bug', id: '1' },
            },
          }),
      });

      const ticket = await provider.getTicket('PROJ-123');
      expect(ticket.state).toBe('in_progress');
    });

    it('should map "Open" to open', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () =>
          JSON.stringify({
            id: '10001',
            key: 'PROJ-123',
            self: 'https://company.atlassian.net/rest/api/3/issue/10001',
            fields: {
              summary: 'Test',
              description: null,
              status: {
                name: 'Open',
                statusCategory: { key: 'new', name: 'To Do' },
              },
              labels: [],
              issuetype: { name: 'Bug', id: '1' },
            },
          }),
      });

      const ticket = await provider.getTicket('PROJ-123');
      expect(ticket.state).toBe('open');
    });

    it('should map "To Do" to open', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () =>
          JSON.stringify({
            id: '10001',
            key: 'PROJ-123',
            self: 'https://company.atlassian.net/rest/api/3/issue/10001',
            fields: {
              summary: 'Test',
              description: null,
              status: {
                name: 'To Do',
                statusCategory: { key: 'new', name: 'To Do' },
              },
              labels: [],
              issuetype: { name: 'Bug', id: '1' },
            },
          }),
      });

      const ticket = await provider.getTicket('PROJ-123');
      expect(ticket.state).toBe('open');
    });

    it('should map unknown status to open', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () =>
          JSON.stringify({
            id: '10001',
            key: 'PROJ-123',
            self: 'https://company.atlassian.net/rest/api/3/issue/10001',
            fields: {
              summary: 'Test',
              description: null,
              status: {
                name: 'Unknown Custom Status',
                statusCategory: { key: 'new', name: 'To Do' },
              },
              labels: [],
              issuetype: { name: 'Bug', id: '1' },
            },
          }),
      });

      const ticket = await provider.getTicket('PROJ-123');
      expect(ticket.state).toBe('open');
    });
  });

  describe('adfToPlainText', () => {
    it('should extract text from simple ADF', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () =>
          JSON.stringify({
            id: '10001',
            key: 'PROJ-123',
            self: 'https://company.atlassian.net/rest/api/3/issue/10001',
            fields: {
              summary: 'Test',
              description: {
                type: 'doc',
                version: 1,
                content: [
                  {
                    type: 'paragraph',
                    content: [{ type: 'text', text: 'Hello World' }],
                  },
                ],
              },
              status: {
                name: 'Open',
                statusCategory: { key: 'new', name: 'To Do' },
              },
              labels: [],
              issuetype: { name: 'Bug', id: '1' },
            },
          }),
      });

      const ticket = await provider.getTicket('PROJ-123');
      expect(ticket.body).toBe('Hello World');
    });

    it('should handle multiple paragraphs', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () =>
          JSON.stringify({
            id: '10001',
            key: 'PROJ-123',
            self: 'https://company.atlassian.net/rest/api/3/issue/10001',
            fields: {
              summary: 'Test',
              description: {
                type: 'doc',
                version: 1,
                content: [
                  {
                    type: 'paragraph',
                    content: [{ type: 'text', text: 'First paragraph' }],
                  },
                  {
                    type: 'paragraph',
                    content: [{ type: 'text', text: 'Second paragraph' }],
                  },
                ],
              },
              status: {
                name: 'Open',
                statusCategory: { key: 'new', name: 'To Do' },
              },
              labels: [],
              issuetype: { name: 'Bug', id: '1' },
            },
          }),
      });

      const ticket = await provider.getTicket('PROJ-123');
      expect(ticket.body).toBe('First paragraph\nSecond paragraph');
    });

    it('should handle null description', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () =>
          JSON.stringify({
            id: '10001',
            key: 'PROJ-123',
            self: 'https://company.atlassian.net/rest/api/3/issue/10001',
            fields: {
              summary: 'Test',
              description: null,
              status: {
                name: 'Open',
                statusCategory: { key: 'new', name: 'To Do' },
              },
              labels: [],
              issuetype: { name: 'Bug', id: '1' },
            },
          }),
      });

      const ticket = await provider.getTicket('PROJ-123');
      expect(ticket.body).toBe('');
    });

    it('should handle nested content', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () =>
          JSON.stringify({
            id: '10001',
            key: 'PROJ-123',
            self: 'https://company.atlassian.net/rest/api/3/issue/10001',
            fields: {
              summary: 'Test',
              description: {
                type: 'doc',
                version: 1,
                content: [
                  {
                    type: 'bulletList',
                    content: [
                      {
                        type: 'listItem',
                        content: [
                          {
                            type: 'paragraph',
                            content: [{ type: 'text', text: 'Item 1' }],
                          },
                        ],
                      },
                      {
                        type: 'listItem',
                        content: [
                          {
                            type: 'paragraph',
                            content: [{ type: 'text', text: 'Item 2' }],
                          },
                        ],
                      },
                    ],
                  },
                ],
              },
              status: {
                name: 'Open',
                statusCategory: { key: 'new', name: 'To Do' },
              },
              labels: [],
              issuetype: { name: 'Bug', id: '1' },
            },
          }),
      });

      const ticket = await provider.getTicket('PROJ-123');
      expect(ticket.body).toContain('Item 1');
      expect(ticket.body).toContain('Item 2');
    });
  });

  describe('error handling', () => {
    it('should throw AuthError when auth not configured', async () => {
      delete process.env['JIRA_EMAIL'];
      delete process.env['JIRA_API_TOKEN'];

      const providerNoAuth = new JiraProvider(jiraConfig);

      await expect(providerNoAuth.getTicket('PROJ-123')).rejects.toThrow(AuthError);
      await expect(providerNoAuth.getTicket('PROJ-123')).rejects.toThrow(
        'not configured'
      );
    });

    it('should handle JSON parse errors gracefully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => {
          throw new Error('Invalid JSON');
        },
      });

      await expect(provider.getTicket('PROJ-123')).rejects.toThrow(ProviderError);
    });

    it('should include HTTP status in error message', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({
          errorMessages: ['Internal Server Error'],
          errors: {},
        }),
      });

      try {
        await provider.getTicket('PROJ-123');
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(ProviderError);
        expect((error as ProviderError).message).toContain('500');
      }
    });
  });
});
