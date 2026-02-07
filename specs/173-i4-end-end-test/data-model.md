# Data Model: Local Provider Integration Tests

## Core Entities

### LocalTicketStore

The root storage structure persisted to `.specify/local-tickets.json`:

```typescript
interface LocalTicketStore {
  /** Schema version for future migrations */
  version: 1;

  /** Next ID to generate (auto-incrementing) */
  nextId: number;

  /** Tickets indexed by ID string (e.g., "LOCAL-001") */
  tickets: Record<string, LocalTicket>;
}
```

### LocalTicket

Individual ticket stored in the local store:

```typescript
interface LocalTicket {
  /** Unique identifier (e.g., "LOCAL-001") */
  id: string;

  /** Ticket title */
  title: string;

  /** Optional markdown body */
  body?: string;

  /** Current state */
  state: TicketState;

  /** Labels attached to ticket */
  labels: string[];

  /** Creation timestamp (ISO 8601) */
  createdAt: string;

  /** Last update timestamp (ISO 8601) */
  updatedAt: string;
}
```

### TicketState

Enumeration of valid ticket states:

```typescript
type TicketState = 'open' | 'closed' | 'in_progress';
```

### Ticket (Normalized)

The normalized ticket format returned by provider methods:

```typescript
interface Ticket {
  ref: TicketRef;
  title: string;
  body?: string;
  state: TicketState;
  labels: string[];
}
```

### TicketRef

Reference object for addressing tickets:

```typescript
interface TicketRef {
  /** Provider identifier */
  provider: 'local' | 'github';

  /** Ticket ID within provider */
  id: string;
}
```

## Validation Rules

### ID Format
- Pattern: `LOCAL-NNN` where NNN is zero-padded to at least 3 digits
- Valid: `LOCAL-001`, `LOCAL-042`, `LOCAL-1000`
- Invalid: `LOCAL-1`, `LOCAL-01`, `local001`

### Reference Parsing
Accepts flexible input formats:
| Input | Parsed ID |
|-------|-----------|
| `LOCAL-001` | `LOCAL-001` |
| `local-001` | `LOCAL-001` |
| `001` | `LOCAL-001` |
| `1` | `LOCAL-001` |

### Title Requirements
- Required field
- Minimum length: 1 character
- No maximum length enforced

### State Transitions
All transitions are allowed:
- `open` → `closed` | `in_progress`
- `in_progress` → `open` | `closed`
- `closed` → `open` | `in_progress`

## Relationships

```
┌─────────────────────────────────────────┐
│             LocalTicketStore             │
├─────────────────────────────────────────┤
│  version: 1                             │
│  nextId: number                         │
│  tickets: Record<string, LocalTicket>   │
└───────────────────┬─────────────────────┘
                    │ 1:N
                    ▼
         ┌─────────────────────┐
         │     LocalTicket      │
         ├─────────────────────┤
         │  id: string          │
         │  title: string       │
         │  body?: string       │
         │  state: TicketState  │
         │  labels: string[]    │
         │  createdAt: string   │
         │  updatedAt: string   │
         └─────────────────────┘
                    │
                    │ normalized to
                    ▼
            ┌──────────────┐
            │    Ticket     │
            ├──────────────┤
            │  ref: TicketRef │
            │  title: string  │
            │  body?: string  │
            │  state: TicketState │
            │  labels: string[]   │
            └──────────────┘
```

## File Structure

Storage location: `{projectRoot}/.specify/local-tickets.json`

Example content:
```json
{
  "version": 1,
  "nextId": 3,
  "tickets": {
    "LOCAL-001": {
      "id": "LOCAL-001",
      "title": "First ticket",
      "body": "Description here",
      "state": "open",
      "labels": ["feature"],
      "createdAt": "2026-02-01T10:00:00.000Z",
      "updatedAt": "2026-02-01T10:00:00.000Z"
    },
    "LOCAL-002": {
      "id": "LOCAL-002",
      "title": "Second ticket",
      "state": "in_progress",
      "labels": [],
      "createdAt": "2026-02-01T11:00:00.000Z",
      "updatedAt": "2026-02-01T11:30:00.000Z"
    }
  }
}
```
