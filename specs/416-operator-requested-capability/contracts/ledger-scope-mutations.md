# Contract: Ledger scope-mutation vocabulary

**Feature**: See [spec.md](../spec.md)
**Anchor**: spec § Changes item 6; plan.md § Ledger action-outcome vocabulary + L.6 extensions

## Purpose

Extend the § Ledger action-outcome vocabulary table with rows for scope-mutation events (add-existing, file-new, scope-drained gate outcomes, filing-gate skip, phase-queue hold on ad-hoc), and extend the run summary § L.6 with a `Scope growth:` line and a per-ref disposition list (epic-less only).

## Extended action-outcome vocabulary rows

Appended to the § Ledger action-outcome vocabulary table:

| Dispatch row | `<action>` | `<outcome>` (examples) |
|--------------|------------|------------------------|
| Add-issue (add-existing intent) | `scope-add` | `queued`, `error: <description>` |
| Add-issue (file-new intent) | `filing-gate+scope-add` | `filed + queued (<new-ref>)`, `skipped (draft discarded)`, `error: <description>`, `error: scope-add failed: <description>`, `error: queue failed: <description>` |
| G.6 filing gate (skip only — no ref filed) | `filing-gate` | `skipped (draft discarded)` |
| G.7 scope-drained gate | `scope-drained-gate` | `keep-watching`, `add-more-work`, `finish (tracking closed)`, `error: close failed: <description>` |
| D.8 phase-queue hold (non-empty ad-hoc list) | `phase-queue-gate` | `held (<M> ad-hoc open)`, `queued P<next> (<N> issues) with <M> ad-hoc open` |
| D.8 `openAdHocIssues` helper (failure only) | `openAdHocIssues` | `error: cockpit_status failed for <ref>: <description>` |

**Note**: existing D.8 outcomes (`queued P<next> (<N> issues)`, `cancelled`) are unchanged — the new outcomes are added, not substituted.

## Ledger-line examples

```text
# Add-existing intent — no gate, dispatch line is the ledger record
generacy-ai/agency#420 · scope-add · queued

# File-new intent — filing gate + scope-add composite
generacy-ai/agency#421 · filing-gate+scope-add · filed + queued (generacy-ai/agency#421)

# File-new intent skipped at G.6
generacy-ai/agency#100 · filing-gate · skipped (draft discarded)
    # left slot is the tracking ref (no new ref was assigned); this line signals a G.6 skip

# G.7 scope-drained gate outcomes (epic-less)
generacy-ai/agency#100 · scope-drained · scope-drained-gate · keep-watching
generacy-ai/agency#100 · scope-drained · scope-drained-gate · add-more-work
generacy-ai/agency#100 · scope-drained · scope-drained-gate · finish (tracking closed)

# D.8 phase-queue hold (non-empty ad-hoc list)
generacy-ai/agency#100 · phase-complete · phase-queue-gate · held (2 ad-hoc open)
generacy-ai/agency#100 · phase-complete · phase-queue-gate · queued P2 (4 issues) with 2 ad-hoc open

# D.8 openAdHocIssues helper failure (partial list emitted)
generacy-ai/agency#100 · phase-complete · openAdHocIssues · error: cockpit_status failed for generacy-ai/agency#420: HTTP 502
```

## Run summary § L.6 extension

Existing summary lines (Events dispatched: N, Clarification batches: k1, etc.) are unchanged. Two additions:

### Line 1 (unconditional): `Scope growth:`

Appended immediately before the `Muted issues (session-local):` line.

```text
Scope growth: started with <N>, added <M>, completed <K>
```

**Counts derivation** (from the ledger file):

- **`started with N`** — number of refs in the tracking issue's task list at run start.
  - Epic mode: count of synthetic events from step 3 startup sweep.
  - Epic-less mode: count of task-list refs in the tracking issue at step 3 (read from `cockpit_status(issue=<tracking-ref>, json=true)`).
- **`added M`** — number of successful scope mutations during the run:
  - Count of `scope-add · queued` action lines (add-existing intent).
  - PLUS count of `filing-gate+scope-add · filed + queued (...)` action lines (file-new intent successes).
  - EXCLUDES `filing-gate · skipped` outcomes (no scope mutation).
  - EXCLUDES `filing-gate+scope-add · error: ...` outcomes (attempted but failed).
- **`completed K`** — number of scope refs that reached terminal state during the run:
  - Count of `merge · merged (...)` action lines PLUS any `epic-complete` action line for the tracking ref itself.
  - Epic-less mode: count of task-list refs classified `completed | not-planned` per `cockpit_status` at exit time.

### Block 2 (epic-less only): per-ref disposition list

Appended immediately after the `Scope growth:` line, ONLY under `invocationForm: tracking-existing | tracking-new`:

```text
Per-ref disposition:
  · <owner>/<repo>#<m1> · <completed | not-planned>
  · <owner>/<repo>#<m2> · <completed | not-planned>
  ...
```

Same content as the G.7 gate's per-ref disposition list — reused verbatim so the summary and the gate presentation cannot drift.

## Extended L.6 example (epic-less)

```text
Auto run complete.

Epic: generacy-ai/agency#100 · Exited: finish (tracking closed)
Events dispatched: 12
  · Clarification batches: 1
  · Review verdicts: 4
  · Manual-validation gates: 2
  · Phase-queue confirmations: 0
  · Merges: 3 (3/0, 0)
  · Escalations: 0
  · Cursor recoveries: 0 (by class: invalid-cursor=0, resetFrom=0, expiry=0, discarded=0)
  · Cursor-recovery escalations: 0 (continue-degraded=0, stop=0)
Scope growth: started with 0, added 3, completed 3
Per-ref disposition:
  · generacy-ai/agency#420 · completed
  · generacy-ai/agency#421 · completed
  · generacy-ai/agency#422 · not-planned
Muted issues (session-local): 0
Ledger file: /workspaces/agency/.generacy/cockpit/auto-runs/generacy-ai-agency-100-20260713-153421.ledger
```

## Extended L.6 example (epic mode with mid-run ad-hoc adds)

```text
Auto run complete.

Epic: generacy-ai/agency#50 · Exited: epic-complete
Events dispatched: 27
  · Clarification batches: 3
  · Review verdicts: 8
  · Manual-validation gates: 4
  · Phase-queue confirmations: 2
  · Merges: 7 (7/0, 0)
  · Escalations: 0
  · Cursor recoveries: 0 (by class: invalid-cursor=0, resetFrom=0, expiry=0, discarded=0)
  · Cursor-recovery escalations: 0 (continue-degraded=0, stop=0)
Scope growth: started with 5, added 2, completed 7
Muted issues (session-local): 0
Ledger file: /workspaces/agency/.generacy/cockpit/auto-runs/generacy-ai-agency-50-20260713-091214.ledger
```

Under epic mode, the per-ref disposition block is omitted (the epic's phase-based structure supplies the "who did what" reading; per-ref disposition would be noise).

## L.4 status table policy extension

Extends the § Ledger L.4 surfaces list. Current L.4 emits the full status table at four surfaces (phase-complete, epic-complete, escalation gates, startup sweep). Added:

5. **Scope-drained gate G.7 presentation** — operator needs orientation before an exit decision (matches surface 3's "escalation gate" rationale).

## Validation rules

- Every scope mutation MUST have a ledger line (scope mutations are first-class ledger lines per spec § Changes item 6). Filing-gate skips MUST also have a ledger line (`filing-gate · skipped (draft discarded)`), so that the ledger records the operator's choice to reject the draft.
- The `Scope growth:` line MUST NOT be omitted, even when `started = added = completed = 0` (a run with zero scope activity — for instance, an epic-less run that was closed at the initial G.7 without any adds — still records `Scope growth: started with 0, added 0, completed 0`).
- The per-ref disposition block MUST NOT appear under epic mode (`invocationForm: epic`).
- The per-ref disposition block MUST use the same ordering as the tracking issue's task-list markdown.

## Fixtures

- Ledger-line fixtures are inline in the run-summary and gate-presentation fixtures (416-scope-drained-*, 416-d8-adhoc-*). No dedicated fixture file for the ledger vocabulary — the assertions are grep-based.

## Verification

- **Static grep positive**: `commands/auto.md` § Ledger action-outcome vocabulary contains `scope-add`, `filing-gate+scope-add`, `scope-drained-gate`, `filing-gate` (as `<action>` values); § L.6 contains `Scope growth:` and `Per-ref disposition:` (the latter within a conditional-emit paragraph).
- **Static grep positive**: `commands/auto.md` § L.4 status table policy contains a fifth surface entry referencing the scope-drained gate.
- **Behavioral**: 416-4 verifies the per-ref disposition rendering in G.7 fixtures; ledger vocabulary is verified via grep.
- **True verifier**: an end-to-end run's ledger file contains at least one of each new action type (`scope-add`, `filing-gate+scope-add`, `scope-drained-gate`); the L.6 summary printed at exit contains the `Scope growth:` line and, under epic-less, the per-ref disposition block.

## Related contracts

- [Filing gate](./filing-gate.md) — G.6 outcomes populate `filing-gate+scope-add` and `filing-gate` action lines.
- [Scope-drained gate](./scope-drained-gate.md) — G.7 outcomes populate `scope-drained-gate` action lines.
- [Phase-queue ad-hoc enumeration](./phase-queue-adhoc-enumeration.md) — D.8 outcomes populate extended `phase-queue-gate` outcomes (`held (...)`, `queued ... with ... ad-hoc open`).
