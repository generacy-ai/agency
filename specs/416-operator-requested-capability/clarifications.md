# Clarifications

## Batch 1 — 2026-07-13

### Q1: Terminal-state definition
**Context**: FR-005 says the scope-drained gate fires when "every task-list ref is terminal", but the spec never defines which issue/PR states count as terminal. This directly gates when the epic-less run exits and how the ledger reports `completed K`.
**Question**: Which states count as "terminal" for a task-list ref (i.e. cause it to stop counting toward open scope)?
**Options**:
- A: Merged PR OR closed issue (any close reason)
- B: Merged PR OR closed-as-completed issue only (excludes closed-as-not-planned / wontfix)
- C: Whatever `cockpit_status` reports as a terminal disposition — defer to engine
- D: Something else (please specify)

**Answer**: *Pending*

### Q2: Add-issue trigger recognition
**Context**: FR-002 lists two example phrases ("also process <ref>", "file an issue for <bug> and process it") that trigger the add-issue flow. Implementation needs to know whether these are literal templates, an intent class, or a strict grammar — otherwise the session may miss valid operator requests or misfire on chat.
**Question**: How should the session recognise add-issue instructions?
**Options**:
- A: Intent-class match — natural-language variants of "add existing ref" and "file new issue" both trigger; the session confirms the intent before acting when ambiguous
- B: Literal-ish prefix match — only phrases starting with "also process" / "file an issue" trigger; anything else is chat
- C: Explicit verb only — operator must say `/add <ref>` or `/file <title>` (structured invocation, no NL)
- D: Something else (please specify)

**Answer**: *Pending*

### Q3: Filing-gate "edit" affordance
**Context**: FR-002 says the filing gate uses "#400 presentation shape: approve/edit/skip". The "edit" branch's UX shape isn't defined in this spec — it drives the drafting loop for outward-facing issue creation, so the implementation needs to know its behaviour.
**Question**: When the operator picks "edit" on the filing gate, what happens?
**Options**:
- A: Inline single-shot edit — operator provides revised title/body once, gate re-presents the edited draft for final approve/skip (no further edit)
- B: Iterative refinement — operator can request changes conversationally; the session redrafts and re-presents until approve or skip
- C: Reuse whatever #400 already implements — treat this as inherited behaviour, don't redefine
- D: Something else (please specify)

**Answer**: *Pending*

### Q4: Scope-drained gate default
**Context**: FR-005 defines the scope-drained gate options as `Add more work` / `Keep watching` / `Finish (close tracking issue + summary)`, but does not name a recommended default (unlike the D.8 gate, which recommends "hold"). The default affects how the gate is presented and how quickly a run terminates.
**Question**: Which option should be the recommended default when the scope-drained gate fires?
**Options**:
- A: `Keep watching` — safest, non-destructive, keeps the loop alive for late-arriving work
- B: `Finish` — session has drained scope, treat completion as the expected exit
- C: No default — force the operator to choose explicitly (no highlighted option)
- D: Something else (please specify)

**Answer**: *Pending*

### Q5: D.10 vs first-sight dispatch row
**Context**: FR-003 says D.10 must not fire on the first-sight event, and offers two paths: add a dedicated dispatch row, or fold into a D.9-class row — "align with whatever event shape #935 pins". The spec both depends on #935 shipping first *and* is P1. It's unclear whether this playbook change makes the choice now or explicitly defers it.
**Question**: Should this feature commit to a specific first-sight dispatch approach in `auto.md`, or explicitly leave it as a TODO tied to #935?
**Options**:
- A: Commit now to a dedicated new dispatch row (e.g. D.12) for the first-sight event
- B: Commit now to folding first-sight into an existing D.9-class row
- C: Explicitly defer — `auto.md` documents the constraint (D.10 must not fire on first-sight) and marks the specific dispatch wiring as a follow-up once #935 pins its event shape
- D: Something else (please specify)

**Answer**: *Pending*
