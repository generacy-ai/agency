# Implementation Plan: LocalProvider for Offline Ticket Tracking

**Feature**: A4: LocalProvider implementation
**Branch**: `148-a4-localprovider-implementation`
**Status**: Complete

## Summary

Implement a full LocalProvider for offline/file-based ticket tracking in spec-kit. This enables spec-kit workflows without any external backlog system (GitHub, Jira, etc.) - useful for offline work, personal projects, testing, and quick prototyping.

The provider stores tickets in a local JSON file (`.specify/local-tickets.json`) with auto-generated IDs (`LOCAL-001`, `LOCAL-002`, etc.).

## Technical Context

- **Language**: TypeScript (ESM)
- **Package**: `packages/agency-plugin-spec-kit`
- **Location**: `src/providers/local.ts` (existing stub to be replaced)
- **Dependencies**: Node.js fs/promises for file I/O
- **Pattern**: Follows existing GitHubProvider patterns

## Project Structure

```
packages/agency-plugin-spec-kit/
├── src/
│   ├── providers/
│   │   ├── local.ts        # LocalProvider implementation (modify)
│   │   ├── types.ts        # BacklogProvider interface (reference only)
│   │   ├── errors.ts       # Error classes (reference only)
│   │   └── registry.ts     # Provider registration (reference only)
│   └── types/
│       └── ticket.ts       # TicketRef types (reference only)
└── tests/
    └── providers/
        └── local.test.ts   # Unit tests (create)
```

## Key Design Decisions

### 1. Storage Location
- Default: `.specify/local-tickets.json` (relative to working directory)
- Configurable via constructor option

### 2. ID Format (addressing Q2)
- Format: `LOCAL-NNN` with zero-padded 3-digit minimum
- IDs naturally extend beyond 999: `LOCAL-001`, `LOCAL-999`, `LOCAL-1000`
- Minimum padding ensures consistent sorting for first 999 tickets

### 3. Delete Operation (addressing Q1)
- **No delete method** - tickets are permanent once created
- Matches typical backlog semantics (issues rarely deleted)
- Users can manually edit JSON file if needed

### 4. Optional Methods (addressing Q3)
- **Implement setLabels and getLabels** for full label support
- Skip searchTickets (adds complexity, limited value for local files)
- Labels stored as simple string arrays per the spec

### 5. Reference Parsing
- Accept: `LOCAL-001`, `LOCAL-1`, `001`, `1` (bare numbers)
- Case-insensitive for the `LOCAL-` prefix

### 6. File Locking
- Use atomic write pattern (write to temp, rename)
- Sufficient for single-user local scenarios

## Interface Compliance

Required methods:
- [x] `name: 'local'`
- [x] `getTicket(ref: string): Promise<Ticket>`
- [x] `createTicket(params: TicketCreateParams): Promise<Ticket>`
- [x] `updateTicket(ref: string, updates: TicketUpdates): Promise<Ticket>`
- [x] `checkAuth(): Promise<AuthCheckResult>` (always returns `ok: true`)
- [x] `getTicketUrl(ref: string): string` (returns `local://LOCAL-001`)
- [x] `parseRef(input: string): TicketRef | null`

Optional methods:
- [x] `setLabels(ref: string, labels: string[]): Promise<void>`
- [x] `getLabels(ref: string): Promise<string[]>`
- [ ] `searchTickets(query: string): Promise<Ticket[]>` (deferred)

## Data Structures

### LocalTicketStore (file format)
```typescript
interface LocalTicketStore {
  version: 1;
  nextId: number;
  tickets: Record<string, LocalTicket>;
}
```

### LocalTicket (internal storage)
```typescript
interface LocalTicket {
  id: string;           // "LOCAL-001"
  title: string;
  body?: string;
  state: TicketState;   // 'open' | 'closed' | 'in_progress'
  labels: string[];
  createdAt: string;    // ISO 8601
  updatedAt: string;    // ISO 8601
}
```

## Error Handling

- `NotFoundError`: Ticket doesn't exist
- `ProviderError`: File system errors (permissions, disk full)
- No `AuthError` - local provider never requires auth

## Testing Strategy

1. **Unit tests** for all public methods
2. Use temp directories to avoid polluting working directory
3. Test edge cases: empty store, missing file, concurrent access
4. Test ID parsing variations

## Out of Scope

- Synchronization across multiple machines
- Conflict resolution
- Search/query functionality
- Ticket deletion
- Migration tools from/to other providers
