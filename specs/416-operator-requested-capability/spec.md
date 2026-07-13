# Feature Specification: Operator-requested capability from the cockpit auto-mode workstream (context: generacy-ai/tetrad-development#92)

**Branch**: `416-operator-requested-capability` | **Date**: 2026-07-13 | **Status**: Draft

## Summary

Operator-requested capability from the cockpit auto-mode workstream (context: generacy-ai/tetrad-development#92). Companion to generacy-ai/generacy#935 (dynamic-scope engine contract), which this depends on — sequence after it ships and write the implementation against its shipped verb/tool contract.

## Goal

Two additions to auto.md, both riding #935's scope primitive (scope = a task-list-bearing issue whose membership is live):

**1. Mid-run ad-hoc issues in epic mode.** Out-of-band testing between phases (telephony agents, deployed-environment-only behavior) surfaces bugs that must be resolved before the next phase queues. The auto session gains an add-issue flow and the phase-queue gate gains awareness of open ad-hoc work.

**2. Epic-less mode (stabilization runs).** `/cockpit:auto` without a planned epic: the session drives a tracking issue whose task list grows as issues are filed, with the same D.1–D.11 dispatch machinery per issue. The monitored set is exactly what this conversation added; concurrent auto conversations in other tabs (distinct tracking issues, own MCP server processes, per-ref event buses) are isolated by construction — the playbook's only isolation duty is to never widen scope beyond its own tracking ref.

## Changes (auto.md)

1. **Invocation forms**: existing `/cockpit:auto <epic-ref>` unchanged; add `/cockpit:auto --tracking <issue-ref>` (drive an existing tracking issue) and `/cockpit:auto --new "<title>"` (create the tracking issue first — gated: the session presents the draft, the operator approves creation, then the loop starts on it). The tracking ref is printed at startup and recorded in the ledger header — it is the run's identity.
2. **Add-issue flow (both modes)**, triggered by the operator mid-conversation via **intent-class recognition** — natural-language variants of "add existing ref" ("also process owner/repo#N", "process #N too", …) and "file new issue" ("file an issue for <bug> and process it", "open a bug for X", …) both trigger; on ambiguity the session confirms intent before acting. Recognition can be generous because the safety net is structural: the add-existing path requires a parseable explicit ref to act on, and the file-new path always lands on the filing gate — a misread intent surfaces as a skippable gate, never as an unreviewed outward action.
   - Existing issue: `cockpit_scope_add` → `cockpit_queue` (issue form) → ledger line (`<ref> · scope-add · queued`). No gate — the operator's instruction *is* the approval.
   - New issue: the session drafts title/body, presents a **filing gate** (#400 presentation shape: draft shown in full, approve/edit/skip) — filing is outward-facing, so it always gates. The **edit branch is iterative**: the operator can request changes conversationally, the session redrafts and re-presents the full revised draft each round (what gets filed is exactly what was last shown), until approve or skip; single-shot free-text is the fast path. On approval: create → scope-add → queue → ledger line.
   - First-sight events from #935 arrive as `initial: true` `issue-transition` events carrying a known state class. They dispatch through the existing table by carried state with the step-4a re-check (the same path connect-time snapshots use today), so D.10 structurally cannot fire on them. The `auto.md` change is one sentence in the event-consumption step — initial-flagged events (connect-time or mid-run scope join) dispatch normally — plus a fixture. No new dispatch row.
3. **Phase-boundary interplay (epic mode)**: the D.8 phase-queue gate's presentation must enumerate open ad-hoc issues in scope; queueing the next phase while ad-hoc work is open stays *possible* but never *silent* (the gate text names the open refs and the operator decides). Recommended default when ad-hoc issues are open: hold.
4. **Exit semantics (epic-less mode)**: no `epic-complete` event exists; the run reaches a **scope-drained gate** when every task-list ref is terminal. Terminality is whatever `cockpit_status` reports as a terminal disposition — the engine's classifier owns it, the playbook does not re-derive from raw GitHub states. Under that definition closed-as-not-planned is terminal; the run summary reports disposition per ref (completed vs not-planned), which is where that distinction lives — in the accounting, not the exit condition. Gate options: `Add more work` / `Keep watching` / `Finish (close tracking issue + summary)`, with `Keep watching` as the recommended default (reversible; the mode's premise is that work arrives ad hoc, so drained-for-now is not done). Closing the tracking issue is gated (outward-facing). The run summary lists every processed ref and disposition.
5. **Restart semantics**: unchanged principles — a restarted session re-orients from the tracking ref's live task list (the scope survives restarts because it lives on the issue, not in session state); mutes/cursors stay session-local.
6. **Ledger**: scope mutations are first-class ledger lines; the run summary reports scope growth (started with N, added M, completed K).

## Out of scope

- Engine changes (all in #935).
- Multi-repo scope in one run beyond what full refs in a task list already give; autonomy policy; any change to gate blocking semantics.

## Success criteria

- Epic mode: operator files a bug mid-run via the filing gate; it is processed to merge without restarting the session; the next phase-queue gate named it while open.
- Epic-less: a stabilization conversation processes 3+ ad-hoc issues to terminal state and exits through the scope-drained gate with an accurate summary.
- Two concurrent tabs on the same repo with distinct tracking issues: neither session's ledger references the other's refs (isolation observed end-to-end).
- Playbook-verification suite: invocation forms, filing-gate presence, D.8 ad-hoc enumeration, and scope-drained gate asserted (house `NNN-1` pattern).


## User Stories

### US1: [Primary User Story]

**As a** [user type],
**I want** [capability],
**So that** [benefit].

**Acceptance Criteria**:
- [ ] [Criterion 1]
- [ ] [Criterion 2]

## Functional Requirements

| ID | Requirement | Priority | Notes |
|----|-------------|----------|-------|
| FR-001 | [Description] | P1 | |

## Success Criteria

| ID | Metric | Target | Measurement |
|----|--------|--------|-------------|
| SC-001 | [Metric] | [Target] | [How to measure] |

## Assumptions

- [Assumption 1]

## Out of Scope

- [Exclusion 1]

---

*Generated by speckit*
