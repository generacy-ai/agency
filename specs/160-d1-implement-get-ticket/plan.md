# Implementation Plan: D1: Implement get_ticket tool

**Feature**: MCP tool to fetch ticket details from configured backlog provider
**Branch**: `160-d1-implement-get-ticket`
**Status**: Complete

## Summary

Implement the `spec_kit.get_ticket` MCP tool that fetches ticket details from the configured backlog provider. Per clarifications, this issue absorbs the scope of A1 (provider registry) and A5 (auto-detect logic), implementing the full provider lookup and reference detection functionality.

## Technical Context

- **Language**: TypeScript
- **Framework**: Agency MCP Plugin system
- **Package**: `@generacy-ai/agency-plugin-spec-kit`
- **Dependencies**:
  - `@octokit/rest` - GitHub API (already in workspace)
  - `zod` - Runtime validation (already in use)
  - Existing types from `src/providers/types.ts` and `src/types/ticket.ts`

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                    spec_kit.get_ticket Tool                      │
├─────────────────────────────────────────────────────────────────┤
│  Input: ref (string)                                            │
│  - URL: https://github.com/owner/repo/issues/123                │
│  - GitHub shorthand: #123, owner/repo#123                       │
│  - Jira: PROJ-123                                               │
│  - Shortcut: sc-123                                             │
├─────────────────────────────────────────────────────────────────┤
│                           │                                      │
│                    detectTicketRef()                             │
│                           │                                      │
│                    ┌──────┴──────┐                               │
│                    ▼             ▼                               │
│              TicketRef      null (error)                         │
│                    │                                             │
│                    ▼                                             │
│            getProvider(name)                                     │
│                    │                                             │
│     ┌──────────────┼──────────────┐                              │
│     ▼              ▼              ▼                              │
│  GitHub        Jira          Shortcut                            │
│  Provider      Provider      Provider                            │
│     │              │              │                              │
│     └──────────────┼──────────────┘                              │
│                    │                                             │
│                    ▼                                             │
│              Ticket (normalized)                                 │
└─────────────────────────────────────────────────────────────────┘
```

## Project Structure

```
packages/agency-plugin-spec-kit/src/
├── tools/
│   ├── index.ts                    # MODIFY: Add get-ticket tool registration
│   └── get-ticket.ts               # CREATE: Tool implementation
├── providers/
│   ├── index.ts                    # MODIFY: Export provider implementations
│   ├── types.ts                    # EXISTS: BacklogProvider interface
│   ├── errors.ts                   # EXISTS: Error classes
│   ├── registry.ts                 # CREATE: Provider registry
│   ├── github.ts                   # CREATE: GitHub provider implementation
│   ├── jira.ts                     # CREATE: Jira provider (stub)
│   ├── shortcut.ts                 # CREATE: Shortcut provider (stub)
│   └── local.ts                    # CREATE: Local provider (stub)
├── utils/
│   └── detect-ticket-ref.ts        # CREATE: Reference auto-detection
├── config.ts                       # EXISTS: Has BacklogConfigSchema
└── types/
    └── ticket.ts                   # EXISTS: TicketRef type
```

## Implementation Details

### 1. Provider Registry (`src/providers/registry.ts`)

Creates and manages provider instances based on configuration:

```typescript
interface ProviderRegistry {
  getProvider(name?: BacklogProviderName): BacklogProvider;
  detectProvider(ref: string): BacklogProviderName | null;
}
```

- Lazy instantiation of providers
- Caches provider instances
- Falls back to configured default provider

### 2. Reference Auto-Detection (`src/utils/detect-ticket-ref.ts`)

Parses various ticket reference formats:

| Pattern | Provider | Example |
|---------|----------|---------|
| `#\d+` | github | `#123` |
| `owner/repo#\d+` | github | `org/repo#456` |
| `github.com/.../issues/\d+` | github | Full URL |
| `[A-Z]+-\d+` | jira | `PROJ-123` |
| `atlassian.net/browse/...` | jira | Full URL |
| `sc-\d+` | shortcut | `sc-789` |
| `shortcut.com/.../story/\d+` | shortcut | Full URL |

### 3. GitHub Provider (`src/providers/github.ts`)

Full implementation using `@octokit/rest`:

- Authenticates via `GITHUB_TOKEN` environment variable
- Implements all required `BacklogProvider` methods
- Maps GitHub issue states to normalized `TicketState`
- Extracts owner/repo from git remote for local references

### 4. Stub Providers (Jira, Shortcut, Local)

Minimal implementations that throw `NotFoundError` with helpful messages:

```typescript
throw new NotFoundError(
  `Jira provider not yet implemented. Configure GitHub as provider.`,
  'jira'
);
```

### 5. Tool Implementation (`src/tools/get-ticket.ts`)

Factory function following existing tool patterns:

```typescript
export function createGetTicketTool(
  config: SpecKitConfig,
  getProvider: () => BacklogProvider
): AgencyTool
```

- Input validation via JSON Schema
- Calls `detectTicketRef()` to parse input
- Fetches ticket via provider
- Returns normalized JSON response
- Per Q3 clarification: lets provider exceptions propagate

## Key Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Absorb A1/A5 scope | Yes | Per clarification Q1 answer C |
| Config structure | Extend SpecKitPluginConfig | Per clarification Q2 answer A |
| Error handling | Propagate exceptions | Per clarification Q3 answer B |
| GitHub detection | From git remote | Automatic repo context |
| Other providers | Stub with NotFoundError | MVP approach, full impl later |

## Testing Approach

1. **Unit tests** for `detectTicketRef()` - various input formats
2. **Unit tests** for GitHub provider with mocked Octokit
3. **Integration test** with real GitHub API (requires token)
4. **E2E test** via MCP protocol

## Success Criteria

- [x] Tool registered in manifest (already done)
- [ ] `detectTicketRef()` parses all documented formats
- [ ] GitHub provider fetches real issues
- [ ] Returns normalized `Ticket` object
- [ ] Graceful error for not-found tickets
- [ ] Other providers return helpful stub errors

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| GitHub rate limiting | Use authenticated requests (5000 req/hr) |
| Missing GITHUB_TOKEN | Clear error message with setup instructions |
| Complex reference parsing | Comprehensive regex test suite |
