# Data Model: Fuse cockpit review findings presentation and approval prompt

**Feature**: 388-found-during-cockpit-v1
**Date**: 2026-07-08

This feature is a **playbook-document edit**, so the "data model" describes the structural layout of `packages/claude-plugin-cockpit/commands/review.md` — its steps, sections, and the invariants that must hold pre- and post-fusion.

---

## Entities (playbook sections)

### 1. `Instructions` (the numbered step list)

The core body of the playbook. Pre-fusion, the step list is 9 steps (see "Pre-fusion step layout" below); post-fusion, the step list is 8 steps (see "Post-fusion step layout" below).

Each step has an `id` (its display number), a `name` (short label), a `body` (one or more paragraphs and inline instructions), and optionally sub-branches keyed by `--gate` argument value.

**Post-fusion invariants**:
- Step ids form a contiguous 1..N sequence with no gaps.
- The fused step (new step 3) contains exactly one `AskUserQuestion` invocation contract.
- The fusion rule sentence appears at the head of the fused step and exactly once in the file (SC-003).

### 2. `Examples` section

An inlined `## Examples` section demonstrating the command's shape via worked examples.

**Post-fusion invariants**:
- Every example that touches the fused step shows analysis-and-prompt in the same response block.
- No example renders a turn boundary between analysis and prompt.

### 3. `Terminal Outcome Check` block

A fence-marked block at the end of the file (`<!-- BEGIN terminal-check -->` / `<!-- END terminal-check -->`) declaring the three terminal-outcome markers and a re-invocation fallback.

**Post-fusion invariants**:
- Fence markers preserved verbatim.
- Marker list preserved verbatim: `Labels:` / `Feedback posted:` / `Aborted:`.
- Re-invocation fallback preserved (with step-number reference updated for renumbering).
- Rationale comment updated to record the new layering (fusion covers reaching the prompt; this block covers executing the decision, steps 5–7).

### 4. `Error handling` block

A fence-marked block (`<!-- BEGIN error-conv -->` / `<!-- END error-conv -->`) with three classes: `MISSING_BINARY`, `AUTH_FAILURE`, `OTHER`.

**Post-fusion invariants**:
- Block preserved byte-identical.
- `/code-review` hard errors route to class `OTHER` from within the fused step (per R5 / FR-009).

---

## Pre-fusion step layout (current `review.md`)

| # | Name | Notes |
|---|------|-------|
| 1 | Parse arguments | Validates `--gate <name>`; usage-error print. |
| 2 | Pre-flight | `command -v generacy`; errors via MISSING_BINARY. |
| 3 | `--gate implementation-review` branch | Invokes `/code-review`; classifies findings; renders table; appends `Suggested decision:` line. **Ends turn here in the observed defect.** |
| 4 | Non-`implementation-review` gate branch | Reads artifact; produces three-section summary; appends `Suggested decision:` line. |
| 5 | Approval prompt | Invokes `AskUserQuestion` with three options; MUST display the summary from step 3 or step 4. |
| 6 | Advance on approval | Runs `generacy cockpit advance`; emits `Labels:` line. |
| 7 | Post feedback on `request-changes` | POSTs `event: COMMENT` review with inline comments; emits `Feedback posted:` line. |
| 8 | No-op on `abort` | Emits `Aborted:` line. |
| 9 | Non-zero CLI exit → Error handling | Delegates to Error handling block. |

**Failure mode**: step 3 (or step 4) executes a long analysis, prints findings, and ends the turn — step 5 is never invoked. The Terminal Outcome Check block at end-of-file is not re-read.

---

## Post-fusion step layout (target `review.md`)

| # | Name | Notes |
|---|------|-------|
| 1 | Parse arguments | Unchanged. |
| 2 | Pre-flight | Unchanged. |
| **3 (NEW)** | **Fused analysis + approval prompt** | Rule sentence at head. Body branches internally on `--gate`. Implementation-review sub-branch: retained `MUST NOT print raw JSON` clause → findings-summary table → `Suggested decision:` line. Artifact-review sub-branch: three-section summary → `Suggested decision:` line. **Both sub-branches converge on ONE shared `AskUserQuestion` invocation, delivered in the same response as the summary prose.** |
| 4 | Advance on approval | Renumbered from 6. Unchanged behavior. Emits `Labels:` line. |
| 5 | Post feedback on `request-changes` | Renumbered from 7. Unchanged behavior. Emits `Feedback posted:` line. |
| 6 | No-op on `abort` | Renumbered from 8. Emits `Aborted:` line. |
| 7 | Non-zero CLI exit → Error handling | Renumbered from 9. |

**Removed**: pre-fusion steps 3 and 4 as separate entities; step 5 (approval prompt) as a separate entity. Their content is subsumed into the new fused step 3.

**Renumbering rule**: post-fusion steps 4/5/6/7 = pre-fusion steps 6/7/8/9. All internal references to step numbers (e.g., "step 6" in the current step-3 note about the approval-review body) must be updated to their new indices.

---

## Fused step (new step 3) — internal structure

```text
### Step 3. Fused analysis + approval prompt

<rule-sentence: appears exactly once>
"The findings summary is delivered AS PART OF the same response that invokes
`AskUserQuestion` — presenting findings in a response that does not invoke
`AskUserQuestion` is a protocol violation. Do not end a response between
completing the analysis and invoking the prompt."

<branch on --gate>

  IF --gate == implementation-review:
    - Invoke Claude Code's built-in /code-review (the sole cross-slash exception).
    - Capture output verbatim.
    - Classify each finding (blocking / non-blocking) — Claude's judgment.
    - **MUST NOT print raw JSON under any circumstance.** [inline, immediately before table]
    - Render findings-summary table as PROSE in the response body.
    - Append `Suggested decision: <approve|request-changes|abort>` line.
  ELSE (--gate ∈ {spec-review, clarification-review, plan-review, tasks-review}):
    - Read the artifact.
    - Produce a terse three-section summary (Blockers / Open questions / Suggested decision).
    - Append `Suggested decision: <approve|request-changes|abort>` line.

<converge — this must be the same response as the analysis above>

  Invoke `AskUserQuestion` with:
    - question: the summary table (implementation-review) or three-section summary
                (artifact-review). Digest fallback: model judgment (~4 KB rough
                guide); digest MUST carry artifact/PR identifier + blocking count
                + non-blocking count + a "see table above" pointer.
    - options: [approve, request-changes, abort]  (this fixed order)

<edge cases>

  Zero findings (implementation-review): render `| (none) | | | |` row in the
    table; `Suggested decision:` line reads `approve`; STILL invoke
    `AskUserQuestion`.
  `/code-review` hard error: route to Error handling block, class OTHER; do
    NOT invoke `AskUserQuestion`.
```

---

## Contracts / invariants

### C1. Rule-sentence greppability (SC-003)

`grep -c "delivered AS PART OF the same response that invokes AskUserQuestion" packages/claude-plugin-cockpit/commands/review.md` returns exactly `1`.

### C2. Raw-JSON clause placement (SC-004, FR-006)

The exact clause `MUST NOT print raw JSON under any circumstance` (or the retained verbatim version thereof) appears exactly once in the fused step and is located INLINE, on the line(s) immediately preceding the findings-summary table rendering instruction.

### C3. Terminal Outcome Check fence-marker preservation (FR-010)

`grep -c "<!-- BEGIN terminal-check -->" packages/claude-plugin-cockpit/commands/review.md` returns exactly `1`. Same for `<!-- END terminal-check -->`.

### C4. Marker-list preservation (FR-010)

The Terminal Outcome Check block still names `Labels:`, `Feedback posted:`, and `Aborted:` as its three markers, in unchanged text.

### C5. Prose-first response shape (FR-003, SC-002)

The fused step's rendered instructions state that the summary is printed as prose in the response body immediately before the `AskUserQuestion` call, in every non-error case.

### C6. Uniform gate shape across five gate types (FR-005)

The fused step produces the same response shape (summary-as-prose then `AskUserQuestion`) for all five accepted gate values.

### C7. Examples adherence (SC-007, FR-012)

No example in `## Examples` renders analysis and prompt in separate response blocks. Grep for a hypothetical marker like "in the next turn" or "in a subsequent response" between analysis and prompt in any example: MUST return zero matches.

### C8. Suggested-decision line survival (FR-007)

The `Suggested decision:` line appears in the pre-prompt prose of the fused step for both branches.

### C9. Sibling playbook non-modification (FR-011)

`git diff main -- packages/claude-plugin-cockpit/commands/clarify.md packages/claude-plugin-cockpit/commands/merge.md packages/claude-plugin-cockpit/commands/queue.md packages/claude-plugin-cockpit/commands/status.md packages/claude-plugin-cockpit/commands/watch.md` returns empty (no changes).

---

## Relationships

```text
Instructions.steps[3] (fused)
  ├─ contains: rule-sentence (Q4=A) ──────────────► guaranteed by C1
  ├─ contains: raw-JSON clause (Q5=A) ────────────► guaranteed by C2
  ├─ contains: findings-summary rendering ────────► guaranteed by C5, C6, C8
  └─ terminates in: AskUserQuestion invocation ──► guaranteed by fusion (structural)

Examples[*] (touching fused step)
  └─ MUST render analysis-and-prompt in same block ► guaranteed by C7

TerminalOutcomeCheck (block at end-of-file)
  ├─ fence markers preserved ─────────────────────► guaranteed by C3
  ├─ marker list preserved ───────────────────────► guaranteed by C4
  ├─ step-5-only fallback preserved ──────────────► FR-010 (renumbered ref)
  └─ rationale comment updated ───────────────────► Q8=A (new layering documented)

ErrorHandling (block)
  └─ /code-review hard errors route here ─────────► FR-009 (from within fused step)

Sibling playbooks (clarify.md, merge.md, queue.md, status.md, watch.md)
  └─ untouched ────────────────────────────────────► guaranteed by C9
```

---

## Validation rules (non-normative summary)

- The fused step must terminate in `AskUserQuestion` — there is no valid post-analysis exit path other than routing to Error handling for `/code-review` failures.
- The `AskUserQuestion` options list must be exactly `approve`, `request-changes`, `abort`, in that order (spec § Out of Scope explicitly excludes changes to the three-option shape or order).
- Zero-findings is a normal outcome and MUST prompt; it does not auto-approve (out-of-scope autonomy policy).
- Digest fallback is a rendering choice for the `question` field only; the prose summary in the response body is unconditional.
