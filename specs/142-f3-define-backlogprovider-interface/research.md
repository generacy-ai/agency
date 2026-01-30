# Research: BacklogProvider Interface Design

## Technology Decisions

### 1. Type-Only Package vs Runtime Code
**Decision**: Type definitions with error classes (minimal runtime code)

**Rationale**:
- Error classes require runtime code for `instanceof` checks to work correctly
- Interface and type definitions are compile-time only
- This hybrid approach is standard for TypeScript libraries

### 2. Error Class Inheritance Pattern
**Decision**: Use standard ES6 class inheritance extending `Error`

**Alternatives Considered**:
- **Result types**: `Result<T, E>` pattern - more functional but adds complexity and differs from existing codebase patterns
- **Error codes enum**: Less type-safe, harder to extend
- **Tagged unions**: `{ type: 'auth', ... } | { type: 'notFound', ... }` - good but loses `instanceof` support

**Rationale**: Following the pattern established in `packages/agency-extension/src/errors/ErrorTypes.ts` which uses class inheritance.

### 3. Optional Methods Pattern
**Decision**: Use TypeScript optional method syntax (`method?()`)

**Alternatives Considered**:
- **Separate interfaces**: `BacklogProviderWithLabels extends BacklogProvider` - more complex inheritance
- **Capability flags**: `supports: { labels: boolean, search: boolean }` - runtime checks needed

**Rationale**: Optional methods are a well-understood TypeScript pattern and allow providers to implement only what they support naturally.

### 4. State as Union Type
**Decision**: `state: 'open' | 'closed' | 'in_progress'`

**Alternatives Considered**:
- **Enum**: `enum TicketState { Open, Closed, InProgress }` - more ceremony, import required
- **Extensible string**: `state: string` - loses type safety

**Rationale**: Union types are simpler, provide good type safety, and serialize cleanly to JSON.

## Implementation Patterns

### Provider Name as Literal Type
```typescript
readonly name: 'github' | 'jira' | 'shortcut' | 'local';
```
This pattern:
- Ensures type-safe provider discrimination
- Allows exhaustive switch statements
- Can be extended by adding to the union

### Reference Parsing Pattern
```typescript
parseRef(input: string): TicketRef | null;
```
Providers accept various input formats:
- GitHub: `#123`, `owner/repo#123`, full URL
- Jira: `PROJ-123`, full URL
- Shortcut: `sc-123`, story URL

Returning `null` for invalid input allows chaining parsers:
```typescript
const ref = github.parseRef(input) ?? jira.parseRef(input) ?? local.parseRef(input);
```

### Metadata Extension Pattern
```typescript
meta?: Record<string, unknown>;
```
Allows providers to attach additional data without polluting the core interface:
- GitHub: `{ assignees, milestone, project }`
- Jira: `{ priority, sprint, epic }`

## Key Sources

### Existing Implementation Reference
`/workspaces/claude-plugins/plugins/speckit/mcp-server/src/utils/github.ts`
- Current GitHub-specific implementation
- Provides reference for API patterns

### Error Pattern Reference
`/workspaces/agency/packages/agency-extension/src/errors/ErrorTypes.ts`
- Established error class pattern in this codebase
- Shows proper `name` property assignment
- Demonstrates inheritance pattern

### Type Export Pattern Reference
`/workspaces/agency/packages/agency-extension/src/types/index.ts`
- Barrel file pattern for type re-exports
- Separation of concerns by domain

## Provider-Specific Considerations

### GitHub
- Uses issue numbers as IDs
- Labels are first-class citizens
- Search via GitHub search syntax
- Auth via `GITHUB_TOKEN` or GitHub CLI

### Jira (Future)
- Uses project-key format (PROJ-123)
- Rich custom field support
- JQL for search
- Auth via API token or OAuth

### Shortcut (Future)
- Uses numeric story IDs
- Iteration/sprint model
- Label support
- Auth via API token

### Local (Future)
- File-based ticket storage
- No authentication needed
- Full offline support
- Markdown format for tickets
