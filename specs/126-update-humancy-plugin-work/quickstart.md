# Quickstart: Humancy Plugin

## Installation

```bash
pnpm add @generacy-ai/agency-plugin-humancy
```

## Configuration

### Environment Variables

```bash
# API endpoint (optional, defaults to https://generacy.ai/api/humancy)
export HUMANCY_API_URL=https://generacy.ai/api/humancy

# API key for production (required for cloud mode)
export GENERACY_API_KEY=your-api-key-here
```

### Configuration File

```typescript
// agency.config.ts
export default {
  humancy: {
    // API endpoint (optional)
    apiUrl: 'https://generacy.ai/api/humancy',

    // API key (prefer env var for security)
    apiKey: process.env.GENERACY_API_KEY,

    // Default timeout for decisions (ms)
    timeout: 60000,

    // Force a specific connection mode (optional)
    // Values: 'direct' | 'cloud' | 'offline'
    mode: undefined, // auto-detect
  },
};
```

## Connection Modes

| Mode | Description | When Used |
|------|-------------|-----------|
| `direct` | IPC to local VS Code extension | Detected when `HUMANCY_SOCKET_PATH` is set |
| `cloud` | HTTP to generacy.ai API | API key configured or endpoint reachable |
| `offline` | Queue for later delivery | No connection available |

The plugin auto-detects the best mode:
1. If explicit `humancy.mode` is configured, use that
2. If local VS Code extension detected, use `direct`
3. If API config available, use `cloud`
4. Otherwise, fall back to `offline`

## Usage Examples

### Request a Decision

```typescript
// Basic decision request
const result = await mcp.callTool('humancy.request_decision', {
  question: 'Which database should we use?',
  options: [
    { id: 'postgres', label: 'PostgreSQL', description: 'Relational database' },
    { id: 'mongodb', label: 'MongoDB', description: 'Document database' },
  ],
  urgency: 'blocking_soon',
});

// Result: { selectedOption: 'postgres' }
```

### Ask a Freeform Question

```typescript
const result = await mcp.callTool('humancy.ask_question', {
  question: 'What naming convention should we use for API endpoints?',
  context: 'Building a REST API for user management',
  urgency: 'when_available',
});

// Result: { answer: 'Use kebab-case: /api/user-profiles' }
```

### Request Review

```typescript
const result = await mcp.callTool('humancy.request_review', {
  artifact: 'src/api/handlers.ts',
  context: 'Please review error handling in the new handlers',
  urgency: 'blocking_soon',
});

// Result: { approved: true, feedback: 'Looks good!' }
```

### Send Notification

```typescript
// Fire-and-forget notification
await mcp.callTool('humancy.notify', {
  message: 'Build completed successfully',
  urgency: 'when_available',
});
```

### Three-Layer Decision Model

```typescript
// Request with three-layer recommendations
const result = await mcp.callTool('humancy.request_decision', {
  question: 'Which caching strategy?',
  options: [
    { id: 'redis', label: 'Redis', tradeoffs: { pros: ['Fast'], cons: ['Extra infra'] } },
    { id: 'memory', label: 'In-Memory', tradeoffs: { pros: ['Simple'], cons: ['Not shared'] } },
  ],
  domain: ['architecture', 'performance'],
  includeRecommendations: true,
});

// Result includes baseline/protégé/human breakdown:
// {
//   selectedOption: 'redis',
//   decisionId: 'abc-123',
//   baseline: { optionId: 'redis', confidence: 0.85 },
//   protege: { optionId: 'redis', reasoning: 'Matches org preference' },
//   human: { optionId: 'redis', note: 'We already use Redis' }
// }
```

### Report Decision Outcome

```typescript
// Report what happened after a decision
await mcp.callTool('humancy.report_decision_result', {
  decisionId: 'abc-123',
  outcome: 'success',
  note: 'Redis integration completed without issues',
});
```

## Available Tools

| Tool | Purpose |
|------|---------|
| `humancy.ask_question` | Ask freeform questions |
| `humancy.request_review` | Request artifact review |
| `humancy.request_decision` | Present structured options |
| `humancy.notify` | Send fire-and-forget notifications |
| `humancy.get_decision_outcome` | Retrieve past decisions |
| `humancy.report_decision_result` | Report decision outcomes |

## Troubleshooting

### "Humancy is offline"

- Check network connectivity
- Verify `GENERACY_API_KEY` is set for production
- Check if `HUMANCY_API_URL` points to correct endpoint

### "Authentication failed"

- Verify API key is correct
- Check if API key has expired
- Ensure key has appropriate permissions

### "Timeout waiting for decision"

- Increase timeout: `timeout: 120000` (2 minutes)
- Check if human received the notification
- Consider using `urgency: 'blocking_now'` for time-sensitive requests

### "Connection mode not detected"

Force a specific mode in config:
```typescript
{
  humancy: {
    mode: 'cloud' // Force cloud mode
  }
}
```

## Local Development

For local development without cloud access:

1. Use direct mode with VS Code extension installed
2. Or set `humancy.mode: 'offline'` to queue decisions

```bash
# Run with VS Code extension
code --install-extension generacy.humancy

# Or force offline mode
export HUMANCY_MODE=offline
```
