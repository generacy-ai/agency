# Quickstart: BacklogProvider Interface

## Overview

The BacklogProvider interface provides a unified contract for interacting with ticket/issue systems across different backlog providers (GitHub, Jira, Shortcut, local).

## Installation

```bash
# From the monorepo root
pnpm install
pnpm build
```

## Usage

### Implementing a Provider

```typescript
import { BacklogProvider, Ticket, TicketCreateParams, TicketUpdates } from '@agency/backlog/providers';
import { TicketRef } from '@agency/backlog/types';

class MyProvider implements BacklogProvider {
  readonly name = 'github' as const;

  async getTicket(ref: string): Promise<Ticket> {
    // Fetch ticket from your system
  }

  async createTicket(params: TicketCreateParams): Promise<Ticket> {
    // Create a new ticket
  }

  async updateTicket(ref: string, updates: TicketUpdates): Promise<Ticket> {
    // Update an existing ticket
  }

  async checkAuth(): Promise<{ ok: boolean; message?: string }> {
    // Verify authentication is valid
    return { ok: true };
  }

  getTicketUrl(ref: string): string {
    // Return the web URL for this ticket
    return `https://example.com/tickets/${ref}`;
  }

  parseRef(input: string): TicketRef | null {
    // Parse a string reference into a TicketRef
    // Return null if the format is not recognized
  }

  // Optional: Implement label management
  async setLabels(ref: string, labels: string[]): Promise<void> {
    // Set labels on a ticket
  }

  async getLabels(ref: string): Promise<string[]> {
    // Get labels from a ticket
  }

  // Optional: Implement search
  async searchTickets(query: string): Promise<Ticket[]> {
    // Search for tickets
  }
}
```

### Handling Errors

```typescript
import { AuthError, NotFoundError, ProviderError } from '@agency/backlog/providers';

async function fetchTicket(provider: BacklogProvider, ref: string) {
  try {
    return await provider.getTicket(ref);
  } catch (error) {
    if (error instanceof AuthError) {
      console.error(`Authentication failed for ${error.provider}: ${error.message}`);
    } else if (error instanceof NotFoundError) {
      console.error(`Ticket not found: ${error.ref}`);
    } else if (error instanceof ProviderError) {
      console.error(`Provider error: ${error.message}`);
    }
    throw error;
  }
}
```

### Checking Optional Method Support

```typescript
function supportsLabels(provider: BacklogProvider): boolean {
  return provider.setLabels !== undefined && provider.getLabels !== undefined;
}

function supportsSearch(provider: BacklogProvider): boolean {
  return provider.searchTickets !== undefined;
}

// Usage
if (supportsLabels(provider)) {
  await provider.setLabels!(ref, ['bug', 'urgent']);
}
```

## Type Reference

### Core Types

| Type | Description |
|------|-------------|
| `BacklogProvider` | Main interface for provider implementations |
| `Ticket` | Represents a ticket/issue |
| `TicketRef` | Reference to a ticket (from F2) |
| `TicketCreateParams` | Parameters for creating a ticket |
| `TicketUpdates` | Parameters for updating a ticket |

### Error Types

| Error | When Thrown |
|-------|-------------|
| `ProviderError` | Generic provider error (base class) |
| `AuthError` | Authentication/authorization failure |
| `NotFoundError` | Ticket or resource not found |

## Ticket States

| State | Description |
|-------|-------------|
| `open` | Ticket is open/active |
| `closed` | Ticket is closed/resolved |
| `in_progress` | Ticket is being worked on |

## Troubleshooting

### Error: "Authentication failed"
- Verify your API token is set correctly
- Check token permissions for the required operations
- Ensure the token hasn't expired

### Error: "Ticket not found"
- Verify the reference format is correct for the provider
- Check that the ticket exists and you have access to it
- Ensure the repository/project is correct

### TypeScript compilation errors
- Ensure all required methods are implemented
- Check that return types match the interface exactly
- Verify you're importing from the correct paths
