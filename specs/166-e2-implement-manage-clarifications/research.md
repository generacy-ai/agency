# Research: E2 - Implement manage_clarifications Tool

## Technology Decisions

### 1. Humancy vs Direct GitHub Posting

**Decision**: Use Humancy plugin for human input (per clarification answer A)

**Rationale**:
- Humancy provides a unified interface for human-agent interaction
- Supports both cloud and direct modes automatically
- Enables future enhancements like three-layer decision model
- Better separation of concerns (SpecKit manages files, Humancy handles communication)

**Alternative Considered**: Direct GitHub posting (like reference implementation)
- Pros: Simpler, no additional dependency
- Cons: Tightly couples to GitHub, loses Humancy features, duplicates communication logic

### 2. Tool Namespace Convention

**Decision**: Use `speckit.manage_clarifications` (per clarification answer C)

**Rationale**:
- Consistent with other speckit tools (though they use `spec_kit.` prefix currently)
- Note: Need to verify existing convention - may need to use `spec_kit.` instead

**Existing Tools**:
- `spec_kit.get_paths`
- `spec_kit.get_ticket`
- `spec_kit.check_prereqs`

**Action**: Use `spec_kit.manage_clarifications` to match existing convention.

### 3. Status Tracking Model

**Decision**: Use explicit status enum (per clarification answer B)

**Rationale**:
- More explicit and type-safe
- Easier to extend with additional statuses (e.g., `in_progress`, `deferred`)
- Clearer API contract

**Implementation**:
```typescript
export enum ClarificationStatus {
  PENDING = 'pending',
  ANSWERED = 'answered'
}
```

### 4. Humancy Tool Invocation

**Decision**: Use core API's `getTool()` method to invoke Humancy tools

**Rationale**:
- Follows Agency plugin architecture patterns
- Properly handles tool availability
- Enables testing via mocks

**Alternative Considered**: Direct import from Humancy package
- Pros: Stronger typing
- Cons: Creates tight coupling, bypasses Agency's tool management

## Implementation Patterns

### Markdown Parser Pattern

Follow the reference implementation's parsing approach:
1. Use regex to extract batch headers
2. Use regex to extract question headers within batches
3. Parse individual fields (context, question, options, answer)
4. Return structured data

### File Writing Pattern

Use existing `writeFile` utility from `utils/fs.ts`:
- Automatically creates parent directories
- Handles permissions errors
- Returns appropriate errors for tool output

### Error Handling Pattern

Use `createError` from `types/errors.ts`:
```typescript
createError('CLARIFICATION_NOT_FOUND', `Question ${number} not found`)
```

Error codes to add:
- `CLARIFICATION_FILE_NOT_FOUND`
- `CLARIFICATION_NOT_FOUND`
- `CLARIFICATION_INVALID_OPERATION`
- `CLARIFICATION_APPEND_FAILED`

## Key Sources/References

1. **Reference Implementation**: `/workspaces/claude-plugins/plugins/speckit/mcp-server/src/tools/clarifications.ts`
   - ~750 lines of production code
   - Well-tested parsing and formatting logic
   - GitHub integration (not needed for Humancy approach)

2. **Existing SpecKit Tools**: `packages/agency-plugin-spec-kit/src/tools/`
   - Pattern for tool creation
   - Error handling conventions
   - TerseOutput usage

3. **Humancy Plugin**: `packages/agency-plugin-humancy/src/tools/`
   - API for `ask_question` and `request_decision`
   - Input schema definitions
   - Response formats

4. **Clarification Types**: `packages/agency-plugin-spec-kit/src/types/clarification.ts`
   - Existing type definitions to extend
   - Interface contracts already defined
