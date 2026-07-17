# Quickstart & Verification

This feature is a documentation-only edit to `packages/claude-plugin-cockpit/commands/auto.md`. There are no install steps, no new commands, and no runtime behavior added to any package — the file is a playbook the auto loop reads at run time.

## Files touched

- `packages/claude-plugin-cockpit/commands/auto.md` (only file)

## Verification scenarios

Each scenario is a hypothetical dispatch the loop should handle correctly after the edits. Verification is **read the edited `auto.md` and confirm the branch of prose that would fire matches the expected outcome**. There is no automated fixture harness for `auto.md` dispatch — the playbook is LLM-interpreted.

### Scenario 1 — `waiting-for:merge-conflicts` first arrival (regression check)

**Given**: The current per-issue state stream emits `waiting-for:merge-conflicts` on `<issue-ref>` and the dispatched-issues set does not contain `<issue-ref>`.

**Then**:
- D.11 Trigger matches on `waiting-for:merge-conflicts`.
- `<issue-ref>` is added to the dispatched-issues set.
- Subagent is spawned with source label `waiting-for:merge-conflicts` in the prompt.
- G.4d presentation block is the **five-element shape** (no `Auto-remedy status:` row).
- Ledger line: `<issue-ref> · waiting-for:merge-conflicts · escalation-gate · <outcome>`.

**Verifies**: FR-001 (no regression on the existing path), unchanged G.4d shape when source is `waiting-for:*`.

### Scenario 2 — `blocked:stuck-merge-conflicts` first arrival (new path)

**Given**: The event stream emits `blocked:stuck-merge-conflicts` on `<issue-ref>` (classifier fix has shipped) and dispatched-issues set does not contain `<issue-ref>`.

**Then**:
- D.11 Trigger matches on `blocked:stuck-merge-conflicts`.
- `<issue-ref>` is added to the dispatched-issues set.
- Subagent is spawned with source label `blocked:stuck-merge-conflicts` in the prompt; subagent may reference "auto-remedy already failed" in `root_cause`/`evidence`.
- G.4d presentation block is the **six-element shape** with `**Auto-remedy status:** failed (engine escalated via blocked:stuck-merge-conflicts)` above `**Root cause:**`.
- Ledger line: `<issue-ref> · blocked:stuck-merge-conflicts · escalation-gate · <outcome>`.

**Verifies**: FR-002, FR-003 (source label routing + rendering).

### Scenario 3 — sibling label second arrival (dedup path)

**Given**: The event stream emits `waiting-for:merge-conflicts` for `<issue-ref>` first; D.11 fires and enters `<issue-ref>` into the dispatched-issues set. Then the sibling `blocked:stuck-merge-conflicts` arrives for the same `<issue-ref>`.

**Then**:
- Second event's D.11 Trigger check finds `<issue-ref>` in the dispatched-issues set.
- No subagent is spawned; no gate is presented.
- Ledger line: `<issue-ref> · blocked:stuck-merge-conflicts · escalation-gate · already-dispatched`.
- Loop continues without operator interruption.

**Verifies**: Q1 dedup semantics — Entity 2 lifecycle rule "already-dispatched".

### Scenario 4 — future new conflict after prior advance

**Given**: D.11 previously dispatched for `<issue-ref>`; operator picked `I've resolved it`; `cockpit_advance` succeeded; `<issue-ref>` was removed from the dispatched-issues set. Later in the same session, a NEW `waiting-for:merge-conflicts` event arrives for `<issue-ref>` (genuinely new conflict).

**Then**:
- Dispatched-issues set does not contain `<issue-ref>` (cleared on advance).
- D.11 Trigger matches; new dispatch runs normally.
- `<issue-ref>` is re-added to the dispatched-issues set.

**Verifies**: Q1 rule "dedup entry cleared when gate advances so future new conflicts re-gate".

### Scenario 5 — new `blocked:*` token that is NOT stuck-merge-conflicts

**Given**: A new event `blocked:stuck-validate-fix` (from generacy#943) arrives for `<issue-ref>`. No D.1–D.11 row names this token verbatim.

**Then**:
- D.11 Trigger does not match (only names `waiting-for:merge-conflicts` and `blocked:stuck-merge-conflicts`).
- D.10 case (d) — broadened to `waiting-for:* or blocked:*` — matches.
- D.10 escalation gate fires (Skip / Stop, never Retry).
- Ledger line: `<issue-ref> · blocked:stuck-validate-fix · unrecognized-state · <skip | stop>`.

**Verifies**: Q4 D.10 broadening — `blocked:*` is a recognized token family and does not fall through the vague catch-all.

## How to run the verification

Since there is no automated harness for the playbook:

1. `git diff packages/claude-plugin-cockpit/commands/auto.md` and read the changed hunks against the five scenarios above.
2. Confirm each of the five edit sites listed in `plan.md` § Edit sites is present.
3. Spot-check by grepping the file:
   ```bash
   grep -n "blocked:stuck-merge-conflicts" packages/claude-plugin-cockpit/commands/auto.md
   grep -n "Auto-remedy status" packages/claude-plugin-cockpit/commands/auto.md
   grep -n "already-dispatched" packages/claude-plugin-cockpit/commands/auto.md
   grep -n "blocked:\*" packages/claude-plugin-cockpit/commands/auto.md
   ```
   All four queries must return at least one line after the edits ship.
4. Replay the snappoll transcript (spec cites #3, #13, +1) mentally against the edited D.11 Trigger + G.4d shape to confirm the observed fall-through is now caught.

## Troubleshooting

- **New D.11 branch doesn't fire in production**: verify the `@generacy-ai/cockpit` classifier fix (companion issue) has shipped — until then, `blocked:stuck-merge-conflicts` may arrive as `unknown` state and hit D.10 despite the playbook edit. The playbook edit is safe to ship ahead, but not sufficient alone.
- **Dedup entry never clears (operator sees no gate on a genuinely new conflict)**: check the ledger for a successful `advanced` line on the prior incident. If the operator picked `Skip` on the prior gate, the entry deliberately stays (session-mute semantics). Restart the auto run to reset.
- **Fall-through recurs on a new `blocked:*` label**: confirm D.10 case (d) prose reads `waiting-for:* or blocked:*` (Q4 answer C). If it still says only `waiting-for:*`, the D.10 broadening edit was not applied.
