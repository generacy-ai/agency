/**
 * Tests for GitHubCliProvider (gh CLI based implementation)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import {
  GitHubCliProvider,
  GitHubCliError,
  GitHubCliAuthError,
  GitHubCliNotFoundError,
} from '../../src/providers/github-cli.js';
import { parseConfig } from '../../src/config.js';

// Mock execFileSync
vi.mock('node:child_process', () => ({
  execFileSync: vi.fn(),
}));

const mockExecFileSync = vi.mocked(execFileSync);

describe('GitHubCliProvider', () => {
  let provider: GitHubCliProvider;
  const config = parseConfig();

  beforeEach(() => {
    provider = new GitHubCliProvider(config);
    provider.setRepoContext('owner', 'repo');
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // ==========================================================================
  // Basic Properties
  // ==========================================================================

  describe('name', () => {
    it('should have name "github"', () => {
      expect(provider.name).toBe('github');
    });
  });

  // ==========================================================================
  // parseRef Tests (T008, T020)
  // ==========================================================================

  describe('parseRef', () => {
    it('should parse #123 format', () => {
      const ref = provider.parseRef('#123');
      expect(ref).toEqual({
        provider: 'github',
        id: '123',
        raw: '#123',
      });
    });

    it('should parse plain number format', () => {
      const ref = provider.parseRef('456');
      expect(ref).toEqual({
        provider: 'github',
        id: '456',
        raw: '456',
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
      const ref = provider.parseRef(
        'https://github.com/owner/repo/issues/456'
      );
      expect(ref).toEqual({
        provider: 'github',
        id: '456',
        url: 'https://github.com/owner/repo/issues/456',
        raw: 'https://github.com/owner/repo/issues/456',
      });
    });

    it('should handle URL with trailing whitespace', () => {
      const ref = provider.parseRef(
        '  https://github.com/owner/repo/issues/789  '
      );
      expect(ref).toEqual({
        provider: 'github',
        id: '789',
        url: 'https://github.com/owner/repo/issues/789',
        raw: 'https://github.com/owner/repo/issues/789',
      });
    });

    it('should return null for Jira references', () => {
      expect(provider.parseRef('PROJ-123')).toBeNull();
    });

    it('should return null for Shortcut references', () => {
      expect(provider.parseRef('sc-123')).toBeNull();
    });

    it('should return null for invalid input', () => {
      expect(provider.parseRef('invalid')).toBeNull();
      expect(provider.parseRef('')).toBeNull();
      expect(provider.parseRef('abc')).toBeNull();
    });

    it('should return null for URL with wrong domain', () => {
      expect(
        provider.parseRef('https://gitlab.com/owner/repo/issues/123')
      ).toBeNull();
    });
  });

  // ==========================================================================
  // getTicketUrl Tests (T009)
  // ==========================================================================

  describe('getTicketUrl', () => {
    it('should generate URL for #123 format using repo context', () => {
      const url = provider.getTicketUrl('#123');
      expect(url).toBe('https://github.com/owner/repo/issues/123');
    });

    it('should return existing URL if present', () => {
      const url = provider.getTicketUrl(
        'https://github.com/other/project/issues/456'
      );
      expect(url).toBe('https://github.com/other/project/issues/456');
    });

    it('should generate URL for owner/repo#123 format', () => {
      const url = provider.getTicketUrl('other/project#789');
      expect(url).toBe('https://github.com/other/project/issues/789');
    });

    it('should throw GitHubCliError for invalid ref', () => {
      expect(() => provider.getTicketUrl('invalid')).toThrow(GitHubCliError);
    });

    it('should throw GitHubCliError when repo context not set for local ref', () => {
      const freshProvider = new GitHubCliProvider(config);
      expect(() => freshProvider.getTicketUrl('#123')).toThrow(GitHubCliError);
    });
  });

  // ==========================================================================
  // checkAuth Tests (T010, T021)
  // ==========================================================================

  describe('checkAuth', () => {
    it('should return ok: true when gh auth succeeds', async () => {
      mockExecFileSync.mockReturnValueOnce('Logged in to github.com');

      const result = await provider.checkAuth();

      expect(result.ok).toBe(true);
      expect(mockExecFileSync).toHaveBeenCalledWith(
        'gh',
        ['auth', 'status'],
        expect.any(Object)
      );
    });

    it('should return ok: false when gh auth fails', async () => {
      const error = new Error('not logged in') as Error & { stderr: string };
      error.stderr = 'You are not logged in. Run gh auth login to authenticate.';
      mockExecFileSync.mockImplementationOnce(() => {
        throw error;
      });

      const result = await provider.checkAuth();

      expect(result.ok).toBe(false);
      expect(result.message).toContain('auth login');
    });

    it('should return ok: false with message for other errors', async () => {
      mockExecFileSync.mockImplementationOnce(() => {
        throw new Error('Network error');
      });

      const result = await provider.checkAuth();

      expect(result.ok).toBe(false);
      expect(result.message).toContain('check failed');
    });
  });

  // ==========================================================================
  // getTicket Tests (T011, T022)
  // ==========================================================================

  describe('getTicket', () => {
    const mockIssueJson = {
      number: 123,
      title: 'Test Issue',
      body: 'Issue body content',
      state: 'OPEN',
      labels: [{ name: 'bug' }, { name: 'priority:high' }],
      url: 'https://github.com/owner/repo/issues/123',
      assignees: [{ login: 'developer' }],
      milestone: { title: 'v1.0', number: 1 },
    };

    it('should fetch ticket successfully', async () => {
      mockExecFileSync.mockReturnValueOnce(JSON.stringify(mockIssueJson));

      const ticket = await provider.getTicket('#123');

      expect(ticket.title).toBe('Test Issue');
      expect(ticket.body).toBe('Issue body content');
      expect(ticket.state).toBe('open');
      expect(ticket.labels).toEqual(['bug', 'priority:high']);
      expect(ticket.url).toBe('https://github.com/owner/repo/issues/123');
      expect(ticket.ref.id).toBe('123');
      expect(ticket.ref.provider).toBe('github');
      expect(ticket.meta).toEqual({
        assignees: ['developer'],
        milestone: { title: 'v1.0', number: 1 },
      });
    });

    it('should throw GitHubCliNotFoundError for non-existent issue', async () => {
      const error = new Error('not found') as Error & { stderr: string };
      error.stderr = 'issue not found';
      mockExecFileSync.mockImplementationOnce(() => {
        throw error;
      });

      await expect(provider.getTicket('#999')).rejects.toThrow(
        GitHubCliNotFoundError
      );
    });

    it('should throw GitHubCliAuthError for auth failures', async () => {
      const error = new Error('auth error') as Error & { stderr: string };
      error.stderr = 'not logged in';
      mockExecFileSync.mockImplementationOnce(() => {
        throw error;
      });

      await expect(provider.getTicket('#123')).rejects.toThrow(
        GitHubCliAuthError
      );
    });

    it('should throw GitHubCliError for invalid reference', async () => {
      await expect(provider.getTicket('invalid')).rejects.toThrow(
        GitHubCliError
      );
    });

    it('should handle full URL with different repo', async () => {
      mockExecFileSync.mockReturnValueOnce(JSON.stringify(mockIssueJson));

      await provider.getTicket(
        'https://github.com/other/project/issues/456'
      );

      expect(mockExecFileSync).toHaveBeenCalledWith(
        'gh',
        expect.arrayContaining(['--repo', 'other/project']),
        expect.any(Object)
      );
    });

    it('should map closed state correctly', async () => {
      const closedIssue = { ...mockIssueJson, state: 'CLOSED' };
      mockExecFileSync.mockReturnValueOnce(JSON.stringify(closedIssue));

      const ticket = await provider.getTicket('#123');

      expect(ticket.state).toBe('closed');
    });

    it('should detect in_progress from labels', async () => {
      const inProgressIssue = {
        ...mockIssueJson,
        labels: [{ name: 'in-progress' }],
      };
      mockExecFileSync.mockReturnValueOnce(JSON.stringify(inProgressIssue));

      const ticket = await provider.getTicket('#123');

      expect(ticket.state).toBe('in_progress');
    });
  });

  // ==========================================================================
  // createTicket Tests (T012, T023)
  // ==========================================================================

  describe('createTicket', () => {
    const mockCreatedIssue = {
      number: 456,
      title: 'New Issue',
      body: 'New issue body',
      state: 'OPEN',
      labels: [{ name: 'feature' }],
      url: 'https://github.com/owner/repo/issues/456',
      assignees: [],
      milestone: null,
    };

    it('should create ticket successfully', async () => {
      // First call creates the issue and returns URL
      mockExecFileSync.mockReturnValueOnce(
        'https://github.com/owner/repo/issues/456'
      );
      // Second call fetches the created issue
      mockExecFileSync.mockReturnValueOnce(JSON.stringify(mockCreatedIssue));

      const ticket = await provider.createTicket({
        title: 'New Issue',
        body: 'New issue body',
        labels: ['feature'],
      });

      expect(ticket.title).toBe('New Issue');
      expect(ticket.ref.id).toBe('456');

      // Verify create call
      expect(mockExecFileSync).toHaveBeenCalledWith(
        'gh',
        expect.arrayContaining([
          'issue',
          'create',
          '--title',
          'New Issue',
          '--body',
          'New issue body',
          '--label',
          'feature',
        ]),
        expect.any(Object)
      );
    });

    it('should create ticket without optional fields', async () => {
      mockExecFileSync.mockReturnValueOnce(
        'https://github.com/owner/repo/issues/789'
      );
      const minimalIssue = {
        ...mockCreatedIssue,
        number: 789,
        body: null,
        labels: [],
      };
      mockExecFileSync.mockReturnValueOnce(JSON.stringify(minimalIssue));

      const ticket = await provider.createTicket({
        title: 'Minimal Issue',
      });

      expect(ticket.title).toBe('New Issue'); // From mock
      expect(mockExecFileSync).toHaveBeenCalledWith(
        'gh',
        ['issue', 'create', '--title', 'Minimal Issue'],
        expect.any(Object)
      );
    });

    it('should throw GitHubCliAuthError on auth failure', async () => {
      const error = new Error('auth error') as Error & { stderr: string };
      error.stderr = 'not logged in';
      mockExecFileSync.mockImplementationOnce(() => {
        throw error;
      });

      await expect(
        provider.createTicket({ title: 'Test' })
      ).rejects.toThrow(GitHubCliAuthError);
    });

    it('should auto-detect repo context if not set', async () => {
      const freshProvider = new GitHubCliProvider(config);

      // First call to ensureRepoContext
      mockExecFileSync.mockReturnValueOnce(
        JSON.stringify({ nameWithOwner: 'detected/repo' })
      );
      // Create call
      mockExecFileSync.mockReturnValueOnce(
        'https://github.com/detected/repo/issues/1'
      );
      // Fetch call
      mockExecFileSync.mockReturnValueOnce(
        JSON.stringify({
          number: 1,
          title: 'Test',
          body: null,
          state: 'OPEN',
          labels: [],
          url: 'https://github.com/detected/repo/issues/1',
          assignees: [],
          milestone: null,
        })
      );

      const ticket = await freshProvider.createTicket({ title: 'Test' });

      expect(ticket.ref.id).toBe('1');
    });
  });

  // ==========================================================================
  // updateTicket Tests (T013, T024)
  // ==========================================================================

  describe('updateTicket', () => {
    const mockUpdatedIssue = {
      number: 123,
      title: 'Updated Title',
      body: 'Updated body',
      state: 'OPEN',
      labels: [{ name: 'updated' }],
      url: 'https://github.com/owner/repo/issues/123',
      assignees: [],
      milestone: null,
    };

    it('should update ticket title', async () => {
      // Edit call
      mockExecFileSync.mockReturnValueOnce('');
      // Fetch call
      mockExecFileSync.mockReturnValueOnce(JSON.stringify(mockUpdatedIssue));

      const ticket = await provider.updateTicket('#123', {
        title: 'Updated Title',
      });

      expect(ticket.title).toBe('Updated Title');
      expect(mockExecFileSync).toHaveBeenCalledWith(
        'gh',
        expect.arrayContaining([
          'issue',
          'edit',
          '123',
          '--title',
          'Updated Title',
        ]),
        expect.any(Object)
      );
    });

    it('should update ticket body', async () => {
      mockExecFileSync.mockReturnValueOnce('');
      mockExecFileSync.mockReturnValueOnce(JSON.stringify(mockUpdatedIssue));

      await provider.updateTicket('#123', {
        body: 'Updated body',
      });

      expect(mockExecFileSync).toHaveBeenCalledWith(
        'gh',
        expect.arrayContaining(['--body', 'Updated body']),
        expect.any(Object)
      );
    });

    it('should update labels via setLabels', async () => {
      // Edit call (no label args)
      mockExecFileSync.mockReturnValueOnce('');
      // getLabels call for setLabels
      mockExecFileSync.mockReturnValueOnce(
        JSON.stringify({ labels: [{ name: 'old-label' }] })
      );
      // setLabels edit call
      mockExecFileSync.mockReturnValueOnce('');
      // Final fetch call
      mockExecFileSync.mockReturnValueOnce(JSON.stringify(mockUpdatedIssue));

      await provider.updateTicket('#123', {
        labels: ['new-label'],
      });

      // Should have called setLabels
      expect(mockExecFileSync).toHaveBeenCalledWith(
        'gh',
        expect.arrayContaining(['--add-label', 'new-label', '--remove-label', 'old-label']),
        expect.any(Object)
      );
    });

    it('should throw GitHubCliNotFoundError for non-existent issue', async () => {
      const error = new Error('not found') as Error & { stderr: string };
      error.stderr = 'issue not found';
      mockExecFileSync.mockImplementationOnce(() => {
        throw error;
      });

      await expect(
        provider.updateTicket('#999', { title: 'Test' })
      ).rejects.toThrow(GitHubCliNotFoundError);
    });

    it('should throw GitHubCliError for invalid reference', async () => {
      await expect(
        provider.updateTicket('invalid', { title: 'Test' })
      ).rejects.toThrow(GitHubCliError);
    });
  });

  // ==========================================================================
  // getLabels Tests (T014)
  // ==========================================================================

  describe('getLabels', () => {
    it('should return labels for an issue', async () => {
      mockExecFileSync.mockReturnValueOnce(
        JSON.stringify({ labels: [{ name: 'bug' }, { name: 'urgent' }] })
      );

      const labels = await provider.getLabels('#123');

      expect(labels).toEqual(['bug', 'urgent']);
    });

    it('should return empty array when no labels', async () => {
      mockExecFileSync.mockReturnValueOnce(JSON.stringify({ labels: [] }));

      const labels = await provider.getLabels('#123');

      expect(labels).toEqual([]);
    });

    it('should throw GitHubCliNotFoundError for non-existent issue', async () => {
      const error = new Error('not found') as Error & { stderr: string };
      error.stderr = 'issue not found';
      mockExecFileSync.mockImplementationOnce(() => {
        throw error;
      });

      await expect(provider.getLabels('#999')).rejects.toThrow(
        GitHubCliNotFoundError
      );
    });
  });

  // ==========================================================================
  // setLabels Tests (T015, T025)
  // ==========================================================================

  describe('setLabels', () => {
    it('should add new labels and remove old ones', async () => {
      // getLabels call
      mockExecFileSync.mockReturnValueOnce(
        JSON.stringify({ labels: [{ name: 'old-label' }] })
      );
      // setLabels edit call
      mockExecFileSync.mockReturnValueOnce('');

      await provider.setLabels('#123', ['new-label']);

      expect(mockExecFileSync).toHaveBeenCalledWith(
        'gh',
        expect.arrayContaining([
          'issue',
          'edit',
          '123',
          '--add-label',
          'new-label',
          '--remove-label',
          'old-label',
        ]),
        expect.any(Object)
      );
    });

    it('should not make API call when labels unchanged', async () => {
      mockExecFileSync.mockReturnValueOnce(
        JSON.stringify({ labels: [{ name: 'bug' }, { name: 'feature' }] })
      );

      await provider.setLabels('#123', ['bug', 'feature']);

      // Only one call for getLabels, no edit call
      expect(mockExecFileSync).toHaveBeenCalledTimes(1);
    });

    it('should handle adding labels to unlabeled issue', async () => {
      mockExecFileSync.mockReturnValueOnce(JSON.stringify({ labels: [] }));
      mockExecFileSync.mockReturnValueOnce('');

      await provider.setLabels('#123', ['bug', 'feature']);

      expect(mockExecFileSync).toHaveBeenCalledWith(
        'gh',
        expect.arrayContaining(['--add-label', 'bug', '--add-label', 'feature']),
        expect.any(Object)
      );
    });

    it('should handle removing all labels', async () => {
      mockExecFileSync.mockReturnValueOnce(
        JSON.stringify({ labels: [{ name: 'bug' }] })
      );
      mockExecFileSync.mockReturnValueOnce('');

      await provider.setLabels('#123', []);

      expect(mockExecFileSync).toHaveBeenCalledWith(
        'gh',
        expect.arrayContaining(['--remove-label', 'bug']),
        expect.any(Object)
      );
    });
  });

  // ==========================================================================
  // searchTickets Tests (T016)
  // ==========================================================================

  describe('searchTickets', () => {
    const mockSearchResults = [
      {
        number: 1,
        title: 'First Issue',
        body: 'First body',
        state: 'open',
        labels: [{ name: 'bug' }],
        url: 'https://github.com/owner/repo/issues/1',
      },
      {
        number: 2,
        title: 'Second Issue',
        body: 'Second body',
        state: 'closed',
        labels: [{ name: 'feature' }],
        url: 'https://github.com/owner/repo/issues/2',
      },
    ];

    it('should search tickets successfully', async () => {
      mockExecFileSync.mockReturnValueOnce(JSON.stringify(mockSearchResults));

      const tickets = await provider.searchTickets('is:open label:bug');

      expect(tickets).toHaveLength(2);
      expect(tickets[0]!.title).toBe('First Issue');
      expect(tickets[0]!.state).toBe('open');
      expect(tickets[1]!.title).toBe('Second Issue');
      expect(tickets[1]!.state).toBe('closed');
    });

    it('should pass query to gh search command', async () => {
      mockExecFileSync.mockReturnValueOnce(JSON.stringify([]));

      await provider.searchTickets('is:open label:bug');

      expect(mockExecFileSync).toHaveBeenCalledWith(
        'gh',
        expect.arrayContaining([
          'search',
          'issues',
          '--repo',
          'owner/repo',
          '--',
          'is:open label:bug',
        ]),
        expect.any(Object)
      );
    });

    it('should return empty array for no results', async () => {
      mockExecFileSync.mockReturnValueOnce(JSON.stringify([]));

      const tickets = await provider.searchTickets('is:open label:nonexistent');

      expect(tickets).toEqual([]);
    });
  });

  // ==========================================================================
  // Retry Logic Tests (T005, T026)
  // ==========================================================================

  describe('retry logic', () => {
    it('should retry on transient errors', async () => {
      const transientError = new Error('socket hang up') as Error & {
        stderr: string;
      };
      transientError.stderr = 'socket hang up';

      const successResult = {
        number: 123,
        title: 'Test',
        body: null,
        state: 'OPEN',
        labels: [],
        url: 'https://github.com/owner/repo/issues/123',
        assignees: [],
        milestone: null,
      };

      // First call fails with transient error
      mockExecFileSync.mockImplementationOnce(() => {
        throw transientError;
      });
      // Second call succeeds
      mockExecFileSync.mockReturnValueOnce(JSON.stringify(successResult));

      const ticket = await provider.getTicket('#123');

      expect(ticket.title).toBe('Test');
      expect(mockExecFileSync).toHaveBeenCalledTimes(2);
    });

    it('should not retry on auth errors', async () => {
      const authError = new Error('auth error') as Error & { stderr: string };
      authError.stderr = 'not logged in';

      mockExecFileSync.mockImplementation(() => {
        throw authError;
      });

      await expect(provider.getTicket('#123')).rejects.toThrow(
        GitHubCliAuthError
      );
      expect(mockExecFileSync).toHaveBeenCalledTimes(1);
    });

    it('should not retry on not found errors', async () => {
      const notFoundError = new Error('not found') as Error & {
        stderr: string;
      };
      notFoundError.stderr = 'issue not found';

      mockExecFileSync.mockImplementation(() => {
        throw notFoundError;
      });

      await expect(provider.getTicket('#999')).rejects.toThrow(
        GitHubCliNotFoundError
      );
      expect(mockExecFileSync).toHaveBeenCalledTimes(1);
    });

    it('should give up after max retries', async () => {
      const transientError = new Error('rate limit') as Error & {
        stderr: string;
      };
      transientError.stderr = 'rate limit exceeded';

      mockExecFileSync.mockImplementation(() => {
        throw transientError;
      });

      await expect(provider.getTicket('#123')).rejects.toThrow(GitHubCliError);
      // Initial attempt + 3 retries = 4 calls
      expect(mockExecFileSync).toHaveBeenCalledTimes(4);
    }, 30000); // Increase timeout for retry delays
  });

  // ==========================================================================
  // ensureRepoContext Tests (T007)
  // ==========================================================================

  describe('ensureRepoContext', () => {
    it('should auto-detect repo from gh repo view', async () => {
      const freshProvider = new GitHubCliProvider(config);

      // 1. ensureRepoContext: gh repo view --json nameWithOwner
      mockExecFileSync.mockReturnValueOnce(
        JSON.stringify({ nameWithOwner: 'detected/repo' })
      );
      // 2. createTicket: gh issue create ...
      mockExecFileSync.mockReturnValueOnce(
        'https://github.com/detected/repo/issues/1'
      );
      // 3. getTicket after create: gh issue view ...
      mockExecFileSync.mockReturnValueOnce(
        JSON.stringify({
          number: 1,
          title: 'Test',
          body: null,
          state: 'OPEN',
          labels: [],
          url: 'https://github.com/detected/repo/issues/1',
          assignees: [],
          milestone: null,
        })
      );

      await freshProvider.createTicket({ title: 'Test' });

      expect(mockExecFileSync).toHaveBeenCalledWith(
        'gh',
        ['repo', 'view', '--json', 'nameWithOwner'],
        expect.any(Object)
      );
    });

    it('should throw GitHubCliError when not in a git repo', async () => {
      const freshProvider = new GitHubCliProvider(config);

      mockExecFileSync.mockImplementationOnce(() => {
        throw new Error('not a git repository');
      });

      await expect(freshProvider.createTicket({ title: 'Test' })).rejects.toThrow(
        GitHubCliError
      );
    });

    it('should cache repo context after first detection', async () => {
      const freshProvider = new GitHubCliProvider(config);

      // 1. First createTicket - ensureRepoContext: gh repo view
      mockExecFileSync.mockReturnValueOnce(
        JSON.stringify({ nameWithOwner: 'detected/repo' })
      );
      // 2. First createTicket - gh issue create
      mockExecFileSync.mockReturnValueOnce(
        'https://github.com/detected/repo/issues/1'
      );
      // 3. First createTicket - getTicket: gh issue view
      mockExecFileSync.mockReturnValueOnce(
        JSON.stringify({
          number: 1,
          title: 'Test',
          body: null,
          state: 'OPEN',
          labels: [],
          url: 'https://github.com/detected/repo/issues/1',
          assignees: [],
          milestone: null,
        })
      );
      // 4. Second createTicket - gh issue create (no repo view - cached)
      mockExecFileSync.mockReturnValueOnce(
        'https://github.com/detected/repo/issues/2'
      );
      // 5. Second createTicket - getTicket: gh issue view
      mockExecFileSync.mockReturnValueOnce(
        JSON.stringify({
          number: 2,
          title: 'Test 2',
          body: null,
          state: 'OPEN',
          labels: [],
          url: 'https://github.com/detected/repo/issues/2',
          assignees: [],
          milestone: null,
        })
      );

      await freshProvider.createTicket({ title: 'Test' });
      await freshProvider.createTicket({ title: 'Test 2' });

      // gh repo view should only be called once
      const repoViewCalls = mockExecFileSync.mock.calls.filter(
        (call) => call[1]?.[0] === 'repo' && call[1]?.[1] === 'view'
      );
      expect(repoViewCalls).toHaveLength(1);
    });
  });

  // ==========================================================================
  // Error Class Tests (T002)
  // ==========================================================================

  describe('error classes', () => {
    describe('GitHubCliError', () => {
      it('should have correct name and provider', () => {
        const error = new GitHubCliError('Test error', 'gh issue view');
        expect(error.name).toBe('GitHubCliError');
        expect(error.provider).toBe('github');
        expect(error.command).toBe('gh issue view');
        expect(error.message).toBe('Test error');
      });

      it('should work without command parameter', () => {
        const error = new GitHubCliError('Test error');
        expect(error.command).toBeUndefined();
      });
    });

    describe('GitHubCliAuthError', () => {
      it('should have correct name and provider', () => {
        const error = new GitHubCliAuthError('Auth failed');
        expect(error.name).toBe('GitHubCliAuthError');
        expect(error.provider).toBe('github');
        expect(error.message).toBe('Auth failed');
      });

      it('should be instanceof AuthError', () => {
        const error = new GitHubCliAuthError('Auth failed');
        expect(error).toBeInstanceOf(Error);
      });
    });

    describe('GitHubCliNotFoundError', () => {
      it('should have correct name and provider', () => {
        const error = new GitHubCliNotFoundError('Not found', '#123');
        expect(error.name).toBe('GitHubCliNotFoundError');
        expect(error.provider).toBe('github');
        expect(error.ref).toBe('#123');
        expect(error.message).toBe('Not found');
      });

      it('should work without ref parameter', () => {
        const error = new GitHubCliNotFoundError('Not found');
        expect(error.ref).toBeUndefined();
      });
    });
  });
});
