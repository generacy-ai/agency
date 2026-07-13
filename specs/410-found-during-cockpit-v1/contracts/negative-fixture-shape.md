# Contract: `packages/claude-plugin-cockpit/tests/fixtures/410-drift-auto.md` — negative fixture

**Surface**: `packages/claude-plugin-cockpit/tests/fixtures/410-drift-auto.md` — a checked-in markdown file reproducing the pre-fix drift for the `410-2` negative-fixture regression assertion.

## Purpose

The fixture is fed through `auditD7` (per [drift-audit-assertion.md](./drift-audit-assertion.md)) and MUST cause at least one structural check to report `false`. This is the machine-checkable proof that the audit's structural logic isn't vacuous — if the audit's implementation ever regresses to always-return-true (e.g., a regex scope bug that always matches), the negative fixture no longer trips a failure and the 410-2 assertion catches the regression.

## Content contract

The fixture must contain:

1. **A top-level `## Dispatch` H2 heading** — so the audit parser can locate the section.
2. **A `### D.7 —` subsection anchor** — so the audit parser can extract the D.7 body.
3. **A pre-fix step 1 body** with one unified "Fetch evidence" bullet — no `**First dispatch**` / `**Repeat dispatch**` sub-path split.
4. **A pre-fix step 2 body** with one "Spawn diagnosis subagent" bullet — no verdict-schema addendum (no `failure_class_changed`, no `failure_classes_seen`), no no-parent-characterization rule anchor.
5. **A minimal G.4(b) presentation block** — five-element form (Root cause / Evidence / Current state / Suggested decision), no `Failure class changed since prior` row.

The fixture must NOT contain (any of these would defeat the drift's purpose):

- `first dispatch` / `first-dispatch` / `First dispatch` (any anchor that would satisfy `firstDispatchSubPath: true`).
- `repeat dispatch` / `repeat-dispatch` / `Repeat dispatch` (any anchor that would satisfy `repeatDispatchSubPath: true`).
- `failure_class_changed` (any occurrence that would satisfy `failureClassChangedField: true`).
- `failure_classes_seen` (any occurrence that would satisfy `failureClassesSeenField: true`).
- `MUST NOT characterize` / `no parent-authored` / `not the parent's role to characterize` / `parent MUST NOT summarize` (any anchor that would satisfy `noParentCharacterizationRule: true`).
- `Failure class changed since prior` (any occurrence that would satisfy `g4bSixthElementRow: true`).

## Illustrative content (~20-30 lines)

```markdown
<!--
Drift fixture for finding #410.
This is a MINIMAL FIXTURE reproducing the pre-#410 state of commands/auto.md D.7
(one unified dispatch path; no first-vs-repeat sub-path split; no verdict-schema
addendum for failure_class_changed / failure_classes_seen; no no-parent-
characterization rule; no G.4(b) sixth-element row).

The audit (410-2) feeds this file through auditD7 and asserts at least one of
the structural fields is false — proving the audit's logic isn't vacuous.

DO NOT reintroduce the post-fix field names, sub-path anchors, or G.4(b) row
into this file. The fixture's value is the ABSENCE of those post-fix properties
(see specs/410-found-during-cockpit-v1/contracts/negative-fixture-shape.md).
-->

## Dispatch

### D.7 — `agent:error` / `failed:*` → escalation gate (Requeue path)

**Trigger**: An issue enters `agent:error` or any `failed:*` state. Verbatim event strings: `agent:error` and `failed:` (matching any `failed:<subtype>`).

**Dispatch**:
1. **Fetch evidence** — the parent's sole evidence-fetch tool is `cockpit_context(issue=<issue-ref>)`. No ad-hoc `gh` chains, no link-following. The return payload is whatever the engine bundle returns.
2. **Spawn diagnosis subagent** — dispatch to a general-purpose subagent. Return contract: a single JSON value `{root_cause: string, evidence: string, recommended_action: string, confidence: "low"|"medium"|"high"}`.
3. **Present escalation gate** (see § Gate contract G.4b).
4. **Apply verdict**: Requeue / Skip / Stop.

## Gate contract

### G.4 — Escalation gate

**(b) `agent:error` / `failed:*`**:

```
Agent error on <issue-ref>:

**Root cause:** <verdict.root_cause verbatim>
**Evidence:** <verdict.evidence verbatim>
**Current state:** <observed state>
**Suggested decision:** <verdict.recommended_action> (confidence: <verdict.confidence>)
```

<!-- No first-vs-repeat sub-path split, no failure_class_changed field, no failure_classes_seen field, no no-parent-characterization rule anchor, no G.4(b) sixth-element row. The audit MUST report at least one structural failure on this file. -->
```

## Naming and location

- **File**: `packages/claude-plugin-cockpit/tests/fixtures/410-drift-auto.md`.
- **Naming pattern**: `<finding>-drift-<command>.md` — matches `398-drift-auto.md`, `402-drift-auto.md`, `408-drift-auto.md`.
- **Location**: same fixtures directory as prior drift fixtures.

## Expected audit output on this fixture

```typescript
{
  d7Present: true,                    // fixture has ## Dispatch / ### D.7 —
  firstDispatchSubPath: false,        // fixture has no first-dispatch anchor
  repeatDispatchSubPath: false,       // fixture has no repeat-dispatch anchor
  failureClassChangedField: false,    // fixture has no failure_class_changed substring
  failureClassesSeenField: false,     // fixture has no failure_classes_seen substring
  noParentCharacterizationRule: false,// fixture has no rule anchor
  g4bSixthElementRow: false,          // fixture has no "Failure class changed since prior" row
}
```

All six downstream fields `false` — the audit reports the whole class of pre-fix drift. Any single field being `false` satisfies the 410-2 assertion; having all six `false` is a strong positive signal that the audit reliably catches the drift.

## Non-goals

- The fixture is NOT a complete `auto.md` reproduction. Only the D.7 section and a minimal G.4(b) block are included; other sections (§ step 5, § Ledger, § Invariants, etc.) are elided.
- The fixture is NOT executed at runtime by any playbook. It exists only as an input to the audit's parser.
- The fixture MAY be extended in the future to reproduce additional pre-fix drift shapes (e.g., a variant where the sub-path split exists but the rule anchor is missing) if #410's follow-ups reveal edge cases the current fixture doesn't cover. Each variant would be a new file (`410-drift-<variant>.md`) rather than a modification to the primary fixture.

## Failure modes the fixture prevents

- **Vacuous audit** (auditD7 always returns all-true): the fixture's absence of all six positive properties triggers all six `false` values; a vacuous audit would return `all-true` and 410-2 would fail.
- **Over-broad regex scope** (auditD7's regex matches something in the fixture that shouldn't count): if the fixture contains anything that would falsely trip a positive check, the fixture is no longer a valid drift reproduction — the fix is to tighten the fixture, not the audit.

## Precedent

Same shape as:

- **`398-drift-auto.md`** — pre-fix D.5 CLI-contract drift fixture.
- **`402-drift-auto.md`** — pre-fix `AskUserQuestion` contract-section-missing drift fixture.
- **`408-drift-auto.md`** — pre-fix § step 5 cursor-error signals converged drift fixture.

Each fixture reproduces a specific pre-fix drift shape for the corresponding audit; each is minimal (~20-30 lines) and self-contained. #410's fixture follows the same shape.
