/**
 * Jira E2E Integration Tests
 *
 * End-to-end tests for the complete spec-kit workflow using the Jira provider.
 * Tests validate Jira-specific behaviors including:
 * - Issue key parsing (PROJ-123 format)
 * - URL parsing (atlassian.net/browse/...)
 * - Status normalization (Done→closed, In Progress→in_progress, Open→open)
 * - ADF (Atlassian Document Format) conversion
 * - Issue type handling (default: Story)
 * - Error handling (401, 403, 404, 429)
 *
 * Test modes:
 * - Primary: Uses mocked fetch responses (default, runs in CI)
 * - Optional: Uses real Jira API when TEST_REAL_JIRA=true
 *
 * @see packages/agency-plugin-spec-kit/src/providers/jira.ts
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { JiraProvider } from '../../src/providers/jira.js';
import { NotFoundError, AuthError, ProviderError } from '../../src/providers/errors.js';
import {
  createMockJiraIssue,
  createMockAdf,
  createMockJiraUser,
  createMockIssueCreated,
  createTestJiraConfig,
  STATUS_MAPPINGS,
  skipIfNoJiraCredentials,
  shouldSkipRealJiraTest,
} from './test-utils.js';

// =============================================================================
// Test Infrastructure
// =============================================================================

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

describe('Jira E2E Integration Tests', () => {
  let provider: JiraProvider;
  let originalEmail: string | undefined;
  let originalToken: string | undefined;

  const config = createTestJiraConfig();

  /**
   * Set up test environment before each test.
   * Saves and sets environment variables, initializes provider.
   */
  beforeEach(() => {
    // Save original env vars
    originalEmail = process.env['JIRA_EMAIL'];
    originalToken = process.env['JIRA_API_TOKEN'];

    // Set test credentials
    process.env['JIRA_EMAIL'] = 'test@example.com';
    process.env['JIRA_API_TOKEN'] = 'test-api-token';

    // Create provider
    provider = new JiraProvider(config);

    // Reset mock
    mockFetch.mockReset();
  });

  /**
   * Clean up after each test.
   * Restores original environment variables.
   */
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

  // ===========================================================================
  // Phase 2: Core Ticket Operations (get_ticket)
  // ===========================================================================

  describe('get_ticket', () => {
    /**
     * T010: Validates PROJ-N reference parsing
     * Test that get_ticket correctly fetches a Jira issue using the PROJ-123 key format.
     */
    it('fetches Jira issue by key (PROJ-123 format)', async () => {
      const mockIssue = createMockJiraIssue({
        key: 'PROJ-123',
        fields: {
          summary: 'Test Feature Implementation',
          description: createMockAdf('This is a test issue for E2E testing.'),
          status: { name: 'Open', statusCategory: { key: 'new', name: 'To Do' } },
          labels: ['test', 'e2e'],
          issuetype: { name: 'Story', id: '1' },
          priority: { name: 'Medium', id: '3' },
          assignee: { displayName: 'Test User', accountId: '12345' },
        },
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify(mockIssue),
      });

      const ticket = await provider.getTicket('PROJ-123');

      // Verify ticket structure
      expect(ticket.ref.id).toBe('PROJ-123');
      expect(ticket.ref.provider).toBe('jira');
      expect(ticket.title).toBe('Test Feature Implementation');
      expect(ticket.body).toBe('This is a test issue for E2E testing.');
      expect(ticket.state).toBe('open');
      expect(ticket.labels).toEqual(['test', 'e2e']);
      expect(ticket.url).toBe('https://company.atlassian.net/browse/PROJ-123');

      // Verify API call
      expect(mockFetch).toHaveBeenCalledWith(
        'https://company.atlassian.net/rest/api/3/issue/PROJ-123',
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: expect.stringMatching(/^Basic /),
            'Content-Type': 'application/json',
          }),
        })
      );
    });

    /**
     * T011: Validates full URL parsing with provider detection
     * Test that get_ticket correctly parses and fetches from a full Jira URL.
     */
    it('parses Jira URL correctly', async () => {
      const mockIssue = createMockJiraIssue({
        key: 'PROJ-456',
        fields: {
          summary: 'Issue from URL',
          description: null,
          status: { name: 'To Do', statusCategory: { key: 'new', name: 'To Do' } },
          labels: [],
          issuetype: { name: 'Bug', id: '2' },
        },
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify(mockIssue),
      });

      const ticket = await provider.getTicket(
        'https://company.atlassian.net/browse/PROJ-456'
      );

      expect(ticket.ref.id).toBe('PROJ-456');
      expect(ticket.ref.provider).toBe('jira');
      expect(ticket.ref.url).toBe('https://company.atlassian.net/browse/PROJ-456');
      expect(ticket.title).toBe('Issue from URL');
    });

    /**
     * T012: Validates issueType, priority, assignee, jiraStatus extraction
     * Test that Jira-specific metadata is correctly extracted from the issue.
     */
    it('extracts Jira metadata correctly', async () => {
      const mockIssue = createMockJiraIssue({
        key: 'PROJ-789',
        fields: {
          summary: 'Issue with Metadata',
          description: null,
          status: {
            name: 'In Review',
            statusCategory: { key: 'indeterminate', name: 'In Progress' },
          },
          labels: ['backend'],
          issuetype: { name: 'Bug', id: '2' },
          priority: { name: 'High', id: '2' },
          assignee: { displayName: 'Jane Developer', accountId: '67890' },
        },
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify(mockIssue),
      });

      const ticket = await provider.getTicket('PROJ-789');

      // Verify Jira-specific metadata
      expect(ticket.meta).toEqual({
        issueType: 'Bug',
        priority: 'High',
        assignee: 'Jane Developer',
        jiraStatus: 'In Review',
      });
    });

    /**
     * T013: Validates status normalization
     * Test that various Jira statuses are correctly mapped to normalized states.
     *
     * Jira-Specific Status Normalization:
     * - Done/Closed/Resolved → 'closed'
     * - In Progress/Review/Testing → 'in_progress'
     * - Open/To Do → 'open'
     * - Unknown statuses default to 'open'
     */
    it('maps Jira status to normalized state', async () => {
      // Test each status mapping
      for (const mapping of STATUS_MAPPINGS) {
        mockFetch.mockReset();

        const mockIssue = createMockJiraIssue({
          key: 'PROJ-100',
          fields: {
            summary: `Issue with status: ${mapping.jiraStatus}`,
            description: null,
            status: {
              name: mapping.jiraStatus,
              statusCategory: mapping.statusCategory,
            },
            labels: [],
            issuetype: { name: 'Task', id: '3' },
          },
        });

        mockFetch.mockResolvedValueOnce({
          ok: true,
          text: async () => JSON.stringify(mockIssue),
        });

        const ticket = await provider.getTicket('PROJ-100');

        expect(ticket.state).toBe(mapping.expectedState);
        expect(ticket.meta?.jiraStatus).toBe(mapping.jiraStatus);
      }
    });
  });

  // ===========================================================================
  // Phase 3: Ticket Creation (create_ticket)
  // ===========================================================================

  describe('create_ticket', () => {
    /**
     * T020: Validates POST to /rest/api/3/issue
     * Test that create_ticket correctly creates a new Jira issue.
     */
    it('creates Jira issue', async () => {
      // First call: create issue
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify(createMockIssueCreated('PROJ-200')),
      });

      // Second call: fetch created issue
      const createdIssue = createMockJiraIssue({
        key: 'PROJ-200',
        fields: {
          summary: 'New Feature Request',
          description: createMockAdf('This is a new feature request.'),
          status: { name: 'Open', statusCategory: { key: 'new', name: 'To Do' } },
          labels: ['feature', 'api'],
          issuetype: { name: 'Story', id: '1' },
        },
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify(createdIssue),
      });

      const ticket = await provider.createTicket({
        title: 'New Feature Request',
        body: 'This is a new feature request.',
        labels: ['feature', 'api'],
      });

      expect(ticket.ref.id).toBe('PROJ-200');
      expect(ticket.title).toBe('New Feature Request');

      // Verify the create API call
      const createCall = mockFetch.mock.calls[0];
      expect(createCall[0]).toBe('https://company.atlassian.net/rest/api/3/issue');
      expect(createCall[1].method).toBe('POST');

      const body = JSON.parse(createCall[1].body);
      expect(body.fields.summary).toBe('New Feature Request');
      expect(body.fields.project.key).toBe('PROJ');
    });

    /**
     * T021: Validates default issue type handling
     * Test that create_ticket uses 'Story' as the default issue type.
     */
    it('uses Story issue type by default', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify(createMockIssueCreated('PROJ-201')),
      });

      const fetchedIssue = createMockJiraIssue({
        key: 'PROJ-201',
        fields: {
          summary: 'Default Type Issue',
          description: null,
          status: { name: 'Open', statusCategory: { key: 'new', name: 'To Do' } },
          labels: [],
          issuetype: { name: 'Story', id: '1' },
        },
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify(fetchedIssue),
      });

      await provider.createTicket({ title: 'Default Type Issue' });

      // Verify the issue type in the request
      const createCall = mockFetch.mock.calls[0];
      const body = JSON.parse(createCall[1].body);
      expect(body.fields.issuetype.name).toBe('Story');
    });

    /**
     * T022: Validates markdown to ADF conversion
     * Test that the body content is converted to ADF format.
     */
    it('converts body to ADF format', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify(createMockIssueCreated('PROJ-202')),
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () =>
          JSON.stringify(
            createMockJiraIssue({
              key: 'PROJ-202',
              fields: {
                summary: 'Issue with ADF',
                description: createMockAdf('First paragraph\n\nSecond paragraph'),
                status: { name: 'Open', statusCategory: { key: 'new', name: 'To Do' } },
                labels: [],
                issuetype: { name: 'Story', id: '1' },
              },
            })
          ),
      });

      await provider.createTicket({
        title: 'Issue with ADF',
        body: 'First paragraph\n\nSecond paragraph',
      });

      // Verify the description is in ADF format
      const createCall = mockFetch.mock.calls[0];
      const body = JSON.parse(createCall[1].body);

      expect(body.fields.description).toBeDefined();
      expect(body.fields.description.type).toBe('doc');
      expect(body.fields.description.version).toBe(1);
      expect(body.fields.description.content).toBeInstanceOf(Array);
      expect(body.fields.description.content.length).toBeGreaterThan(0);
    });
  });

  // ===========================================================================
  // Phase 4: Feature Creation (create_feature)
  // ===========================================================================

  describe('create_feature', () => {
    /**
     * T030: Validates spec directory creation from Jira issue
     * Note: This test validates the provider interaction, not the full
     * create_feature tool which requires git operations.
     */
    it('provides ticket data for feature initialization', async () => {
      const mockIssue = createMockJiraIssue({
        key: 'PROJ-300',
        fields: {
          summary: 'Feature for New Module',
          description: createMockAdf(
            '## Description\n\nThis feature adds a new module.\n\n## Acceptance Criteria\n- AC1\n- AC2'
          ),
          status: { name: 'Open', statusCategory: { key: 'new', name: 'To Do' } },
          labels: ['feature', 'module'],
          issuetype: { name: 'Story', id: '1' },
        },
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify(mockIssue),
      });

      const ticket = await provider.getTicket('PROJ-300');

      // Verify the ticket contains all data needed for feature creation
      expect(ticket.title).toBe('Feature for New Module');
      expect(ticket.body).toContain('This feature adds a new module');
      expect(ticket.labels).toEqual(['feature', 'module']);
      expect(ticket.ref.id).toBe('PROJ-300');

      // The create_feature tool would use this ticket data to:
      // 1. Generate branch name from ticket.ref.id and ticket.title
      // 2. Create spec.md with ticket.title as header and ticket.body as description
      // 3. Include ticket.labels in the spec metadata
    });
  });

  // ===========================================================================
  // Phase 5: Error Handling
  // ===========================================================================

  describe('error handling', () => {
    /**
     * T040: Validates key format validation
     * Test that invalid Jira key formats are rejected.
     */
    it('handles invalid Jira key format', async () => {
      // Invalid formats that should be rejected
      const invalidRefs = [
        'invalid',
        'proj-123', // lowercase
        'PROJ123', // no hyphen
        '123-PROJ', // reversed
        'OTHER-123', // wrong project key
      ];

      for (const ref of invalidRefs) {
        await expect(provider.getTicket(ref)).rejects.toThrow(ProviderError);
      }
    });

    /**
     * T041: Validates auth error handling (401)
     * Test that authentication failures are handled correctly.
     */
    it('handles authentication failure (401)', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({
          errorMessages: ['Authentication failed'],
          errors: {},
        }),
      });

      await expect(provider.getTicket('PROJ-123')).rejects.toThrow(AuthError);
      await expect(provider.getTicket('PROJ-123')).rejects.toThrow(
        /authentication failed/i
      );
    });

    /**
     * T042: Validates missing issue handling (404)
     * Test that not found errors are handled correctly.
     */
    it('handles not found (404)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => ({
          errorMessages: ['Issue does not exist or you do not have permission to see it.'],
          errors: {},
        }),
      });

      await expect(provider.getTicket('PROJ-999')).rejects.toThrow(NotFoundError);
    });

    /**
     * T043: Validates permission error handling (403)
     * Test that permission denied errors are handled correctly.
     */
    it('handles permission denied (403)', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 403,
        json: async () => ({
          errorMessages: ['You do not have permission to view this issue'],
          errors: {},
        }),
      });

      await expect(provider.getTicket('PROJ-123')).rejects.toThrow(AuthError);
      await expect(provider.getTicket('PROJ-123')).rejects.toThrow(/access denied/i);
    });

    /**
     * T044: Validates rate limit handling (429)
     * Test that rate limiting errors are handled correctly.
     */
    it('handles rate limiting (429)', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 429,
        json: async () => ({
          errorMessages: ['Rate limit exceeded. Please retry after a short wait.'],
          errors: {},
        }),
      });

      await expect(provider.getTicket('PROJ-123')).rejects.toThrow(ProviderError);
      await expect(provider.getTicket('PROJ-123')).rejects.toThrow(/429/);
    });

    /**
     * Additional error handling: auth not configured
     */
    it('handles auth not configured', async () => {
      delete process.env['JIRA_EMAIL'];
      delete process.env['JIRA_API_TOKEN'];

      const providerNoAuth = new JiraProvider(config);

      await expect(providerNoAuth.getTicket('PROJ-123')).rejects.toThrow(AuthError);
      await expect(providerNoAuth.getTicket('PROJ-123')).rejects.toThrow(
        /not configured/i
      );
    });
  });

  // ===========================================================================
  // Phase 6: tasks_to_issues Integration
  // Note: These tests validate the provider's createTicket functionality
  // that would be used by tasks_to_issues. The full tasks_to_issues tool
  // has its own dedicated test suite.
  // ===========================================================================

  describe('tasks_to_issues', () => {
    /**
     * T050: Validates task conversion to Jira issues
     * Test that multiple issues can be created in sequence (as would happen
     * when converting tasks to issues).
     */
    it('creates Jira issues from task list', async () => {
      const tasks = [
        { title: 'T001: Setup project structure', body: 'Create initial directories' },
        { title: 'T002: Add configuration', body: 'Add config files' },
        { title: 'T003: Implement core logic', body: 'Implement main functionality' },
      ];

      const createdIssues: Array<{ key: string; title: string }> = [];

      for (let i = 0; i < tasks.length; i++) {
        const issueNum = 300 + i;
        const key = `PROJ-${issueNum}`;

        // Create response
        mockFetch.mockResolvedValueOnce({
          ok: true,
          text: async () => JSON.stringify(createMockIssueCreated(key)),
        });

        // Fetch response
        mockFetch.mockResolvedValueOnce({
          ok: true,
          text: async () =>
            JSON.stringify(
              createMockJiraIssue({
                key,
                fields: {
                  summary: tasks[i].title,
                  description: createMockAdf(tasks[i].body),
                  status: { name: 'Open', statusCategory: { key: 'new', name: 'To Do' } },
                  labels: [],
                  issuetype: { name: 'Story', id: '1' },
                },
              })
            ),
        });

        const ticket = await provider.createTicket(tasks[i]);
        createdIssues.push({ key: ticket.ref.id, title: ticket.title });
      }

      expect(createdIssues).toHaveLength(3);
      expect(createdIssues[0].key).toBe('PROJ-300');
      expect(createdIssues[1].key).toBe('PROJ-301');
      expect(createdIssues[2].key).toBe('PROJ-302');
    });

    /**
     * T051: Validates epic linking behavior
     * Note: This tests the provider's ability to create issues with labels,
     * which would be used to link issues to an epic.
     */
    it('creates issue with epic-related labels', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify(createMockIssueCreated('PROJ-400')),
      });

      const createdIssue = createMockJiraIssue({
        key: 'PROJ-400',
        fields: {
          summary: 'Child Task',
          description: null,
          status: { name: 'Open', statusCategory: { key: 'new', name: 'To Do' } },
          labels: ['epic:PROJ-100', 'child-task'],
          issuetype: { name: 'Story', id: '1' },
        },
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify(createdIssue),
      });

      const ticket = await provider.createTicket({
        title: 'Child Task',
        labels: ['epic:PROJ-100', 'child-task'],
      });

      // Verify labels were passed correctly
      const createCall = mockFetch.mock.calls[0];
      const body = JSON.parse(createCall[1].body);
      expect(body.fields.labels).toEqual(['epic:PROJ-100', 'child-task']);

      expect(ticket.labels).toEqual(['epic:PROJ-100', 'child-task']);
    });
  });

  // ===========================================================================
  // Phase 7: Real Jira API Tests (Optional)
  // These tests only run when TEST_REAL_JIRA=true and valid credentials
  // are configured.
  // ===========================================================================

  describe('real Jira API tests', () => {
    it(
      'fetches real issue (requires TEST_REAL_JIRA=true)',
      skipIfNoJiraCredentials(async () => {
        // This test uses real credentials - skip mock setup
        vi.restoreAllMocks();

        const realConfig = createTestJiraConfig({
          baseUrl: process.env['JIRA_BASE_URL']!,
          projectKey: process.env['JIRA_PROJECT_KEY'] || 'PROJ',
        });

        const realProvider = new JiraProvider(realConfig);

        // Use a known test issue or create one
        const testIssueKey = process.env['JIRA_TEST_ISSUE_KEY'];
        if (!testIssueKey) {
          console.log('Skipping: JIRA_TEST_ISSUE_KEY not set');
          return;
        }

        const ticket = await realProvider.getTicket(testIssueKey);

        expect(ticket.ref.id).toBe(testIssueKey);
        expect(ticket.ref.provider).toBe('jira');
        expect(ticket.title).toBeDefined();
        expect(ticket.url).toMatch(/atlassian\.net/);
      })
    );
  });
});
