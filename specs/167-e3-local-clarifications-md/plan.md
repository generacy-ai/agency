# Implementation Plan: E3: Local clarifications.md read/write

**Feature**: Utilities for reading and writing clarifications.md files in feature directories
**Branch**: `167-e3-local-clarifications-md`
**Status**: Complete

## Summary

This feature implements the local file utilities for managing clarifications.md files. The implementation provides functions to parse the markdown format, serialize structured data back to markdown, track question numbers across batches, and handle answer updates.

**Discovery**: The implementation already exists in `packages/agency-plugin-spec-kit`:
- Types in `src/types/clarification.ts`
- Parser utilities in `src/utils/clarification-parser.ts`
- MCP tool in `src/tools/manage-clarifications.ts`

The original spec requested creation in `src/utils/clarifications.ts` (agency core), but clarification #3 confirmed it should be in the speckit plugin. This is already done.

## Technical Context

- **Language**: TypeScript
- **Runtime**: Node.js
- **Package**: `@generacy-ai/agency-plugin-spec-kit`
- **Location**: `packages/agency-plugin-spec-kit/src/utils/clarification-parser.ts`
- **Dependencies**: None (pure parsing utilities)

## Implementation Status

### Already Implemented

| Component | Location | Status |
|-----------|----------|--------|
| Type definitions | `src/types/clarification.ts` | ✅ Complete |
| Parse function | `src/utils/clarification-parser.ts:parseClarificationsFile()` | ✅ Complete |
| Serialize functions | `formatQuestion()`, `formatBatch()` | ✅ Complete |
| Question counting | `countQuestions()` | ✅ Complete |
| Question finding | `findQuestion()` | ✅ Complete |
| Answer updates | `updateAnswerInContent()` | ✅ Complete |
| Batch timestamps | `generateBatchTimestamp()` | ✅ Complete |
| MCP tool | `src/tools/manage-clarifications.ts` | ✅ Complete |
| Re-exports | `src/utils/index.ts` | ✅ Complete |

### Type Definitions (clarification.ts)

```typescript
// Core types
export enum ClarificationStatus { PENDING = 'pending', ANSWERED = 'answered' }
export interface ClarificationOption { label: string; description: string; }
export interface ClarificationQuestion {
  number: number;
  topic: string;
  context: string;
  question: string;
  options?: ClarificationOption[];
  answer: string | null;
  status: ClarificationStatus;
}
export interface ClarificationBatch {
  number: number;
  timestamp: string;
  questions: ClarificationQuestion[];
}
```

### Parser Functions (clarification-parser.ts)

```typescript
// Parsing
parseClarificationsFile(content: string): ParsedClarificationsFile
// Returns { batches, nextQuestionNumber, nextBatchNumber }

// Serialization
formatQuestion(q: ClarificationQuestion): string
formatBatch(batch: ClarificationBatch): string

// Utilities
generateBatchTimestamp(): string  // "2024-01-15 10:30"
countQuestions(batches): { pending_count, total_count }
findQuestion(batches, questionNumber): ClarificationQuestion | null
updateAnswerInContent(content, questionNumber, answer): string
```

## File Format

The clarifications.md format uses this structure:

```markdown
# Clarifications

Questions and answers to clarify the feature specification.

## Batch 1 - 2024-01-15 10:30

### Q1: Authentication Method
**Context**: Need to determine the authentication approach
**Question**: Should we use JWT tokens or session-based authentication?
**Options**:
- A: JWT tokens - Stateless, good for microservices
- B: Session-based - Simpler, server-side state

**Answer**: A - JWT tokens

### Q2: Database Choice
**Context**: Need to select primary database
**Question**: Which database should we use?

**Answer**: *Pending*
```

## Project Structure

```
packages/agency-plugin-spec-kit/
├── src/
│   ├── types/
│   │   ├── clarification.ts    # Type definitions
│   │   └── index.ts            # Re-exports types
│   ├── utils/
│   │   ├── clarification-parser.ts  # Parser implementation
│   │   └── index.ts            # Re-exports utilities
│   └── tools/
│       ├── manage-clarifications.ts  # MCP tool
│       └── index.ts            # Re-exports tools
```

## Acceptance Criteria Mapping

| Criterion | Implementation | Status |
|-----------|----------------|--------|
| Create `src/utils/clarifications.ts` | `clarification-parser.ts` (different name) | ✅ |
| Parse clarifications.md format | `parseClarificationsFile()` | ✅ |
| Generate clarifications.md | `formatQuestion()`, `formatBatch()` | ✅ |
| Support question batches with timestamps | `ClarificationBatch.timestamp`, `generateBatchTimestamp()` | ✅ |
| Track question numbers across batches | `ParsedClarificationsFile.nextQuestionNumber` | ✅ |
| Handle malformed files gracefully | Parser returns empty results for unparseable content | ✅ |

## API Comparison

The spec requested these functions (spec format → actual implementation):

| Spec Function | Actual Function | Notes |
|---------------|-----------------|-------|
| `parseClarifications(content)` | `parseClarificationsFile(content)` | Returns `ParsedClarificationsFile` |
| `serializeClarifications(file)` | `formatBatch(batch)` | Per-batch serialization |
| `getNextQuestionNumber(file)` | `parsed.nextQuestionNumber` | Property on parse result |
| `findQuestion(file, number)` | `findQuestion(batches, number)` | Takes batches array |
| `updateAnswer(file, number, answer)` | `updateAnswerInContent(content, number, answer)` | Works on string content |
| `appendBatch(file, questions)` | Handled in `manage-clarifications.ts` tool | In tool implementation |

## Verification

To verify the implementation works:

1. **Build the package**:
   ```bash
   cd packages/agency-plugin-spec-kit
   pnpm build
   ```

2. **Run tests** (if available):
   ```bash
   pnpm test
   ```

3. **Test via MCP tool**:
   ```typescript
   // Read clarifications
   await manageClarifications({ operation: 'read' });

   // Append questions
   await manageClarifications({
     operation: 'append',
     questions: [{ topic: 'Test', context: 'Testing', question: 'Does it work?' }]
   });

   // Update answer
   await manageClarifications({
     operation: 'update_answer',
     question_number: 1,
     answer: 'Yes it works!'
   });
   ```

## Notes

- The implementation follows clarification answers from issue #166:
  - Uses Humancy plugin for human input (answer A to Q1)
  - Tool name is `spec_kit.manage_clarifications` (answer C to Q2 - though code still uses `spec_kit` prefix)
  - Located in speckit plugin (answer B to Q3)
  - Uses explicit status enum (answer B to Q4)

- The file format differs slightly from the spec example:
  - Spec: `## Batch 1 (2024-01-15T10:30:00Z)` with parentheses and ISO timestamp
  - Actual: `## Batch 1 - 2024-01-15 10:30` with dash and simplified timestamp

## Next Steps

Since the implementation is complete, the next step is to:
1. Run `/speckit:tasks` to generate task verification checklist
2. Build and test the package
3. Consider updating tool namespace to `speckit.*` for consistency (if desired)
