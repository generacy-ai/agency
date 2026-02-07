/**
 * Test utilities for Jira E2E integration tests.
 *
 * Provides mock response factories, skip conditions for real API tests,
 * and helper functions for testing the spec-kit Jira provider workflow.
 */

import { vi } from 'vitest';
import type { SpecKitConfig } from '../../src/config.js';

// =============================================================================
// Environment & Skip Conditions
// =============================================================================

/**
 * Check if real Jira API testing is enabled.
 *
 * Real API tests only run when:
 * 1. TEST_REAL_JIRA=true is set
 * 2. Valid Jira credentials are configured
 */
export function isRealJiraTestEnabled(): boolean {
  return process.env['TEST_REAL_JIRA'] === 'true';
}

/**
 * Check if Jira credentials are configured.
 */
export function hasJiraCredentials(): boolean {
  return !!(
    process.env['JIRA_EMAIL'] &&
    process.env['JIRA_API_TOKEN'] &&
    process.env['JIRA_BASE_URL']
  );
}

/**
 * Skip helper for real Jira API tests.
 * Returns a message if the test should be skipped, null otherwise.
 */
export function shouldSkipRealJiraTest(): string | null {
  if (!isRealJiraTestEnabled()) {
    return 'Skipping: TEST_REAL_JIRA not set to true';
  }
  if (!hasJiraCredentials()) {
    return 'Skipping: Jira credentials not configured (JIRA_EMAIL, JIRA_API_TOKEN, JIRA_BASE_URL)';
  }
  return null;
}

/**
 * Wrapper to conditionally skip tests based on real Jira availability.
 */
export function skipIfNoJiraCredentials(
  testFn: () => void | Promise<void>
): () => void | Promise<void> {
  return async () => {
    const skipReason = shouldSkipRealJiraTest();
    if (skipReason) {
      console.log(skipReason);
      return;
    }
    return testFn();
  };
}

// =============================================================================
// Mock Data Factories
// =============================================================================

/**
 * Jira issue field structure for mock responses.
 */
export interface MockJiraFields {
  summary: string;
  description: MockJiraAdfDocument | null;
  status: {
    name: string;
    statusCategory: {
      key: string;
      name: string;
    };
  };
  labels: string[];
  issuetype: {
    name: string;
    id: string;
  };
  priority?: {
    name: string;
    id: string;
  } | null;
  assignee?: {
    displayName: string;
    accountId: string;
  } | null;
}

/**
 * Jira ADF document structure.
 */
export interface MockJiraAdfDocument {
  type: 'doc';
  version: 1;
  content: MockJiraAdfNode[];
}

/**
 * Jira ADF node structure.
 */
export interface MockJiraAdfNode {
  type: string;
  content?: MockJiraAdfNode[];
  text?: string;
}

/**
 * Full Jira issue response structure.
 */
export interface MockJiraIssue {
  id: string;
  key: string;
  self: string;
  fields: MockJiraFields;
}

/**
 * Create a mock Jira issue with default values.
 * Allows partial overrides for specific test scenarios.
 */
export function createMockJiraIssue(
  overrides: Partial<MockJiraIssue> & { fields?: Partial<MockJiraFields> } = {}
): MockJiraIssue {
  const defaultFields: MockJiraFields = {
    summary: 'Test Issue',
    description: null,
    status: {
      name: 'Open',
      statusCategory: { key: 'new', name: 'To Do' },
    },
    labels: [],
    issuetype: { name: 'Story', id: '1' },
    priority: null,
    assignee: null,
  };

  return {
    id: '10001',
    key: 'PROJ-123',
    self: 'https://company.atlassian.net/rest/api/3/issue/10001',
    ...overrides,
    fields: {
      ...defaultFields,
      ...overrides.fields,
    },
  };
}

/**
 * Create mock ADF content from plain text.
 */
export function createMockAdf(text: string): MockJiraAdfDocument {
  const paragraphs = text.split('\n\n').filter((p) => p.trim());

  return {
    type: 'doc',
    version: 1,
    content: paragraphs.map((paragraph) => ({
      type: 'paragraph',
      content: [{ type: 'text', text: paragraph }],
    })),
  };
}

/**
 * Create a mock Jira error response.
 */
export function createMockJiraError(
  errorMessages: string[] = ['An error occurred'],
  errors: Record<string, string> = {}
): { errorMessages: string[]; errors: Record<string, string> } {
  return { errorMessages, errors };
}

/**
 * Create a mock Jira user response (for /myself endpoint).
 */
export function createMockJiraUser(
  overrides: Partial<{
    self: string;
    accountId: string;
    displayName: string;
    emailAddress: string;
    active: boolean;
  }> = {}
): {
  self: string;
  accountId: string;
  displayName: string;
  emailAddress: string;
  active: boolean;
} {
  return {
    self: 'https://company.atlassian.net/rest/api/3/user/12345',
    accountId: '12345',
    displayName: 'Test User',
    emailAddress: 'test@example.com',
    active: true,
    ...overrides,
  };
}

/**
 * Create a mock issue creation response.
 */
export function createMockIssueCreated(
  key: string = 'PROJ-124'
): { id: string; key: string; self: string } {
  const id = key.split('-')[1] || '10001';
  return {
    id,
    key,
    self: `https://company.atlassian.net/rest/api/3/issue/${id}`,
  };
}

// =============================================================================
// Mock Fetch Factory
// =============================================================================

/**
 * Response configuration for mock fetch.
 */
export interface MockFetchResponse {
  ok: boolean;
  status: number;
  data?: unknown;
  error?: { errorMessages: string[]; errors: Record<string, string> };
}

/**
 * Create a configured mock fetch function.
 *
 * @param responses - Map of URL patterns to responses
 * @returns Mock fetch function
 */
export function createMockFetch(
  responses: Map<string | RegExp, MockFetchResponse>
): typeof fetch {
  return vi.fn(async (url: string | URL | Request): Promise<Response> => {
    const urlString = url instanceof Request ? url.url : url.toString();

    for (const [pattern, response] of responses) {
      const matches =
        typeof pattern === 'string'
          ? urlString.includes(pattern)
          : pattern.test(urlString);

      if (matches) {
        const responseData = response.ok ? response.data : response.error;

        return {
          ok: response.ok,
          status: response.status,
          text: async () => JSON.stringify(responseData),
          json: async () => responseData,
        } as Response;
      }
    }

    // Default: 404 Not Found
    return {
      ok: false,
      status: 404,
      json: async () => ({
        errorMessages: ['Resource not found'],
        errors: {},
      }),
      text: async () =>
        JSON.stringify({
          errorMessages: ['Resource not found'],
          errors: {},
        }),
    } as Response;
  });
}

// =============================================================================
// Test Configuration
// =============================================================================

/**
 * Create a test configuration for the Jira provider.
 */
export function createTestJiraConfig(
  overrides: Partial<{
    baseUrl: string;
    projectKey: string;
    email: string;
    apiToken: string;
  }> = {}
): SpecKitConfig {
  return {
    paths: { specs: 'specs', templates: '.specify/templates' },
    branches: {
      pattern: '{paddedNumber}-{slug}',
      numberPadding: 3,
      maxSlugWords: 4,
    },
    backlog: {
      provider: 'jira',
      jira: {
        baseUrl: overrides.baseUrl ?? 'https://company.atlassian.net',
        projectKey: overrides.projectKey ?? 'PROJ',
        email: overrides.email,
        apiToken: overrides.apiToken,
      },
    },
  };
}

// =============================================================================
// Jira-Specific Status Mappings
// =============================================================================

/**
 * Map of Jira statuses to normalized states for testing status normalization.
 *
 * Jira Status Normalization Rules:
 * - Done/Closed/Resolved → 'closed'
 * - In Progress/Review/Testing → 'in_progress'
 * - Open/To Do → 'open'
 * - Unknown → 'open' (default)
 */
export const STATUS_MAPPINGS: Array<{
  jiraStatus: string;
  statusCategory: { key: string; name: string };
  expectedState: 'open' | 'closed' | 'in_progress';
}> = [
  // Closed states
  {
    jiraStatus: 'Done',
    statusCategory: { key: 'done', name: 'Done' },
    expectedState: 'closed',
  },
  {
    jiraStatus: 'Closed',
    statusCategory: { key: 'done', name: 'Done' },
    expectedState: 'closed',
  },
  {
    jiraStatus: 'Resolved',
    statusCategory: { key: 'done', name: 'Done' },
    expectedState: 'closed',
  },
  // In-progress states
  {
    jiraStatus: 'In Progress',
    statusCategory: { key: 'indeterminate', name: 'In Progress' },
    expectedState: 'in_progress',
  },
  {
    jiraStatus: 'In Review',
    statusCategory: { key: 'indeterminate', name: 'In Progress' },
    expectedState: 'in_progress',
  },
  {
    jiraStatus: 'Testing',
    statusCategory: { key: 'indeterminate', name: 'In Progress' },
    expectedState: 'in_progress',
  },
  // Open states
  {
    jiraStatus: 'Open',
    statusCategory: { key: 'new', name: 'To Do' },
    expectedState: 'open',
  },
  {
    jiraStatus: 'To Do',
    statusCategory: { key: 'new', name: 'To Do' },
    expectedState: 'open',
  },
  // Unknown (defaults to open)
  {
    jiraStatus: 'Custom Unknown Status',
    statusCategory: { key: 'new', name: 'To Do' },
    expectedState: 'open',
  },
];
