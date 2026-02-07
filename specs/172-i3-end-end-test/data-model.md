# Data Model: Jira E2E Tests

## Core Types

### JiraIssue (from Jira API)

```typescript
interface JiraIssue {
  id: string;           // Internal Jira ID (e.g., "10001")
  key: string;          // Issue key (e.g., "PROJ-123")
  self: string;         // API URL
  fields: {
    summary: string;
    description: JiraAdfDocument | null;
    status: {
      name: string;      // e.g., "In Progress"
      statusCategory: {
        key: string;     // "new", "indeterminate", "done"
        name: string;
      };
    };
    labels: string[];
    issuetype: {
      name: string;      // e.g., "Story", "Bug", "Task"
      id: string;
    };
    priority?: {
      name: string;      // e.g., "High", "Medium"
      id: string;
    } | null;
    assignee?: {
      displayName: string;
      accountId: string;
    } | null;
  };
}
```

### JiraAdfDocument (Atlassian Document Format)

```typescript
interface JiraAdfDocument {
  type: 'doc';
  version: 1;
  content: JiraAdfNode[];
}

interface JiraAdfNode {
  type: string;          // "paragraph", "bulletList", etc.
  content?: JiraAdfNode[];
  text?: string;
}
```

### Ticket (normalized spec-kit type)

```typescript
interface Ticket {
  ref: TicketRef;
  title: string;
  body?: string;
  state: TicketState;    // 'open' | 'closed' | 'in_progress'
  labels: string[];
  url: string;
  meta?: {
    issueType: string;
    priority?: string;
    assignee?: string;
    jiraStatus: string;
  };
}

interface TicketRef {
  provider: 'jira';
  id: string;            // "PROJ-123"
  url?: string;
  raw: string;           // Original input
}
```

## State Mappings

### Jira Status → TicketState

| Jira Status | TicketState |
|-------------|-------------|
| Done, Closed, Resolved, Complete | `closed` |
| In Progress, In Review, Testing, QA, Dev | `in_progress` |
| Open, To Do, Backlog, (default) | `open` |

Mapping uses keyword-based regex matching:
```typescript
function mapJiraStatusToTicketState(status: string): TicketState {
  const lower = status.toLowerCase();
  if (/done|closed|resolved|complete/i.test(lower)) return 'closed';
  if (/progress|review|testing|qa|dev/i.test(lower)) return 'in_progress';
  return 'open';
}
```

## Validation Rules

### TicketRef Parsing

Valid Jira references:
- `PROJ-123` - Issue key format (uppercase project, hyphen, number)
- `https://company.atlassian.net/browse/PROJ-123` - Full Jira URL

Invalid formats:
- `proj-123` - Lowercase project key
- `PROJ123` - Missing hyphen
- `123-PROJ` - Reversed format
- `#123` - GitHub format (returns null, not an error)

### Project Key Validation

Provider validates that issue key matches configured project:
```typescript
const projectPrefix = issueKey.split('-')[0];
if (projectPrefix !== this.projectKey) {
  return null;  // Not this provider's issue
}
```

## Test Mock Data

### Standard Mock Issue

```typescript
const mockJiraIssue: JiraIssue = {
  id: '10001',
  key: 'PROJ-123',
  self: 'https://company.atlassian.net/rest/api/3/issue/10001',
  fields: {
    summary: 'Test Issue',
    description: {
      type: 'doc',
      version: 1,
      content: [{
        type: 'paragraph',
        content: [{ type: 'text', text: 'Issue description' }]
      }]
    },
    status: {
      name: 'In Progress',
      statusCategory: { key: 'indeterminate', name: 'In Progress' }
    },
    labels: ['bug', 'priority-high'],
    issuetype: { name: 'Bug', id: '1' },
    priority: { name: 'High', id: '2' },
    assignee: { displayName: 'Test User', accountId: '12345' }
  }
};
```

### Error Responses

```typescript
const notFoundResponse = {
  errorMessages: ['Issue does not exist or you do not have permission to see it.'],
  errors: {}
};

const authFailedResponse = {
  errorMessages: ['Authentication failed'],
  errors: {}
};
```

## Relationships

```
SpecKitConfig
    └── backlog.jira: { baseUrl, projectKey, email?, apiToken? }
           │
           ▼
     JiraProvider
           │
           ├── getTicket(ref) → Ticket
           ├── createTicket(params) → Ticket
           ├── updateTicket(ref, updates) → Ticket
           └── checkAuth() → AuthCheckResult
```
