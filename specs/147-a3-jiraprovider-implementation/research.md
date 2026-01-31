# Research: JiraProvider Implementation

## Technology Decisions

### 1. HTTP Client: Native `fetch`

**Decision**: Use Node.js native `fetch` instead of axios or node-fetch.

**Rationale**:
- Native `fetch` is available in Node.js 18+ (the project target)
- No additional dependencies required
- Consistent with browser APIs
- GitHubProvider uses Octokit, but Jira doesn't have an equivalent official client

**Alternative Considered**: `axios`
- Pros: Request/response interceptors, automatic JSON parsing
- Cons: Additional dependency, not needed for our simple use case

### 2. Authentication: Basic Auth with API Token

**Decision**: Use Basic Authentication with `email:apiToken`.

**Rationale**:
- This is the standard Jira Cloud authentication method
- API tokens are generated in Atlassian account settings
- Works for all Jira Cloud REST API v3 endpoints

**Implementation**:
```typescript
const authHeader = 'Basic ' + Buffer.from(`${email}:${apiToken}`).toString('base64');
```

**Alternative Considered**: OAuth 2.0
- Pros: More secure, supports refresh tokens
- Cons: Complex setup, requires callback URLs, overkill for CLI tool

### 3. Status Mapping: Keyword Matching

**Decision**: Use regex-based keyword matching for status→TicketState mapping.

**Rationale**:
- Jira workflows are highly customizable
- Different organizations use different status names
- Keyword matching is flexible enough to handle common patterns
- Avoids requiring configuration for status mapping

**Mapping Logic**:
```typescript
// Closed states
/done|closed|resolved|complete/i → 'closed'

// In-progress states
/progress|review|testing|qa|dev/i → 'in_progress'

// Everything else
default → 'open'
```

**Alternative Considered**: Status category mapping
- Jira has status categories (To Do, In Progress, Done)
- Cons: Requires additional API call to get status metadata

### 4. Default Issue Type: Story

**Decision**: Default to "Story" for new issues.

**Rationale**:
- Most agile teams use Story as the primary work item type
- Task is too granular for spec-driven development
- Bug would be misleading for new feature work

**Note**: Issue type is required by Jira API when creating issues.

### 5. Single Project Scope

**Decision**: Only operate within the configured `projectKey`.

**Rationale**:
- Simplifies reference validation
- Prevents accidental cross-project operations
- Matches typical CI/CD pipeline configuration patterns

**Implementation**: `parseRef()` will validate that the issue key's project prefix matches the configured `projectKey`.

## Implementation Patterns

### Jira REST API v3 Response Structures

**Issue Object** (simplified):
```json
{
  "id": "10001",
  "key": "PROJ-123",
  "self": "https://company.atlassian.net/rest/api/3/issue/10001",
  "fields": {
    "summary": "Issue title",
    "description": { "type": "doc", "content": [...] },
    "status": { "name": "In Progress" },
    "labels": ["bug", "urgent"],
    "issuetype": { "name": "Story" },
    "priority": { "name": "High" }
  }
}
```

**Description Format**: Jira v3 uses Atlassian Document Format (ADF), not plain text or markdown. Need to:
1. Convert ADF to plain text for reading
2. Convert markdown to ADF for writing (or use legacy `description` field)

### Error Response Format

```json
{
  "errorMessages": ["Issue does not exist or you do not have permission to see it."],
  "errors": {}
}
```

### Rate Limiting

Jira Cloud has rate limits (varies by plan):
- Standard: ~100 requests/10 seconds per user
- Premium: Higher limits

Implementation should handle 429 responses gracefully.

## Key Sources

1. **Jira REST API v3 Documentation**: https://developer.atlassian.com/cloud/jira/platform/rest/v3/
2. **Authentication Guide**: https://developer.atlassian.com/cloud/jira/platform/basic-auth-for-rest-apis/
3. **Issue CRUD Operations**: https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issues/
4. **ADF Format**: https://developer.atlassian.com/cloud/jira/platform/apis/document/structure/

## Risks and Mitigations

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| ADF description format complexity | Medium | Accept ADF for read, use plain text for write initially |
| Status mapping edge cases | Low | Document expected behavior, allow future config extension |
| Rate limiting | Low | Add retry-after handling if needed |
| Project key validation | Low | Clear error messages for mismatched projects |
