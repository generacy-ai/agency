# Quickstart: update_ticket Tool

## Overview

The `spec_kit.update_ticket` tool updates existing tickets in the configured backlog system (GitHub, Jira, Shortcut, or local).

## Installation

The tool is included in the `@generacy-ai/agency-plugin-spec-kit` package. No additional installation required.

## Usage Examples

### Update Title

```json
{
  "name": "spec_kit.update_ticket",
  "arguments": {
    "ref": "#123",
    "title": "Updated: Fix login bug"
  }
}
```

### Update Body

```json
{
  "name": "spec_kit.update_ticket",
  "arguments": {
    "ref": "https://github.com/owner/repo/issues/123",
    "body": "## Description\n\nUpdated description with more details..."
  }
}
```

### Add Labels

```json
{
  "name": "spec_kit.update_ticket",
  "arguments": {
    "ref": "#123",
    "add_labels": ["in-progress", "priority:high"]
  }
}
```

### Remove Labels

```json
{
  "name": "spec_kit.update_ticket",
  "arguments": {
    "ref": "#123",
    "remove_labels": ["needs-triage"]
  }
}
```

### Combined Label Operations

```json
{
  "name": "spec_kit.update_ticket",
  "arguments": {
    "ref": "#123",
    "add_labels": ["completed"],
    "remove_labels": ["in-progress"]
  }
}
```

### Close Ticket

```json
{
  "name": "spec_kit.update_ticket",
  "arguments": {
    "ref": "#123",
    "state": "closed"
  }
}
```

### Reopen Ticket

```json
{
  "name": "spec_kit.update_ticket",
  "arguments": {
    "ref": "#123",
    "state": "open"
  }
}
```

### Multiple Updates

```json
{
  "name": "spec_kit.update_ticket",
  "arguments": {
    "ref": "#123",
    "title": "Done: Implement feature X",
    "state": "closed",
    "add_labels": ["completed"],
    "remove_labels": ["in-progress"]
  }
}
```

## Supported Reference Formats

| Format | Example | Provider |
|--------|---------|----------|
| GitHub URL | `https://github.com/owner/repo/issues/123` | github |
| GitHub shorthand | `#123` | github (default) |
| Cross-repo | `owner/repo#123` | github |
| Jira key | `PROJ-123` | jira |
| Shortcut | `sc-123` | shortcut |
| Bare number | `123` | default provider |

## Response Format

### Success

```json
{
  "updated": true,
  "id": "123",
  "url": "https://github.com/owner/repo/issues/123",
  "changes": ["title", "labels", "state"]
}
```

### Not Found Error

```json
{
  "error": "not_found",
  "message": "Ticket #999 not found",
  "ref": "#999"
}
```

### Invalid Input Error

```json
{
  "error": "invalid_input",
  "message": "Ticket reference is required",
  "hint": "Supported formats: #123, owner/repo#123, PROJ-123, sc-123, or full URLs"
}
```

## Troubleshooting

### "Ticket not found" Error

- Verify the ticket reference is correct
- Ensure you have access to the repository/project
- Check if using cross-repo format for tickets in other repos

### "Invalid reference" Error

- Check the reference format matches one of the supported formats
- For bare numbers, ensure a default provider is configured

### "Authentication failed" Error

- For GitHub: Run `gh auth login` to authenticate
- For Jira: Configure API token in environment
- For Shortcut: Configure API token in environment

### Labels Not Updating

- Verify the label names are spelled correctly (case-sensitive)
- Check that you have permission to modify labels
- Some providers may not support label operations (check with `getLabels`)
