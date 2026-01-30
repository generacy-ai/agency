# Data Model: D2 - Implement create_ticket tool

## Core Types (Existing)

### TicketCreateParams
From `packages/agency-plugin-spec-kit/src/providers/types.ts`:

```typescript
interface TicketCreateParams {
  title: string;       // Required - ticket title
  body?: string;       // Optional - markdown description
  labels?: string[];   // Optional - labels to apply
}
```

### Ticket
From `packages/agency-plugin-spec-kit/src/providers/types.ts`:

```typescript
interface Ticket {
  ref: TicketRef;      // Provider, ID, URL, raw input
  title: string;
  body?: string;
  state: TicketState;  // 'open' | 'closed' | 'in_progress'
  labels: string[];
  url: string;
  meta?: Record<string, unknown>;
}
```

### TicketRef
From `packages/agency-plugin-spec-kit/src/types/ticket.ts`:

```typescript
interface TicketRef {
  provider: TicketProvider;  // 'github' | 'jira' | 'shortcut' | 'local' | string
  id: string;                // Issue number or key
  url?: string;              // Full URL to ticket
  raw: string;               // Original input string
}
```

## New Types (Tool-Specific)

### CreateTicketParams
Input parameters for the tool:

```typescript
interface CreateTicketParams {
  title: string;       // Required - ticket title
  body?: string;       // Optional - markdown body
  labels?: string[];   // Optional - labels to add
}
```

### CreateTicketResult
Success response structure:

```typescript
interface CreateTicketResult {
  created: true;
  id: string;          // Ticket ID (e.g., "123")
  url: string;         // Full URL to view ticket
}
```

### CreateTicketError
Error response structure:

```typescript
interface CreateTicketError {
  error: string;       // Error type (e.g., "Invalid input")
  message: string;     // Human-readable message
}
```

## Type Flow

```
User Input (MCP)
    ↓
CreateTicketParams
    ↓
TicketCreateParams (provider interface)
    ↓
BacklogProvider.createTicket()
    ↓
Ticket (full ticket object)
    ↓
CreateTicketResult (terse output)
```

## Validation Rules

| Field | Validation |
|-------|------------|
| `title` | Required, non-empty string |
| `body` | Optional, any string (markdown) |
| `labels` | Optional, array of strings |
