# Quickstart: get_ticket Tool

## Overview

The `spec_kit.get_ticket` tool fetches ticket/issue details from your configured backlog system (GitHub, Jira, Shortcut, or local).

## Installation

The tool is included in `@generacy-ai/agency-plugin-spec-kit`. No additional installation required.

## Configuration

### GitHub (Default)

GitHub is the default provider. Ensure you have a `GITHUB_TOKEN` environment variable:

```bash
export GITHUB_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxx
```

The token needs `repo` scope for private repositories, or no special scopes for public repos.

### Jira (Future)

```yaml
# agency.config.yaml
specKit:
  backlog:
    provider: jira
    jira:
      baseUrl: https://company.atlassian.net
      projectKey: PROJ
```

Requires `JIRA_API_TOKEN` and `JIRA_EMAIL` environment variables.

### Shortcut (Future)

```yaml
# agency.config.yaml
specKit:
  backlog:
    provider: shortcut
    shortcut:
      workspaceSlug: my-workspace
```

Requires `SHORTCUT_API_TOKEN` environment variable.

## Usage

### Input Formats

The tool accepts various ticket reference formats:

| Format | Example | Provider |
|--------|---------|----------|
| Issue number | `#123` | Configured default |
| Full GitHub ref | `owner/repo#123` | GitHub |
| GitHub URL | `https://github.com/owner/repo/issues/123` | GitHub |
| Jira key | `PROJ-456` | Jira |
| Jira URL | `https://company.atlassian.net/browse/PROJ-456` | Jira |
| Shortcut ID | `sc-789` | Shortcut |
| Shortcut URL | `https://app.shortcut.com/workspace/story/789` | Shortcut |

### MCP Tool Call

```json
{
  "name": "spec_kit.get_ticket",
  "arguments": {
    "ref": "#123"
  }
}
```

### Response Format

```json
{
  "ref": {
    "provider": "github",
    "id": "123",
    "url": "https://github.com/owner/repo/issues/123",
    "raw": "#123"
  },
  "title": "Implement feature X",
  "body": "## Description\n\nThis issue tracks...",
  "state": "open",
  "labels": ["feature", "priority:high"],
  "url": "https://github.com/owner/repo/issues/123",
  "meta": {
    "assignees": ["developer"],
    "milestone": "v1.0"
  }
}
```

## Troubleshooting

### "Authentication failed"

Ensure your token is set and valid:

```bash
# Test GitHub token
gh auth status

# Or verify manually
curl -H "Authorization: token $GITHUB_TOKEN" https://api.github.com/user
```

### "Ticket not found"

- Verify the ticket exists and is accessible
- For private repos, ensure token has `repo` scope
- Check the reference format matches expected patterns

### "Provider not implemented"

Currently only GitHub is fully implemented. Jira and Shortcut return helpful stub errors.

## Examples

### Fetch by Issue Number

```
ref: "#42"
→ Fetches issue #42 from current repo (detected from git remote)
```

### Fetch from Specific Repo

```
ref: "facebook/react#12345"
→ Fetches issue #12345 from facebook/react
```

### Fetch by URL

```
ref: "https://github.com/owner/repo/issues/100"
→ Fetches issue #100 from owner/repo
```

## Available Commands

| Command | Description |
|---------|-------------|
| `spec_kit.get_ticket` | Fetch ticket details by reference |
| `spec_kit.create_ticket` | Create a new ticket (future) |
| `spec_kit.update_ticket` | Update existing ticket (future) |
