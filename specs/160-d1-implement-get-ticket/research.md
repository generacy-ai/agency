# Research Notes: D1: Implement get_ticket tool

## Technology Decisions

### 1. GitHub API Client

**Choice**: `@octokit/rest`

**Rationale**:
- Already available in the monorepo workspace
- Official GitHub library with TypeScript support
- Built-in rate limiting and pagination
- Automatic request retries

**Alternatives Considered**:
- `gh` CLI: Requires subprocess, less programmatic control
- Raw `fetch`: No auth handling, rate limiting, or typed responses

### 2. Reference Detection Pattern

**Choice**: Regex-based pattern matching with provider-specific parsers

**Rationale**:
- Each provider has distinct reference patterns
- Regex is fast and deterministic
- Easy to test comprehensively
- Can chain parsers to try multiple providers

**Pattern Precedence**:
1. Full URLs (most specific) - check domain
2. Provider-specific formats (e.g., `PROJ-123` for Jira)
3. Ambiguous formats (e.g., `#123`) - use configured provider

### 3. Provider Instance Management

**Choice**: Lazy singleton per provider type

**Rationale**:
- Avoids creating unused provider instances
- Reuses authenticated connections
- Minimal memory overhead
- Thread-safe for MCP concurrent requests

### 4. Error Handling Strategy

**Choice**: Let provider exceptions propagate (per clarification Q3)

**Rationale**:
- Caller (MCP server) has context for user-friendly messages
- Avoids double-wrapping errors
- Preserves stack traces for debugging
- Existing error types (`NotFoundError`, `AuthError`) are informative

## Implementation Patterns

### Provider Factory Pattern

```typescript
// Registry maintains provider instances
class ProviderRegistry {
  private providers = new Map<BacklogProviderName, BacklogProvider>();

  getProvider(name: BacklogProviderName): BacklogProvider {
    if (!this.providers.has(name)) {
      this.providers.set(name, this.createProvider(name));
    }
    return this.providers.get(name)!;
  }
}
```

### Reference Detection Chain

```typescript
function detectTicketRef(
  input: string,
  defaultProvider: BacklogProviderName
): TicketRef | null {
  // Try URL detection first
  const urlRef = detectFromUrl(input);
  if (urlRef) return urlRef;

  // Try provider-specific patterns
  for (const parser of providerParsers) {
    const ref = parser(input);
    if (ref) return ref;
  }

  // Fallback: generic #number uses default provider
  const match = input.match(/^#?(\d+)$/);
  if (match) {
    return { provider: defaultProvider, id: match[1], raw: input };
  }

  return null;
}
```

### GitHub State Mapping

| GitHub State | Open? | Mapped State |
|--------------|-------|--------------|
| `open` | true | `open` |
| `closed` | false | `closed` |
| (with `in_progress` label) | true | `in_progress` |

Note: GitHub doesn't have native "in progress" state. Check for common workflow labels.

## Key Sources

### Existing Codebase

- `src/providers/types.ts` - BacklogProvider interface definition
- `src/providers/errors.ts` - Error class hierarchy
- `src/types/ticket.ts` - TicketRef and TicketParams types
- `src/config.ts` - BacklogConfigSchema with provider enum

### External Documentation

- [Octokit REST API](https://octokit.github.io/rest.js/v20) - GitHub client
- [GitHub Issues API](https://docs.github.com/en/rest/issues) - Issue endpoints
- [MCP Specification](https://modelcontextprotocol.io/docs) - Tool response format

## Open Questions (Resolved)

| Question | Resolution | Source |
|----------|------------|--------|
| Block on A1/A5? | No, absorb scope | Q1 → C |
| Config location? | Extend SpecKitPluginConfig | Q2 → A |
| Error handling? | Propagate exceptions | Q3 → B |

## Future Considerations

### Jira Implementation
- Requires `JIRA_API_TOKEN` and `JIRA_EMAIL`
- Uses `/rest/api/3/issue/{id}` endpoint
- Project key extraction from config

### Shortcut Implementation
- Requires `SHORTCUT_API_TOKEN`
- Uses `/api/v3/stories/{id}` endpoint
- Workspace slug from config

### Local Provider
- File-based ticket storage in `.specify/tickets/`
- JSON format with auto-incrementing IDs
- Good for offline/testing scenarios
