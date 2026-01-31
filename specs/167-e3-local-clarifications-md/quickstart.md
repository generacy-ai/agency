# Quickstart: E3 Local clarifications.md

## Overview

The clarifications.md utilities provide functions to parse, format, and manipulate clarification files used during feature specification.

## Installation

The utilities are part of `@generacy-ai/agency-plugin-spec-kit`:

```bash
pnpm add @generacy-ai/agency-plugin-spec-kit
```

## Usage

### Import Utilities

```typescript
import {
  // Types
  ClarificationStatus,
  type ClarificationQuestion,
  type ClarificationBatch,
  type ClarificationOption,

  // Parser functions
  parseClarificationsFile,
  formatQuestion,
  formatBatch,
  generateBatchTimestamp,
  countQuestions,
  findQuestion,
  updateAnswerInContent,
  CLARIFICATIONS_FILE_HEADER,
} from '@generacy-ai/agency-plugin-spec-kit';
```

### Parse a Clarifications File

```typescript
import { readFileSync } from 'fs';

const content = readFileSync('specs/042-feature/clarifications.md', 'utf-8');
const parsed = parseClarificationsFile(content);

console.log(`Batches: ${parsed.batches.length}`);
console.log(`Next question number: ${parsed.nextQuestionNumber}`);
console.log(`Next batch number: ${parsed.nextBatchNumber}`);
```

### Count Questions

```typescript
const { pending_count, total_count } = countQuestions(parsed.batches);
console.log(`Questions: ${total_count} total, ${pending_count} pending`);
```

### Find a Question

```typescript
const question = findQuestion(parsed.batches, 3);
if (question) {
  console.log(`Q${question.number}: ${question.topic}`);
  console.log(`Status: ${question.status}`);
  console.log(`Answer: ${question.answer ?? 'Pending'}`);
}
```

### Create New Questions

```typescript
import { writeFileSync } from 'fs';

// Create a new batch
const newBatch: ClarificationBatch = {
  number: parsed.nextBatchNumber,
  timestamp: generateBatchTimestamp(),
  questions: [
    {
      number: parsed.nextQuestionNumber,
      topic: 'Authentication',
      context: 'Need to decide auth approach',
      question: 'Should we use JWT or sessions?',
      options: [
        { label: 'A', description: 'JWT tokens - Stateless' },
        { label: 'B', description: 'Sessions - Server state' },
      ],
      answer: null,
      status: ClarificationStatus.PENDING,
    },
  ],
};

// Format and append to file
const batchMd = formatBatch(newBatch);
const newContent = content + '\n' + batchMd;
writeFileSync('clarifications.md', newContent);
```

### Update an Answer

```typescript
const updatedContent = updateAnswerInContent(
  content,
  3, // Question number
  'A - Use JWT tokens for stateless auth'
);
writeFileSync('clarifications.md', updatedContent);
```

## MCP Tool Usage

The utilities are also exposed via the `spec_kit.manage_clarifications` MCP tool:

### Read Clarifications

```typescript
const result = await manageClarifications({
  operation: 'read',
  // feature_dir is auto-detected from branch
});

// Returns:
// {
//   success: true,
//   exists: true,
//   batches: [...],
//   pending_count: 2,
//   total_count: 5
// }
```

### Append Questions

```typescript
const result = await manageClarifications({
  operation: 'append',
  questions: [
    {
      topic: 'Database',
      context: 'Need to choose database technology',
      question: 'PostgreSQL or MongoDB?',
      options: [
        { label: 'A', description: 'PostgreSQL' },
        { label: 'B', description: 'MongoDB' },
      ],
    },
  ],
});

// Returns:
// {
//   success: true,
//   batch_number: 2,
//   questions_added: 1,
//   first_question_number: 6,
//   humancy_requests: [...]
// }
```

### Update Answer

```typescript
const result = await manageClarifications({
  operation: 'update_answer',
  question_number: 1,
  answer: 'A - PostgreSQL for relational data needs',
});

// Returns:
// {
//   success: true,
//   question_number: 1,
//   previous_answer: null,
//   status: 'answered'
// }
```

## File Format

Clarifications files follow this structure:

```markdown
# Clarifications

Questions and answers to clarify the feature specification.

## Batch 1 - 2024-01-15 10:30

### Q1: Authentication Method
**Context**: Need to determine the authentication approach
**Question**: Should we use JWT or session-based authentication?
**Options**:
- A: JWT tokens - Stateless, good for microservices
- B: Sessions - Server state, simpler

**Answer**: A - JWT tokens

### Q2: Database Choice
**Context**: Need to select primary database
**Question**: Which database should we use?

**Answer**: *Pending*

## Batch 2 - 2024-01-16 14:00

### Q3: Caching Strategy
...
```

## Troubleshooting

### File Not Found

If `operation: 'read'` returns `exists: false`, ensure:
- You're on a feature branch
- The feature directory exists in `specs/`
- Or provide explicit `feature_dir` parameter

### Question Not Found

If `update_answer` fails with "Question N not found":
- Verify the question number exists
- Check for typos in the clarifications.md file
- Re-parse the file to ensure it's valid

### Humancy Not Available

If `humancy_requests` shows `sent: false`:
- This is normal if Humancy plugin is not installed
- Questions are still saved to clarifications.md
- Answers must be provided manually or via GitHub

## API Reference

| Function | Description |
|----------|-------------|
| `parseClarificationsFile(content)` | Parse markdown into structured data |
| `formatQuestion(question)` | Format single question as markdown |
| `formatBatch(batch)` | Format batch with all questions |
| `generateBatchTimestamp()` | Generate "YYYY-MM-DD HH:MM" timestamp |
| `countQuestions(batches)` | Count pending and total questions |
| `findQuestion(batches, number)` | Find question by number |
| `updateAnswerInContent(content, number, answer)` | Update answer in markdown |
