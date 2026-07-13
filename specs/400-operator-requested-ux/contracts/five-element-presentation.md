# Contract: five-element presentation block

**Surface**: `packages/claude-plugin-cockpit/commands/clarify.md` (step 5) and `packages/claude-plugin-cockpit/commands/auto.md` (D.1 step 3, § Gate contract G.1).
**Feature**: [../spec.md](../spec.md) | **Plan**: [../plan.md](../plan.md) | **Data model**: [../data-model.md § Five-element presentation](../data-model.md#five-element-presentation-block-byte-identical-in-both-playbooks)

## Presentation block layout

Rendered per open question in the presentation block that immediately precedes the batch-gate `AskUserQuestion` call:

```markdown
Drafted answers for <issue-ref> (<N> open questions):

### Q<n> — <title from batch comment>
**Context:** <framing from batch comment, verbatim/condensed>
**Question:** <question verbatim>
**Options:** <lettered options as posted (A — …, B — …); or "(free-form — no options posted)">
**Recommendation:** <chosen letter + its text, or the drafted free-form response>
**Why:** <1–3 sentences justifying the recommendation over the other options>
_provenance: <citation>_

### Q<n+1> — <title>
… (per open question, separated by a blank line)
```

**Five elements per question** (spec §Requested behavior section 1):

1. `**Context:**` — the framing the workflow agent posted with the question, verbatim/condensed.
2. `**Question:**` — the question verbatim.
3. `**Options:**` — the lettered options as posted (or the free-form placeholder).
4. `**Recommendation:**` — the drafter's chosen letter + its text (for questions with options) OR the drafted free-form response (for free-form questions).
5. `**Why:**` — the drafter's justification, 1–3 sentences over-alternatives.

Provenance follows the five elements as a trailing italic line: `_provenance: <citation>_`. It is presentation-only (not posted in the marker comment).

## Field-source mapping

Each element's content source:

| Element | Source |
|---------|--------|
| `<n>` in `### Q<n>` header | `ParsedQuestion.questionId` |
| `<title>` in `### Q<n> — <title>` header | `ParsedQuestion.title` (verbatim, when non-null); OR `ParsedQuestion.question.split('\n')[0].slice(0, 80)` (fallback, when title is null — Q5 anchor) |
| `**Context:**` value | `ParsedQuestion.context` verbatim (multi-line preserved) |
| `**Question:**` value | `ParsedQuestion.question` verbatim (multi-line preserved) |
| `**Options:**` value | See § Options rendering rules below |
| `**Recommendation:**` value | `DrafterEntry.recommendation` verbatim (opaque to the renderer; the drafter is instructed to produce a self-describing string) |
| `**Why:**` value | `DrafterEntry.justification` verbatim |
| `<citation>` in `_provenance: <citation>_` | `DrafterEntry.provenance` verbatim |

## Options rendering rules

**When `ParsedQuestion.options` is non-null** (a lettered-options question):

```
**Options:** A — <optionA.text>, B — <optionB.text>, C — <optionC.text>, D — <optionD.text>
```

- Separator between options: `, ` (comma + space).
- Separator between letter and text: ` — ` (space + em-dash + space).
- Multi-line option texts: internal newlines within a single option's text are replaced with `; ` (semicolon + space) to keep the entire options string on one visual line in the presentation block. This is a minor visual normalization — the underlying option text remains available via `ParsedQuestion.options[i].text` for letter-resolution in the directive parser.

**When `ParsedQuestion.options` is null** (a free-form question):

```
**Options:** (free-form — no options posted)
```

Verbatim placeholder string, no substitutions. The five-element structure preserves the `**Options:**` element even when the answer is free-form — the placeholder makes the absence explicit rather than dropping the line (spec acceptance-criterion anchor: "free-form questions render the no-options placeholder rather than omitting the element").

## Title fallback

**When `ParsedQuestion.title` is non-null** (canonical path — every batch comment on this issue and in the wild has titles): use the title verbatim.

**When `ParsedQuestion.title` is null** (fallback path — defense against a future engine template that omits titles): substitute a first-line truncation of the question field:

```typescript
const displayTitle = q.title ?? q.question.split('\n')[0].slice(0, 80);
```

Truncation length: 80 characters, no ellipsis. Length chosen to match the presentation-block visual width and avoid a title that overflows one visual line.

**Never invent a title from a drafter subagent** (Q5=A rejected). A drafter-invented title creates a second name for a question already named on the GitHub issue; divergent titles would make Q-numbers the only common key.

## Whole-block header

```markdown
Drafted answers for <issue-ref> (<N> open questions):
```

- `<issue-ref>` — the qualified issue reference (`owner/repo#N`).
- `<N>` — the number of open questions in the batch (`ParsedBatch.questions.length`).

The header sits above the first `### Q1 — …` block; a single blank line separates the header from the first question block.

## Re-present flow (only-changed questions)

When the operator selects `Make changes` and provides directives, the re-present flow renders:

- **Changed questions** (targeted by an edit or skip directive): full five-element block, with:
  - Edit directives with `rationale !== null`: `**Recommendation:**` updated to the directive's `answer`, `**Why:**` updated to the directive's `rationale`.
  - Edit directives with `rationale === null` (bare-letter override): `**Recommendation:**` updated to the directive's `answer`, `**Why:**` REPLACED with the italic string `_(no rationale — operator override)_`. This makes the omission visible in the re-present block; the posted comment still omits the `**Rationale:**` line entirely.
  - Skip directives: full five-element block, followed by a bold italic marker line `**_(will be skipped — excluded from post)_**` between the `**Why:**` line and the provenance.
- **Unchanged questions**: collapsed one-line reference — `### Q<n> — <title>` only, no `**Context:**`/`**Question:**`/`**Options:**`/`**Recommendation:**`/`**Why:**` lines. Provides scanning context but doesn't repeat unchanged content.

The batch gate then re-fires with the same three options (`Approve all & post (Recommended)` / `Make changes` / `Skip this batch`).

## Byte-identity requirement

The presentation-block layout MUST be byte-identical between `clarify.md` step 5 and `auto.md` § Gate contract G.1. A static-grep in [../quickstart.md § Static checks](../quickstart.md#static-checks) verifies the five element headers appear in both files; the § Directive grammar block byte-identity check in the same runbook ensures the ancillary Grammar block also doesn't drift.

## Rejected alternatives

- **Truncated title with ellipsis** (`title.slice(0, 60) + '…'`) — visually noisy, adds no signal. The 80-char fallback truncation is defense-in-depth against a template that omits titles; the primary path uses the header title verbatim.
- **Dropping `**Options:**` line for free-form questions** — breaks the five-element structural invariant; the operator scans for `**Options:**` on every block; missing lines are silent drift.
- **Recommendation-and-Why-as-one-paragraph** — re-fuses into a blob what the SB.1 schema deliberately separated (Q3 anchor). The two elements are separately queryable and independently editable via the directive grammar (bare-letter overrides drop `**Why:**`; letter + reason keeps it and replaces its content).
- **Emitting `<citation>` inside the recommendation** — provenance is presentation-only (not posted); keeping it as its own trailing line makes the "not posted" invariant visually obvious.

## Relationship to other contracts

- Consumes `ParsedBatch` from [batch-comment-parser.md](./batch-comment-parser.md).
- Consumes `DrafterResult` per [sb1-return-schema.md](./sb1-return-schema.md).
- The Make-changes re-present flow reads `Directive[]` per [directive-parser.md](./directive-parser.md).
- Preceded (in the same assistant response) by the batch gate `AskUserQuestion` per [batch-gate-shape.md](./batch-gate-shape.md).
