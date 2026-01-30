# Data Model: Clarification Flow with Humancy

## Core Entities

### ClarificationQuestion

Represents a single question to be asked during the clarify phase.

```typescript
interface ClarificationQuestion {
  /** Unique question number (sequential across all batches) */
  number: number;

  /** Short topic identifier (e.g., "timeout-handling") */
  topic: string;

  /** Why this question matters for the specification */
  context: string;

  /** The actual question to ask the human */
  question: string;

  /** Optional multiple-choice options */
  options?: ClarificationOption[];

  /** Human's answer (null if pending) */
  answer: string | null;

  /** Humancy decision ID for tracking (optional) */
  decisionId?: string;

  /** Question urgency level */
  urgency?: ClarificationUrgency;

  /** Custom timeout in milliseconds */
  timeout?: number;
}
```

### ClarificationOption

Represents a choice for multiple-choice questions.

```typescript
interface ClarificationOption {
  /** Option identifier (A, B, C, etc.) */
  label: string;

  /** Description of what this option means */
  description: string;
}
```

### ClarificationBatch

Groups questions asked at the same time.

```typescript
interface ClarificationBatch {
  /** Batch number (sequential) */
  number: number;

  /** ISO timestamp when batch was created */
  timestamp: string;

  /** Questions in this batch */
  questions: ClarificationQuestion[];
}
```

### ClarificationUrgency

Maps to Humancy urgency levels.

```typescript
type ClarificationUrgency =
  | 'blocking'      // Maps to BLOCKING_NOW - agent blocked
  | 'important'     // Maps to BLOCKING_SOON - can continue briefly
  | 'optional';     // Maps to WHEN_AVAILABLE - non-blocking
```

## Type Definitions

### HumancyQuestionRequest

Request format for Humancy `ask_question` tool.

```typescript
interface HumancyQuestionRequest {
  /** The question text */
  question: string;

  /** Additional context for the human */
  context?: string;

  /** Urgency level */
  urgency?: 'blocking_now' | 'blocking_soon' | 'when_available';

  /** Timeout in milliseconds */
  timeout?: number;
}
```

### HumancyDecisionRequest

Request format for Humancy `request_decision` tool.

```typescript
interface HumancyDecisionRequest {
  /** The decision question */
  question: string;

  /** Available options */
  options: HumancyDecisionOption[];

  /** Domain tags for principle matching */
  domain?: string[];

  /** Additional context */
  decisionContext?: {
    projectConstraints?: string[];
    relatedIssue?: string;
  };

  /** Enable three-layer recommendations */
  includeRecommendations?: boolean;

  /** Urgency level */
  urgency?: 'blocking_now' | 'blocking_soon' | 'when_available';

  /** Timeout in milliseconds */
  timeout?: number;
}

interface HumancyDecisionOption {
  /** Unique identifier */
  id: string;

  /** Display label */
  label: string;

  /** Detailed description */
  description?: string;
}
```

### HumancyResponse

Response from Humancy tools.

```typescript
interface HumancyQuestionResponse {
  /** Human's text answer */
  answer: string;

  /** Decision ID for outcome tracking */
  decisionId?: string;
}

interface HumancyDecisionResponse {
  /** Selected option ID */
  selectedOption: string;

  /** Decision ID for outcome tracking */
  decisionId?: string;

  /** Three-layer breakdown (if requested) */
  baseline?: {
    optionId: string;
    confidence: number;
    reasoning: string[];
  };

  protege?: {
    optionId: string;
    confidence: number;
    reasoning: string[];
    appliedPrinciples: string[];
  };

  human?: {
    optionId: string;
    matchedProtege: boolean;
    coaching: string | null;
  };
}
```

## Validation Rules

### Question Validation

```typescript
const questionSchema = z.object({
  number: z.number().positive(),
  topic: z.string().min(1).max(50),
  context: z.string().min(10).max(500),
  question: z.string().min(5).max(1000),
  options: z.array(z.object({
    label: z.string().regex(/^[A-Z]$/),
    description: z.string().min(1).max(500)
  })).optional(),
  answer: z.string().nullable(),
  decisionId: z.string().uuid().optional(),
  urgency: z.enum(['blocking', 'important', 'optional']).optional(),
  timeout: z.number().positive().optional()
});
```

### Batch Validation

```typescript
const batchSchema = z.object({
  number: z.number().positive(),
  timestamp: z.string().datetime(),
  questions: z.array(questionSchema).min(1).max(20)
});
```

## Relationships

```
┌─────────────────────┐
│ ClarificationBatch  │
│                     │
│ - number: 1         │
│ - timestamp: ...    │
└─────────┬───────────┘
          │
          │ 1:N
          │
          ▼
┌─────────────────────┐      ┌─────────────────────┐
│ ClarificationQuestion│     │ HumancyDecisionStore│
│                     │◄────►│                     │
│ - number: 1         │      │ - decisionId        │
│ - topic: ...        │      │ - request           │
│ - decisionId ──────────────│ - threeLayer        │
│ - answer: ...       │      │ - outcome           │
└─────────┬───────────┘      └─────────────────────┘
          │
          │ 0:N
          │
          ▼
┌─────────────────────┐
│ ClarificationOption │
│                     │
│ - label: A          │
│ - description: ...  │
└─────────────────────┘
```

## File Format: clarifications.md

### Current Format

```markdown
# Clarifications

Questions and answers to clarify the feature specification.

## Batch 1 - 2026-01-30 10:45

### Q1: Topic Name
**Context**: Why this matters
**Question**: The actual question?
**Options**:
- A: First option
- B: Second option
**Answer**: *Pending*
```

### Extended Format (with Humancy)

```markdown
# Clarifications

Questions and answers to clarify the feature specification.

## Batch 1 - 2026-01-30 10:45

### Q1: Topic Name
**DecisionId**: `abc123-def456-ghi789`
**Urgency**: blocking
**Context**: Why this matters
**Question**: The actual question?
**Options**:
- A: First option
- B: Second option
**Answer**: A - First option

### Q2: Another Topic
**DecisionId**: `xyz789-abc123-def456`
**Urgency**: optional
**Context**: Additional context
**Question**: What should the timeout be?
**Answer**: *Pending*
```

## State Transitions

### Question State Machine

```
                    ┌─────────────┐
                    │   Created   │
                    └──────┬──────┘
                           │
                           ▼
                    ┌─────────────┐
          ┌─────────│   Pending   │─────────┐
          │         └──────┬──────┘         │
          │                │                │
    Timeout (skip)         │          Timeout (block)
          │                │                │
          ▼                ▼                ▼
   ┌─────────────┐  ┌─────────────┐  ┌─────────────┐
   │   Skipped   │  │  Answered   │  │   Blocked   │
   └─────────────┘  └─────────────┘  └─────────────┘
```

### Batch State Machine

```
┌─────────────┐      ┌──────────────────┐      ┌─────────────┐
│   Created   │ ───► │ Awaiting Answers │ ───► │  Complete   │
└─────────────┘      └──────────────────┘      └─────────────┘
                              │
                              │ (partial answers + threshold met)
                              ▼
                     ┌──────────────────┐
                     │ Partial Complete │
                     └──────────────────┘
```
