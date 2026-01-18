# Quickstart: @generacy-ai/agency-plugin-humancy

## Installation

The humancy plugin is included with the Agency monorepo. Install from the workspace:

```bash
# From monorepo root
pnpm install
pnpm build
```

For standalone projects:

```bash
pnpm add @generacy-ai/agency @generacy-ai/agency-plugin-humancy
```

## Configuration

The plugin auto-detects connection mode. Optional configuration:

```json
{
  "plugins": {
    "@generacy-ai/agency-plugin-humancy": {
      "mode": "direct"
    }
  }
}
```

### Connection Modes

| Mode | Config Value | Description |
|------|--------------|-------------|
| Direct | `"direct"` | Local IPC to VS Code extension |
| Via Generacy | `"generacy"` | Routed through orchestration |
| Offline | `"offline"` | Queue for later delivery |
| Auto | omit setting | Detect automatically (default) |

## Usage

### Ask a Question

Get freeform text response from human:

```typescript
const result = await agent.callTool('humancy.ask_question', {
  question: 'Should I refactor this function or keep it as-is?',
  context: 'The function is 50 lines with nested conditionals',
  urgency: 'blocking_soon'
});
// Returns: "Please refactor it for clarity"
```

### Request Code Review

Get approval/rejection with optional comments:

```typescript
const result = await agent.callTool('humancy.request_review', {
  artifact: 'src/utils/parser.ts',
  context: 'New parsing utility for config files',
  urgency: 'blocking_soon'
});
// Returns: "approved" or "rejected: Please add error handling"
```

### Present Decision Options

Get selection from structured choices:

```typescript
const result = await agent.callTool('humancy.request_decision', {
  question: 'Which database should we use?',
  options: [
    { id: 'postgres', label: 'PostgreSQL', description: 'Relational, ACID compliant' },
    { id: 'mongodb', label: 'MongoDB', description: 'Document store, flexible schema' },
    { id: 'sqlite', label: 'SQLite', description: 'Embedded, zero-config' }
  ],
  urgency: 'blocking_now'
});
// Returns: "Selected: postgres"
```

### Send Notification

Fire-and-forget message to human:

```typescript
const result = await agent.callTool('humancy.notify', {
  message: 'Build completed successfully',
  context: 'All 42 tests passed'
});
// Returns: "sent"
```

## Urgency Levels

| Level | Constant | When to Use |
|-------|----------|-------------|
| `blocking_now` | Agent is blocked | Need immediate response |
| `blocking_soon` | Can continue briefly | Need response within minutes |
| `when_available` | Informational | No time pressure |

## Timeout Handling

Blocking tools accept optional timeout (default: 30 seconds):

```typescript
const result = await agent.callTool('humancy.ask_question', {
  question: 'Approve this deployment?',
  timeout: 60000  // 60 seconds
});
```

On timeout, the tool returns an error:
```
Timeout after 60000ms waiting for human response
```

The agent then decides how to proceed (retry, default choice, fail, or move on).

## Error Handling

All errors follow terse output pattern:

| Error | Output | Agent Action |
|-------|--------|--------------|
| Timeout | `Timeout after Xms...` | Retry or proceed |
| Offline | `Humancy not connected` | Queue or fail |
| Invalid params | Validation error details | Fix params |

## Troubleshooting

### Humancy Not Detected

1. Ensure Humancy VS Code extension is installed
2. Check extension is activated
3. Verify workspace trust settings

### Requests Timing Out

1. Check Humancy queue for pending requests
2. Increase timeout value
3. Use appropriate urgency level

### Connection Mode Issues

Force specific mode via config:

```json
{
  "plugins": {
    "@generacy-ai/agency-plugin-humancy": {
      "mode": "offline"
    }
  }
}
```

## API Reference

### humancy.ask_question

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| question | string | Yes | - | Question to ask |
| context | string | No | - | Additional context |
| urgency | Urgency | No | when_available | Priority level |
| timeout | number | No | 30000 | Max wait time (ms) |

### humancy.request_review

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| artifact | string | Yes | - | Path or content to review |
| context | string | No | - | Review focus areas |
| urgency | Urgency | No | blocking_soon | Priority level |
| timeout | number | No | 30000 | Max wait time (ms) |

### humancy.request_decision

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| question | string | Yes | - | Decision question |
| options | Option[] | Yes | - | Choices (2-10 items) |
| context | string | No | - | Additional context |
| urgency | Urgency | No | blocking_soon | Priority level |
| timeout | number | No | 30000 | Max wait time (ms) |

### humancy.notify

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| message | string | Yes | - | Notification text |
| context | string | No | - | Additional context |
| urgency | Urgency | No | when_available | Priority level |
