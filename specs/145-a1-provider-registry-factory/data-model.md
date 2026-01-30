# Data Model: Provider Registry

## Core Entities

### BacklogProvider (Interface - Existing)

```typescript
export interface BacklogProvider {
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

### BacklogProviderName (Type - Existing)

```typescript
export type BacklogProviderName = 'github' | 'jira' | 'shortcut' | 'local';
```

### BacklogConfig (Type - Existing)

```typescript
export interface BacklogConfig {
  provider: BacklogProviderName;
  github?: {};
  jira?: { baseUrl: string; projectKey: string };
  shortcut?: { workspaceSlug: string };
}
```

## New Types

### ProviderNotFoundError (New)

```typescript
export class ProviderNotFoundError extends ProviderError {
  constructor(provider: string) {
    super(`Provider not found: ${provider}`, provider);
    this.name = 'ProviderNotFoundError';
  }
}
```

## Registry State

### Provider Cache

```typescript
// Internal module state
const providers = new Map<string, BacklogProvider>();
```

- **Key**: Provider name (e.g., 'github', 'jira')
- **Value**: BacklogProvider instance
- **Cardinality**: One instance per provider type

## Relationships

```
BacklogConfig
     │
     ▼ (factory input)
createProvider()
     │
     ▼ (creates)
BacklogProvider
     │
     ▼ (cached in)
providers Map
     │
     ▼ (retrieved via)
getProvider() / getConfiguredProvider()
```

## Validation Rules

1. Provider name must be one of: 'github', 'jira', 'shortcut', 'local'
2. Unknown provider names throw `ProviderNotFoundError`
3. `getProvider()` throws if provider not in cache
4. Config must have corresponding provider-specific config object
