# Data Model: JiraProvider Implementation

## Core Types

### Existing Types (from BacklogProvider interface)

These types are already defined in `src/providers/types.ts` and will be implemented by JiraProvider:

```typescript
interface BacklogProvider {
  readonly name: BacklogProviderName;

  // Required methods
  getTicket(ref: string): Promise<Ticket>;
  createTicket(params: TicketCreateParams): Promise<Ticket>;
  updateTicket(ref: string, updates: TicketUpdates): Promise<Ticket>;
  checkAuth(): Promise<AuthCheckResult>;
  getTicketUrl(ref: string): string;
  parseRef(input: string): TicketRef | null;

  // Optional methods (JiraProvider will implement)
  setLabels?(ref: string, labels: string[]): Promise<void>;
  getLabels?(ref: string): Promise<string[]>;
}

interface Ticket {
  ref: TicketRef;
  title: string;
  body?: string;
  state: TicketState;  // 'open' | 'closed' | 'in_progress'
  labels: string[];
  url: string;
  meta?: Record<string, unknown>;
}

interface TicketRef {
  provider: TicketProvider;  // 'jira'
  id: string;               // Issue key: "PROJ-123"
  url?: string;
  raw: string;
}

interface TicketCreateParams {
  title: string;
  body?: string;
  labels?: string[];
}

type TicketUpdates = Partial<TicketCreateParams>;

interface AuthCheckResult {
  ok: boolean;
  message?: string;
}
```

### Jira-Specific Configuration

Extend the existing `JiraConfigSchema` with authentication fields:

```typescript
interface JiraConfig {
  baseUrl: string;        // Required: https://company.atlassian.net
  projectKey: string;     // Required: PROJ
  email?: string;         // Optional: falls back to JIRA_EMAIL env var
  apiToken?: string;      // Optional: falls back to JIRA_API_TOKEN env var
}
```

### Internal Jira API Types

These types model Jira REST API v3 responses (internal to JiraProvider):

```typescript
// Issue response from GET /rest/api/3/issue/{issueKey}
interface JiraIssue {
  id: string;
  key: string;
  self: string;
  fields: {
    summary: string;
    description: JiraAdfDocument | null;
    status: {
      name: string;
      statusCategory: {
        key: string;  // 'new' | 'indeterminate' | 'done'
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
    };
    assignee?: {
      displayName: string;
      accountId: string;
    } | null;
  };
}

// Simplified ADF document type
interface JiraAdfDocument {
  type: 'doc';
  version: 1;
  content: JiraAdfNode[];
}

interface JiraAdfNode {
  type: string;  // 'paragraph', 'text', 'heading', etc.
  content?: JiraAdfNode[];
  text?: string;
}

// Create issue request body
interface JiraCreateIssueRequest {
  fields: {
    project: { key: string };
    summary: string;
    description?: JiraAdfDocument;
    issuetype: { name: string };  // Default: "Story"
    labels?: string[];
  };
}

// Update issue request body
interface JiraUpdateIssueRequest {
  fields: {
    summary?: string;
    description?: JiraAdfDocument;
    labels?: string[];
  };
}

// Current user response from GET /rest/api/3/myself
interface JiraCurrentUser {
  self: string;
  accountId: string;
  displayName: string;
  emailAddress: string;
  active: boolean;
}

// Error response
interface JiraErrorResponse {
  errorMessages: string[];
  errors: Record<string, string>;
}
```

## Validation Rules

### Issue Key Format
- Pattern: `^[A-Z][A-Z0-9_]*-\d+$`
- Examples: `PROJ-123`, `ABC_DEF-1`, `TEST-9999`
- Project prefix must match configured `projectKey`

### URL Format
- Pattern: `^https?://[^/]+/browse/[A-Z][A-Z0-9_]*-\d+$`
- Examples:
  - `https://company.atlassian.net/browse/PROJ-123`
  - `https://jira.example.com/browse/ABC-456`

### Configuration Validation
- `baseUrl`: Required, must be valid URL (no trailing slash)
- `projectKey`: Required, uppercase letters/numbers/underscores, starts with letter
- `email`: Optional in config, required at runtime (from config or env)
- `apiToken`: Optional in config, required at runtime (from config or env)

## Entity Relationships

```
┌─────────────────┐      ┌─────────────────┐
│  SpecKitConfig  │      │  JiraProvider   │
├─────────────────┤      ├─────────────────┤
│ backlog:        │─────>│ config          │
│   provider      │      │ baseUrl         │
│   jira:         │      │ projectKey      │
│     baseUrl     │      │ auth            │
│     projectKey  │      └─────────────────┘
└─────────────────┘              │
                                 │ implements
                                 ▼
                        ┌─────────────────┐
                        │ BacklogProvider │
                        ├─────────────────┤
                        │ getTicket()     │
                        │ createTicket()  │
                        │ updateTicket()  │
                        │ setLabels()     │
                        │ checkAuth()     │
                        │ parseRef()      │
                        │ getTicketUrl()  │
                        └─────────────────┘
                                 │
                                 │ returns
                                 ▼
                        ┌─────────────────┐
                        │     Ticket      │
                        ├─────────────────┤
                        │ ref: TicketRef  │
                        │ title           │
                        │ body            │
                        │ state           │
                        │ labels          │
                        │ url             │
                        │ meta            │
                        └─────────────────┘
```

## Metadata (meta field)

JiraProvider will populate the `meta` field with Jira-specific information:

```typescript
{
  issueType: string;     // "Story", "Bug", "Task", etc.
  priority?: string;     // "High", "Medium", "Low"
  assignee?: string;     // Display name or null
  jiraStatus: string;    // Original Jira status name (before mapping)
}
```

This allows consumers to access Jira-specific fields without breaking the normalized interface.
