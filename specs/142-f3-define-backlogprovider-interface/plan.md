# Implementation Plan: BacklogProvider Interface

**Feature**: Define the BacklogProvider interface for abstracting ticket/issue operations
**Branch**: `142-f3-define-backlogprovider-interface`
**Status**: Complete

## Summary

This feature defines the `BacklogProvider` interface that abstracts ticket/issue operations across different backlog systems (GitHub, Jira, Shortcut, local). The interface provides a contract for CRUD operations on tickets, optional label management and search capabilities, and authentication checks. It also defines minimal error types (AuthError, NotFoundError, ProviderError) for consistent error handling across providers.

## Technical Context

- **Language**: TypeScript
- **Runtime**: Node.js
- **Build System**: pnpm workspaces + TypeScript (tsc)
- **Package Location**: `packages/backlog` (new package)
- **Dependencies**:
  - F1: Package structure (provides the base package setup)
  - F2: Core types for `TicketRef` (import from `../types`)

## Project Structure

```
packages/backlog/
├── src/
│   ├── providers/
│   │   ├── types.ts          # BacklogProvider interface, Ticket, TicketCreateParams, TicketUpdates
│   │   ├── errors.ts         # ProviderError, AuthError, NotFoundError
│   │   └── index.ts          # Re-exports for providers module
│   ├── types/                # (from F2 - TicketRef lives here)
│   │   └── index.ts
│   └── index.ts              # Package entry point
├── package.json
├── tsconfig.json
└── README.md
```

## Key Design Decisions

### 1. Interface Design
- **Required methods**: `getTicket`, `createTicket`, `updateTicket`, `checkAuth`, `getTicketUrl`, `parseRef`
- **Optional methods**: `setLabels`, `getLabels`, `searchTickets` (marked with `?`)
- **Provider identity**: `readonly name` property with union type for known providers

### 2. Type Definitions
- `TicketRef` imported from F2 core types (not redefined)
- `TicketUpdates` as `Partial<TicketCreateParams>` - simple and consistent
- `Ticket.state` uses union type: `'open' | 'closed' | 'in_progress'`
- `Ticket.meta` for provider-specific metadata as `Record<string, unknown>`

### 3. Error Hierarchy
```
ProviderError (base)
├── AuthError     (authentication failures)
└── NotFoundError (resource not found, includes optional ref)
```

### 4. What's NOT Included (By Design)
- Provider-specific config types (deferred to individual provider implementations)
- `deleteTicket` method (use state changes via `updateTicket` instead)
- Rate limiting errors (can be added later if needed)

## Implementation Phases

### Phase 1: Error Types
Create `src/providers/errors.ts` with:
- `ProviderError` base class with `provider` property
- `AuthError` extending `ProviderError`
- `NotFoundError` extending `ProviderError` with optional `ref` property

### Phase 2: Interface Types
Create `src/providers/types.ts` with:
- Import `TicketRef` from F2 core types
- `BacklogProvider` interface with all methods
- `TicketCreateParams` interface
- `TicketUpdates` type alias
- `Ticket` interface

### Phase 3: Module Exports
Create `src/providers/index.ts` to re-export all types and errors.

## Code Style

Following existing patterns from `packages/agency-extension`:
- Use `class` for errors with explicit `name` property assignment
- Use `interface` for type definitions
- Use `type` for aliases and unions
- JSDoc comments for public APIs
- Export types via barrel files (`index.ts`)

## Dependencies

| Dependency | Type | Purpose |
|------------|------|---------|
| F2 TicketRef | Internal | Core type for ticket references |
| TypeScript | Dev | Type definitions |

## Testing Strategy

Since this is a pure type/interface definition task with no runtime logic:
- **Type checking**: Verify types compile correctly
- **Export verification**: Ensure all types are exported from the package
- **Integration**: Provider implementations (future tasks) will validate the interface contract

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| F2 TicketRef not yet available | Import path may need adjustment; interface shape is documented |
| Interface may need extension | Optional methods pattern allows adding features without breaking changes |

## Next Steps

After implementation:
1. Run `/speckit:tasks` to generate the task breakdown
2. Implement the types and errors
3. Ensure types are exported from the package entry point
