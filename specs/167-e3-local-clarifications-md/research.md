# Research: E3 Local clarifications.md

## Technology Decisions

### 1. Pure TypeScript Implementation

**Decision**: Use pure TypeScript with regex-based parsing

**Rationale**:
- No external dependencies required
- Markdown format is simple enough for regex parsing
- Avoids complexity of full markdown AST parsing
- Fast and lightweight

**Alternatives Considered**:
- **marked/remark**: Full markdown parsers - overkill for structured format
- **unified/mdast**: AST-based - more powerful but unnecessary complexity

### 2. Explicit Status Enum

**Decision**: Use `ClarificationStatus` enum with `PENDING` and `ANSWERED` values

**Rationale**:
- Type-safe status checking
- Clear intent in code
- Extensible for future states if needed
- Per clarification answer B to Q4

**Alternatives Considered**:
- **null-based**: `answer === null` means pending - implicit, error-prone
- **Boolean flag**: `isAnswered: boolean` - less semantic

### 3. Batch-Based Question Organization

**Decision**: Questions are grouped into batches with timestamps

**Rationale**:
- Preserves history of when questions were asked
- Allows multiple clarification rounds
- Matches typical workflow (ask batch, get answers, ask more if needed)

**Alternatives Considered**:
- **Flat list**: Simpler but loses temporal context
- **Conversation threads**: More complex, unnecessary for clarifications

### 4. Global Question Numbering

**Decision**: Question numbers are unique across all batches (Q1, Q2, Q3...)

**Rationale**:
- Simple reference in discussions ("See Q3")
- No ambiguity about which question is being discussed
- Easy to track next number

**Alternatives Considered**:
- **Per-batch numbering**: B1.Q1, B1.Q2, B2.Q1 - more complex references
- **UUIDs**: Overkill for sequential questions

## Implementation Patterns

### Regex-Based Parsing

The parser uses capture groups to extract structured data:

```typescript
// Batch header: "## Batch 1 - 2024-01-15 10:30"
const batchRegex = /^## Batch (\d+) - (.+)$/gm;

// Question header: "### Q1: Authentication Method"
const questionRegex = /^### Q(\d+): (.+)$/gm;

// Field extraction with lookahead
const contextMatch = qContent.match(/\*\*Context\*\*:\s*(.+?)(?=\n\*\*|\n###|$)/s);
```

### In-Place Content Update

For updating answers, we use regex replacement on the raw content:

```typescript
export function updateAnswerInContent(
  content: string,
  questionNumber: number,
  answer: string
): string {
  const regex = new RegExp(
    `(### Q${questionNumber}:[^]*?\\*\\*Answer\\*\\*:\\s*)([^\\n]+|\\*Pending\\*)`,
    's'
  );
  return content.replace(regex, `$1${answer}`);
}
```

This preserves formatting while updating just the answer text.

### Immutable Data Transformations

All functions return new objects rather than mutating:

```typescript
// Returns new content string, doesn't modify original
const newContent = updateAnswerInContent(content, number, answer);

// Parse returns new structure
const parsed = parseClarificationsFile(content);
```

## File Format Design

### Header Structure

```markdown
# Clarifications

Questions and answers to clarify the feature specification.
```

Static header provides context and file identification.

### Batch Header

```markdown
## Batch 1 - 2024-01-15 10:30
```

Format chosen for:
- Human readability
- Easy regex parsing
- Markdown heading hierarchy (## for batch, ### for question)

### Question Format

```markdown
### Q1: Authentication Method
**Context**: Need to determine the authentication approach
**Question**: Should we use JWT tokens or session-based auth?
**Options**:
- A: JWT tokens - Stateless
- B: Sessions - Server state

**Answer**: A - JWT tokens
```

Design decisions:
- **Bold field names**: Visual separation, easy to parse
- **Options as list**: Natural markdown, easy to extend
- **Single-letter labels**: Quick reference (A, B, C)
- **Answer at end**: Natural reading flow

## Edge Cases Handled

### Empty or Missing File

```typescript
if (!fileExists) {
  return {
    success: true,
    exists: false,
    batches: [],
    pending_count: 0,
    total_count: 0,
  };
}
```

### Malformed Content

Parser returns empty/partial results rather than throwing:

```typescript
// If regex doesn't match, we get null/undefined
const contextMatch = qContent.match(/.../);
question.context = contextMatch?.[1]?.trim() || '';
```

### Missing Options

Options are optional - questions can be open-ended:

```typescript
export interface ClarificationQuestion {
  options?: ClarificationOption[];  // Optional
}
```

## Integration Points

### Humancy Plugin

When appending questions, the tool optionally invokes Humancy:

```typescript
// Try to get Humancy tools
const askQuestion = getTool?.('humancy.ask_question');
const requestDecision = getTool?.('humancy.request_decision');

// Use request_decision for multiple choice
if (question.options?.length && requestDecision) {
  await requestDecision.execute({...});
}
```

Gracefully handles missing Humancy plugin.

### MCP Tool Interface

Exposed via `spec_kit.manage_clarifications` tool with operations:
- `read`: Parse and return structured data
- `append`: Add new questions batch
- `update_answer`: Update specific question's answer

## References

- Existing clarifications.md files in `specs/*/clarifications.md`
- Clarification types in `src/types/clarification.ts`
- Reference implementation in `plugins/speckit/mcp-server/` (deprecated)
