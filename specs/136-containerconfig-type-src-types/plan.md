# Implementation Plan: Add mcpCommand Field to ContainerConfig Schema

**Feature**: Add `mcpCommand` and `mcpArgs` fields to ContainerConfig Zod schema and update McpClientService to use them
**Branch**: `136-containerconfig-type-src-types`
**Status**: Complete

## Summary

This feature synchronizes the `ContainerConfigSchema` Zod validation schema with the `ContainerConfig` TypeScript interface by adding the `mcpCommand` and `mcpArgs` fields. It also updates `McpConnectionOptions` to accept `args` and modifies `McpClientService._doConnect()` to use custom command arguments when connecting to MCP servers in containers.

## Technical Context

- **Language**: TypeScript 5.x
- **Runtime**: Node.js 20+
- **Framework**: VS Code Extension API
- **Key Dependencies**:
  - `zod` - Runtime validation
  - `@modelcontextprotocol/sdk` - MCP client
- **Patterns**: Singleton service pattern, VS Code extension architecture

## Project Structure

```
packages/agency-extension/src/
├── config/
│   └── ConfigSchema.ts          # Zod schemas (modify)
├── types/
│   ├── container.ts             # ContainerConfig interface (modify)
│   └── mcp.ts                   # McpConnectionOptions interface (modify)
└── services/
    └── McpClientService.ts      # MCP client service (modify)
```

## Implementation Approach

### Phase 1: Schema Updates

1. **Update `ContainerConfigSchema`** in `ConfigSchema.ts`:
   - Add `mcpCommand: z.string().optional()`
   - Add `mcpArgs: z.array(z.string()).optional()`

2. **Update `ContainerConfig` interface** in `container.ts`:
   - Add `mcpArgs?: string[]` (mcpCommand already exists)

3. **Update `McpConnectionOptions` interface** in `mcp.ts`:
   - Add `args?: string[]`

### Phase 2: Service Integration

4. **Update `McpClientService._doConnect()`**:
   - Accept `options.args` when provided
   - Build docker exec command using `options.command` and `options.args`
   - Maintain backward compatibility with default `npx @modelcontextprotocol/server`

## File Changes

| File | Change Type | Description |
|------|-------------|-------------|
| `packages/agency-extension/src/config/ConfigSchema.ts` | Modify | Add mcpCommand and mcpArgs to ContainerConfigSchema |
| `packages/agency-extension/src/types/container.ts` | Modify | Add mcpArgs to ContainerConfig interface |
| `packages/agency-extension/src/types/mcp.ts` | Modify | Add args to McpConnectionOptions interface |
| `packages/agency-extension/src/services/McpClientService.ts` | Modify | Update _doConnect() to use options.args |

## Constitution Check

No constitution.md found - proceeding with standard patterns.

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Breaking existing configs | Low | Medium | All new fields are optional with sensible defaults |
| Type mismatch between schema and interface | Low | Low | Zod infers types from schema, manual interface kept for documentation |

## Dependencies

- None - all changes are internal to the agency-extension package

## Testing Strategy

- Unit tests for schema validation with new fields
- Build verification (TypeScript type checking)
- Manual testing with container configurations
