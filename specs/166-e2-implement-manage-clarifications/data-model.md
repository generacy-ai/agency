# Data Model: E2 - Implement manage_clarifications Tool

## Core Entities

### ClarificationStatus (Enum)

New enum for explicit status tracking (per clarification answer B):

```typescript
/**
 * Status of a clarification question
 */
export enum ClarificationStatus {
  /** Question awaiting answer */
  PENDING = 'pending',
  /** Question has been answered */
  ANSWERED = 'answered'
}
```

### ClarificationOption (Existing)

Already defined in `types/clarification.ts`:

```typescript
export interface ClarificationOption {
  /** Option label (A, B, C) */
  label: string;
  /** Description */
  description: string;
}
```

### ClarificationQuestion (Extended)

Extend existing interface with explicit status:

```typescript
export interface ClarificationQuestion {
  /** Sequential question number */
  number: number;
  /** Short topic identifier */
  topic: string;
  /** Why this question matters */
  context: string;
  /** The specific question */
  question: string;
  /** Optional A/B/C options */
  options?: ClarificationOption[];
  /** Answer text or null if pending */
  answer: string | null;
  /** Explicit status */
  status: ClarificationStatus;
}
```

### ClarificationBatch (Existing)

Already defined in `types/clarification.ts`:

```typescript
export interface ClarificationBatch {
  /** Batch number */
  number: number;
  /** ISO timestamp when batch was created */
  timestamp: string;
  /** Questions in batch */
  questions: ClarificationQuestion[];
}
```

## Tool Input/Output Types

### ManageClarificationsParams

```typescript
export interface ManageClarificationsParams {
  /** Operation to perform */
  operation: 'read' | 'append' | 'update_answer';

  /** Feature directory path (auto-detected if not provided) */
  feature_dir?: string;

  /** Working directory */
  cwd?: string;

  /** Questions to append (for 'append' operation) */
  questions?: ClarificationQuestionInput[];

  /** Question number to update (for 'update_answer' operation) */
  question_number?: number;

  /** Answer text (for 'update_answer' operation) */
  answer?: string;
}
```

### ReadClarificationsOutput

```typescript
export interface ReadClarificationsOutput {
  success: boolean;
  /** Whether clarifications.md exists */
  exists: boolean;
  /** All question batches */
  batches: ClarificationBatch[];
  /** Number of pending questions */
  pending_count: number;
  /** Total number of questions */
  total_count: number;
  /** Error if success is false */
  error?: SpecKitError;
}
```

### AppendClarificationsOutput

```typescript
export interface AppendClarificationsOutput {
  success: boolean;
  /** Batch number assigned */
  batch_number: number;
  /** Number of questions added */
  questions_added: number;
  /** First question number in batch */
  first_question_number: number;
  /** Humancy request status per question */
  humancy_requests?: HumancyRequestStatus[];
  /** Error if success is false */
  error?: SpecKitError;
}

export interface HumancyRequestStatus {
  question_number: number;
  /** Whether Humancy request was sent */
  sent: boolean;
  /** Humancy request type used */
  type: 'ask_question' | 'request_decision';
  /** Error message if sent is false */
  error?: string;
}
```

### UpdateAnswerOutput

```typescript
export interface UpdateAnswerOutput {
  success: boolean;
  /** Question number updated */
  question_number: number;
  /** Previous answer (null if was pending) */
  previous_answer: string | null;
  /** New status */
  status: ClarificationStatus;
  /** Error if success is false */
  error?: SpecKitError;
}
```

## Validation Rules

### Question Input Validation (Zod Schema)

```typescript
const ClarificationQuestionInputSchema = z.object({
  topic: z.string().min(1).max(100),
  context: z.string().min(1).max(1000),
  question: z.string().min(1).max(500),
  options: z.array(z.object({
    label: z.string().length(1).regex(/^[A-Z]$/),
    description: z.string().min(1).max(200)
  })).min(2).max(6).optional()
});

const ManageClarificationsParamsSchema = z.object({
  operation: z.enum(['read', 'append', 'update_answer']),
  feature_dir: z.string().optional(),
  cwd: z.string().optional(),
  questions: z.array(ClarificationQuestionInputSchema).optional(),
  question_number: z.number().int().positive().optional(),
  answer: z.string().optional()
}).refine(
  data => {
    if (data.operation === 'append') return data.questions && data.questions.length > 0;
    if (data.operation === 'update_answer') return data.question_number !== undefined && data.answer !== undefined;
    return true;
  },
  { message: 'Missing required parameters for operation' }
);
```

## Relationships

```
┌─────────────────────┐
│  ClarificationsFile │
│  (clarifications.md)│
└──────────┬──────────┘
           │ 1:N
           ▼
┌─────────────────────┐
│ ClarificationBatch  │
│   - number          │
│   - timestamp       │
└──────────┬──────────┘
           │ 1:N
           ▼
┌─────────────────────┐
│ClarificationQuestion│
│   - number (global) │
│   - status          │
│   - answer          │
└──────────┬──────────┘
           │ 0:N
           ▼
┌─────────────────────┐
│ ClarificationOption │
│   - label (A,B,C)   │
│   - description     │
└─────────────────────┘
```

## Error Types

```typescript
export type ClarificationErrorCode =
  | 'CLARIFICATION_FILE_NOT_FOUND'
  | 'CLARIFICATION_NOT_FOUND'
  | 'CLARIFICATION_INVALID_OPERATION'
  | 'CLARIFICATION_APPEND_FAILED'
  | 'CLARIFICATION_UPDATE_FAILED'
  | 'HUMANCY_NOT_AVAILABLE';
```
