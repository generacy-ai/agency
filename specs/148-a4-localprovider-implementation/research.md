# Research: LocalProvider Implementation

## Technology Decisions

### 1. Storage Format: JSON File

**Decision**: Single JSON file at `.specify/local-tickets.json`

**Rationale**:
- Human-readable and editable
- No external dependencies
- Simple to implement and debug
- Consistent with spec-kit's other config files
- Easy to version control

**Alternatives Considered**:
- SQLite: Overkill for simple ticket storage, adds native dependency
- Multiple JSON files (one per ticket): More complex file management
- YAML: Less standard for data storage, harder to parse

### 2. File I/O: Node.js fs/promises

**Decision**: Use native `fs/promises` API

**Rationale**:
- Zero external dependencies
- Full async support
- Sufficient for local file operations
- Follows patterns in existing codebase

### 3. Atomic Writes

**Decision**: Write to temp file, then rename

**Pattern**:
```typescript
const tempPath = `${storePath}.tmp`;
await fs.writeFile(tempPath, JSON.stringify(store, null, 2));
await fs.rename(tempPath, storePath);
```

**Rationale**:
- Prevents file corruption on crash during write
- Rename is atomic on most file systems
- Simple to implement

### 4. ID Generation

**Decision**: Sequential integers with `LOCAL-` prefix

**Format**: `LOCAL-{padded_number}`
- Pad to minimum 3 digits: `LOCAL-001`
- Extend naturally beyond 999: `LOCAL-1000`

**Rationale**:
- Consistent with Jira-style IDs (PROJECT-123)
- Zero-padding ensures lexicographic sorting for first 999
- Prefix distinguishes from GitHub (#123) or bare numbers
- Easy to type and remember

### 5. Reference Parsing

**Decision**: Accept multiple formats

| Input | Parsed ID |
|-------|-----------|
| `LOCAL-001` | `LOCAL-001` |
| `local-1` | `LOCAL-001` |
| `001` | `LOCAL-001` |
| `1` | `LOCAL-001` |

**Rationale**:
- User convenience - don't require exact format
- Case-insensitivity for the prefix is common UX
- Bare numbers accepted since local is unambiguous

### 6. No Delete Operation

**Decision**: Omit `deleteTicket` method

**Rationale**:
- Not in BacklogProvider interface (neither required nor optional)
- Most backlog systems don't support hard delete
- Simplifies implementation
- Users can manually edit JSON if needed
- Matches spec acceptance criteria (create, read, update)

### 7. Optional Methods

**Decision**: Implement `setLabels` and `getLabels`, skip `searchTickets`

**Rationale for labels**:
- Simple to implement (just update array)
- Useful for workflow automation
- Acceptance criteria mentions label support

**Rationale against search**:
- Local files are typically small (< 100 tickets)
- Users can grep the JSON file
- Search syntax would need to be defined
- Can be added later if needed

## Implementation Patterns

### Following GitHubProvider

The implementation follows patterns established in `GitHubProvider`:

1. **Constructor**: Accept `SpecKitConfig`, initialize store path
2. **Error handling**: Use `NotFoundError`, `ProviderError` from `errors.ts`
3. **Type mapping**: Internal `LocalTicket` → interface `Ticket`
4. **Registration**: Call `registerProviderFactory` at module bottom

### Differences from GitHubProvider

| Aspect | GitHubProvider | LocalProvider |
|--------|---------------|---------------|
| Auth | Requires GITHUB_TOKEN | None required |
| API | Octokit REST client | fs/promises |
| State | Stateless (API) | Stateful (file) |
| Errors | Network/HTTP | File system |
| URL | Web URL | Pseudo-URL |

## Key Sources

1. **BacklogProvider interface**: `src/providers/types.ts`
2. **GitHubProvider reference**: `src/providers/github.ts`
3. **Error classes**: `src/providers/errors.ts`
4. **Provider registry**: `src/providers/registry.ts`
5. **Issue spec**: GitHub Issue #148
