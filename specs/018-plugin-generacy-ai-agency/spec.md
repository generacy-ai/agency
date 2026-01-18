# Feature Specification: Plugin: @generacy-ai/agency-plugin-humancy

**Branch**: `018-plugin-generacy-ai-agency` | **Date**: 2026-01-18 | **Status**: Complete

## Summary

Implement the Humancy bridge plugin that enables agents to request human input. This plugin provides tools for agents to ask questions, request reviews, present decisions, and send notifications to humans via the Humancy VS Code extension.

## Parent Epic

#13 - Agency Official Plugins

## Dependencies

- #6 - Agency Core Package
- #12 - Channel router
- generacy-ai/contracts#4 - Agency ↔ Humancy schemas

## Tools

| Tool | Description |
|------|-------------|
| `humancy.ask_question` | Ask human a question and wait for answer |
| `humancy.request_review` | Request human review of work (returns approval status) |
| `humancy.request_decision` | Present options and get human decision |
| `humancy.notify` | Send notification (fire-and-forget, non-blocking) |

## Tool Specifications

### humancy.ask_question
Ask human a freeform question and wait for their response.

**Parameters**:
- `question: string` - The question to ask
- `context?: string` - Additional context to help the human answer
- `urgency?: Urgency` - How urgent the question is (default: `when_available`)
- `timeout?: number` - Maximum time to wait in milliseconds

**Returns**: The human's freeform text response

### humancy.request_review
Request human review of an artifact (code, document, plan, etc.).

**Parameters**:
- `artifact: string` - Path to file or content to review
- `context?: string` - What the human should focus on
- `urgency?: Urgency` - How urgent the review is (default: `blocking_soon`)
- `timeout?: number` - Maximum time to wait in milliseconds

**Returns**: Approval status (`approved`, `rejected`, or `changes_requested`) with optional comments on rejection

### humancy.request_decision
Present structured options to a human and get their selection.

**Parameters**:
- `question: string` - The decision question
- `options: { id: string; label: string; description?: string }[]` - Available choices
- `context?: string` - Additional context for the decision
- `urgency?: Urgency` - How urgent the decision is (default: `blocking_soon`)
- `timeout?: number` - Maximum time to wait in milliseconds

**Returns**: The selected option ID

### humancy.notify
Send a non-blocking notification to the human.

**Parameters**:
- `message: string` - The notification message
- `context?: string` - Additional context
- `urgency?: Urgency` - Notification priority (default: `when_available`)

**Returns**: Immediately (fire-and-forget, no delivery confirmation)

## Example Implementation

```typescript
// humancy.ask_question
async function askQuestion(params: {
  question: string;
  context?: string;
  urgency?: Urgency;
  timeout?: number;
}): Promise<ToolResult> {
  const request: DecisionRequest = {
    id: generateRequestId(),
    type: 'question',
    urgency: params.urgency || 'when_available',
    question: params.question,
    context: params.context,
    timeout: params.timeout
  };

  // Send via channel to Humancy
  const response = await channelRouter.sendAndWait(
    'agency.humancy',
    { type: 'decision_request', payload: request },
    params.timeout
  );

  return TerseOutput.success(response.payload.freeformResponse);
}

// humancy.request_decision
async function requestDecision(params: {
  question: string;
  options: { id: string; label: string; description?: string }[];
  context?: string;
  urgency?: Urgency;
}): Promise<ToolResult> {
  const request: DecisionRequest = {
    id: generateRequestId(),
    type: 'decision',
    urgency: params.urgency || 'blocking_soon',
    question: params.question,
    options: params.options,
    context: params.context
  };

  const response = await channelRouter.sendAndWait('agency.humancy', {
    type: 'decision_request',
    payload: request
  });

  return TerseOutput.success(`Selected: ${response.payload.selectedOption}`);
}

// humancy.request_review
async function requestReview(params: {
  artifact: string;
  context?: string;
  urgency?: Urgency;
  timeout?: number;
}): Promise<ToolResult> {
  const request: ReviewRequest = {
    id: generateRequestId(),
    type: 'review',
    urgency: params.urgency || 'blocking_soon',
    artifact: params.artifact,
    context: params.context,
    timeout: params.timeout
  };

  const response = await channelRouter.sendAndWait('agency.humancy', {
    type: 'review_request',
    payload: request
  });

  if (response.payload.status === 'approved') {
    return TerseOutput.success('approved');
  }
  return TerseOutput.error(`${response.payload.status}: ${response.payload.comments}`);
}

// humancy.notify
async function notify(params: {
  message: string;
  context?: string;
  urgency?: Urgency;
}): Promise<ToolResult> {
  // Fire-and-forget - don't wait for response
  channelRouter.send('agency.humancy', {
    type: 'notification',
    payload: {
      id: generateRequestId(),
      message: params.message,
      context: params.context,
      urgency: params.urgency || 'when_available'
    }
  });

  return TerseOutput.success('sent');
}
```

## Urgency Levels

| Level | Description | UI Treatment |
|-------|-------------|--------------|
| `blocking_now` | Agent is blocked, needs immediate response | Top of queue, notification |
| `blocking_soon` | Agent can continue briefly | High priority in queue |
| `when_available` | Informational, no rush | Normal queue position |

## Connection Modes

The plugin uses **hybrid detection with fallback** (config preference with automatic fallback):

1. **Direct** - Humancy extension running locally, direct IPC
2. **Via Generacy** - Routed through orchestration layer
3. **Offline** - Queue requests for later (timeout handling)

### Detection Logic
- Check configuration for explicit mode preference
- If not configured, auto-detect: Direct → Via Generacy → Offline
- Level 1 users (no Humancy) automatically get Offline mode
- Level 2 users (local Humancy) auto-detect Direct mode
- Level 3+ users can override if needed

## Queue Persistence

Queue persistence is **delegated to the channel router's persistence layer** (#12). The channel router handles:
- Message queuing when Humancy is disconnected
- Retry logic for failed deliveries
- Persistence across agent restarts

This keeps the humancy plugin focused on request semantics rather than storage mechanics.

## Timeout Behavior

When a human decision request times out:
- **Return an error result** with clear timeout indication
- Include elapsed time and suggestions in the error details
- Let the agent decide how to proceed (retry, default choice, fail task, or work on something else)

This respects agent autonomy per the Generacy philosophy.

## Mode Affiliations

- All modes include `humancy.*` tools

## Acceptance Criteria

- [ ] All 4 tools implemented (`ask_question`, `request_review`, `request_decision`, `notify`)
- [ ] Urgency levels respected in request routing
- [ ] Timeout handling returns error with details for agent decision
- [ ] Hybrid connection mode detection works (Direct → Generacy → Offline)
- [ ] Queue persistence delegated to channel router
- [ ] Tests for all connection modes

## User Stories

### US1: Agent Asks Human Question

**As an** AI agent,
**I want** to ask the human a freeform question,
**So that** I can get clarification on ambiguous requirements.

**Acceptance Criteria**:
- [ ] Question is delivered to Humancy with appropriate urgency
- [ ] Agent receives human's text response
- [ ] Timeout returns error, not hang

### US2: Agent Requests Code Review

**As an** AI agent,
**I want** to request human review of code I've written,
**So that** a human can approve or reject before I proceed.

**Acceptance Criteria**:
- [ ] Artifact path/content is sent for review
- [ ] Returns approved/rejected/changes_requested status
- [ ] Rejection includes human's feedback comments

### US3: Agent Presents Decision Options

**As an** AI agent,
**I want** to present structured options to the human,
**So that** I can get a clear decision when multiple valid paths exist.

**Acceptance Criteria**:
- [ ] Options with IDs/labels/descriptions are presented
- [ ] Human selects one option
- [ ] Agent receives the selected option ID

### US4: Agent Sends Notification

**As an** AI agent,
**I want** to send non-blocking notifications to the human,
**So that** I can keep them informed without waiting for response.

**Acceptance Criteria**:
- [ ] Notification is fire-and-forget
- [ ] Returns immediately without waiting for delivery confirmation
- [ ] Delivery failures handled by channel router, not surfaced to tool

## Functional Requirements

| ID | Requirement | Priority | Notes |
|----|-------------|----------|-------|
| FR-001 | Implement humancy.ask_question tool | P1 | Blocking request with timeout |
| FR-002 | Implement humancy.request_review tool | P1 | Returns approval status |
| FR-003 | Implement humancy.request_decision tool | P1 | Structured option selection |
| FR-004 | Implement humancy.notify tool | P1 | Fire-and-forget |
| FR-005 | Hybrid connection mode detection | P1 | Config → Direct → Generacy → Offline |
| FR-006 | Timeout error handling | P1 | Clear error with elapsed time |
| FR-007 | Channel router integration | P1 | Delegate queue persistence |

## Success Criteria

| ID | Metric | Target | Measurement |
|----|--------|--------|-------------|
| SC-001 | Tool response correctness | 100% | All tools return expected data types |
| SC-002 | Timeout handling | 100% | No hanging requests on timeout |
| SC-003 | Mode fallback | Works | Auto-detects and falls back correctly |

## Assumptions

- Channel router (#12) provides reliable message persistence
- Humancy VS Code extension implements the agency.humancy channel protocol
- Agency ↔ Humancy schemas (contracts#4) define the message formats

## Out of Scope

- Humancy VS Code extension implementation (separate repo)
- Channel router persistence implementation (handled by #12)
- Multi-human routing (single human target assumed)

---

*Generated by speckit*
