# Implementation Plan: D3: Implement update_ticket tool

**Feature**: Implement the `spec_kit.update_ticket` MCP tool that updates existing tickets in the configured backlog provider
**Branch**: `162-d3-implement-update-ticket`
**Status**: Complete

## Summary

Implement a new `update_ticket` tool for the spec-kit plugin that allows updating existing tickets in the configured backlog system. The tool will support partial updates (only specified fields), add/remove label operations, state changes, and graceful error handling for not-found cases.

## Technical Context

- **Language**: TypeScript (ESM)
- **Framework**: Agency MCP tools
- **Package**: `@generacy-ai/agency-plugin-spec-kit`
- **Dependencies**:
  - `@generacy-ai/agency` (AgencyTool, ToolResult types)
  - Existing BacklogProvider interface (already supports `updateTicket`)
  - Existing ProviderRegistry for provider resolution
  - Existing `detectTicketRef` utility for parsing references

## Project Structure

```
packages/agency-plugin-spec-kit/
├── src/
│   ├── tools/
│   │   ├── index.ts              # Export createUpdateTicketTool, add to createTools()
│   │   ├── update-ticket.ts      # NEW: Main implementation
│   │   ├── get-ticket.ts         # Reference: existing pattern
│   │   └── create-ticket.ts      # Reference: existing pattern
│   ├── providers/
│   │   ├── types.ts              # BacklogProvider interface (already has updateTicket)
│   │   └── github-cli.ts         # Already implements updateTicket
│   └── utils/
│       └── detect-ticket-ref.ts  # Used for parsing refs
└── tests/
    └── update-ticket-tool.test.ts # NEW: Unit tests
```

## Implementation Approach

### 1. Tool Interface

The tool accepts the following parameters (matching the spec definition):
- `ref` (required): Ticket reference - URL or identifier
- `title` (optional): New ticket title
- `body` (optional): New ticket body
- `state` (optional): New ticket state ('open' | 'closed')
- `add_labels` (optional): Labels to add
- `remove_labels` (optional): Labels to remove

### 2. Label Handling Strategy

The tool provides `add_labels` and `remove_labels` for precise label control, which differs from the `BacklogProvider.updateTicket` interface that uses a `labels` field that replaces all labels. The tool will:

1. If only `add_labels` or `remove_labels` specified:
   - Fetch current labels via `provider.getLabels()` (if available)
   - Calculate new label set: `(currentLabels - remove_labels) + add_labels`
   - Pass computed `labels` array to `provider.updateTicket()`

2. If neither label param specified:
   - Don't include `labels` in updates

### 3. State Handling

The spec defines state as `'open' | 'closed'`. The existing `BacklogProvider.updateTicket()` accepts `TicketUpdates` which is `Partial<TicketCreateParams>` and doesn't include state. However:

- GitHub CLI provider's `updateTicket` would need enhancement, OR
- We can use `gh issue close/reopen` commands separately for state changes

**Decision**: Extend the tool to handle state changes via provider-specific methods. For GitHub, this means:
- State 'closed' → call `gh issue close`
- State 'open' (on closed issue) → call `gh issue reopen`

This will require adding state-change capability to the tool implementation itself, since the provider interface doesn't currently support it directly.

### 4. Error Handling

- **Not found errors**: Catch `NotFoundError` from provider and return user-friendly error response
- **Auth errors**: Let propagate (per existing pattern from get-ticket)
- **Validation errors**: Return `isError: true` with helpful message

### 5. Response Format

Follow existing `outputPattern: 'terse'` pattern from create-ticket:
```json
{
  "updated": true,
  "id": "123",
  "url": "https://github.com/owner/repo/issues/123",
  "changes": ["title", "labels"]
}
```

## Key Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Label operations | Add/Remove semantic | More intuitive than replace-all; matches common workflows |
| Provider resolution | Use detectTicketRef for provider auto-detection | Consistent with get-ticket pattern |
| State changes | Handle in tool layer | Provider interface doesn't support state; keep provider simple |
| Error propagation | Catch NotFoundError, let others propagate | Balance user experience with debugging needs |

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `src/tools/update-ticket.ts` | Create | Main tool implementation |
| `src/tools/index.ts` | Modify | Export and register the new tool |
| `tests/update-ticket-tool.test.ts` | Create | Unit tests |

## Dependencies

All dependencies are already available in the codebase:
- A1 (provider registry) - `ProviderRegistry` in `src/providers/registry.ts`
- A5 (auto-detect logic) - `detectTicketRef` in `src/utils/detect-ticket-ref.ts`
- F2 (Ticket types) - `Ticket` in `src/providers/types.ts`
- F3 (BacklogProvider interface) - in `src/providers/types.ts`
- D1 (shared patterns) - `get-ticket.ts` and `create-ticket.ts` as references

## Integration Points

1. **Tool Registration**: Add to `createTools()` array in `src/tools/index.ts`
2. **Provider Interface**: Uses existing `BacklogProvider.updateTicket()` method
3. **Label Operations**: Uses existing `BacklogProvider.getLabels()` and `setLabels()` (optional methods)
