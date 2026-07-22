# Clarifications

Questions and answers to clarify the feature specification.

## Batch 1 - 2026-07-22 17:27

### Q1: Gate mapping table — G.4 subtypes
**Context**: FR-008 mandates 'Each of G.1–G.7 has an explicit mapping in auto.md from optionId/freeText to the same tool calls...'. But the current playbook has G.4 with five subtypes (G.4a validate-red, G.4b agent:error, G.4c unrecognized, G.4d merge-conflicts, G.4e consecutive invalid-cursor) with distinct option strings and, in G.4(e)'s case, a per-epic (not per-issue) scope. FR-015 asserts 'the new gate mapping table headings/columns' (singular table). Whether G.4 subtypes each get their own row (with per-subtype option lists) or share one G.4 row (with subtype-conditional option strings) determines the mapping table's shape and downstream pin assertions.
**Question**: In the new UI-mode gate mapping table, how are the G.4 subtypes represented?
**Options**:
- A: One row per subtype (G.4a, G.4b, G.4c, G.4d, G.4e), each carrying its own optionId list and downstream-action mapping — total 11 rows (G.1, G.2, G.3, G.4a, G.4b, G.4c, G.4d, G.4e, G.5, G.6, G.7).
- B: One consolidated G.4 row with sub-bullets per subtype naming their option strings and actions — total 7 rows (G.1–G.7).
- C: One row per subtype for G.4a–G.4d (per-issue), but exclude G.4(e) from the UI mapping (leave it as local-only) — total 10 rows. Rationale: G.4(e) is per-epic and diagnostic; opening a remote inbox record for a cursor mechanism fault may not fit the inbox's per-issue orientation.

**Answer**: *Pending*

### Q2: Startup-sweep scope in UI mode
**Context**: FR-013 says the startup sweep 'MUST re-open remote gates for every pending waiting-for:* state discovered'. But several gate-triggering states are NOT waiting-for:* labels — agent:error / failed:* (G.4b), completed:validate with red checks (G.4a), phase-complete (G.5), blocked:stuck-merge-conflicts (G.4d), and consecutive invalid-cursor fault (G.4e — per-epic, in-memory only). If the operator restarts a driving session whose prior run left an issue in agent:error with a fixer-unfixed escalation pending, does the UI startup sweep re-open a remote gate for that non-waiting-for:* state?
**Question**: Which pending states does the UI-mode startup sweep re-open remote gates for?
**Options**:
- A: Only pending waiting-for:* states (verbatim per FR-013) — non-waiting-for:* gate triggers (agent:error, failed:*, red checks, phase-complete, blocked:stuck-merge-conflicts) are re-opened only when they re-fire as fresh events after startup, not swept.
- B: All persistent gate-trigger states — waiting-for:* PLUS the label-driven non-waiting-for gates (agent:error, failed:*, completed:validate with red checks, phase-complete, blocked:stuck-merge-conflicts). Cursor-fault G.4(e) is excluded (in-memory only).
- C: Only labels the operator can act on across sessions (waiting-for:* + agent:error/failed:*); exclude phase-complete (transient, will re-fire from the batch) and merge-red (fixer state is in-memory).

**Answer**: *Pending*

### Q3: --gates=ui with cockpit_gate_open absent
**Context**: Per FR-002, `--gates=auto` selects local mode when `cockpit_gate_open` is missing OR the cluster is not cloud-activated. Per US6 AC #2, `--gates=ui` 'forces UI mode even when local would otherwise apply (subject to fallback per US4)'. Per US4 / FR-011, cockpit_gate_open ERRORS fall back to local AskUserQuestion per-gate. But 'tool not bound at all' is not the same as 'tool errored at call time' — pre-flight can't call an absent tool, so US4's fallback doesn't naturally apply. Behavior on `--gates=ui` invocation against a session where `cockpit_gate_open` is not in the tool binding is ambiguous.
**Question**: When invoked with `--gates=ui` and `cockpit_gate_open` is absent from the session's tool binding, what does the run do?
**Options**:
- A: Hard-fail at pre-flight — print a verbatim error (`--gates=ui specified but cockpit_gate_open is not available in this session; re-invoke with --gates=local or --gates=auto`) and exit non-zero. No ledger directory created (matches Monitor-presence-check precedent).
- B: Fall back per-gate to local AskUserQuestion (extend US4's fallback semantics to cover absence-not-just-error), with a single ledger note at first-gate that the run is degraded, and the loop continues in effectively-local mode.
- C: Print a warning and downgrade to `--gates=local` for the entire run (no per-gate fallback overhead), with a ledger note at startup. Behavior after downgrade is byte-identical to `--gates=local`.

**Answer**: *Pending*

### Q4: G.7 Add-more-work prose loop under UI mode
**Context**: G.7's `Add more work` option emits a prose prompt after operator selection: `What would you like to add? Reference an existing ref (e.g., 'also process <ref>') or ask me to file a new issue (e.g., 'file an issue for <topic>').` The operator's NEXT turn is routed through the intent-recognizer (add-existing vs. file-new). Under UI mode, this two-turn interaction (select option → emit prose prompt → operator prose reply → intent recognizer) doesn't map to a single gate-answer event carrying `optionId`/`freeText`. The wire contract's freeText field carries at most the initial answer, not an ongoing conversational loop.
**Question**: How does UI-mode handle G.7's `Add more work` follow-up prose input?
**Options**:
- A: Collapse the two-turn flow: when the inbox operator selects `Add more work`, the answer's `freeText` field carries the operator's prose payload directly (the inbox UI collects `also process <ref>` or `file an issue for <topic>` as freeText alongside the optionId). D.12 handling routes freeText through the intent recognizer just as the local prose-reply turn does today.
- B: The operator's `Add more work` selection re-opens a new G.7-followup gate (with a text-input prompt) as a fresh gate generation; the second answer carries the prose in freeText. Two-turn shape preserved in UI mode.
- C: Under UI mode, G.7's `Add more work` option is disabled — remove it from the option list in UI mode, leaving only `Keep watching` and `Finish`. Add-more-work is a driving-session-only interaction and fits poorly with the fan-out-to-inbox model.

**Answer**: *Pending*

### Q5: Ledger vocabulary for UI-mode dispatch
**Context**: The playbook's existing ledger enforces Invariant #8 ('every dispatch writes exactly one ledger line') and stipulates a stable `<action>` / `<outcome>` vocabulary per dispatch row (§ Ledger Action + outcome vocabulary). FR-010 requires D.12 events to `applied`/`failed` (or `superseded` per FR-007), and mandates a ledger line for every D.12 event. FR-005 says the initial UI gate-open prints 'exactly one pointer line' but does not specify whether a ledger row is also written. The Invariant #8 cost contract implies every gate-open is itself a dispatch and should write a ledger row — but this could double the ledger volume if the gate-open AND the gate-answer both write rows.
**Question**: What ledger vocabulary applies to UI-mode gate-open + D.12 gate-answer events?
**Options**:
- A: Both events write ledger rows. Gate-open: `<issue-ref> · <transition-class> · gate-open · opened (gateId=<id>, generation=<g>)`. D.12 gate-answer: `<issue-ref> · <transition-class> · gate-answer · <applied | superseded | failed: <detail>>`. On applied, an additional per-gate downstream-action row is written (preserving the existing per-gate action vocabulary — e.g., clarification-batch · advanced).
- B: Only the D.12 gate-answer writes a ledger row. Gate-open is print-only (per FR-005's 'exactly one pointer line', treated as UI-affordance not dispatch). The D.12 row carries the full outcome: `<issue-ref> · <transition-class> · <original-action> · <outcome> · source: ui-gate` where `<original-action>` matches the pre-change vocabulary and `<outcome>` covers `applied` / `superseded` / `failed: <detail>`. Preserves ledger cost.
- C: Both events write rows AND the existing per-gate action vocabulary is preserved verbatim on `applied`. Gate-open writes `gate-open · opened (gateId=<id>, generation=<g>)`. D.12 applied re-uses the pre-change action string (e.g., `clarification-batch · advanced · source: ui-gate`); D.12 superseded/failed writes `gate-answer · superseded` / `gate-answer · failed: <detail>` (no per-gate action for non-applied outcomes).

**Answer**: *Pending*

