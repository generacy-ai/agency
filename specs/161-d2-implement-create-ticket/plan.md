# Implementation Plan: D2 - Implement create_ticket tool

**Feature**: Implement `spec_kit.create_ticket` MCP tool for creating tickets in the configured backlog provider
**Branch**: `161-d2-implement-create-ticket`
**Status**: Complete

## Summary

Implement a new MCP tool `spec_kit.create_ticket` that creates tickets in the configured backlog system. The tool will follow the same patterns established by `get-ticket.ts`, accepting title, body, and labels as parameters, and returning the created ticket with its URL.

## Technical Context

- **Language**: TypeScript (ES modules)
- **Package**: `@generacy-ai/agency-plugin-spec-kit`
- **Dependencies**:
  - `@generacy-ai/agency` - AgencyTool, ToolResult types
  - `BacklogProvider` interface - provides `createTicket()` method
  - `ProviderRegistry` - routes to appropriate provider

## Project Structure

```
packages/agency-plugin-spec-kit/
├── src/
│   ├── tools/
│   │   ├── index.ts              # Export and register new tool
│   │   ├── get-ticket.ts         # Reference implementation
│   │   └── create-ticket.ts      # NEW: create_ticket tool
│   ├── providers/
│   │   ├── types.ts              # BacklogProvider, TicketCreateParams
│   │   ├── github.ts             # createTicket() implementation exists
│   │   ├── jira.ts               # createTicket() implementation exists
│   │   ├── shortcut.ts           # createTicket() implementation exists
│   │   └── local.ts              # createTicket() implementation exists
│   └── config.ts                 # SpecKitConfig type
```

## Implementation Approach

### 1. Create `src/tools/create-ticket.ts`

Follow the pattern from `get-ticket.ts`:

```typescript
interface CreateTicketParams {
  title: string;      // Required
  body?: string;      // Optional markdown
  labels?: string[];  // Optional labels
}
```

Key implementation details:
- Use `outputPattern: 'terse'` for concise JSON output
- Support `modes: ['coding']` only (ticket creation is an action, not research)
- Validate that title is provided and non-empty
- Use the default provider from config (no auto-detection like get-ticket)
- Return `{ created: true, id, url }` on success
- Return `{ error, message }` with `isError: true` on failure

### 2. Update `src/tools/index.ts`

- Import `createCreateTicketTool` from new file
- Add to `createTools()` function array
- Export the factory function

## Error Handling Strategy

Follow existing patterns:
- Provider exceptions propagate naturally (per clarification Q3 in get-ticket)
- Input validation returns structured error responses
- No try/catch around provider.createTicket() - let ProviderError/AuthError propagate

## Constitution Check

No constitution.md found - no governance constraints apply.

## Key Decisions

1. **Default provider only**: Unlike `get-ticket` which auto-detects provider from ref format, `create_ticket` uses the configured default provider since there's no existing ticket to detect from
2. **Minimal return data**: Return only `{ created, id, url }` to keep responses terse
3. **No state control**: Tickets are created in the provider's default state (typically "open")
