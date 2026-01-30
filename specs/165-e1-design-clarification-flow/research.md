# Research: Clarification Flow with Humancy

## Technology Decisions

### TD1: Humancy Tool Selection

**Decision**: Use `humancy.ask_question` for freeform questions, `humancy.request_decision` for multiple-choice

**Rationale**:
- `ask_question` supports open-ended responses (e.g., "What should the timeout be?")
- `request_decision` provides structured options with three-layer recommendations
- Both support urgency levels and timeouts
- Maps directly to existing `clarifications.md` question types

**Alternatives Considered**:
- Use only `request_decision` for all questions: Rejected - limits freeform responses
- Use only `ask_question` for all questions: Rejected - loses structured option benefits

### TD2: Response Polling Strategy

**Decision**: SSE (Server-Sent Events) primary, polling fallback

**Rationale**:
- SSE provides real-time updates with low latency
- SSE reduces server load compared to polling
- Polling fallback handles environments where SSE fails
- Humancy already implements both via `SSEHandler` and `getDecision`

**Alternatives Considered**:
- Polling only: Rejected - higher latency, more API calls
- WebSocket: Rejected - Humancy doesn't support it, SSE sufficient

### TD3: Question ID Correlation

**Decision**: Use Humancy `decisionId` stored in `clarifications.md`

**Rationale**:
- Humancy generates unique IDs for each decision/question
- IDs can be stored alongside questions in markdown
- Enables outcome reporting via `report_decision_result`
- Supports three-layer decision tracking

**File Format Extension**:
```markdown
### Q1: Topic
**DecisionId**: `abc123-def456`
**Context**: ...
**Question**: ...
**Answer**: *Pending*
```

### TD4: Urgency Mapping

**Decision**: Map question criticality to Humancy urgency levels

| Question Type | Urgency | Behavior |
|--------------|---------|----------|
| Blocking architectural decision | `blocking_now` | Agent waits |
| Important clarification | `blocking_soon` | Agent can continue briefly |
| Nice-to-have detail | `when_available` | Non-blocking |

**Rationale**:
- Allows users to prioritize responses
- Prevents non-critical questions from blocking workflow
- Urgency visible in Humancy VS Code panel

### TD5: Timeout Configuration

**Decision**: Hierarchical timeout configuration

```
Global default (from config) → Per-batch override → Per-question override
```

**Proposed Defaults**:
- `blocking_now`: 5 minutes (300000ms)
- `blocking_soon`: 15 minutes (900000ms)
- `when_available`: No timeout (infinite wait)

**Rationale**:
- Flexible per-use-case configuration
- Reasonable defaults for common scenarios
- Can be overridden in workflow configuration

## Implementation Patterns

### Pattern 1: Graceful Degradation

```typescript
async function askClarification(question: ClarificationQuestion): Promise<string> {
  // Try Humancy first
  if (await isHumancyAvailable()) {
    try {
      const response = await humancy.ask_question({
        question: question.question,
        context: question.context,
        urgency: mapUrgency(question),
        timeout: getTimeout(question)
      });
      return response.answer;
    } catch (e) {
      if (e.code === 'HUMANCY_TIMEOUT') {
        // Handle timeout based on configuration
        return handleTimeout(question);
      }
      // Fall through to GitHub
    }
  }

  // Fallback to GitHub comments
  return await postToGitHubAndWait(question);
}
```

### Pattern 2: Batch Question Handling

```typescript
async function askBatch(questions: ClarificationQuestion[]): Promise<Answer[]> {
  const answers: Answer[] = [];
  const pending: Map<string, ClarificationQuestion> = new Map();

  // Submit all questions
  for (const q of questions) {
    const decisionId = await submitQuestion(q);
    pending.set(decisionId, q);
  }

  // Subscribe to responses
  const events = await subscribeToDecisions([...pending.keys()]);

  for await (const event of events) {
    if (event.type === 'decision:resolved') {
      const question = pending.get(event.decisionId);
      answers.push({
        questionNumber: question.number,
        answer: event.selectedOption
      });
      pending.delete(event.decisionId);
    }

    // Check if all critical questions answered
    if (canProceed(answers, questions)) {
      break;
    }
  }

  return answers;
}
```

### Pattern 3: Three-Layer Integration (Optional)

For complex decisions, leverage Humancy's three-layer model:

```typescript
const response = await humancy.request_decision({
  question: "Which authentication approach?",
  options: [
    { id: 'jwt', label: 'JWT tokens', description: '...' },
    { id: 'session', label: 'Server sessions', description: '...' }
  ],
  domain: ['security', 'authentication'],
  includeRecommendations: true
});

// Store three-layer breakdown for learning
if (response.baseline && response.protege && response.human) {
  await storeDecisionRecord(response);
}
```

## Key Sources/References

### Humancy Plugin
- Source: `/workspaces/agency/packages/agency-plugin-humancy`
- Key files:
  - `src/plugin.ts` - Main plugin class
  - `src/tools/*.ts` - Tool implementations
  - `src/types/*.ts` - Type definitions
  - `src/http/client.ts` - HTTP client
  - `src/storage/decision-store.ts` - Decision storage

### Speckit Clarifications
- Source: `/workspaces/claude-plugins/plugins/speckit`
- Key files:
  - `mcp-server/src/tools/clarifications.ts` - Tool implementation
  - `mcp-server/src/types/clarifications.ts` - Data models

### MCP SDK
- Documentation: https://modelcontextprotocol.io
- Package: `@modelcontextprotocol/sdk`

## Open Questions for Future Implementation

1. **Decision Store Persistence**: Should clarification decision IDs be stored persistently for outcome reporting?
2. **Answer Format**: Should Humancy answers be stored verbatim or normalized?
3. **Retry Logic**: How many times should we retry failed Humancy calls before falling back?
4. **Partial Progress**: Should we commit partial answers if connection drops mid-batch?
