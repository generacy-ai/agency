# Contract: Ledger Line

**Feature**: 392-part-auto-mode-v1
**Target**: `packages/claude-plugin-cockpit/commands/auto.md` § Ledger

This contract defines the one-line ledger format, its persistence rule, and the mandatory-per-dispatch enforcement rule. The ledger is the audit trail SC-002 measures against: every dispatched event has exactly one ledger line, and the file `.generacy/cockpit/auto-runs/<epic-ref-slug>-<timestamp>.ledger` is the run log.

---

## L.0 — Scope and purpose

The ledger serves three consumers:
1. **Operator visibility** (transcript print) — the visible feedback that the loop is dispatching work.
2. **Audit trail** (persistent file) — post-hoc grep target for SC-002 and for troubleshooting.
3. **Session-restart survivability** — a run that spans multiple Claude Code sessions preserves its record.

**Dual-write is unconditional** (per Q5=C): every dispatch writes to **both** the transcript and the persistent file. There is no CLI-verb conditional (Q5=C explicitly deletes the FR-005 `if the CLI supports it` clause).

---

## L.1 — Line format

**Format**:

```text
<issue-ref> · <transition-class> · <action> · <outcome>
```

**Field definitions**:

| Field | Description | Format |
|-------|-------------|--------|
| `<issue-ref>` | The issue or epic reference the event applies to | `<owner>/<repo>#<n>` (verbatim from `cockpit status --json`) |
| `<transition-class>` | The transition class from spec § Dispatch (D.1 through D.10 keys) | `waiting-for:clarification`, `completed:validate`, `agent:error`, `phase-complete`, etc. Verbatim string from the event. |
| `<action>` | The dispatch action shape (CLI verb + subagent + gate combination) | Free-form, but stable per row of the dispatch table. See § L.2 below. |
| `<outcome>` | The terminal outcome of the dispatch | Free-form, but stable per row / gate result. See § L.2 below. |

**Separator**: middle-dot (` · `, U+00B7) with a single space on each side. This matches spec § Loop's format sentence verbatim.

**Line count**: Exactly one line per dispatched event. Never zero. Never more than one. A dispatch without a ledger line is a **protocol violation** (#388 enforcement-style — spec § Loop verbatim).

---

## L.2 — Action + outcome vocabulary (per dispatch row)

Stable strings per dispatch table row, so `grep` recipes are reliable.

| Dispatch row | `<action>` | `<outcome>` (examples) |
|--------------|------------|------------------------|
| D.1 clarification | `clarification-batch` | `advanced`, `posted <k>/<N>, skipped <s>`, `all answers skipped`, `error: <description>` |
| D.2 artifact-review | `review-analysis+advance` | `approved`, `advance failed`, `error: <description>` |
| D.2 artifact-review | `review-analysis+comment-review` | `request-changes (<count> findings)` |
| D.2 artifact-review | `review-analysis+abort` | `aborted` |
| D.3 implementation-review | (same as D.2) | (same as D.2) |
| D.4 manual-validation | `manual-validation-summary+advance` | `manually validated` |
| D.4 manual-validation | `manual-validation-summary+wait` | `not yet` |
| D.5 merge (green) | `merge` | `merged (PR #<n>)`, `blocked: missing-approval`, `blocked: draft`, `blocked: pending`, `blocked: missing-label`, `infrastructure failure — <checks>` |
| D.6 fixer | `fixer` | `fixed`, `unfixed → escalation` |
| D.6 fixer + escalation | `fixer+escalation-gate` | `retry`, `skip (session-local mute)`, `stop (exit)` |
| D.7 agent-error / failed | `escalation-gate` | `requeue (cockpit resume)`, `requeue failed: <description>`, `skip (session-local mute)`, `skip (cockpit resume unavailable — G-S8 prerequisite)`, `stop (exit)` |
| D.8 phase-complete | `phase-queue-gate` | `queued P<next> (<N> issues)`, `cancelled` |
| D.9 address-pr-feedback | `(no-op)` | `server-side-owned` |
| D.10 unrecognized | `unrecognized-state` | `skip (session-local mute)`, `stop (exit)` |
| mute-set hit | `(muted)` | `skip (session-local mute active)` |

**Contract invariant**: The `<action>` and `<outcome>` strings appear verbatim in `auto.md`'s dispatch prose (per row), so grep recipes are stable across implementations.

---

## L.3 — Persistence rule (dual-write)

**Rule**: Every ledger line is:
1. **Printed to the transcript** (the assistant response's text body), on its own line, prefixed with `[ledger] ` for visual scanning.
2. **Appended to the persistent file** at `.generacy/cockpit/auto-runs/<epic-ref-slug>-<timestamp>.ledger`, one line per dispatch, in the exact `<issue-ref> · <transition-class> · <action> · <outcome>` format (no `[ledger] ` prefix in the file — the file's whole purpose is ledger lines).

**Persistence file path**:
- **Directory**: `.generacy/cockpit/auto-runs/` — created via `mkdir -p .generacy/cockpit/auto-runs` on the first dispatch of a run. Sibling of the existing `.generacy/` tree conventions used by the cluster.
- **Filename**: `<epic-ref-slug>-<timestamp>.ledger`
  - `<epic-ref-slug>`: epic reference with `/` → `-` and `#` stripped (e.g., `christrudelpw/epic#42` → `christrudelpw-epic-42`).
  - `<timestamp>`: `YYYYMMDD-HHMMSS` in the operator's local time, captured at the start of the run.

**Write mechanism**: `echo "<line>" >> <filepath>` (or equivalent — the mechanism is one append per dispatch, no rewriting).

**Concurrent runs on the same epic**: Different timestamps → different filenames → no collision. (Multi-epic parallel runs are out of scope, per plan.md § Out of Scope.)

**Failure modes**:
- File cannot be written (permissions, missing parent directory that `mkdir -p` did not create, disk full): route to Error handling class `OTHER`; write the ledger line to transcript only for that dispatch; do not silently continue (the operator needs to know the persistent record is broken).
- Directory creation fails: same — Error handling class `OTHER`.

---

## L.4 — Mandatory-per-dispatch enforcement rule

**Rule** (spec § Loop verbatim + #388 enforcement style):

> A dispatch without a ledger line is a protocol violation.

**What counts as a "dispatch"**:
- Any event line from `cockpit watch` that the parent processes (branches into the dispatch table).
- Any event synthesized by the startup sweep (each issue in the live-state snapshot with an actionable transition class).
- Any escalation-gate retry that re-runs the fixer or re-presents the escalation gate (each retry is a separate dispatched event with its own ledger line).
- Any session-mute skip (the mute set hit is itself a dispatched event; the ledger records the mute).

**What does NOT count as a "dispatch"**:
- Re-check calls (`cockpit status --json` invocations that don't produce a dispatch decision).
- Watch re-arms (spawning `cockpit watch` again after it dies) — the re-arm itself is not dispatched work.
- Pre-flight failures (before the loop begins).

**Enforcement**: `auto.md` states this rule verbatim in `## Ledger` and again in `## Invariants` (as invariant §2's ledger-related sub-clause). The rule is greppable, review-checkable, and the playbook's own contract with itself.

---

## L.5 — Startup sweep + live-state re-check

**Startup sweep**: On step 3 of `auto.md`'s `## Instructions`, the parent calls `cockpit status --json <epic-ref>` and enumerates every issue with an actionable transition class as a synthetic event, dispatching one by one before entering the main `cockpit watch` loop. This handles the case where the epic already has open work when auto is invoked.

**Live-state re-check**: On step 4a (main loop), the parent re-checks live state via `cockpit status --json` before dispatching each event. This handles two failure modes:
1. **Stream staleness** — the watcher emitted an event, but the operator ran an assist command in parallel, moving the state.
2. **Duplicate dispatch after watch re-arm** — the watcher died mid-run, was re-spawned in step 5, and re-emitted events for state that has already been dispatched. The re-check catches these: if the live state doesn't match the streamed transition class, the parent applies the live class instead (or writes a ledger line noting the mismatch and continues).

**Idempotency**: The startup sweep + live-state re-check pair guarantees the watch re-arm is idempotent. Spawning `cockpit watch` twice on the same live state produces no duplicate action.

**Ledger lines from startup sweep**: Each synthetic event from the startup sweep produces a ledger line, per L.4. The `<transition-class>` is the class read from the live state.

---

## L.6 — Run summary

**Rule**: On `epic-complete` exit (step 6), the parent prints a **run summary** — one paragraph summarizing the run — and includes the persistent ledger file's absolute path so the operator can find it.

**Shape** (illustrative):

```text
Auto run complete.

Epic: <epic-ref> · Exited: epic-complete
Events dispatched: <N>
  · Clarification batches: <k1>
  · Review verdicts: <k2>
  · Manual-validation gates: <k3>
  · Phase-queue confirmations: <k4>
  · Merges: <k5> (<green>/<red>, <fixer runs>)
  · Escalations: <k6>
Muted issues (session-local): <s>
Ledger file: <absolute path to .ledger file>
```

**Fields**:
- Counts derived from the ledger file (or the in-memory count if the file is unavailable).
- Muted issues list comes from the session mute set (empty if none).
- Ledger file path is the absolute path to the persistent file.

**Non-`epic-complete` exits** (Stop from an escalation gate, pre-flight failure, etc.): print an abbreviated summary with the exit reason.

---

## Contract invariants (LC)

- **LC.1**. Every dispatched event produces exactly one ledger line.
- **LC.2**. Every ledger line matches the format `<issue-ref> · <transition-class> · <action> · <outcome>` (four fields, ` · ` separator).
- **LC.3**. Every ledger line is written to **both** the transcript and the persistent file `.generacy/cockpit/auto-runs/<epic-ref-slug>-<timestamp>.ledger` (per Q5=C — no CLI-verb conditional).
- **LC.4**. The persistent file is opened in append-only mode (`>>`); the parent never rewrites a prior line.
- **LC.5**. The mandatory-per-dispatch rule is stated verbatim in `## Ledger` and referenced from `## Invariants`.
- **LC.6**. The startup sweep + live-state re-check pair keep the watch re-arm idempotent (spawning `cockpit watch` twice on the same live state produces no duplicate ledger lines).
- **LC.7**. The run summary at exit references the persistent file's absolute path.
- **LC.8**. `<action>` and `<outcome>` strings per dispatch row are stable — a change in the dispatch table's action shape requires a corresponding change to this contract and to `auto.md`'s dispatch prose.
- **LC.9**. No `cockpit run-log` CLI verb is called (Q5=C — dangling machinery). The persistent file **is** the run log.
