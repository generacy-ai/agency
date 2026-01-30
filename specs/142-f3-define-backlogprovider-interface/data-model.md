# Data Model: BacklogProvider Interface

## Core Entities

### TicketRef (from F2)
Reference type for identifying tickets across providers. Imported from F2 core types.

```typescript
// Expected structure (defined in F2, imported here)
interface TicketRef {
  provider: string;  // e.g., 'github', 'jira', 'shortcut', 'local'
  id: string;        // provider-specific identifier
}
```

### Ticket
Represents a ticket/issue in any backlog system.

```typescript
interface Ticket {
  ref: TicketRef;                    // Unique reference
  title: string;                     // Ticket title
  body?: string;                     // Description/body (optional)
  state: 'open' | 'closed' | 'in_progress';  // Current state
  labels: string[];                  // Applied labels/tags
  url: string;                       // Web URL for the ticket
  meta?: Record<string, unknown>;    // Provider-specific metadata
}
```

### TicketCreateParams
Parameters for creating a new ticket.

```typescript
interface TicketCreateParams {
  title: string;      // Required: ticket title
  body?: string;      // Optional: description
  labels?: string[];  // Optional: initial labels
}
```

### TicketUpdates
Parameters for updating an existing ticket.

```typescript
type TicketUpdates = Partial<TicketCreateParams>;
// Equivalent to:
// {
//   title?: string;
//   body?: string;
//   labels?: string[];
// }
```

## Provider Interface

### BacklogProvider
The main interface for backlog system integrations.

```typescript
interface BacklogProvider {
  // Identity
  readonly name: 'github' | 'jira' | 'shortcut' | 'local';

  // CRUD Operations (required)
  getTicket(ref: string): Promise<Ticket>;
  createTicket(params: TicketCreateParams): Promise<Ticket>;
  updateTicket(ref: string, updates: TicketUpdates): Promise<Ticket>;

  // Label Management (optional)
  setLabels?(ref: string, labels: string[]): Promise<void>;
  getLabels?(ref: string): Promise<string[]>;

  // Search (optional)
  searchTickets?(query: string): Promise<Ticket[]>;

  // Authentication
  checkAuth(): Promise<{ ok: boolean; message?: string }>;

  // URL and Reference Handling
  getTicketUrl(ref: string): string;
  parseRef(input: string): TicketRef | null;
}
```

## Error Types

### ProviderError (Base)
Base class for all provider-related errors.

```typescript
class ProviderError extends Error {
  readonly provider: string;

  constructor(message: string, provider: string) {
    super(message);
    this.name = 'ProviderError';
    this.provider = provider;
  }
}
```

### AuthError
Authentication or authorization failure.

```typescript
class AuthError extends ProviderError {
  constructor(message: string, provider: string) {
    super(message, provider);
    this.name = 'AuthError';
  }
}
```

Use cases:
- Missing API token
- Expired credentials
- Insufficient permissions

### NotFoundError
Resource not found.

```typescript
class NotFoundError extends ProviderError {
  readonly ref?: string;

  constructor(message: string, provider: string, ref?: string) {
    super(message, provider);
    this.name = 'NotFoundError';
    this.ref = ref;
  }
}
```

Use cases:
- Ticket doesn't exist
- Repository/project not found
- Label doesn't exist

## Relationships

```
┌─────────────────────────────────────────────────────────────────┐
│                       BacklogProvider                            │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐ │
│  │   getTicket │  │createTicket │  │     updateTicket        │ │
│  └──────┬──────┘  └──────┬──────┘  └───────────┬─────────────┘ │
│         │                │                      │               │
│         ▼                ▼                      ▼               │
│     ┌───────┐    ┌───────────────┐    ┌───────────────┐        │
│     │Ticket │◄───│TicketCreate  │    │TicketUpdates │        │
│     └───┬───┘    │   Params     │    │              │        │
│         │        └───────────────┘    └───────────────┘        │
│         │                                                       │
│         ▼                                                       │
│    ┌─────────┐                                                  │
│    │TicketRef│  (from F2)                                      │
│    └─────────┘                                                  │
└─────────────────────────────────────────────────────────────────┘

Error Hierarchy:
┌─────────────────┐
│  ProviderError  │ (base)
└────────┬────────┘
         │
    ┌────┴────┐
    │         │
┌───▼───┐ ┌───▼─────────┐
│AuthErr│ │NotFoundError│
└───────┘ └─────────────┘
```

## Validation Rules

### Ticket
- `ref`: Must be valid TicketRef (non-empty provider and id)
- `title`: Must be non-empty string
- `state`: Must be one of the three valid states
- `labels`: Array of non-empty strings
- `url`: Must be valid URL string

### TicketCreateParams
- `title`: Required, non-empty string
- `body`: Optional, may be empty string
- `labels`: Optional, array of non-empty strings

### Provider Method Parameters
- `ref` parameter (string): Provider-specific reference format
- `query` parameter (search): Provider-specific query syntax
