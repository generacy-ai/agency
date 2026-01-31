# Data Model: E3 Local clarifications.md

## Core Entities

### ClarificationStatus (Enum)

Explicit status tracking for question state.

```typescript
export enum ClarificationStatus {
  PENDING = 'pending',
  ANSWERED = 'answered',
}
```

### ClarificationOption

Represents a choice option for multiple-choice questions.

```typescript
export interface ClarificationOption {
  /** Option label (A, B, C, etc.) */
  label: string;

  /** Description of the option */
  description: string;
}
```

**Validation Rules**:
- `label`: Non-empty string, typically single uppercase letter
- `description`: Non-empty string describing the option

### ClarificationQuestion

A single clarification question with its answer state.

```typescript
export interface ClarificationQuestion {
  /** Sequential question number (1-indexed, unique across all batches) */
  number: number;

  /** Short topic identifier (e.g., "Authentication", "Database") */
  topic: string;

  /** Context explaining why this question matters */
  context: string;

  /** The actual question text */
  question: string;

  /** Optional multiple choice options */
  options?: ClarificationOption[];

  /** Answer text, or null if pending */
  answer: string | null;

  /** Explicit status enum */
  status: ClarificationStatus;
}
```

**Validation Rules**:
- `number`: Positive integer, unique across all batches
- `topic`: Non-empty string, typically 1-3 words
- `context`: Non-empty string explaining the question's importance
- `question`: Non-empty string ending with `?`
- `options`: If provided, must have at least 2 options
- `answer`: `null` when pending, non-empty string when answered
- `status`: Must match `answer` state (PENDING when null, ANSWERED otherwise)

### ClarificationBatch

A group of questions added together at the same time.

```typescript
export interface ClarificationBatch {
  /** Batch number (1-indexed) */
  number: number;

  /** Timestamp when batch was created */
  timestamp: string;

  /** Questions in this batch */
  questions: ClarificationQuestion[];
}
```

**Validation Rules**:
- `number`: Positive integer, sequential
- `timestamp`: Format `YYYY-MM-DD HH:MM`
- `questions`: Non-empty array of questions

### ParsedClarificationsFile

Result of parsing a clarifications.md file.

```typescript
export interface ParsedClarificationsFile {
  /** All question batches */
  batches: ClarificationBatch[];

  /** Next question number to assign */
  nextQuestionNumber: number;

  /** Next batch number to assign */
  nextBatchNumber: number;
}
```

**Derived Properties**:
- `nextQuestionNumber`: Max question number + 1 across all batches
- `nextBatchNumber`: Max batch number + 1

## Entity Relationships

```
ParsedClarificationsFile
    │
    └── batches[]
          │
          └── ClarificationBatch
                │
                ├── number (unique)
                ├── timestamp
                │
                └── questions[]
                      │
                      └── ClarificationQuestion
                            │
                            ├── number (globally unique)
                            ├── topic
                            ├── context
                            ├── question
                            ├── status (enum)
                            ├── answer (nullable)
                            │
                            └── options[]
                                  │
                                  └── ClarificationOption
                                        ├── label
                                        └── description
```

## File Format → Data Model Mapping

### Markdown Structure

```markdown
# Clarifications                           → File header (static)

## Batch {number} - {timestamp}            → ClarificationBatch
                                             - number: parsed from header
                                             - timestamp: parsed from header

### Q{number}: {topic}                     → ClarificationQuestion
**Context**: {context}                       - number: parsed from header
**Question**: {question}                     - topic: parsed from header
**Options**:                                 - context: parsed from field
- {label}: {description}                     - question: parsed from field
                                             - options: parsed from list

**Answer**: {answer}                         - answer: null if "*Pending*"
                                             - status: derived from answer
```

### Parsing Rules

| Markdown Pattern | Regex | Field |
|------------------|-------|-------|
| `## Batch N - timestamp` | `/^## Batch (\d+) - (.+)$/` | batch.number, batch.timestamp |
| `### QN: topic` | `/^### Q(\d+): (.+)$/` | question.number, question.topic |
| `**Context**: text` | `/\*\*Context\*\*:\s*(.+?)(?=\n\*\*)/` | question.context |
| `**Question**: text` | `/\*\*Question\*\*:\s*(.+?)(?=\n\*\*)/` | question.question |
| `- A: description` | `/- ([A-Z]): (.+)/` | option.label, option.description |
| `**Answer**: text` | `/\*\*Answer\*\*:\s*(.+?)$/` | question.answer |

### Status Derivation

```typescript
// During parsing
const answerText = parsed ?? '*Pending*';
const isPending = answerText === '*Pending*';

question.answer = isPending ? null : answerText;
question.status = isPending ? ClarificationStatus.PENDING : ClarificationStatus.ANSWERED;
```

## Tool Output Types

### ReadClarificationsOutput

```typescript
export interface ReadClarificationsOutput {
  success: boolean;
  exists: boolean;
  batches: ClarificationBatch[];
  pending_count: number;
  total_count: number;
  error?: string;
}
```

### AppendClarificationsOutput

```typescript
export interface AppendClarificationsOutput {
  success: boolean;
  batch_number: number;
  questions_added: number;
  first_question_number: number;
  humancy_requests?: HumancyRequestStatus[];
  error?: string;
}
```

### UpdateAnswerOutput

```typescript
export interface UpdateAnswerOutput {
  success: boolean;
  question_number: number;
  previous_answer: string | null;
  status: ClarificationStatus;
  error?: string;
}
```
