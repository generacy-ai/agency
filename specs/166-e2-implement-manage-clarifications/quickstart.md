# Quickstart: E2 - manage_clarifications Tool

## Installation

The `spec_kit.manage_clarifications` tool is part of the `@generacy-ai/agency-plugin-spec-kit` package.

```bash
pnpm add @generacy-ai/agency-plugin-spec-kit
```

Ensure the Humancy plugin is also installed for question routing:

```bash
pnpm add @generacy-ai/agency-plugin-humancy
```

## Configuration

Load both plugins when initializing Agency:

```typescript
import { createAgency } from '@generacy-ai/agency';
import { createSpecKitPlugin } from '@generacy-ai/agency-plugin-spec-kit';
import { createHumancyPlugin } from '@generacy-ai/agency-plugin-humancy';

const agency = await createAgency({
  plugins: [
    createSpecKitPlugin(),
    createHumancyPlugin()
  ]
});
```

## Usage

### Read Clarifications

Read existing clarification questions and their status:

```typescript
const result = await agency.executeTool('spec_kit.manage_clarifications', {
  operation: 'read'
});

// Result:
{
  success: true,
  exists: true,
  batches: [
    {
      number: 1,
      timestamp: '2026-01-30 10:30',
      questions: [
        {
          number: 1,
          topic: 'Authentication',
          context: 'Need to decide on auth method',
          question: 'Should we use OAuth or API keys?',
          options: [
            { label: 'A', description: 'OAuth 2.0' },
            { label: 'B', description: 'API Keys' }
          ],
          answer: null,
          status: 'pending'
        }
      ]
    }
  ],
  pending_count: 1,
  total_count: 1
}
```

### Append Questions

Add new clarification questions (routes through Humancy):

```typescript
const result = await agency.executeTool('spec_kit.manage_clarifications', {
  operation: 'append',
  questions: [
    {
      topic: 'Database',
      context: 'Need to choose database for user data',
      question: 'Should we use PostgreSQL or MongoDB?',
      options: [
        { label: 'A', description: 'PostgreSQL - relational, ACID compliant' },
        { label: 'B', description: 'MongoDB - document store, flexible schema' }
      ]
    },
    {
      topic: 'Caching',
      context: 'Performance optimization needed',
      question: 'What caching strategy should we use?'
      // No options = freeform question
    }
  ]
});

// Result:
{
  success: true,
  batch_number: 2,
  questions_added: 2,
  first_question_number: 2,
  humancy_requests: [
    { question_number: 2, sent: true, type: 'request_decision' },
    { question_number: 3, sent: true, type: 'ask_question' }
  ]
}
```

### Update Answer

Update a specific question with an answer:

```typescript
const result = await agency.executeTool('spec_kit.manage_clarifications', {
  operation: 'update_answer',
  question_number: 1,
  answer: 'A: OAuth 2.0 - provides better security and standard compliance'
});

// Result:
{
  success: true,
  question_number: 1,
  previous_answer: null,
  status: 'answered'
}
```

## Available Commands

| Operation | Required Parameters | Description |
|-----------|---------------------|-------------|
| `read` | None | Read all clarifications and their status |
| `append` | `questions` array | Add new questions and route through Humancy |
| `update_answer` | `question_number`, `answer` | Update a question's answer |

## Optional Parameters

All operations support:
- `feature_dir`: Explicit feature directory path
- `cwd`: Working directory (defaults to `process.cwd()`)

## Troubleshooting

### "Humancy not available"

Ensure the Humancy plugin is loaded before SpecKit:

```typescript
const agency = await createAgency({
  plugins: [
    createHumancyPlugin(),  // Load first
    createSpecKitPlugin()
  ]
});
```

### "Feature directory not found"

The tool auto-detects the feature directory from:
1. `feature_dir` parameter
2. `SPECIFY_FEATURE` environment variable
3. Current git branch name

Ensure you're on a feature branch (e.g., `166-my-feature`) or provide the path explicitly.

### "Question not found"

Question numbers are global across all batches. Check the correct number with a `read` operation first.

## File Format

The tool manages `clarifications.md` in your feature directory:

```markdown
# Clarifications

Questions and answers to clarify the feature specification.

## Batch 1 - 2026-01-30 10:30

### Q1: Authentication
**Context**: Need to decide on auth method
**Question**: Should we use OAuth or API keys?
**Options**:
- A: OAuth 2.0
- B: API Keys

**Answer**: A: OAuth 2.0 - provides better security
```
