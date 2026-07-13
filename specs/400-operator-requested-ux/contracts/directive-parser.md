# Contract: directive parser

**Module**: `packages/claude-plugin-cockpit/lib/clarification-batch-parser.ts`
**Export**: `parseDirectives(input: string, batch: ParsedBatch): Directive[]`
**Feature**: [../spec.md](../spec.md) | **Plan**: [../plan.md](../plan.md) | **Data model**: [../data-model.md § parseDirectives](../data-model.md#parsedirectivesinput-string-batch-parsedbatch-directive)

## Signature

```typescript
export type Directive =
  | {
      readonly kind: "edit";
      readonly questionId: number;
      readonly answer: string;
      readonly rationale: string | null;   // null when bare-letter override (Q1 anchor)
    }
  | {
      readonly kind: "skip";
      readonly questionId: number;
    };

export function parseDirectives(input: string, batch: ParsedBatch): Directive[];
```

## Input

- `input` — raw operator-typed text from either:
  - The `AskUserQuestion` "Other" free-text channel (one-turn edit path).
  - A `Make changes` follow-up prompt (the loop path).
- `batch` — the current `ParsedBatch` (needed for letter → option-text resolution and unknown-questionId detection).

## Splitter rule (load-bearing)

**Token-anchored split**: `input.split(/(?=Q\d+:)/)`. A new directive begins at each `Q<n>:` token (n ≥ 1); each directive's payload runs from the token to the next token or end of input.

Why this rule (Q1 rationale):

- **Semicolon-only split** (naive alternative) corrupts verbatim replacement text containing a legitimate semicolon (`Q2: We should defer; the tradeoff is unclear.`).
- **Newline-only split** would forbid the single-line semicolon form documented as valid (`Q2: B; Q4: skip`).
- Token-anchored rule handles both: the newline-separated form has one token per line; the semicolon-inline form has one token per Q-number; a semicolon-embedded verbatim replacement stays inside a single payload because the semicolon isn't a delimiter — the `Q<n>:` token is.

The splitter regex is a positive lookahead (`(?=Q\d+:)`), so the token itself is preserved at the start of each resulting segment. Segment 0 (before the first `Q<n>:` token, if any) is dropped as noise.

## Per-segment parsing

For each non-empty segment produced by the splitter:

1. **Extract the questionId**: match `^Q(\d+):\s*(.*)$` (in `s` mode to handle multi-line payloads); capture `questionId` from group 1 and `payload` from group 2.
2. **Classify the payload**:

| Payload shape | Semantics | Directive |
|---------------|-----------|-----------|
| `skip` (case-insensitive, trim-matched) | Exclude this question from the posted batch and block advance. | `{kind: "skip", questionId}` |
| `<letter>` where `letter ∈ [A-Z]` AND the batch's question has an options array with that letter | Bare letter — resolves to the option's text. Rationale is `null` (never carry the draft's justification under override). | `{kind: "edit", questionId, answer: option.text, rationale: null}` |
| `<letter> — <reason>` where `letter` matches an option (dash is em-dash `—` or hyphen-space `- ` after normalization) | Letter resolves to option text; `<reason>` replaces the justification. | `{kind: "edit", questionId, answer: option.text, rationale: reason.trim()}` |
| Any other text | Verbatim replacement text for the answer; no rationale line. | `{kind: "edit", questionId, answer: payload.trim(), rationale: null}` |

**Letter-resolution rules**:

- Look up `letter` in `batch.questions.find(q => q.questionId === questionId).options`. If the question has `options: null` (free-form), letter matching is skipped and the payload is treated as verbatim text (falls through to the "any other text" rule).
- Letter comparison is case-sensitive (options in the batch are uppercase A–Z; operator-typed lowercase `b` does NOT match option `B` — the parser treats it as verbatim text).

**Dash normalization** (letter + reason):

- Accept both `—` (em-dash, U+2014) and `-` (hyphen) as the separator between letter and reason.
- The regex is `/^([A-Z])\s*[—-]\s+(.+)$/` (case-sensitive letter, dash surrounded by optional whitespace, followed by non-empty reason).
- `B—<reason>` (no whitespace) is accepted; so is `B — <reason>`.

## Unknown / duplicate questionIds

- If a directive's `questionId` doesn't match any `ParsedQuestion.questionId` in the batch: silently drop the directive (the playbook prose adds a ledger note like `ignored directive: Q<n> not in batch`).
- If two directives in the same input target the same `questionId`: the last one wins. (Ledger note at playbook level; parser silently applies last-write-wins.)

## Zero-directive input

- `input === ""` (or whitespace-only after trim) → return `[]`. The playbook's `Make changes` prose treats an empty `Directive[]` as the no-op re-present case (Q4 anchor).
- The parser does NOT try to infer intent from an empty input; that's the playbook's responsibility.

## Load-bearing correctness constraints

These are tested by 400-4 and 400-5 in [`packages/claude-plugin-cockpit/tests/playbook-verification.test.ts`](../../../packages/claude-plugin-cockpit/tests/playbook-verification.test.ts):

1. **Bare letter → `rationale: null`** — never carry the draft's justification under an operator-overridden letter. If the operator types `Q2: B` alone, the posted body's Q2 block MUST have no `**Rationale:**` line at all.
2. **Verbatim text with embedded `;` → not mis-split** — an operator can type `Q2: We should defer; the tradeoff is unclear and a follow-up is the right shape.` and get one directive whose `answer` field contains the full sentence (semicolon included). The token rule is the reason this works.
3. **Single-line `Q2: B; Q4: skip` ≡ newline-separated `Q2: B\nQ4: skip`** — one rule, two documented forms. The parser produces byte-identical `Directive[]` output for both.

## Purity constraints

- No I/O.
- No async.
- No mutable global state; no side effects visible to the caller.
- Deterministic — same `(input, batch)` inputs always produce the same `Directive[]` (with stable ordering matching input directive order).

## Fixtures

All under `packages/claude-plugin-cockpit/tests/fixtures/`:

- **`400-directives-bare-letter.txt`** — `Q2: B` → `[{kind: "edit", questionId: 2, answer: <option-B-text>, rationale: null}]`.
- **`400-directives-letter-reason.txt`** — `Q2: B — because it's mildly tolerant` → `[{kind: "edit", questionId: 2, answer: <option-B-text>, rationale: "because it's mildly tolerant"}]`.
- **`400-directives-skip.txt`** — `Q2: skip` → `[{kind: "skip", questionId: 2}]`.
- **`400-directives-verbatim-with-semicolon.txt`** — `Q2: We should defer this; the tradeoff is unclear and a follow-up is the right shape.` → single `{kind: "edit", questionId: 2, answer: "We should defer …", rationale: null}`.
- **`400-directives-newline.txt`** — `Q2: B\nQ4: skip` → two directives (edit Q2, skip Q4).
- **`400-directives-semicolon-inline.txt`** — `Q2: B; Q4: skip` → byte-identical output to `400-directives-newline.txt` (test 400-5).

## Rejected alternatives

- **Semicolon-only splitter** (Q1=A) — corrupts semicolon-embedded verbatim replacements. Rejected.
- **Newline-only splitter** — forbids the single-line form. Rejected.
- **LLM re-parse via subagent** (Q1=C) — introduces model interpretation variance across two playbooks; adds a round-trip per edit. Rejected.
- **Structured JSON/YAML input** (Q1=D) — operator-hostile in a free-text `AskUserQuestion` "Other" channel. Rejected.

## Relationship to other contracts

- Consumes `ParsedBatch` from [batch-comment-parser.md](./batch-comment-parser.md) for letter resolution.
- Feeds the assembly step (post-comment assembly reads `Directive[]` + `DrafterResult` and produces the marker comment body). See [sb1-return-schema.md](./sb1-return-schema.md).
- Independent of the presentation renderer — the renderer reads `ParsedBatch` + `DrafterResult`; `Directive[]` only affects the post-gate assembly step and the re-present flow.
