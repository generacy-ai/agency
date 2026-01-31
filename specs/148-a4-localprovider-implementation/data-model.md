# Data Model: LocalProvider

## Core Entities

### LocalTicketStore

The root structure stored in the JSON file (`.specify/local-tickets.json`).

```typescript
interface LocalTicketStore {
  /**
   * Schema version for future migrations.
   */
  version: 1;

  /**
   * Next ID number to use (starts at 1).
   * Incremented after each ticket creation.
   */
  nextId: number;

  /**
   * Tickets indexed by their ID string (e.g., "LOCAL-001").
   */
  tickets: Record<string, LocalTicket>;
}
```

### LocalTicket

Internal representation of a ticket in the local store.

```typescript
interface LocalTicket {
  /**
   * Unique ticket ID (e.g., "LOCAL-001", "LOCAL-1000").
   */
  id: string;

  /**
   * Ticket title (required).
   */
  title: string;

  /**
   * Ticket description/body (optional, supports markdown).
   */
  body?: string;

  /**
   * Current state of the ticket.
   */
  state: 'open' | 'closed' | 'in_progress';

  /**
   * Labels attached to the ticket.
   * Simple string array (no color, description).
   */
  labels: string[];

  /**
   * Creation timestamp (ISO 8601 format).
   */
  createdAt: string;

  /**
   * Last update timestamp (ISO 8601 format).
   */
  updatedAt: string;
}
```

## Type Mappings

### LocalTicket → Ticket (Provider Interface)

```typescript
function toTicket(local: LocalTicket): Ticket {
  return {
    ref: {
      provider: 'local',
      id: local.id,
      raw: local.id,
    },
    title: local.title,
    body: local.body,
    state: local.state,
    labels: local.labels,
    url: `local://${local.id}`,
    meta: {
      createdAt: local.createdAt,
      updatedAt: local.updatedAt,
    },
  };
}
```

### TicketCreateParams → LocalTicket

```typescript
function fromCreateParams(
  params: TicketCreateParams,
  id: string,
  now: string
): LocalTicket {
  return {
    id,
    title: params.title,
    body: params.body,
    state: 'open',
    labels: params.labels ?? [],
    createdAt: now,
    updatedAt: now,
  };
}
```

## Validation Rules

### Ticket ID
- Format: `LOCAL-{number}` where number is a positive integer
- Minimum 3 digits with zero-padding for numbers < 1000
- Examples: `LOCAL-001`, `LOCAL-042`, `LOCAL-999`, `LOCAL-1000`

### Reference Parsing
Valid inputs (all resolve to same ticket):
- `LOCAL-001`
- `local-001` (case-insensitive prefix)
- `001`
- `1`

Invalid inputs:
- `LOCAL-` (no number)
- `LOCAL-0` (IDs start at 1)
- `#123` (GitHub format)
- `PROJ-123` (Jira format)

### Title
- Required, non-empty string
- No length limit (but recommend < 200 chars)

### Body
- Optional
- No length limit
- Supports markdown formatting

### Labels
- Array of strings
- Empty array is valid
- Duplicates allowed (but not recommended)
- No validation on label content

### State
- Must be one of: `'open'`, `'closed'`, `'in_progress'`
- Default for new tickets: `'open'`

## File Format

Example `.specify/local-tickets.json`:

```json
{
  "version": 1,
  "nextId": 3,
  "tickets": {
    "LOCAL-001": {
      "id": "LOCAL-001",
      "title": "Initial feature implementation",
      "body": "## Description\n\nImplement the core feature...",
      "state": "closed",
      "labels": ["feature", "core"],
      "createdAt": "2024-01-15T10:30:00.000Z",
      "updatedAt": "2024-01-16T14:22:00.000Z"
    },
    "LOCAL-002": {
      "id": "LOCAL-002",
      "title": "Fix validation bug",
      "state": "open",
      "labels": ["bug"],
      "createdAt": "2024-01-16T09:00:00.000Z",
      "updatedAt": "2024-01-16T09:00:00.000Z"
    }
  }
}
```

## Empty Store Initialization

When no file exists, create:

```json
{
  "version": 1,
  "nextId": 1,
  "tickets": {}
}
```
