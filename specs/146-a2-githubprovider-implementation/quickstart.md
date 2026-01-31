# Quickstart: GitHubCliProvider

## Prerequisites

1. **GitHub CLI installed**: `brew install gh` or [installation instructions](https://cli.github.com/)
2. **Authenticated**: `gh auth login`
3. **In a git repository** with a GitHub remote

## Installation

The `GitHubCliProvider` is part of the `@generacy-ai/agency-plugin-spec-kit` package:

```bash
pnpm add @generacy-ai/agency-plugin-spec-kit
```

## Usage

### Basic Setup

```typescript
import { GitHubCliProvider } from '@generacy-ai/agency-plugin-spec-kit/providers';

const provider = new GitHubCliProvider();

// Check authentication
const auth = await provider.checkAuth();
if (!auth.ok) {
  console.error('Please run: gh auth login');
  process.exit(1);
}
```

### Get a Ticket

```typescript
// Using issue number
const ticket = await provider.getTicket('#123');

// Using full URL
const ticket = await provider.getTicket('https://github.com/owner/repo/issues/123');

console.log(ticket.title);
console.log(ticket.state);  // 'open' | 'closed' | 'in_progress'
console.log(ticket.labels); // ['bug', 'priority:high']
```

### Create a Ticket

```typescript
const newTicket = await provider.createTicket({
  title: 'Bug: Login form not working',
  body: '## Description\nUsers cannot submit the login form...',
  labels: ['bug', 'priority:high'],
});

console.log(`Created: ${newTicket.url}`);
```

### Update a Ticket

```typescript
await provider.updateTicket('#123', {
  title: 'Updated title',
  body: 'Updated description',
});
```

### Manage Labels

```typescript
// Replace all labels
await provider.setLabels('#123', ['reviewed', 'ready-for-merge']);

// Get current labels
const labels = await provider.getLabels('#123');
```

### Search Tickets

```typescript
// Search using GitHub search syntax
const bugs = await provider.searchTickets('is:open label:bug');

for (const ticket of bugs) {
  console.log(`#${ticket.ref.id}: ${ticket.title}`);
}
```

## Error Handling

```typescript
import {
  GitHubCliProvider,
  GitHubCliAuthError,
  GitHubCliNotFoundError,
  GitHubCliError,
} from '@generacy-ai/agency-plugin-spec-kit/providers';

try {
  const ticket = await provider.getTicket('#99999');
} catch (error) {
  if (error instanceof GitHubCliNotFoundError) {
    console.log('Issue not found');
  } else if (error instanceof GitHubCliAuthError) {
    console.log('Please run: gh auth login');
  } else if (error instanceof GitHubCliError) {
    console.log(`GitHub CLI error: ${error.message}`);
  }
}
```

## Provider Registry

The provider is automatically registered with the factory:

```typescript
import { createProvider } from '@generacy-ai/agency-plugin-spec-kit/providers';

// Create GitHub CLI provider
const provider = createProvider('github-cli', config);

// Or use the Octokit-based provider
const octokitProvider = createProvider('github', config);
```

## Available Commands

| Method | Description |
|--------|-------------|
| `getTicket(ref)` | Fetch ticket by reference |
| `createTicket(params)` | Create new ticket |
| `updateTicket(ref, updates)` | Update existing ticket |
| `setLabels(ref, labels)` | Replace all labels |
| `getLabels(ref)` | Get current labels |
| `searchTickets(query)` | Search with GitHub syntax |
| `checkAuth()` | Verify gh CLI authentication |
| `getTicketUrl(ref)` | Generate GitHub URL |
| `parseRef(input)` | Parse user input to TicketRef |

## Reference Formats

Supported input formats for ticket references:

| Format | Example |
|--------|---------|
| Hash number | `#123` |
| Plain number | `123` |
| Owner/repo#number | `owner/repo#123` |
| Full URL | `https://github.com/owner/repo/issues/123` |

## Troubleshooting

### "gh: command not found"

Install GitHub CLI:
```bash
# macOS
brew install gh

# Ubuntu/Debian
sudo apt install gh

# Windows
winget install GitHub.cli
```

### "gh auth status" fails

Authenticate with GitHub:
```bash
gh auth login
```

### "Repository context not detected"

Ensure you're in a git repository with a GitHub remote:
```bash
git remote -v  # Should show github.com
gh repo view   # Should show repo info
```

### Rate limiting

The provider automatically retries on rate limit errors with exponential backoff. If issues persist, check:
```bash
gh api rate_limit
```
