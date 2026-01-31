/**
 * Tests for GitHubProvider
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GitHubProvider } from '../src/providers/github.js';
import { NotFoundError, AuthError, ProviderError } from '../src/providers/errors.js';
import { parseConfig } from '../src/config.js';

// Mock Octokit
vi.mock('@octokit/rest', () => ({
  Octokit: vi.fn().mockImplementation(() => ({
    issues: {
      get: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      setLabels: vi.fn(),
    },
    users: {
      getAuthenticated: vi.fn(),
    },
    search: {
      issuesAndPullRequests: vi.fn(),
    },
  })),
}));

describe('GitHubProvider', () => {
  let provider: GitHubProvider;
  const config = parseConfig();
  let originalEnv: string | undefined;

  beforeEach(() => {
    originalEnv = process.env['GITHUB_TOKEN'];
    process.env['GITHUB_TOKEN'] = 'test-token';
    provider = new GitHubProvider(config);
    provider.setRepoContext('owner', 'repo');
  });

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env['GITHUB_TOKEN'] = originalEnv;
    } else {
      delete process.env['GITHUB_TOKEN'];
    }
    vi.clearAllMocks();
  });

  describe('name', () => {
    it('should have name "github"', () => {
      expect(provider.name).toBe('github');
    });
  });

  describe('parseRef', () => {
    it('should parse #123 format', () => {
      const ref = provider.parseRef('#123');
      expect(ref).toEqual({
        provider: 'github',
        id: '123',
        raw: '#123',
      });
    });

    it('should parse owner/repo#123 format', () => {
      const ref = provider.parseRef('owner/repo#123');
      expect(ref).toEqual({
        provider: 'github',
        id: '123',
        url: 'https://github.com/owner/repo/issues/123',
        raw: 'owner/repo#123',
      });
    });

    it('should parse full GitHub URL', () => {
      const ref = provider.parseRef('https://github.com/owner/repo/issues/456');
      expect(ref).toEqual({
        provider: 'github',
        id: '456',
        url: 'https://github.com/owner/repo/issues/456',
        raw: 'https://github.com/owner/repo/issues/456',
      });
    });

    it('should return null for non-GitHub references', () => {
      expect(provider.parseRef('PROJ-123')).toBeNull();
      expect(provider.parseRef('sc-123')).toBeNull();
      expect(provider.parseRef('invalid')).toBeNull();
    });
  });

  describe('getTicketUrl', () => {
    it('should generate URL for #123 format', () => {
      const url = provider.getTicketUrl('#123');
      expect(url).toBe('https://github.com/owner/repo/issues/123');
    });

    it('should return existing URL if present', () => {
      const url = provider.getTicketUrl('https://github.com/other/project/issues/456');
      expect(url).toBe('https://github.com/other/project/issues/456');
    });

    it('should throw ProviderError for invalid ref', () => {
      expect(() => provider.getTicketUrl('invalid')).toThrow(ProviderError);
    });
  });

  describe('checkAuth', () => {
    it('should return ok: false when GITHUB_TOKEN is not set', async () => {
      delete process.env['GITHUB_TOKEN'];
      const freshProvider = new GitHubProvider(config);

      const result = await freshProvider.checkAuth();

      expect(result.ok).toBe(false);
      expect(result.message).toContain('GITHUB_TOKEN');
    });
  });

  describe('state mapping', () => {
    it('should map closed state correctly', () => {
      // Test the private mapState indirectly through mapIssueToTicket
      const issue = {
        number: 123,
        title: 'Test',
        state: 'closed',
        labels: [],
        html_url: 'https://github.com/owner/repo/issues/123',
      };

      // Access the private method for testing
      const state = (provider as any).mapState(issue);
      expect(state).toBe('closed');
    });

    it('should map open state correctly', () => {
      const issue = {
        state: 'open',
        labels: [],
      };

      const state = (provider as any).mapState(issue);
      expect(state).toBe('open');
    });

    it('should detect in_progress from labels', () => {
      const issue = {
        state: 'open',
        labels: [{ name: 'in progress' }],
      };

      const state = (provider as any).mapState(issue);
      expect(state).toBe('in_progress');
    });

    it('should detect in_progress from wip label', () => {
      const issue = {
        state: 'open',
        labels: [{ name: 'WIP' }],
      };

      const state = (provider as any).mapState(issue);
      expect(state).toBe('in_progress');
    });

    it('should detect in_progress from agent:in-progress label', () => {
      const issue = {
        state: 'open',
        labels: [{ name: 'agent:in-progress' }],
      };

      const state = (provider as any).mapState(issue);
      expect(state).toBe('in_progress');
    });
  });

  describe('error handling', () => {
    it('should throw ProviderError for invalid reference', async () => {
      await expect(provider.getTicket('invalid')).rejects.toThrow(ProviderError);
    });

    it('should throw ProviderError when repo context not set', async () => {
      const freshProvider = new GitHubProvider(config);
      // Don't set repo context

      await expect(freshProvider.getTicket('#123')).rejects.toThrow(ProviderError);
    });
  });
});
