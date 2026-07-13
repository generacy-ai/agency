# Contract: batch-comment parser

**Module**: `packages/claude-plugin-cockpit/lib/clarification-batch-parser.ts`
**Export**: `parseBatchComment(body: string): ParsedBatch`
**Feature**: [../spec.md](../spec.md) | **Plan**: [../plan.md](../plan.md) | **Data model**: [../data-model.md § parseBatchComment](../data-model.md#parsebatchcommentbody-string-parsedbatch)

## Signature

```typescript
export interface ParsedQuestion {
  readonly questionId: number;                   // 1-indexed
  readonly title: string | null;                 // null when batch header lacks a title
  readonly context: string;                      // verbatim, multi-line preserved
  readonly question: string;                     // verbatim, multi-line preserved
  readonly options: ReadonlyArray<{ letter: string; text: string }> | null;  // null for free-form
}

export interface ParsedBatch {
  readonly questions: ReadonlyArray<ParsedQuestion>;
}

export class ParseError extends Error {
  constructor(public readonly reason: string, public readonly context: string) {
    super(`ParseError: ${reason} (context: ${context})`);
  }
}

export function parseBatchComment(body: string): ParsedBatch;
```

## Input

The raw `clarificationComment.body` string returned by `generacy cockpit context <issue>`. The engine authors this content per its own batch template:

```markdown
### Q<n>: <title>
**Context**: <framing>
**Question**: <question>
**Options**:
- A: <option A text>
- B: <option B text>
- ...

### Q<n+1>: <title>
...
```

## Parsing rules

1. **Question boundaries** — split `body` on lines matching `/^###\s+Q(\d+)(?::\s*(.+?))?\s*$/`. Each match starts a new question block. Capture:
   - `questionId` from group 1 (parsed as integer).
   - `title` from group 2 (may be `undefined` → parser sets `title: null`; empty-string title after trim also → `title: null`).

2. **Field labels within a question block** — walk the block's lines from the header to the next `### Q<n>` header (or end of input). Identify field labels by the leading `**<Label>**:` prefix (Markdown bold followed by colon):

   - `**Context**:` (case-sensitive) → capture content from after the colon to the next label or block end.
   - `**Question**:` → same.
   - `**Options**:` → capture bullet lines from the next line to the next label or block end.

3. **Option bullets** — each option bullet matches `/^\s*-?\s*([A-Z])[:)]\s+(.+?)\s*$/`. Tolerance requirements (Q2 clarification anchor):
   - Leading `-` bullet marker is optional (`- A: text` and `A: text` both parse).
   - Separator between letter and text is `:` OR `)` (`A:` and `A)` both parse).
   - Letter must be a single uppercase A–Z.

4. **Free-form questions** — a question block with no `**Options**:` label produces `options: null`. The renderer emits `**Options:** (free-form — no options posted)` as the placeholder (five-element structure preserved; spec acceptance-criterion anchor).

5. **Multi-line field content** — preserve internal newlines. Strip leading whitespace on the first content line; strip all trailing whitespace at the end of the field.

6. **Content-after-label on the same line** — some engine templates emit `**Context**: <content>` on one line; others emit `**Context**:\n<content>` across two lines. Both must parse; the parser trims the field's captured text before storing.

7. **Titles** — the title in `### Q<n>: <title>` is captured verbatim (trimmed of trailing whitespace), preserving punctuation, casing, and inline formatting characters. Do NOT truncate the title at parse time — truncation is the renderer's fallback ONLY when the title is null.

## Malformed-input classes

The parser throws `ParseError` with a specific `reason` string for each malformed-input class. The playbook runtime handles these by applying the `{"error": "…"}` failure mode from the drafter contract (Error handling class `OTHER`, ledger line, no post, no advance).

| Reason string | Trigger |
|---------------|---------|
| `missing-context` | A question block lacks a `**Context**:` label. |
| `missing-question` | A question block lacks a `**Question**:` label. |
| `empty-context` | A question block has `**Context**:` but the captured content is empty (after trim). |
| `empty-question` | A question block has `**Question**:` but the captured content is empty (after trim). |
| `duplicate-question-id` | Two `### Q<n>` headers with the same `n`. |
| `duplicate-option-letter` | Two option bullets in the same `**Options**:` block with the same letter. |
| `empty-batch` | `body` contains no `### Q<n>` header lines at all. |
| `malformed-header` | A `###` heading resembles a Q-header (`### Q…`) but doesn't match the strict `/^###\s+Q(\d+)(?::\s*(.+?))?\s*$/` shape — likely a template regression. |

## Output shape

`ParsedBatch` with `questions: ReadonlyArray<ParsedQuestion>`, length ≥ 1, `questionId` monotonically increasing (not necessarily contiguous).

## Purity constraints

- No I/O (no file reads, no network calls, no shell-outs).
- No async — the function is synchronous.
- No mutable global state; no side effects visible to the caller.
- Deterministic — the same `body` string always produces the same `ParsedBatch`.

## Fixtures

All under `packages/claude-plugin-cockpit/tests/fixtures/`:

- **`400-batch-comment-a-colon.md`** — Canonical shape (this issue's own clarification-comment shape); 5 questions with `A:` bullets and titles.
- **`400-batch-comment-a-paren.md`** — Same semantic content with `A)` bullets. Verifies tolerance rule (Q2 anchor). Test 400-1 asserts both parse to equivalent `ParsedBatch` values.
- **`400-batch-comment-no-title.md`** — `### Q1` (no colon-title) instead of `### Q1: <title>`. Test 400-2 asserts `title: null` and renderer uses first-line truncation fallback.
- **`400-batch-comment-free-form.md`** — One question, no `**Options**:` label. Test 400-3 asserts `options: null` and renderer emits the placeholder.
- **`400-batch-comment-mixed.md`** — Three questions: Q1 with `A:` options, Q2 free-form, Q3 with `A)` options. Verifies mixed-shape parsing.

## Rejected alternatives

- **Strict `A:` only** — would silently reject `A)` bullets observed on live comments. Q2 tolerance requirement precludes this.
- **Regex-per-line-then-glue** — brittle across multi-line fields; splitting on `### Q<n>` header lines first and then walking each block linearly is more robust and easier to reason about.
- **Parsing the drafter's output at the same time** — separation of concerns: `parseBatchComment` only extracts the engine's five-element shape; `DrafterResult` is a separate schema fetched from the subagent hop.

## Relationship to other contracts

- Feeds `Directive` parsing via `parseDirectives(input, batch)` — the letter-resolution step reads `batch.questions[i].options`. See [directive-parser.md](./directive-parser.md).
- Feeds the five-element presentation renderer. See [five-element-presentation.md](./five-element-presentation.md).
- Independent of the SB.1 return schema — the drafter reads the same batch payload and produces `DrafterResult`; the renderer merges `ParsedBatch` with `DrafterResult` at render time. See [sb1-return-schema.md](./sb1-return-schema.md).
