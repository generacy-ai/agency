# Research: D2 - Implement create_ticket tool

## Technology Decisions

### 1. Tool Pattern: Follow get-ticket.ts

**Decision**: Mirror the structure and patterns from `get-ticket.ts`

**Rationale**:
- Consistent codebase patterns
- Proven error handling approach
- Same configuration/provider integration

**Key patterns to follow**:
- Factory function signature: `createCreateTicketTool(config, getProvider)`
- Input validation with structured error responses
- Terse output format (JSON stringified result)

### 2. Provider Resolution: Default Provider Only

**Decision**: Use configured default provider, no auto-detection

**Rationale**:
- `get-ticket` auto-detects from reference format (e.g., `#123` → GitHub, `PROJ-123` → Jira)
- `create-ticket` has no existing reference to detect from
- Simpler implementation, clearer behavior

**Alternative considered**:
- Accept explicit `provider` parameter
- Rejected: Adds complexity, config already specifies default

### 3. Error Handling: Let Exceptions Propagate

**Decision**: No try/catch around provider.createTicket()

**Rationale**:
- Matches clarification Q3 in get-ticket.ts comments
- Provider errors (AuthError, ProviderError) contain useful details
- Framework handles error serialization

### 4. Output Format: Terse JSON

**Decision**: Return `{ created: true, id, url }` only

**Rationale**:
- `outputPattern: 'terse'` in tool definition
- Agents don't need full ticket object after creation
- URL is the key actionable information

**Alternative considered**:
- Return full `Ticket` object
- Rejected: Verbose for typical use case

## Implementation Patterns

### Factory Function Signature
```typescript
export function createCreateTicketTool(
  config: SpecKitConfig,
  getProvider: () => BacklogProvider
): AgencyTool
```

Note: Unlike `get-ticket` which uses `(name?: string) => BacklogProvider`, we use `() => BacklogProvider` since we always use the default provider.

### Input Schema
```typescript
inputSchema: {
  type: 'object',
  properties: {
    title: { type: 'string', description: 'Ticket title' },
    body: { type: 'string', description: 'Ticket body/description (markdown supported)' },
    labels: { type: 'array', items: { type: 'string' }, description: 'Labels to add to the ticket' },
  },
  required: ['title'],
}
```

## References

- `packages/agency-plugin-spec-kit/src/tools/get-ticket.ts` - Reference tool implementation
- `packages/agency-plugin-spec-kit/src/providers/types.ts` - BacklogProvider interface
- `packages/agency-plugin-spec-kit/src/providers/github.ts` - createTicket() example implementation
- Issue spec: Tool definition in acceptance criteria
