# Research: Humancy Plugin

## Technology Decisions

### 1. Channel Router Integration

**Decision**: Use `agency.humancy` channel with `sendAndWait` for blocking tools

**Rationale**:
- Pre-registered channel in channel manager (from #12)
- Paired with `humancy.agency` in VS Code extension
- `sendAndWait` provides request/response pattern with timeout
- Fire-and-forget `send` available for notify

**Implementation**:
```typescript
// Blocking request
const response = await core.channelRouter.sendAndWait(
  'agency.humancy',
  createMessageEnvelope({ channel: 'agency.humancy', sender: pluginId, payload }),
  timeout
);

// Fire-and-forget
core.channelRouter.send('agency.humancy', envelope);
```

### 2. Connection Mode Detection

**Decision**: Hybrid detection with configuration override

**Rationale**:
- Adoption path supports progressive levels
- Level 1 (Agency only): Offline mode automatic
- Level 2 (Local Humancy): Direct mode auto-detected
- Level 3+ (Generacy): Optional override via config

**Detection Order**:
1. Check `humancy.mode` config (explicit override)
2. Probe for Direct connection (local IPC)
3. Check for Generacy connection
4. Fall back to Offline

### 3. Message Format

**Decision**: Follow Agency ↔ Humancy schemas from contracts#4

**Key Types**:
```typescript
interface DecisionRequest {
  id: string;           // UUID for correlation
  type: 'question' | 'decision' | 'review';
  urgency: Urgency;
  question?: string;
  options?: Option[];
  artifact?: string;
  context?: string;
  timeout?: number;
}

interface HumanResponse {
  requestId: string;
  type: 'text' | 'selection' | 'approval';
  freeformResponse?: string;
  selectedOption?: string;
  status?: 'approved' | 'rejected' | 'changes_requested';
  comments?: string;
}
```

### 4. Error Handling Pattern

**Decision**: Return error via TerseOutput, let agent decide

**Timeout Error Format**:
```typescript
TerseOutput.failure(
  `Timeout after ${elapsed}ms waiting for human response`,
  { requestId, urgency, elapsed }
);
```

**Connection Error Format**:
```typescript
TerseOutput.failure(
  'Humancy not connected',
  { mode: 'offline', requestId }
);
```

## Alternatives Considered

### Queue Persistence Location

| Option | Pros | Cons | Decision |
|--------|------|------|----------|
| In-memory | Simple | Lost on restart | ❌ |
| File-based | Survives restart | Plugin complexity | ❌ |
| Channel router | Separation of concerns | Dependency on #12 | ✅ |
| Telemetry storage | Unified storage | Overkill for messages | ❌ |

**Chosen**: Channel router persistence. Keeps humancy plugin focused on request semantics.

### Review Return Type

| Option | Pros | Cons | Decision |
|--------|------|------|----------|
| Boolean | Simple | No rejection reason | ❌ |
| Status enum | Clear states | Need comments field | ✅ |
| Freeform feedback | Rich | Hard to process | ❌ |
| Item-by-item | Detailed | Overkill | ❌ |

**Chosen**: Status enum with optional comments. Follows terse output pattern.

### Notify Confirmation

| Option | Pros | Cons | Decision |
|--------|------|------|----------|
| Fire-and-forget | Fast, non-blocking | No delivery confirmation | ✅ |
| Wait for ack | Reliable | Blocking | ❌ |
| Async callback | Best of both | Complex | ❌ |

**Chosen**: Fire-and-forget. Matches spec's "non-blocking" requirement.

## Implementation Patterns

### Tool Structure Pattern

Following existing agency tools:
```typescript
export const askQuestionTool: AgencyTool = {
  name: 'humancy.ask_question',
  namespace: 'humancy',
  description: 'Ask human a freeform question',
  outputPattern: 'terse',
  inputSchema: {
    type: 'object',
    properties: {
      question: { type: 'string', description: 'Question to ask' },
      context: { type: 'string', description: 'Additional context' },
      urgency: { type: 'string', enum: ['blocking_now', 'blocking_soon', 'when_available'] },
      timeout: { type: 'number', description: 'Timeout in milliseconds' }
    },
    required: ['question']
  },
  async execute(params: AskQuestionParams): Promise<ToolResult> {
    // Implementation
  }
};
```

### Plugin Cleanup Pattern

```typescript
class HumancyPlugin implements AgencyPlugin {
  private core: AgencyCoreAPI | null = null;
  private subscriptions: Set<() => void> = new Set();

  async initialize(core: AgencyCoreAPI): Promise<void> {
    this.core = core;

    // Register tools
    core.registerTool(askQuestionTool);
    core.registerTool(requestReviewTool);
    core.registerTool(requestDecisionTool);
    core.registerTool(notifyTool);

    // Track subscriptions for cleanup
    const unsub = core.onModeChange(this.handleModeChange.bind(this));
    this.subscriptions.add(unsub);
  }

  async shutdown(): Promise<void> {
    // Unsubscribe all
    for (const unsub of this.subscriptions) {
      unsub();
    }
    this.subscriptions.clear();
    this.core = null;
  }
}
```

## References

- Channel Router Spec: `/workspaces/agency/specs/012-channel-router-inter-plugin/spec.md`
- Terse Output Spec: `/workspaces/agency/specs/011-terse-output-pattern-utilities/spec.md`
- Plugin Loader Spec: `/workspaces/agency/specs/008-plugin-loader-lifecycle-management/spec.md`
- Tool Naming Spec: `/workspaces/agency/specs/010-tool-registry-naming-convention/spec.md`
- Agency ↔ Humancy Schemas: `generacy-ai/contracts#4` (external dependency)
