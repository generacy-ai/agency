# Contract: SB.1 return schema

**Surface**: `packages/claude-plugin-cockpit/commands/auto.md` (D.1 step 2 drafter subagent + step 3 SB.1 block) and `packages/claude-plugin-cockpit/commands/clarify.md` (step 4 drafting contract + step 6 assembly).
**Feature**: [../spec.md](../spec.md) | **Plan**: [../plan.md](../plan.md) | **Data model**: [../data-model.md § SB.1 return schema](../data-model.md#sb1-return-schema-automd-d1-step-3--clarifymd-step-4)

## Post-fix return schema

The clarification drafter subagent returns a single JSON value — either an array of `DrafterEntry` or an error object.

**Success shape** (per-question entry):

```typescript
export interface DrafterEntry {
  readonly question_id: number;         // matches ParsedQuestion.questionId
  readonly recommendation: string;      // chosen letter + text (for lettered), or drafted free-form response
  readonly justification: string;       // 1–3 sentences over-alternatives
  readonly provenance: string;          // spec.md § Section / plan.md § Section / <path>:<line>
}

export type DrafterResult =
  | ReadonlyArray<DrafterEntry>
  | { readonly error: string };
```

**Return contract example** (success — 3 open questions):

```json
[
  {
    "question_id": 1,
    "recommendation": "B — one directive per line, same edit/skip forms as (A)",
    "justification": "Newline-separated is canonical; the semicolon-inline form parses identically under the token-anchored rule. Alternative A's naive semicolon split corrupts a verbatim replacement text that itself contains a semicolon, which the T-S4 arc found. Alternative C introduces a subagent round-trip per edit.",
    "provenance": "spec.md § Requested behavior 2, clarifications.md Q1 answer"
  },
  {
    "question_id": 2,
    "recommendation": "C, with one mechanical correction — no gh api call is needed.",
    "justification": "The payload's `clarificationComment` is the raw comment (verified against generacy origin/develop). The body IS the engine-authored batch template, so the playbooks parse their own wire format. Alternative A's premise is false; alternative B (upstream schema change) is the hardening path if parse fragility appears.",
    "provenance": "clarifications.md Q2 answer, packages/generacy-cli/src/cockpit/clarification-comment-finder.ts"
  },
  {
    "question_id": 3,
    "recommendation": "B — `### Q<n>` then `**Answer:** <recommendation>` and `**Rationale:** <justification>`",
    "justification": "Maps one-to-one onto the SB.1 fields, so assembly is trivial and displayed and posted content cannot drift. Labeled `**Answer:**` makes the operative choice extractable without prose-reading, which matters to the workflow agent resuming from clarification.",
    "provenance": "clarifications.md Q3 answer, spec.md § Unchanged semantics"
  }
]
```

**Error shape**:

```json
{"error": "unable to draft — spec.md § Section 3 references a plan.md § that does not exist"}
```

## Pre-fix vs post-fix schema

**Pre-fix (both playbooks currently document)**:

```json
{"question_id": 1, "drafted_answer": "…", "provenance": "…"}
```

**Post-fix (both playbooks documented in this branch)**:

```json
{"question_id": 1, "recommendation": "…", "justification": "…", "provenance": "…"}
```

The rename splits the answer into two independently-queryable fields, matching the posted body's `**Answer:**` / `**Rationale:**` structure so display and posted content cannot drift.

## Assembly rule

The post-comment assembly step (in `clarify.md` step 6 and `auto.md` D.1 step 4) reads the drafter's `DrafterEntry[]` merged with the operator's `Directive[]` and emits the posted body:

```markdown
<!-- generacy-cockpit:clarification-answers -->

### Q<n>
**Answer:** <answer>
**Rationale:** <rationale>

### Q<n+1>
**Answer:** <answer>

### Q<n+2>
**Answer:** <answer>
**Rationale:** <rationale>
```

**Merging rules**:

For each `DrafterEntry` in ascending `question_id` order:

1. Look up the corresponding `Directive` (if any) targeting `question_id`.
2. **No directive**: emit `### Q<n>\n**Answer:** <recommendation>\n**Rationale:** <justification>\n`.
3. **`kind: "edit"` with `rationale !== null`** (letter + reason override, OR verbatim text with explicit rationale): emit `### Q<n>\n**Answer:** <directive.answer>\n**Rationale:** <directive.rationale>\n`.
4. **`kind: "edit"` with `rationale === null`** (bare letter override, OR verbatim text without rationale): emit `### Q<n>\n**Answer:** <directive.answer>\n` — **NO `**Rationale:**` line at all** (load-bearing Q1 correctness rule).
5. **`kind: "skip"`**: emit nothing for this question (excluded from the posted body; blocks advance).

Separator between question blocks: single blank line. No blank line at end of body.

Marker line 1: `<!-- generacy-cockpit:clarification-answers -->` (verbatim; no leading/trailing whitespace).
Marker line 2: blank.
Question blocks start at line 3.

## Posted-comment field mapping

| Presentation-block element | Posted-comment field |
|----------------------------|----------------------|
| `**Recommendation:**` | `**Answer:**` |
| `**Why:**` | `**Rationale:**` |
| `**Context:**` | NOT posted (already on the issue) |
| `**Question:**` | NOT posted (already on the issue) |
| `**Options:**` | NOT posted (already on the issue) |
| `_provenance: …_` | NOT posted (presentation-only) |

The rename in labels (`Recommendation → Answer`, `Why → Rationale`) is intentional: the presentation-block labels frame the operator's decision ("this is the drafter's recommendation and its why"); the posted-comment labels frame the workflow agent's read ("this is the answer and its rationale").

## Load-bearing invariants

1. **Display and posted content cannot drift** — assembly reads the SAME fields (`recommendation` + `justification`) that the presentation-block renderer reads. A change to one automatically changes the other.
2. **Bare-letter overrides omit `**Rationale:**`** — never carry the draft's justification under an operator-overridden answer. The rationale line is omitted entirely, not left blank and not preserved from the draft.
3. **Skips are excluded from the posted body** — a skipped question doesn't appear in the comment at all; the advance step reads the posted count and gates advance on count === batch total.

## Subagent isolation contract

The drafter subagent's isolation contract (spec § Out of Scope; unchanged in this fix):

- Invocation: `subagent_type: "general-purpose"` with `description: "Draft clarifications <issue-ref>"` and an inlined prompt.
- Return contract: single JSON value (array of `DrafterEntry` on success, `{"error": "…"}` on failure). No prose. No fenced code block. No slash-command invocation.
- The prompt to the subagent includes the open-question list (extracted from `parseBatchComment(clarificationComment.body)`), the spec/plan bodies, the touched-files context, and the return-schema directive stating the four fields (`question_id`, `recommendation`, `justification`, `provenance`).
- The parent MUST NOT restate the JSON verbatim in its response body (raw-JSON-suppression rule preserved from #388 / #390 / #398).

## Rejected alternatives

- **Keep `drafted_answer` as a single field, split at assembly time** — would require a delimiter convention (em-dash? blank line?) inside `drafted_answer` to separate answer from rationale; the delimiter is another drift surface. Explicit two-field schema is more robust.
- **Add a `letter` field alongside `recommendation`** (e.g., `{question_id, letter: "B", answer: "one directive per line…", justification: "…"}`) — imposes structure that doesn't apply to free-form questions; the four-field shape treats lettered and free-form uniformly.
- **Include the posted body verbatim as a fifth field in `DrafterEntry`** — duplicates content already derivable from the four fields; adds a drift surface. The assembly step is the single source of truth for the posted body's shape.

## Relationship to other contracts

- The `recommendation` and `justification` fields feed the [five-element presentation renderer](./five-element-presentation.md).
- The assembly step reads `DrafterResult` and merges with `Directive[]` from [directive-parser.md](./directive-parser.md).
- The batch gate ([batch-gate-shape.md](./batch-gate-shape.md)) fires the assembly step on `Approve all & post` and on the "Other" one-turn edit path.
- Independent of the [batch-comment parser](./batch-comment-parser.md) — the drafter's return is entirely from the subagent hop, not from parsing the batch comment.
