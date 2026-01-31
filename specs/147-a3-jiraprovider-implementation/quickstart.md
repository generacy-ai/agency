# Quickstart: JiraProvider

## Prerequisites

1. A Jira Cloud instance (e.g., `company.atlassian.net`)
2. An API token from your Atlassian account
3. A project key (e.g., `PROJ`)

## Setup

### 1. Generate an API Token

1. Go to https://id.atlassian.com/manage-profile/security/api-tokens
2. Click "Create API token"
3. Give it a name (e.g., "agency-cli")
4. Copy the generated token

### 2. Set Environment Variables

```bash
export JIRA_BASE_URL="https://company.atlassian.net"
export JIRA_EMAIL="your-email@example.com"
export JIRA_API_TOKEN="your-api-token-here"
```

Or add to your `.env` file:
```env
JIRA_BASE_URL=https://company.atlassian.net
JIRA_EMAIL=your-email@example.com
JIRA_API_TOKEN=your-api-token-here
```

### 3. Configure SpecKit

In your project's `speckit.config.js` or `.specifyrc.json`:

```json
{
  "backlog": {
    "provider": "jira",
    "jira": {
      "baseUrl": "https://company.atlassian.net",
      "projectKey": "PROJ"
    }
  }
}
```

## Usage

### Fetch a Ticket

```typescript
import { getProvider } from '@generacy-ai/agency-plugin-spec-kit/providers';

const jira = getProvider('jira');

// By issue key
const ticket = await jira.getTicket('PROJ-123');

// By URL
const ticket = await jira.getTicket('https://company.atlassian.net/browse/PROJ-123');
```

### Create a Ticket

```typescript
const ticket = await jira.createTicket({
  title: 'Implement feature X',
  body: 'Description of the feature...',
  labels: ['feature', 'priority:high']
});

console.log(`Created: ${ticket.ref.id}`);  // e.g., "PROJ-456"
```

### Update a Ticket

```typescript
await jira.updateTicket('PROJ-123', {
  title: 'Updated title',
  labels: ['done', 'v1.0']
});
```

### Manage Labels

```typescript
// Set labels (replaces all existing)
await jira.setLabels('PROJ-123', ['bug', 'urgent']);

// Get labels
const labels = await jira.getLabels('PROJ-123');
```

### Check Authentication

```typescript
const auth = await jira.checkAuth();
if (!auth.ok) {
  console.error(`Auth failed: ${auth.message}`);
}
```

## Status Mapping

Jira statuses are mapped to `TicketState` using keyword matching:

| Jira Status Contains | TicketState |
|---------------------|-------------|
| "done", "closed", "resolved", "complete" | `closed` |
| "progress", "review", "testing", "qa", "dev" | `in_progress` |
| (anything else) | `open` |

## Troubleshooting

### "Invalid credentials" Error

- Verify your email matches your Atlassian account
- Regenerate the API token if it may have expired
- Ensure no extra whitespace in environment variables

### "Project key mismatch" Error

- The issue key must match the configured `projectKey`
- Example: If `projectKey: "PROJ"`, you can't access `OTHER-123`

### "Issue not found" Error

- Verify the issue exists in your Jira project
- Check you have permission to view the issue
- Ensure the issue key format is correct (e.g., `PROJ-123`)

### Rate Limiting (429 Error)

Jira Cloud has rate limits. If you encounter 429 errors:
- Reduce request frequency
- Implement exponential backoff
- Consider Jira Premium for higher limits

## API Reference

### Methods

| Method | Description |
|--------|-------------|
| `getTicket(ref)` | Fetch ticket by key or URL |
| `createTicket(params)` | Create new issue (defaults to Story type) |
| `updateTicket(ref, updates)` | Update existing issue |
| `setLabels(ref, labels)` | Replace all labels |
| `getLabels(ref)` | Get current labels |
| `checkAuth()` | Verify credentials |
| `parseRef(input)` | Parse ticket reference |
| `getTicketUrl(ref)` | Get browse URL |

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `JIRA_BASE_URL` | Yes* | Jira instance URL |
| `JIRA_EMAIL` | Yes* | Your Atlassian email |
| `JIRA_API_TOKEN` | Yes* | API token |

*Required if not specified in config
