# Implementation Plan: JiraProvider Implementation

**Feature**: Jira Cloud integration for the BacklogProvider system
**Branch**: `147-a3-jiraprovider-implementation`
**Status**: Complete

## Summary

Implement a full JiraProvider that integrates with Jira Cloud's REST API v3. This provider enables the backlog system to create, read, update tickets and manage labels in Jira. The implementation follows the existing GitHubProvider pattern for consistency.

## Technical Context

### Language & Framework
- **Language**: TypeScript
- **Runtime**: Node.js (ES modules)
- **Package**: `@generacy-ai/agency-plugin-spec-kit`
- **HTTP Client**: Native `fetch` (built into Node.js 18+)

### Dependencies
- No new dependencies required (using native `fetch`)
- Existing dependencies:
  - `zod` for config schema validation (already in use)
  - Internal utilities: `detectTicketRef`, error classes

### Key Design Decisions
1. **Jira Cloud only** - No Server/Data Center support (per clarification Q1)
2. **Keyword-based status mapping** - Flexible regex matching for status→TicketState (per Q2)
3. **Default issue type: Story** - When createTicket() doesn't specify type (per Q3)
4. **Single project scope** - Only operates within configured projectKey (per Q4)

## Project Structure

```
packages/agency-plugin-spec-kit/
├── src/
│   ├── config.ts                    # [exists] JiraConfigSchema already defined
│   ├── providers/
│   │   ├── types.ts                 # [exists] BacklogProvider interface
│   │   ├── errors.ts                # [exists] ProviderError, AuthError, NotFoundError
│   │   ├── registry.ts              # [exists] Provider registration
│   │   ├── github.ts                # [exists] Reference implementation
│   │   ├── jira.ts                  # [MODIFY] Replace stub with full implementation
│   │   └── index.ts                 # [exists] Exports
│   └── utils/
│       └── detect-ticket-ref.ts     # [exists] Already supports Jira patterns
```

## Implementation Approach

### 1. JiraProvider Class (`src/providers/jira.ts`)

Replace the existing stub with a complete implementation:

```typescript
export class JiraProvider implements BacklogProvider {
  readonly name = 'jira' as const;

  private baseUrl: string;
  private projectKey: string;
  private auth: { email: string; apiToken: string } | null;

  constructor(config: SpecKitConfig) {
    // Extract from config.backlog.jira
    // Fall back to env vars: JIRA_BASE_URL, JIRA_EMAIL, JIRA_API_TOKEN
  }
}
```

### 2. Authentication Strategy

- Use Basic Auth with email + API token (Jira Cloud pattern)
- Header: `Authorization: Basic base64(email:apiToken)`
- Credentials from:
  1. `config.backlog.jira.email` / `config.backlog.jira.apiToken`
  2. Env vars: `JIRA_EMAIL`, `JIRA_API_TOKEN`

### 3. Status Mapping Function

```typescript
function mapJiraStatusToTicketState(status: string): TicketState {
  const lower = status.toLowerCase();
  if (/done|closed|resolved|complete/i.test(lower)) return 'closed';
  if (/progress|review|testing|qa|dev/i.test(lower)) return 'in_progress';
  return 'open';
}
```

### 4. API Endpoints

| Method | Jira API Endpoint | Purpose |
|--------|------------------|---------|
| `getTicket(ref)` | `GET /rest/api/3/issue/{issueKey}` | Fetch issue details |
| `createTicket(params)` | `POST /rest/api/3/issue` | Create new issue |
| `updateTicket(ref, updates)` | `PUT /rest/api/3/issue/{issueKey}` | Update issue fields |
| `setLabels(ref, labels)` | `PUT /rest/api/3/issue/{issueKey}` | Update labels field |
| `checkAuth()` | `GET /rest/api/3/myself` | Verify credentials |

### 5. Reference Parsing

- Issue key format: `PROJ-123` (uppercase project, hyphen, number)
- URL format: `https://company.atlassian.net/browse/PROJ-123`
- Validate project key matches configured `projectKey`
- Use existing `detectTicketRef(input, 'jira')` utility

## Error Handling

| HTTP Status | Error Class | Message Template |
|-------------|-------------|------------------|
| 401 | `AuthError` | "Jira authentication failed: Invalid credentials" |
| 403 | `AuthError` | "Jira access denied: Check permissions" |
| 404 | `NotFoundError` | "Jira issue {ref} not found" |
| Other | `ProviderError` | "Jira API error ({status}): {message}" |

## Configuration Schema

The `JiraConfigSchema` in `config.ts` already defines:
```typescript
{
  baseUrl: string;     // e.g., "https://company.atlassian.net"
  projectKey: string;  // e.g., "PROJ"
}
```

Need to extend with optional `email` and `apiToken` fields (can also use env vars).

## Testing Strategy

1. **Unit tests**: Mock fetch responses for each API endpoint
2. **Integration tests**: Optional, require real Jira instance
3. **Test patterns from GitHubProvider**: Similar test structure

## Out of Scope

- Jira Server/Data Center authentication
- Cross-project operations
- Custom fields, sprints, epics
- Webhook integrations
- JQL search (searchTickets method - can be added later)

## Constitution Check

No constitution.md exists for this project. Implementation follows existing codebase patterns established by GitHubProvider.
