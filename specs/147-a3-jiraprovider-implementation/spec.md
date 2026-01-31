# Feature Specification: A3: JiraProvider implementation

**Branch**: `147-a3-jiraprovider-implementation` | **Date**: 2026-01-31 | **Status**: Draft

## Summary

Implement the JiraProvider that enables the backlog system to interact with Jira Cloud for issue operations including creating, reading, updating tickets and managing labels.

## Parent Epic
Part of #139

## Agent Assignment
**Agent A** - Backlog Providers (`src/providers/*`)

## Description
Implement the JiraProvider that uses Jira's REST API for issue operations.

## Acceptance Criteria
- [ ] Create `src/providers/jira.ts`
- [ ] Implement all BacklogProvider interface methods
- [ ] Use Jira REST API v3
- [ ] Support Jira Cloud authentication via API token + email
- [ ] Parse Jira URLs and issue keys (PROJ-123)
- [ ] Handle Jira-specific fields (issue types, priorities, etc.)
- [ ] Support label operations
- [ ] Map Jira statuses to TicketState using flexible keyword matching

## Design Decisions

Based on clarification answers:

1. **Authentication**: Jira Cloud only (API token + email). Jira Server/Data Center is out of scope.
2. **Status Mapping**: Use flexible keyword matching for status-to-TicketState mapping:
   - Keywords like "done", "closed", "resolved" → `closed`
   - Keywords like "progress", "review", "testing" → `in_progress`
   - Default/other statuses → `open`
3. **Default Issue Type**: Story (agile-friendly) when createTicket() is called without specifying type
4. **Project Scope**: Single project only - the configured projectKey is required context. Cross-project operations are not supported.

## Configuration

```typescript
interface JiraConfig {
  baseUrl: string;        // https://company.atlassian.net
  projectKey: string;     // PROJ - required, single project only
  apiToken?: string;      // Or use JIRA_API_TOKEN env var
  email: string;          // Required for Jira Cloud basic auth
}
```

## Implementation Details

### Status Mapping

```typescript
function mapJiraStatusToTicketState(status: string): TicketState {
  const lower = status.toLowerCase();

  // Closed states
  if (/done|closed|resolved|complete/i.test(lower)) {
    return 'closed';
  }

  // In progress states
  if (/progress|review|testing|qa|dev/i.test(lower)) {
    return 'in_progress';
  }

  // Default to open
  return 'open';
}
```

### Provider Implementation

```typescript
export class JiraProvider implements BacklogProvider {
  readonly name = 'jira' as const;

  constructor(private config: JiraConfig) {}

  async getTicket(ref: string): Promise<Ticket> {
    // GET /rest/api/3/issue/{issueKey}
  }

  async createTicket(params: TicketCreateParams): Promise<Ticket> {
    // POST /rest/api/3/issue
    // Default issue type: Story
  }

  async updateTicket(ref: string, updates: TicketUpdates): Promise<Ticket> {
    // PUT /rest/api/3/issue/{issueKey}
  }

  async setLabels(ref: string, labels: string[]): Promise<void> {
    // PUT /rest/api/3/issue/{issueKey} with labels field
  }

  async checkAuth(): Promise<{ ok: boolean; message?: string }> {
    // GET /rest/api/3/myself
  }

  parseRef(input: string): TicketRef | null {
    // Parse: PROJ-123, https://company.atlassian.net/browse/PROJ-123
    // Only accept refs matching configured projectKey
  }

  getTicketUrl(ref: string): string {
    // Generate Jira browse URL
  }
}
```

## Dependencies
- A1 (provider registry)
- F3 (BacklogProvider interface)

## Files to Create/Modify
- `src/providers/jira.ts`

## User Stories

### US1: Developer Uses Jira for Backlog Management

**As a** developer using Jira Cloud,
**I want** to use the backlog provider system with my Jira instance,
**So that** I can manage issues through a unified interface.

**Acceptance Criteria**:
- [ ] Can authenticate with Jira Cloud using API token
- [ ] Can read, create, and update Jira issues
- [ ] Jira statuses are correctly mapped to TicketState
- [ ] Labels can be managed on Jira issues

## Functional Requirements

| ID | Requirement | Priority | Notes |
|----|-------------|----------|-------|
| FR-001 | Implement BacklogProvider interface | P1 | All methods required |
| FR-002 | Support Jira Cloud authentication | P1 | API token + email |
| FR-003 | Map Jira statuses to TicketState | P1 | Keyword-based matching |
| FR-004 | Parse Jira issue keys and URLs | P1 | PROJ-123 format |
| FR-005 | Default to Story issue type | P2 | When type not specified |

## Success Criteria

| ID | Metric | Target | Measurement |
|----|--------|--------|-------------|
| SC-001 | All interface methods implemented | 100% | Unit tests pass |
| SC-002 | Authentication works | Pass | checkAuth() returns ok:true |

## Assumptions

- User has a Jira Cloud instance with API access
- User has an API token generated from Atlassian account
- BacklogProvider interface is already defined (F3 dependency)

## Out of Scope

- Jira Server/Data Center support
- Cross-project operations
- Jira-specific fields beyond basic ticket operations (sprints, epics, custom fields)
- Webhook integrations

---

*Generated by speckit*
