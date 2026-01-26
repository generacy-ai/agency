# Research: ContainerConfig Schema Extension

## Technology Decisions

### 1. Zod Schema Extension

**Decision**: Add optional fields to existing schema
**Rationale**:
- Maintains backward compatibility (existing configs remain valid)
- Zod's `.optional()` provides clear semantics
- Type inference continues to work correctly

**Alternative Considered**: Creating a new schema version
**Why Rejected**: Unnecessary complexity for additive changes

### 2. Separate Command and Args Fields

**Decision**: Keep `mcpCommand` and `mcpArgs` as separate fields
**Rationale**:
- Cleaner JSON configuration (no shell escaping issues)
- Matches how `child_process.spawn()` and similar APIs work
- Easier to validate individual arguments
- Consistent with how StdioClientTransport accepts arguments

**Alternative Considered**: Single `mcpCommand` field with space-separated arguments
**Why Rejected**: Would require shell parsing, escaping issues with paths containing spaces

### 3. Default Behavior Preservation

**Decision**: Keep defaults in `_doConnect()` rather than schema defaults
**Rationale**:
- Schema stays focused on validation, not business logic
- Easier to see default behavior in one place
- Allows different defaults in different contexts if needed

## Implementation Patterns

### Pattern: Optional Field Extension

```typescript
// Before
export const ContainerConfigSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
});

// After - additive change, no breaking
export const ContainerConfigSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  mcpCommand: z.string().optional(),
  mcpArgs: z.array(z.string()).optional(),
});
```

### Pattern: Default Value Handling in Service

```typescript
// Current implementation (simplified)
const command = options.command ?? 'npx';
const args = options.command ? [] : ['@modelcontextprotocol/server'];

// Updated implementation
const command = options.command ?? 'npx';
const args = options.args ?? (options.command ? [] : ['@modelcontextprotocol/server']);
```

## Key Sources

- [Zod Documentation - Optional Fields](https://zod.dev/?id=optional)
- [MCP SDK - StdioClientTransport](https://github.com/modelcontextprotocol/typescript-sdk)
- Existing codebase patterns in `ConfigSchema.ts`

## Compatibility Notes

### Backward Compatibility

- All new fields are optional
- Existing configurations without `mcpCommand`/`mcpArgs` continue to work
- Default behavior unchanged when fields are not present

### Forward Compatibility

- Older code ignoring new fields will not break
- Zod schema is additive, not breaking
