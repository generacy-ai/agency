# @generacy-ai/agency-plugin-humancy

Human-in-the-loop decision making for AI agents.

## Overview

The Humancy plugin enables AI agents to request human input when decisions require human judgment. It supports three connection modes:

- **Direct**: IPC connection to VS Code extension (local development)
- **Cloud**: HTTP/SSE to humancy-cloud API (production)
- **Offline**: Queue requests for later delivery

## Installation

```bash
pnpm add @generacy-ai/agency-plugin-humancy
```

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `HUMANCY_API_URL` | Base URL for humancy-cloud API | `https://generacy.ai/api/humancy` |
| `GENERACY_API_KEY` | API key for authentication | - |
| `HUMANCY_TIMEOUT` | Request timeout in milliseconds | `60000` |

### Plugin Configuration

```typescript
import { HumancyPlugin } from '@generacy-ai/agency-plugin-humancy';

const plugin = new HumancyPlugin();

// Configuration via agency.config
const config = {
  humancy: {
    apiUrl: 'https://generacy.ai/api/humancy',
    apiKey: 'your-api-key',
    timeout: 60000,
  },
};
```

## Connection Modes

### Direct Mode

Direct mode uses IPC to communicate with the local VS Code extension. This is the default mode when running locally with the Humancy VS Code extension installed.

### Cloud Mode

Cloud mode communicates with the humancy-cloud API via HTTP and Server-Sent Events (SSE). Enable by setting `HUMANCY_API_URL` or `GENERACY_API_KEY`:

```bash
export HUMANCY_API_URL=https://generacy.ai/api/humancy
export GENERACY_API_KEY=your-api-key
```

Features:
- Create decisions via REST API
- Real-time updates via SSE
- Automatic retry with exponential backoff
- Polling fallback when SSE unavailable

### Offline Mode

When no connection is available, requests are queued for later delivery. Notifications report "queued (offline)" status.

## Tools

### humancy.ask_question

Ask a freeform question to the human.

```typescript
const response = await tool.execute({
  question: 'What should we name this function?',
  context: 'We need a descriptive name for a file validation function',
  urgency: 'blocking_soon',
});
```

### humancy.request_review

Request review of an artifact (code, document, plan).

```typescript
const response = await tool.execute({
  artifact: 'src/utils/validator.ts',
  context: 'Please review the error handling logic',
  urgency: 'blocking_now',
});
```

### humancy.request_decision

Request a structured decision with multiple options.

```typescript
const response = await tool.execute({
  question: 'How should we handle the error case?',
  options: [
    { id: 'retry', label: 'Retry operation', description: 'Attempt again with backoff' },
    { id: 'fail', label: 'Fail fast', description: 'Return error immediately' },
    { id: 'fallback', label: 'Use fallback', description: 'Use cached value' },
  ],
  urgency: 'blocking_soon',
});
```

### humancy.notify

Send a non-blocking notification.

```typescript
await tool.execute({
  message: 'Build completed successfully',
  context: 'All 42 tests passed',
  urgency: 'when_available',
});
```

### humancy.get_decision_outcome

Retrieve a decision record by ID.

```typescript
const outcome = await tool.execute({
  decisionId: 'abc-123',
  wait: true, // Wait for resolution if pending
  timeout: 30000,
});
```

### humancy.report_decision_result

Report the outcome of an implemented decision.

```typescript
await tool.execute({
  decisionId: 'abc-123',
  outcome: 'success',
  details: 'Retry strategy worked after 2 attempts',
});
```

## Urgency Levels

| Level | Description |
|-------|-------------|
| `blocking_now` | Agent is blocked, needs immediate response |
| `blocking_soon` | Agent will be blocked soon, moderate priority |
| `when_available` | Non-blocking, respond when convenient |

## Error Handling

The plugin provides detailed error messages for common scenarios:

| Error | Description | Suggested Action |
|-------|-------------|------------------|
| `HTTP 401` | Invalid API key | Check `GENERACY_API_KEY` |
| `HTTP 404` | Decision not found | Verify decision ID |
| `HTTP 429` | Rate limited | Automatic retry with backoff |
| `HTTP 5xx` | Server error | Automatic retry with backoff |
| Timeout | Response timeout | Retry with longer timeout |
| Network | Connection failed | Check network, may fall back to offline |

## Three-Layer Decision Model

Decisions include recommendations from multiple layers:

1. **Baseline**: System AI recommendation with confidence score
2. **Protege**: Human's trained AI with applied principles
3. **Human**: Final human decision with optional coaching feedback

```typescript
const record = await getDecisionOutcome({ decisionId: 'abc-123' });
if (record.threeLayer) {
  console.log('Baseline recommended:', record.threeLayer.baseline.optionId);
  console.log('Protege recommended:', record.threeLayer.protege.optionId);
  console.log('Human chose:', record.threeLayer.human.optionId);
}
```

## API Reference

See [humancy-cloud API documentation](../../specs/126-update-humancy-plugin-work/contracts/humancy-api.yaml) for the complete API specification.

## License

MIT
