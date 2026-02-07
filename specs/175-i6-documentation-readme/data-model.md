# Data Model: Documentation and README

This feature is documentation-focused, so the data model captures the configuration schemas and type definitions that must be accurately documented.

## Core Entities

### SpecKitConfig

The main configuration object for the agency-plugin-spec-kit.

```typescript
interface SpecKitConfig {
  paths: PathsConfig;
  branches: BranchesConfig;
  backlog: BacklogConfig;
}
```

### PathsConfig

```typescript
interface PathsConfig {
  /** Directory for spec artifacts (default: 'specs') */
  specs: string;
  /** Directory for templates (default: '.specify/templates') */
  templates: string;
}
```

### BranchesConfig

```typescript
interface BranchesConfig {
  /** Branch name pattern (default: '{paddedNumber}-{slug}') */
  pattern: string;
  /** Zero-padding for issue numbers (default: 3) */
  numberPadding: number;
  /** Maximum words in slug (default: 4) */
  maxSlugWords: number;
}
```

### BacklogConfig

```typescript
interface BacklogConfig {
  /** Backlog provider type (default: 'github') */
  provider: 'github' | 'jira' | 'shortcut' | 'local';
  /** GitHub-specific configuration */
  github?: {};
  /** Jira-specific configuration */
  jira?: JiraConfig;
  /** Shortcut-specific configuration */
  shortcut?: ShortcutConfig;
}
```

### JiraConfig

```typescript
interface JiraConfig {
  /** Jira base URL (e.g., https://company.atlassian.net) */
  baseUrl: string;
  /** Jira project key (e.g., PROJ) */
  projectKey: string;
  /** Jira user email for authentication */
  email?: string;
  /** Jira API token for authentication */
  apiToken?: string;
}
```

### ShortcutConfig

```typescript
interface ShortcutConfig {
  /** Shortcut workspace slug */
  workspaceSlug: string;
}
```

## Provider Interface

### BacklogProvider

The interface that all backlog providers implement.

```typescript
interface BacklogProvider {
  readonly name: BacklogProviderName;

  // CRUD Operations (required)
  getTicket(ref: string): Promise<Ticket>;
  createTicket(params: TicketCreateParams): Promise<Ticket>;
  updateTicket(ref: string, updates: TicketUpdates): Promise<Ticket>;

  // Label Management (optional)
  setLabels?(ref: string, labels: string[]): Promise<void>;
  getLabels?(ref: string): Promise<string[]>;

  // Search (optional)
  searchTickets?(query: string): Promise<Ticket[]>;

  // Authentication (required)
  checkAuth(): Promise<AuthCheckResult>;

  // URL and Reference Handling (required)
  getTicketUrl(ref: string): string;
  parseRef(input: string): TicketRef | null;
}
```

### Ticket

Normalized ticket representation returned by all providers.

```typescript
interface Ticket {
  ref: TicketRef;
  title: string;
  body?: string;
  state: TicketState;
  labels: string[];
  url: string;
  meta?: Record<string, unknown>;
}
```

### TicketRef

Unique ticket reference with provider information.

```typescript
interface TicketRef {
  provider: BacklogProviderName;
  id: string;
  raw: string;
  url?: string;
}
```

## Type Definitions

### TicketState

```typescript
type TicketState = 'open' | 'closed' | 'in_progress';
```

### BacklogProviderName

```typescript
type BacklogProviderName = 'github' | 'jira' | 'shortcut' | 'local';
```

## Validation Rules

All configuration validation is handled by Zod schemas:

| Field | Type | Required | Validation |
|-------|------|----------|------------|
| `paths.specs` | string | No | Non-empty string, defaults to 'specs' |
| `paths.templates` | string | No | Non-empty string, defaults to '.specify/templates' |
| `branches.pattern` | string | No | Valid pattern with variables |
| `branches.numberPadding` | number | No | 1-10, defaults to 3 |
| `branches.maxSlugWords` | number | No | 1-10, defaults to 4 |
| `backlog.provider` | enum | No | One of: github, jira, shortcut, local |
| `backlog.jira.baseUrl` | string | Yes* | Valid URL (*if jira provider) |
| `backlog.jira.projectKey` | string | Yes* | Valid Jira project key (*if jira provider) |

## Entity Relationships

```
SpecKitConfig
├── PathsConfig (1:1)
├── BranchesConfig (1:1)
└── BacklogConfig (1:1)
    ├── JiraConfig (0:1)
    └── ShortcutConfig (0:1)

BacklogProvider
├── Ticket (1:N via queries)
│   └── TicketRef (1:1)
└── AuthCheckResult (1:1 per check)
```
