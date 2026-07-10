# Research: Batched clarification gate + five-element presentation

**Feature**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md) | **Date**: 2026-07-10

Phase-0 record of design decisions with alternatives and rationale. The five clarifications resolved in [clarifications.md](./clarifications.md) are restated here as design decisions, each paired with the alternatives considered, the rejection reasons, and the implementation pattern that follows.

## R1 — Directive grammar

**Decision**: A `Q<n>:` token-anchored split. A new directive begins at each `Q<n>:` token; each directive's payload runs from the token to the next token or end of input. Newline-separated is the canonical documented form; the single-line semicolon form parses identically under the same rule.

Payload forms:

| Form | Semantics |
|------|-----------|
| `Q<n>: <letter>` | `<letter>` resolves to option text from the parsed batch comment; the answer posts with **no rationale line** (never retain the draft's justification under an operator-overridden answer — it would argue for a different choice). |
| `Q<n>: <letter> — <reason>` | `<letter>` resolves to option text; `<reason>` replaces the justification. |
| `Q<n>: skip` | Excludes that question from the posted batch and blocks advance. |
| Anything else | Verbatim replacement text for the answer; no rationale line. |

Same parser in both `Make changes` and "Other" free-text paths. See [contracts/directive-parser.md](./contracts/directive-parser.md) for the machine-readable contract.

**Alternatives rejected**:

- **Semicolon-only split** (Q1=A) — brittle: an edit directive's verbatim replacement text can legitimately contain semicolons (`; therefore`, `for X; for Y`), and a naive semicolon split corrupts it. The token-anchored rule doesn't care.
- **Loose natural language + drafter re-parse** (Q1=C) — this is the decay surface the grammar exists to prevent. Two playbooks' model interpretations diverge; every edit needs a subagent round-trip.
- **Structured JSON/YAML** (Q1=D) — operator-hostile in a free-text `AskUserQuestion` "Other" channel; nobody types valid JSON into a chat prompt. Would drive operators to abandon the one-turn edit path entirely.

**Implementation pattern**: Token-anchored regex split (`/(?=Q\d+:)/`) yields an array of raw payloads; each payload is classified per the four forms. Letter references are resolved by index against the parsed batch's `options` array. Pure function — no I/O, no async. See [lib/clarification-batch-parser.ts] scaffold in [data-model.md § Directive parser](./data-model.md#directive-parser).

**Key source**: `Q1 answer` in [clarifications.md](./clarifications.md), spec § Requested behavior "Directive grammar" block, and the load-bearing failure case (verbatim text with embedded `;`) documented in fixture `400-directives-verbatim-with-semicolon.txt`.

## R2 — Cockpit context payload fields

**Decision**: The playbooks parse the five presentation elements (title, context, question, options; recommendation + justification + provenance come from the drafter) from `clarificationComment.body`, the raw comment already returned by `generacy cockpit context`. The engine authors the batch comment as `### Q<n>: <title>` / `**Context**:` / `**Question**:` / `**Options**:`, so the playbooks are parsing their own wire format, not scraping GitHub. Parse is mildly tolerant of option-bullet variation (`A:` vs `A)`) observed on live clarification comments — including the two clarification comments on this very issue, which differ in bullet style.

**Alternatives rejected**:

- **Payload already provides structured per-question `context` / `question` / `options` fields** (Q2=A) — verified false against generacy `origin/develop`: `clarification-comment-finder.ts` returns the first comment after the `waiting-for:clarification` label event; `context.ts` emits it unparsed. The spec's Assumptions line was wrong; this fix corrects it in-branch.
- **Upstream schema change in `generacy cockpit` to emit structured per-question fields** (Q2=B) — eventual hardening path if parse fragility shows up in practice, but a generacy-side schema change that should not gate this playbook improvement. Explicitly out of scope (spec § Out of Scope).
- **Fetch the issue body via `gh api` inside the playbooks** (Q2=C mechanical form) — no fetch needed. The body is already in hand.

**Implementation pattern**: `parseBatchComment(body: string): ParsedBatch` walks the body line-by-line, identifying each `### Q<n>:` header as a question-boundary marker. Within a question block, `**Context**:`, `**Question**:`, and `**Options**:` label lines mark the fields; content between labels is captured verbatim. Option bullets are matched by `/^[A-Z][:)]\s+/`; free-form questions (no `**Options**:` label) yield `options: null`. Pure function. See [contracts/batch-comment-parser.md](./contracts/batch-comment-parser.md).

**Key sources**:
- `Q2 answer` in [clarifications.md](./clarifications.md), which verified against generacy `origin/develop` and documents the parse-tolerance requirement.
- Spec § Assumptions (updated in this branch) — `clarificationComment.body` is the engine-authored batch template.
- Verified upstream file references (from Q2 answer): `packages/generacy-cli/src/cockpit/clarification-comment-finder.ts` and `packages/generacy-cli/src/cockpit/context.ts` on generacy `develop`.

## R3 — Posted body structure per question

**Decision**: Each posted question is a `### Q<n>` header followed by two labeled fields on separate lines:

```markdown
### Q<n>
**Answer:** <recommendation>
**Rationale:** <justification>
```

The two fields map one-to-one onto the SB.1 return schema (`recommendation` + `justification`), so the displayed presentation-block content and the posted comment content cannot drift — they're assembled from the same fields. The labeled `**Answer:**` line makes the operative choice extractable without prose-reading, which matters to the real downstream reader: the workflow agent resuming from clarification (and any future engine-side parser that might read the answers back).

**Alternatives rejected**:

- **`### Q<n>` header + recommendation paragraph + `**Why:** <justification>` line** (Q3=A) — leaves the recommendation as an unlabeled paragraph; ambiguous when the answer is free-form prose rather than a letter. Downstream readers can't distinguish the operative content from surrounding prose.
- **Single paragraph joining recommendation and justification with an em-dash** (Q3=C) — re-fuses into a blob what the schema deliberately separated (SB.1's two fields). Same reason the schema was split in the first place: the answer and its justification are separately queryable content, not a single stream of prose.
- **`### Q<n>` header + recommendation only, no justification** (Q3=D) — discards the rationale, which the tetrad-development#92 T-S4 runs showed is load-bearing. Implementing agents downstream used the why-line to make aligned micro-decisions during implementation. Discarding it discards signal for no compression benefit.

**Implementation pattern**: In both playbooks' post-comment assembly step, iterate the posted (approved or edited) `Directive[]` in ascending Q-number order, emit `### Q<n>\n**Answer:** <recommendation>\n**Rationale:** <justification>\n` per entry, separated by a blank line. For bare-letter directives (no rationale), emit only `### Q<n>\n**Answer:** <optionText>\n` — no `**Rationale:**` line at all. See [contracts/sb1-return-schema.md](./contracts/sb1-return-schema.md).

**Key sources**:
- `Q3 answer` in [clarifications.md](./clarifications.md).
- Spec § Unchanged semantics ("Posted comment format") — the schema decision is preserved in the spec's own body.

## R4 — Zero-directive `Make changes`

**Decision**: A `Make changes` turn that collects zero directives (empty input in the "Other" text box, empty submission from a follow-up prompt) is a no-op: re-present the entire batch and fire the same batch gate again. Every iteration requires an explicit operator choice; the loop cannot stall.

**Alternatives rejected**:

- **Implicit Approve** (Q4=B) — disqualified on principle: empty input must never trigger the publish-and-advance action. An accidental submit would post to GitHub (irreversible-ish); the rule "irreversible verbs never fire on ambiguity" is load-bearing across the auto playbook.
- **Implicit Skip** (Q4=C) — silently converts "Make changes" into its opposite. The operator explicitly signaled they want something different; discarding the batch discards their stated intent.
- **Inner retry-loop within the change-collection turn** (Q4=D) — adds a second prompting mechanism for marginal benefit. A (no-op re-present) reuses the one existing gate (one mechanism per job), keeps the full batch in view for the decision the operator was trying to make, and cannot stall — every iteration requires an explicit operator choice, so it is an idle loop with an exit on every face.

**Implementation pattern**: In both playbooks' § Gate contract G.1 prose, after collecting directives from the operator's `Make changes` turn, count the parsed `Directive[]`. If zero, re-present the batch (unchanged five-element blocks for every open question) and re-fire the same batch gate. If ≥ 1, apply the directives (edit answers, mark skips), re-present only the changed questions (unchanged questions render collapsed as `### Q<n>: <title>` reference lines), and re-fire the batch gate. Loop until `Approve all & post` or `Skip this batch`. See [contracts/batch-gate-shape.md](./contracts/batch-gate-shape.md).

**Key source**: `Q4 answer` in [clarifications.md](./clarifications.md), spec § Requested behavior "Make changes" option description.

## R5 — Header title source

**Decision**: The presentation-block header title is reused verbatim from the batch comment's `### Q<n>: <title>` header line. The engine emits a short title for every question in every batch (verified on this issue's own clarification comment); the `parseBatchComment` step captures it, and the five-element renderer uses it verbatim in the `### Q<n> — <title>` presentation header. First-line truncation of the question field is the fallback only when a batch comment ever arrives without titles (defense-in-depth).

**Alternatives rejected**:

- **Drafter subagent generates a short title as part of SB.1** (Q5=A) — the "names that lie" anti-pattern: a drafter-invented title creates a second name for a question that already has one on the GitHub issue, and the operator cross-reads both surfaces during the gate. Divergent titles would make Q-numbers the only common key — degrading the exact scanning affordance the title is supposed to add.
- **Drop the title entirely** (Q5=C) — throws away a genuinely useful scanning affordance in a six-question batch. C over-corrects for A's flaw.

**Implementation pattern**: `parseBatchComment` extracts the title substring from each `### Q<n>: <title>` header (regex `/^###\s+Q(\d+):\s*(.+)$/`). When the header is `### Q<n>` with no colon-title (fallback path, exercised by fixture `400-batch-comment-no-title.md`), the parser sets `title: null` and the renderer substitutes a first-line truncation of the question field (`question.split('\n')[0].slice(0, 80)`). See [contracts/five-element-presentation.md](./contracts/five-element-presentation.md).

**Key source**: `Q5 answer` in [clarifications.md](./clarifications.md), spec § Assumptions ("Every batch comment header carries `### Q<n>: <title>`").

## Cross-cutting patterns

### Reference implementation lives in `lib/`, not in playbook prose

Consistent with the #394 `reference-consumption.ts` shape and #398's `refresh-help-snapshots.sh` pattern: the plugin's runtime is Claude following the playbook prose, but the load-bearing rules (stream consumption in #394, `--help` matching in #398, parser rules here) need a *machine-checkable definition* the tests can exercise independently. That definition is a small, pure module under `lib/` (or `scripts/`) — no I/O, no async, no async-await, no external state; the tests feed it fixtures and assert output.

The runtime — Claude interpreting the prose — is guided by the prose's own English description of the rule. The parser module is the source of truth for the rule's behavior; the prose is the source of truth for the runtime's obligation to follow the rule.

### Fixtures are markdown files, not string literals

Consistent with #398's Q4=A choice for the regression fixture. The audit surfaces (batch comment parse, directive parse) receive text as input at runtime; the tests exercise the same input path via `readFileSync(fixturePath, "utf-8")`. String literals in the test file exercise a different code path (JavaScript escape rules, no line-ending normalization) and don't scale — future drift regressions get a drop-in naming pattern (`400-batch-comment-<variant>.md`, `400-directives-<variant>.txt`) that scales.

### No new invariant number

Consistent with #394's SC-007, #396's no-§8 rule, and #398's audit-lives-in-the-assertion pattern. The batch-gate contract's guarantees live inside `auto.md` § Gate contract G.1's prose and the parser's tests, not at the `auto.md` § Invariants surface. Invariant numbering is reserved for rules that constrain multiple sections of the playbook simultaneously; the batch-gate contract only constrains G.1 (and by mirror, `clarify.md` step 5), so it lives at the section that defines it.

### Both playbooks specify the identical block

Consistent with the spec's FR-006 anchor — the § Directive grammar block and the § Gate contract G.1 presentation-block spec must be byte-identical across `clarify.md` and `auto.md`. Rejected here: DRY'ing via a shared include (Markdown has no include mechanism; would require a preprocessor step, adding infrastructure for a two-file drift surface that a static grep in [quickstart.md](./quickstart.md) catches for free). If a future finding shows the two blocks have drifted despite the static grep, a byte-hash audit assertion is a follow-up of the #396/#398 shape.

## Key sources / references

- Spec: [spec.md](./spec.md) — Requested behavior sections 1–4 (five-element presentation, one batch-gate approval, unchanged semantics, SB.1 return schema).
- Clarifications: [clarifications.md](./clarifications.md) — Q1 (directive grammar), Q2 (payload fields), Q3 (posted body structure), Q4 (zero-directive `Make changes`), Q5 (header title source).
- Prior-art patterns: `specs/394-found-during-cockpit-v1/` (reference implementation in `lib/`), `specs/396-found-during-cockpit-v1/` (vocabulary drift audit), `specs/398-found-during-cockpit-v1/` (help-snapshot fixtures + refresh script + regression fixture).
- Upstream generacy references (from Q2 verification): `clarification-comment-finder.ts` and `context.ts` on `generacy-ai/generacy@develop`.
- Playbook files under audit: `packages/claude-plugin-cockpit/commands/clarify.md`, `packages/claude-plugin-cockpit/commands/auto.md`.
- Companion arc: generacy-ai/tetrad-development#92 T-S4 runs (the operator-facing UX arc this fix formalizes).
