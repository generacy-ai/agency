# Quickstart: Clarification Comments via GitHub Issues

## Overview

The `manage_clarifications` tool now supports posting clarification questions directly to GitHub issues and reading answers from issue comments. This replaces the Humancy routing for MVP.

## Usage

### Post Clarification Questions to an Issue

```typescript
// Via MCP tool call
await manageClarifications.execute({
  operation: 'append',
  issue_number: 226,
  questions: [
    {
      topic: 'Authentication Method',
      context: 'Need to decide auth approach before implementing login',
      question: 'Should we use OAuth 2.0 or API keys?',
      options: [
        { label: 'A', description: 'OAuth 2.0 with PKCE flow' },
        { label: 'B', description: 'API key authentication' },
      ],
    },
  ],
});
```

This will:
1. Write questions to `clarifications.md` in the feature directory
2. Post a structured comment to GitHub issue #226 with `<!-- generacy-clarification:batch-N -->` marker
3. Optionally invoke Humancy if available

### Read Answers from GitHub

```typescript
await manageClarifications.execute({
  operation: 'read',
  issue_number: 226,
});
```

This will:
1. Read questions from `clarifications.md`
2. Fetch comments from GitHub issue #226
3. Parse answers in `Q1: [answer]` format from reviewer comments
4. Return unified results with answer source attribution

### Answer Format for Reviewers

Reviewers respond on the GitHub issue with:
```
Q1: B — API key authentication for simplicity
Q2: Use the standard format
```

Then add the `completed:clarification` label.

## File-Only Mode (Backward Compatible)

Omit `issue_number` for local/offline operation:

```typescript
// No GitHub interaction, file-only
await manageClarifications.execute({
  operation: 'append',
  questions: [{ topic: '...', context: '...', question: '...' }],
});
```

## Troubleshooting

| Issue | Solution |
|-------|----------|
| "IssueTracker facet not available" | Ensure the GitHub IssueTracker provider is registered in your Agency config |
| Questions not posted to GitHub | Check that `issue_number` parameter is provided |
| Answers not detected | Verify reviewer used `Q1: answer` format in a separate comment |
| Humancy not invoked | Expected for MVP — Humancy is optional. GitHub comments are the primary path |
