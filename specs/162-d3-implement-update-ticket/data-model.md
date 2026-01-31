# Data Model: update_ticket Tool

## Core Interfaces

### Tool Input Parameters

```typescript
/**
 * Input parameters for update_ticket tool.
 */
interface UpdateTicketParams {
  /**
   * Ticket reference - URL or identifier (required).
   *
   * Supported formats:
   * - GitHub URL: https://github.com/owner/repo/issues/123
   * - GitHub shorthand: #123, owner/repo#123
   * - Jira: PROJ-123
   * - Shortcut: sc-123
   * - Bare number: 123 (uses default provider)
   */
  ref: string;

  /**
   * New ticket title (optional).
   * If provided, updates the ticket title.
   */
  title?: string;

  /**
   * New ticket body/description (optional).
   * Supports markdown formatting.
   * If provided, replaces the entire body.
   */
  body?: string;

  /**
   * New ticket state (optional).
   * - 'open': Reopen a closed ticket
   * - 'closed': Close an open ticket
   */
  state?: 'open' | 'closed';

  /**
   * Labels to add to the ticket (optional).
   * Added to existing labels (does not replace).
   */
  add_labels?: string[];

  /**
   * Labels to remove from the ticket (optional).
   * Removed from existing labels if present.
   */
  remove_labels?: string[];
}
```

### Tool Output

```typescript
/**
 * Successful update response.
 */
interface UpdateTicketSuccess {
  updated: true;
  id: string;
  url: string;
  changes: string[];  // Fields that were changed, e.g., ['title', 'labels', 'state']
}

/**
 * Error response for not found.
 */
interface UpdateTicketNotFound {
  error: 'not_found';
  message: string;
  ref: string;
}

/**
 * Error response for invalid input.
 */
interface UpdateTicketInvalidInput {
  error: 'invalid_input';
  message: string;
  hint?: string;
}
```

## Existing Types (Used, Not Modified)

### From providers/types.ts

```typescript
// TicketUpdates - passed to provider
type TicketUpdates = Partial<TicketCreateParams>;

interface TicketCreateParams {
  title: string;
  body?: string;
  labels?: string[];
}

// Ticket - returned from provider
interface Ticket {
  ref: TicketRef;
  title: string;
  body?: string;
  state: TicketState;
  labels: string[];
  url: string;
  meta?: Record<string, unknown>;
}

type TicketState = 'open' | 'closed' | 'in_progress';
```

### From types/ticket.ts

```typescript
interface TicketRef {
  provider: BacklogProviderName;
  id: string;
  url?: string;
  raw: string;
}
```

## Validation Rules

### ref (required)
- Must be a non-empty string
- Must be parseable by `detectTicketRef()`
- Invalid format returns error with hint about supported formats

### title (optional)
- If provided, must be a non-empty string after trim
- Empty string after trim is invalid

### body (optional)
- Any string value is valid (including empty string to clear body)

### state (optional)
- Must be exactly 'open' or 'closed'
- Other values are invalid

### add_labels / remove_labels (optional)
- If provided, must be arrays of strings
- Empty arrays are valid (no-op)
- Duplicate labels are handled gracefully

## State Transitions

```
┌──────────┐    state: 'closed'    ┌──────────┐
│   OPEN   │ ─────────────────────→│  CLOSED  │
└──────────┘                       └──────────┘
     ↑                                   │
     │        state: 'open'              │
     └───────────────────────────────────┘
```

Note: `in_progress` state is read-only (derived from labels), not settable via this tool.

## Relationships

```
UpdateTicketParams
       │
       │ parsed by
       ↓
   TicketRef ←──────── detectTicketRef()
       │
       │ determines
       ↓
 BacklogProvider
       │
       │ updateTicket(ref, updates)
       ↓
    Ticket (updated)
       │
       │ mapped to
       ↓
UpdateTicketSuccess
```
