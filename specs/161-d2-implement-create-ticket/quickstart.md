# Quickstart: D2 - create_ticket tool

## Installation

The `spec_kit.create_ticket` tool is part of `@generacy-ai/agency-plugin-spec-kit`. No separate installation required.

## Configuration

Ensure backlog provider is configured in your agency config:

```json
{
  "plugins": {
    "spec-kit": {
      "backlog": {
        "provider": "github"
      }
    }
  }
}
```

## Usage

### Basic Usage

Create a ticket with just a title:

```typescript
// MCP tool call
{
  "name": "spec_kit.create_ticket",
  "arguments": {
    "title": "Add user authentication"
  }
}
```

### Full Example

Create a ticket with all parameters:

```typescript
{
  "name": "spec_kit.create_ticket",
  "arguments": {
    "title": "Add user authentication",
    "body": "## Description\nImplement OAuth2 login flow with support for Google and GitHub providers.\n\n## Acceptance Criteria\n- [ ] Google OAuth integration\n- [ ] GitHub OAuth integration",
    "labels": ["feature", "auth", "P1"]
  }
}
```

### Response

Success response:

```json
{
  "created": true,
  "id": "123",
  "url": "https://github.com/owner/repo/issues/123"
}
```

Error response:

```json
{
  "error": "Invalid input",
  "message": "Ticket title is required"
}
```

## Supported Providers

| Provider | Notes |
|----------|-------|
| GitHub | Requires `GITHUB_TOKEN` env var |
| Jira | Requires Jira API token configuration |
| Shortcut | Requires Shortcut API token |
| Local | Creates local spec files only |

## Troubleshooting

### "Repository context not set"

For GitHub provider with local references, ensure repo context is set:
- Check `GITHUB_REPOSITORY` environment variable
- Or use full org/repo format in configuration

### "Authentication failed"

Verify your provider credentials:
- GitHub: Check `GITHUB_TOKEN` is set and has `repo` scope
- Jira: Verify API token and email are configured
- Shortcut: Check `SHORTCUT_API_TOKEN` is set
