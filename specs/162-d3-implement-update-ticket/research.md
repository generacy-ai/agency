# Research: update_ticket Tool Implementation

## Technology Decisions

### 1. Tool Architecture Pattern

**Decision**: Follow the `createXxxTool(config, getProvider)` factory pattern

**Rationale**:
- Consistent with existing `createGetTicketTool` and `createCreateTicketTool`
- Enables dependency injection for testing
- Separates tool definition from provider instantiation

### 2. Provider Auto-Detection

**Decision**: Use `detectTicketRef()` for provider routing (like get-ticket)

**Alternatives Considered**:
- **Always use default provider** (like create-ticket): Simpler but less flexible
- **Require explicit provider param**: More explicit but worse UX

**Rationale**: Updates should work seamlessly with cross-repo references and URLs, same as get-ticket.

### 3. Label Operation Semantics

**Decision**: Provide `add_labels` and `remove_labels` params instead of `labels` replace-all

**Alternatives Considered**:
- **Replace-all labels param**: Simpler but requires caller to know current labels
- **Both add/remove AND replace-all**: More flexible but confusing API

**Rationale**: Add/remove semantics are more intuitive for common use cases (adding a "done" label, removing "in-progress"). If caller wants replace-all, they can combine with a getTicket call.

### 4. State Change Implementation

**Decision**: Handle state changes in the tool layer, not provider interface

**Options Analyzed**:
1. **Extend TicketUpdates type**: Would require updating all provider implementations
2. **Add separate setState method to BacklogProvider**: Additional interface method
3. **Handle in tool via gh commands**: Pragmatic, works with existing interface

**Implementation**: For GitHub, use `gh issue close/reopen` commands. The tool will:
```typescript
if (state === 'closed') await ghExec(['issue', 'close', id]);
if (state === 'open') await ghExec(['issue', 'reopen', id]);
```

## Implementation Patterns

### Error Handling Pattern

```typescript
// Catch specific errors for user-friendly messages
try {
  const ticket = await provider.updateTicket(ref, updates);
  return { content: [...], isError: false };
} catch (error) {
  if (error instanceof NotFoundError) {
    return { content: [...], isError: true };  // User-friendly
  }
  throw error;  // Auth and other errors propagate
}
```

### Terse Output Pattern

Following create-ticket's pattern:
```typescript
return {
  content: [{
    type: 'text',
    text: JSON.stringify({
      updated: true,
      id: ticket.ref.id,
      url: ticket.url,
      changes: changedFields,  // e.g., ['title', 'labels']
    }),
  }],
};
```

### Label Calculation Pattern

```typescript
async function calculateLabels(
  provider: BacklogProvider,
  ref: string,
  addLabels?: string[],
  removeLabels?: string[]
): Promise<string[] | undefined> {
  if (!addLabels?.length && !removeLabels?.length) {
    return undefined;  // No label changes
  }

  const current = provider.getLabels
    ? await provider.getLabels(ref)
    : [];

  const toAdd = addLabels ?? [];
  const toRemove = new Set(removeLabels ?? []);

  return [...current.filter(l => !toRemove.has(l)), ...toAdd];
}
```

## Key References

### Existing Tool Implementations

1. **get-ticket.ts:89-140**: Input validation and error handling pattern
2. **get-ticket.ts:108-124**: detectTicketRef usage for provider routing
3. **create-ticket.ts:98-152**: Terse output format and execute structure
4. **github-cli.ts:670-726**: updateTicket implementation in provider

### Provider Interface

From `providers/types.ts:267-288`:
```typescript
updateTicket(ref: string, updates: TicketUpdates): Promise<Ticket>;
```

Where `TicketUpdates = Partial<TicketCreateParams>` includes:
- title?: string
- body?: string
- labels?: string[]

Note: Does NOT include `state` - this is why tool handles state separately.

## Testing Strategy

1. **Unit tests for input validation**: Invalid ref, empty updates
2. **Unit tests for label calculation**: Add-only, remove-only, combined
3. **Integration with mock provider**: Verify correct provider methods called
4. **Error handling tests**: NotFoundError, AuthError propagation
