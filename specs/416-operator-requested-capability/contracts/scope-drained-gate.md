# Contract: Scope-drained gate G.7

**Feature**: See [spec.md](../spec.md)
**Anchor**: spec § Changes item 4; clarifications Q1 + Q4; plan.md § Gate contract G.7

## Purpose

Fire when every task-list ref of the tracking issue reaches terminal state (per Q1: `cockpit_status`'s classifier). Present the operator with a three-option decision — `Keep watching` (continue waiting for ad-hoc adds), `Add more work` (prompt for another add), or `Finish` (close tracking issue + summary + exit).

**Only fires in epic-less mode** (`invocationForm: tracking-existing | tracking-new`). Under `epic` invocation form the run exits on `epic-complete` instead.

## Trigger

- Epic-less run: every ref in the tracking issue's task list has a terminal disposition per `cockpit_status`.
- Terminality is whatever `cockpit_status` reports as a terminal disposition (Q1 anchor). Under the engine's definition, closed-as-not-planned is terminal.

## Presentation block

```markdown
Scope drained for <tracking-ref> — every ref is terminal.

**Tracking ref:** <tracking-ref>
**Refs processed:** <N>
**Per-ref disposition:**
1. <owner>/<repo>#<m1> · <completed | not-planned>
2. <owner>/<repo>#<m2> · <completed | not-planned>
...

**Session-mute set:** <s> ref(s)
```

The full epic status table (per § Ledger L.4 surfaces) is emitted immediately before this presentation block — operator orientation before an exit decision (L.4 rationale carried forward).

## `AskUserQuestion` parameters

- **Question text**: `Scope drained on <tracking-ref>. How to proceed?`
- **Header**: `Drain` (≤ 12 chars)
- **multiSelect**: `false`
- **Options** (exactly three, in this order):
  1. `Keep watching (Recommended)` — return to main loop; re-arm `cockpit_await_events`.
  2. `Add more work` — return to main loop with a follow-up prose prompt inviting the operator to file or add.
  3. `Finish (close tracking issue + summary)` — close tracking issue + run summary + exit zero.

Per § AskUserQuestion invocation contract, one `AskUserQuestion` call per G.7 fire (single-item `questions` array).

## `Keep watching` as the default (Q4=A anchor)

- Defaults are the reversible option.
- The mode's premise is that work arrives ad hoc — drained-for-now is not done.
- `Finish` closes the tracking issue (outward-facing, so it's gated regardless) and is always one explicit pick away.

## Post-gate behavior

- **`Keep watching`** →
  1. Ledger line: `<tracking-ref> · scope-drained · scope-drained-gate · keep-watching`.
  2. Return to main loop (step 4); the next `cockpit_await_events` iteration will resume long-polling on the tracking ref.
- **`Add more work`** →
  1. Ledger line: `<tracking-ref> · scope-drained · scope-drained-gate · add-more-work`.
  2. Emit a prose prompt: "What would you like to add? Reference an existing ref (e.g., `also process <ref>`) or ask me to file a new issue (e.g., `file an issue for <topic>`)."
  3. Return to main loop; the operator's next turn is processed by the intent-class recognizer.
- **`Finish (close tracking issue + summary)`** →
  1. Close tracking issue: `gh issue close <tracking-ref>` — the G.7 gate IS the outward-facing confirmation (matches G.5's "gate IS the confirmation" pattern; no second gate fires before the close).
  2. Ledger line: `<tracking-ref> · scope-drained · scope-drained-gate · finish (tracking closed)`.
  3. Print run summary per § Ledger L.6 (extended with per-ref disposition — see [ledger-scope-mutations.md](./ledger-scope-mutations.md)).
  4. Exit zero.

## Per-ref disposition rendering (Q1 anchor)

- Populated from `cockpit_status(issue=<tracking-ref>, json=true)`'s per-ref classifier.
- Format per line: `<owner>/<repo>#<n> · <disposition>` where disposition is one of `completed` / `not-planned`.
- Order: same order as the tracking issue's task-list markdown (first task in the list is first in the disposition list). This gives the operator a stable, predictable read.
- **The playbook does NOT re-derive disposition** — every classification comes from `cockpit_status`. Any disposition not in the engine's `completed | not-planned` vocabulary means the ref is not terminal, and G.7 should not have fired (invariant: G.7 only fires when every ref is terminal per the classifier).

## Validation rules

- G.7 fires exactly once per drain event — subsequent drains (after `Keep watching` and further ad-hoc work processed to terminal state) fire again. Each fire is a fresh gate.
- G.7 does NOT fire when any task-list ref is non-terminal.
- G.7 does NOT fire under `invocationForm: epic`.
- `Finish` MUST close the tracking issue AFTER writing the ledger line but BEFORE printing the run summary — the summary reads the ledger, and the `finish` outcome must be in the ledger when the summary is computed.

## Failure modes

- `gh issue close` fails → the G.7 gate had already committed to `Finish`. Ledger line: `<tracking-ref> · scope-drained · scope-drained-gate · error: close failed: <description>`. Print an abbreviated run summary noting the close failure. Exit non-zero. The operator can manually close the tracking issue offline.
- `cockpit_status` fails (rare — the trust rule is that `cockpit_status` is authoritative) → G.7 cannot compute the per-ref disposition list. Route through **Error handling** class `OTHER`; do NOT fire G.7 (would present incomplete disposition data). The next iteration retries `cockpit_status`.

## Fixtures

- `416-scope-drained-completed-only.md` — G.7 presentation with all refs `completed`; `Keep watching (Recommended)` present.
- `416-scope-drained-mixed.md` — G.7 presentation with mixed `completed` + `not-planned`; both dispositions rendered per-ref.
- `416-scope-drained-not-planned-only.md` — G.7 presentation with all refs `not-planned`; still terminal (Q1 anchor: closed-as-not-planned IS terminal per the classifier); `Keep watching (Recommended)` present.

## Verification

- **Static grep**: `commands/auto.md` § Gate contract G.7 contains `Keep watching (Recommended)`, `Add more work`, `Finish (close tracking issue + summary)`, and the presentation-block field labels.
- **Behavioral**: 416-4 asserts G.7 fixtures show `Keep watching (Recommended)` verbatim + per-ref disposition rendering.
- **True verifier**: operator smoke-test scenario 2 — a stabilization conversation processes 3+ ad-hoc issues to terminal state and exits through G.7 with an accurate summary (spec Success criteria #2).

## Related contracts

- [Invocation forms](./invocation-forms.md) — G.7 only fires under `tracking-existing` / `tracking-new` forms.
- [Ledger scope mutations](./ledger-scope-mutations.md) — G.7 outcomes and the L.6 per-ref disposition line.
- [Phase-queue ad-hoc enumeration](./phase-queue-adhoc-enumeration.md) — the D.8 sibling behavior in epic mode (never silent when open ad-hoc work exists).
