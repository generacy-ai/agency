# Data Model: D1: Implement get_ticket tool

## Core Entities

### TicketRef (Existing)

Location: `src/types/ticket.ts`

```typescript
interface TicketRef {
  /** Provider identifier (github, jira, etc.) */
  provider: TicketProvider;

  /** Ticket ID ("123" or "PROJ-123") */
  id: string;

  /** Full URL if available */
  url?: string;

  /** Original input string */
  raw: string;
}
```

### Ticket (Existing)

Location: `src/providers/types.ts`

```typescript
interface Ticket {
  /** Unique ticket reference */
  ref: TicketRef;

  /** Ticket title */
  title: string;

  /** Ticket description/body (optional, may contain markdown) */
  body?: string;

  /** Current ticket state: 'open' | 'closed' | 'in_progress' */
  state: TicketState;

  /** Labels/tags applied to the ticket */
  labels: string[];

  /** Web URL to view the ticket */
  url: string;

  /** Provider-specific metadata */
  meta?: Record<string, unknown>;
}
```

### BacklogProvider (Existing)

Location: `src/providers/types.ts`

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

  // Optional methods
  setLabels?(ref: string, labels: string[]): Promise<void>;
  getLabels?(ref: string): Promise<string[]>;
  searchTickets?(query: string): Promise<Ticket[]>;
}
```

## New Types

### ProviderRegistry

Location: `src/providers/registry.ts` (new)

```typescript
interface ProviderRegistry {
  /**
   * Get or create a provider instance by name.
   * Falls back to configured default if name not specified.
   */
  getProvider(name?: BacklogProviderName): BacklogProvider;

  /**
   * Detect provider from a ticket reference string.
   * Returns null if reference format is ambiguous.
   */
  detectProvider(ref: string): BacklogProviderName | null;

  /**
   * Get the default provider from configuration.
   */
  getDefaultProvider(): BacklogProviderName;
}
```

### DetectTicketRefResult

Location: `src/utils/detect-ticket-ref.ts` (new)

```typescript
/**
 * Result of detecting a ticket reference from user input.
 */
type DetectTicketRefResult =
  | { success: true; ref: TicketRef }
  | { success: false; error: string };
```

## Configuration Types

### BacklogConfig (Existing)

Location: `src/config.ts`

```typescript
const BacklogConfigSchema = z.object({
  /** Backlog provider type (default: 'github') */
  provider: z.enum(['github', 'jira', 'shortcut', 'local']).default('github'),

  /** GitHub-specific configuration */
  github: z.object({}).optional(),

  /** Jira-specific configuration */
  jira: JiraConfigSchema.optional(),

  /** Shortcut-specific configuration */
  shortcut: ShortcutConfigSchema.optional(),
});
```

## Error Types

### Provider Errors (Existing)

Location: `src/providers/errors.ts`

```typescript
class ProviderError extends Error {
  readonly provider: string;
  constructor(message: string, provider: string);
}

class AuthError extends ProviderError {
  constructor(message: string, provider: string);
}

class NotFoundError extends ProviderError {
  readonly ref?: string;
  constructor(message: string, provider: string, ref?: string);
}
```

## Type Relationships

```
┌─────────────────┐
│  SpecKitConfig  │
├─────────────────┤
│ backlog: {      │
│   provider      │───────┐
│   github?: {}   │       │
│   jira?: {}     │       │
│   shortcut?: {} │       │
│ }               │       │
└─────────────────┘       │
                          │
┌─────────────────┐       │
│ ProviderRegistry │◄──────┘
├─────────────────┤
│ getProvider()   │──────────┐
│ detectProvider()│          │
└─────────────────┘          │
                             │
                             ▼
┌─────────────────┐    ┌─────────────────┐
│ BacklogProvider │◄───│ GitHubProvider  │
├─────────────────┤    │ JiraProvider    │
│ getTicket()     │    │ ShortcutProvider│
│ parseRef()      │    │ LocalProvider   │
│ ...             │    └─────────────────┘
└─────────────────┘
         │
         ▼
┌─────────────────┐
│     Ticket      │
├─────────────────┤
│ ref: TicketRef  │
│ title: string   │
│ body?: string   │
│ state: State    │
│ labels: []      │
│ url: string     │
│ meta?: {}       │
└─────────────────┘
```

## Validation Rules

### TicketRef Input Validation

| Field | Rule | Error |
|-------|------|-------|
| `ref` | Non-empty string | "Ticket reference is required" |
| `ref` | Max 500 chars | "Ticket reference too long" |
| `ref` | Valid format | "Invalid ticket reference format" |

### Ticket Output Validation

| Field | Rule | Notes |
|-------|------|-------|
| `ref.id` | Non-empty | Provider-specific format |
| `title` | Non-empty | May be truncated by providers |
| `state` | Enum value | 'open', 'closed', 'in_progress' |
| `labels` | Array | Empty array if no labels |
| `url` | Valid URL | Absolute URL to ticket |

## GitHub-Specific Mapping

### Issue to Ticket

| GitHub Field | Ticket Field | Transformation |
|--------------|--------------|----------------|
| `number` | `ref.id` | String conversion |
| `title` | `title` | Direct |
| `body` | `body` | Direct (nullable) |
| `state` | `state` | 'open' or 'closed' |
| `labels[].name` | `labels` | Extract names |
| `html_url` | `url` | Direct |
| `assignees`, `milestone` | `meta` | Preserved |

### State Detection

```typescript
function mapGitHubState(issue: GitHubIssue): TicketState {
  if (issue.state === 'closed') return 'closed';

  // Check for in-progress indicators
  const inProgressLabels = ['in progress', 'in-progress', 'wip'];
  if (issue.labels.some(l =>
    inProgressLabels.includes(l.name.toLowerCase())
  )) {
    return 'in_progress';
  }

  return 'open';
}
```
