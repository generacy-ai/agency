# Implementation Plan: E2 - Implement manage_clarifications Tool

**Feature**: Implement the `speckit.manage_clarifications` MCP tool for managing clarification questions
**Branch**: `166-e2-implement-manage-clarifications`
**Status**: Complete

## Summary

Implement a clarifications management tool for the SpecKit plugin that integrates with the Humancy plugin for human input. The tool manages the lifecycle of clarification questions during feature specification, supporting read, append, and update operations on a local `clarifications.md` file while routing questions through Humancy for human responses.

## Technical Context

- **Language**: TypeScript
- **Framework**: Agency plugin architecture
- **Target Package**: `@generacy-ai/agency-plugin-spec-kit`
- **Dependencies**:
  - `@generacy-ai/agency` (core API, tool types, TerseOutput)
  - `@generacy-ai/agency-plugin-humancy` (ask_question, request_decision tools)
  - `zod` (runtime validation)

## Project Structure

```
packages/agency-plugin-spec-kit/
├── src/
│   ├── tools/
│   │   ├── index.ts                    # Modified: export new tool
│   │   ├── manage-clarifications.ts    # NEW: tool implementation
│   │   ├── get-paths.ts
│   │   ├── get-ticket.ts
│   │   └── check-prereqs.ts
│   ├── types/
│   │   ├── index.ts                    # Modified: re-export clarification types
│   │   └── clarification.ts            # Modified: add status enum, output types
│   ├── utils/
│   │   ├── index.ts                    # Modified: export clarification utils
│   │   └── clarification-parser.ts     # NEW: markdown parsing/formatting
│   └── plugin.ts                       # No changes needed
├── tests/
│   └── tools/
│       └── manage-clarifications.test.ts  # NEW: unit tests
└── package.json                        # Modified: add humancy peer dep
```

## Key Design Decisions

### 1. Tool Namespace (Clarification Q2 → Answer C)
Tool name: `speckit.manage_clarifications` - follows existing speckit naming convention.

### 2. Humancy Integration (Clarification Q1 → Answer A)
Use Humancy plugin for human input:
- `humancy.ask_question` for open-ended questions
- `humancy.request_decision` for multiple-choice questions

### 3. Package Location (Clarification Q3 → Answer B)
Implement in SpecKit plugin (`packages/agency-plugin-spec-kit`) to co-locate with related spec management functionality.

### 4. Question Status Model (Clarification Q4 → Answer B)
Use explicit status enum:
```typescript
enum ClarificationStatus {
  PENDING = 'pending',
  ANSWERED = 'answered'
}
```

## Architecture

### Tool Operations

#### `read`
- Parse `clarifications.md` from feature directory
- Return structured batches with question status
- No Humancy interaction required

#### `append`
- Add new question batch with timestamp
- For each question:
  - If options provided → call `humancy.request_decision`
  - If no options → call `humancy.ask_question`
- Write updated file to disk
- Return batch info with question IDs

#### `update_answer`
- Find question by number
- Update answer text in file
- Mark status as `answered`
- Write updated file

### Humancy Integration Pattern

The tool will use Agency's tool invocation system to call Humancy tools:

```typescript
// Get humancy tools from core API
const askQuestion = coreAPI.getTool('humancy.ask_question');
const requestDecision = coreAPI.getTool('humancy.request_decision');

// Invoke for each question
for (const question of questions) {
  if (question.options?.length) {
    await requestDecision.execute({
      question: question.question,
      context: question.context,
      options: question.options.map(opt => ({
        id: opt.label,
        label: opt.description
      }))
    });
  } else {
    await askQuestion.execute({
      question: question.question,
      context: question.context
    });
  }
}
```

### File Format

The `clarifications.md` file format follows the reference implementation:

```markdown
# Clarifications

Questions and answers to clarify the feature specification.

## Batch 1 - 2026-01-30 10:30

### Q1: Topic Name
**Context**: Why this question matters
**Question**: The specific question
**Options**:
- A: Option description
- B: Option description

**Answer**: *Pending*
```

## Constitution Check

Reviewed against `.specify/memory/constitution.md`:
- ✅ Follows existing plugin patterns
- ✅ Uses TerseOutput for tool responses
- ✅ Maintains backwards compatibility with clarifications.md format
- ✅ Integrates with existing Humancy plugin via core API

## Implementation Notes

1. **Error Handling**: Use existing `createError` utility from types/errors.ts
2. **Path Resolution**: Use `spec_kit.get_paths` internally or share the path resolution logic
3. **Testing**: Mock Humancy tools in unit tests
4. **Type Safety**: Share types with existing `clarification.ts` types
