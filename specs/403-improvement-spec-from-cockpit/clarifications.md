# Clarifications

## Batch 1 — 2026-07-11

### Q1: `phase:*` transition dispatch class
**Context**: The spec's motivating example of a ledger-only transition is "transient `phase:*` movements like `phase:plan → phase:tasks`" (Problem, Change 1). But the current `auto.md` dispatch table (D.1–D.11) has **no row for `phase:*` events** — they would fall to D.10 ("unrecognized / ambiguous state"), which is an operator escalation gate. Without an explicit row, either (a) the loop is already emitting D.10 gates on every phase transition (contradicting the observed 4–5k-token silent growth), or (b) `phase:*` events are being consumed but silently dropped somewhere. Implementation must decide what row(s) to add.
**Question**: How should `phase:*` transitions be classified in the D-taxonomy?
**Options**:
- A: Add one new ledger-only row (e.g., D.9d — `phase:*`) that matches any `phase:` prefix and dispatches ledger-line-only
- B: Enumerate the actual `phase:*` labels (`phase:specify`, `phase:clarify`, `phase:plan`, `phase:tasks`, `phase:implement`, `phase:validate`) as individual D.9-class rows
- C: Add a single row that documents `phase:*` as a wildcard category alongside D.9's existing wildcard-flavored entries
- D: `phase:*` transitions are engine-internal and should never surface on the watch stream at all — this issue's scope expands to filter them upstream (generacy-side)

**Answer**: *Pending*

### Q2: Scope of D.9 taxonomy pre-validation
**Context**: The Assumptions section says: "The current D.9 taxonomy in `auto.md` correctly identifies all ledger-only transition classes; if any actionable transition is currently misclassified as D.9, it must be re-classified before this contract change lands." The pre-validation is described as a hard prerequisite (contract change would suppress prose/re-check for actionable rows that shouldn't have it), but the spec doesn't state who runs the audit or where its output lands. This affects whether tasks.md includes a validation task and whether FR-001 has an implicit blocker.
**Question**: Where does the D.9 misclassification audit live?
**Options**:
- A: A task inside this issue's tasks.md, run before FR-001 is applied; findings block the branch until resolved (misclassifications re-routed in the same PR)
- B: A one-shot check performed in Plan phase (documented in plan.md as a design-time verification), not codified as a task
- C: A separate prerequisite issue filed before this one merges — this issue does not land until that issue closes
- D: No audit needed — the current D.9/D.9a/D.9b/D.9c rows are known-correct by construction; the assumption is a caution, not a task

**Answer**: *Pending*

### Q3: Failure-alert evidence fetch boundary (FR-003)
**Context**: FR-003 caps the parent at "exactly one CLI call to fetch failure-alert evidence"; any further work is subagent-only. But failure alerts commonly reference *external* evidence — the alert comment on the issue links to a workflow-run URL, whose logs are pulled with a second CLI call (`gh run view --log`). Whether that second fetch is parent work ("still evidence") or subagent work ("investigation") determines what the diagnosis subagent is handed at spawn time (bare alert body vs. alert body + primary log).
**Question**: When the alert comment references external evidence (CI logs, workflow-run URLs, linked file diffs), what is the parent's fetch envelope?
**Options**:
- A: Strict one call — parent fetches only the alert comment body; subagent fetches every downstream artifact including the primary CI log
- B: Alert comment + one linked-log fetch stay in parent; anything beyond that (bisection, cross-branch inspection, historical runs) goes to subagent
- C: Parent may follow one level of links (URLs mentioned inside the alert body) but not further; subagent handles multi-hop investigation
- D: Parent fetches whatever `generacy cockpit context <issue>` returns as the failure bundle (one CLI verb), and everything else is subagent — no ad-hoc `gh` chains in parent

**Answer**: *Pending*

### Q4: Diagnosis subagent verdict → escalation gate
**Context**: FR-003 specifies the subagent returns `{root_cause, evidence, recommended_action, confidence}` and "the parent presents the escalation gate directly from that verdict; no in-parent re-analysis." The existing D.7 gate offers `Requeue / Skip / Stop`; D.11 offers `I've resolved it / Skip / Stop`. The verdict fields' types and how they map to the operator-facing #400 five-element gate display are not specified — critical for both the subagent's prompt contract and the gate's presentation code.
**Question**: What are the verdict field shapes, and how do they render in the escalation-gate presentation?
**Options**:
- A: `recommended_action` is one of the exact gate option strings (`Requeue`/`Skip`/`Stop` for D.7; `I've resolved it`/`Skip`/`Stop` for D.11), presented as a "Suggested decision" line in the recommendation row (mirrors #400's approve/deny presentation); `confidence` is `low` / `medium` / `high` and appears next to the suggestion; `root_cause` and `evidence` populate the context and evidence rows; the operator still picks from the full option set
- B: Same as A but `confidence` is numeric `0.0–1.0` and displayed as a percentage
- C: `recommended_action` is free-form prose that appears in the presentation block; the operator interprets it; no auto-suggested option in the AskUserQuestion prompt
- D: The subagent returns structured findings only (`root_cause`, `evidence`) and the parent's gate presenter selects the option to suggest based on rules over those fields; `recommended_action` and `confidence` are subagent hints only, not surfaced verbatim to the operator

**Answer**: *Pending*

### Q5: Startup sweep vs. "no status tables between phase boundaries"
**Context**: FR-002 restricts the full epic status table to `phase-complete`, `epic-complete`, and escalation-gate presentations. The startup sweep (auto.md § 3) dispatches every D.1–D.9 issue one-by-one at session start, before any `phase-complete` event fires. The current run emits a status table when the sweep finishes; under FR-002 that table would be forbidden, leaving no session-start orientation for the operator. The Explicitly-Unchanged section preserves "startup sweep" behavior but does not specify whether the post-sweep table is part of that.
**Question**: Does the "no status tables between phase boundaries" rule apply to the startup sweep?
**Options**:
- A: Yes — the sweep produces ledger lines only; no post-sweep status table. Operator uses the ledger file for orientation
- B: No — the sweep ends with exactly one full status table (a permitted exception, added to FR-002's allowed list) so the operator sees the epic's live state on entry
- C: Yes, but the sweep emits a *reduced* one-line summary (e.g., "swept N issues; M actionable dispatched") — not the full status table
- D: Only when the sweep produces zero actionable dispatches — otherwise the last dispatch's ledger line is the sweep summary and no separate table is emitted

**Answer**: *Pending*
