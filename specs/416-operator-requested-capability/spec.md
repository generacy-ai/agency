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
2. **Add-issue flow (both modes)**, triggered by the operator mid-conversation ("also process owner/repo#N" or "file an issue for <bug> and process it"):
   - Existing issue: `cockpit_scope_add` → `cockpit_queue` (issue form) → ledger line (`<ref> · scope-add · queued`). No gate — the operator's instruction *is* the approval.
   - New issue: the session drafts title/body, presents a **filing gate** (#400 presentation shape: draft shown in full, approve/edit/skip) — filing is outward-facing, so it always gates — then on approval: create → scope-add → queue → ledger line.
   - First-sight event from #935 confirms membership; the normal dispatch table owns the issue from there. D.10 must not fire on the first-sight event shape (add a dispatch row or fold into D.9-class as appropriate — align with whatever event shape #935 pins).
3. **Phase-boundary interplay (epic mode)**: the D.8 phase-queue gate's presentation must enumerate open ad-hoc issues in scope; queueing the next phase while ad-hoc work is open stays *possible* but never *silent* (the gate text names the open refs and the operator decides). Recommended default when ad-hoc issues are open: hold.
4. **Exit semantics (epic-less mode)**: no `epic-complete` event exists; the run reaches a **scope-drained gate** when every task-list ref is terminal — options `Add more work` / `Keep watching` / `Finish (close tracking issue + summary)`. Closing the tracking issue is gated (outward-facing). The run summary lists every processed ref and disposition.
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

### US1: Mid-epic ad-hoc bug handling

**As a** cockpit operator running `/cockpit:auto <epic-ref>`,
**I want** to file or add bugs surfaced by out-of-band testing (telephony agents, deployed-environment-only behavior) between phases and have them processed alongside the epic's planned work,
**So that** stabilization findings never force a session restart and phase boundaries do not silently queue the next phase while unresolved ad-hoc work is open.

**Acceptance Criteria**:
- [ ] Operator saying "also process owner/repo#N" mid-run triggers `cockpit_scope_add` → `cockpit_queue` → ledger (`<ref> · scope-add · queued`) with no gate.
- [ ] Operator saying "file an issue for <bug> and process it" triggers a filing gate that presents the drafted title/body in full (#400 shape: approve/edit/skip), then on approval creates → scope-adds → queues → ledger.
- [ ] The D.8 phase-queue gate names every open ad-hoc ref in its presentation text and holds by default when any are open (operator can still queue the next phase — never silently).

### US2: Epic-less stabilization runs

**As a** cockpit operator with no planned epic but ongoing stabilization work,
**I want** `/cockpit:auto --tracking <issue-ref>` (drive an existing tracking issue) or `/cockpit:auto --new "<title>"` (draft-and-gate a new tracking issue, then loop on it),
**So that** I can process a growing set of ad-hoc issues under a single tracking ref using the same D.1–D.11 dispatch machinery and exit cleanly through a scope-drained gate.

**Acceptance Criteria**:
- [ ] `--tracking <ref>` starts the loop on the given task-list-bearing issue; the ref is printed at startup and recorded in the ledger header.
- [ ] `--new "<title>"` presents the drafted tracking issue for operator approval before creation; only after approval is the issue created and the loop started on it.
- [ ] When every task-list ref is terminal, a **scope-drained gate** fires with options `Add more work` / `Keep watching` / `Finish (close tracking issue + summary)`; closing the tracking issue is itself gated (outward-facing).
- [ ] The run summary lists every processed ref with disposition and reports scope growth (`started with N, added M, completed K`).

### US3: Concurrent-tab isolation

**As an** operator running multiple auto conversations in parallel tabs against the same repo,
**I want** each session's monitored set strictly bounded to its own tracking ref's live task list,
**So that** concurrent runs never cross-contaminate ledgers or process each other's refs.

**Acceptance Criteria**:
- [ ] Two concurrent tabs on the same repo with distinct tracking issues run to completion without either ledger referencing the other's refs.
- [ ] The playbook never widens scope beyond its own tracking ref; isolation between sessions is otherwise a property of engine architecture (distinct MCP processes / per-ref event buses).

## Functional Requirements

| ID | Requirement | Priority | Notes |
|----|-------------|----------|-------|
| FR-001 | `auto.md` documents three invocation forms: existing `/cockpit:auto <epic-ref>` (unchanged), `/cockpit:auto --tracking <issue-ref>`, and `/cockpit:auto --new "<title>"`. `--new` gates on operator approval of the drafted tracking issue before creation and loop start. The tracking ref is printed at startup and recorded in the ledger header. | P1 | Ledger-header identity is the run's stable ID across restarts. |
| FR-002 | Add-issue flow (both modes) recognises operator instructions of the form "also process <ref>" / "file an issue for <bug> and process it". Existing-issue path: no gate — `scope-add` → `queue` → ledger. New-issue path: **filing gate** (draft shown in full, approve/edit/skip per #400) → `create` → `scope-add` → `queue` → ledger. | P1 | The operator's mid-run instruction is itself the approval for the existing-issue path. |
| FR-003 | The first-sight event emitted by #935 confirms scope membership and hands the issue to the standard dispatch table. D.10 must not fire on the first-sight event shape — either a dedicated dispatch row is added or the event folds into a D.9-class row, aligning with whatever event shape #935 pins. | P1 | Depends on #935 shipping first; final wiring written against its verb/tool contract. |
| FR-004 | The D.8 phase-queue gate's presentation enumerates every open ad-hoc ref currently in scope. Queueing the next phase while ad-hoc work is open remains **possible** but never **silent** — the gate text names each open ref and the operator decides. Recommended default when ad-hoc issues are open: hold. | P1 | Epic mode only. |
| FR-005 | Epic-less mode has no `epic-complete` event; instead the run reaches a **scope-drained gate** when every task-list ref is terminal. Gate options: `Add more work` / `Keep watching` / `Finish (close tracking issue + summary)`. Closing the tracking issue is gated (outward-facing). The run summary lists every processed ref with disposition. | P1 | |
| FR-006 | Restart semantics: a restarted session re-orients from the tracking ref's live task list. Scope survives restarts because it lives on the issue, not in session state; mutes and cursors remain session-local. | P1 | No new mechanism — existing restart principles applied to the tracking ref. |
| FR-007 | Ledger records scope mutations as first-class lines (e.g. `<ref> · scope-add · queued`). The run summary reports scope growth: `started with N, added M, completed K`. | P1 | |
| FR-008 | The playbook-verification suite (house `NNN-1` pattern) asserts: (a) all three invocation forms are documented; (b) the filing gate is present with #400 presentation shape; (c) the D.8 gate enumerates open ad-hoc refs; (d) the scope-drained gate exists with its three options. | P1 | |

## Success Criteria

| ID | Metric | Target | Measurement |
|----|--------|--------|-------------|
| SC-001 | Mid-epic bug filed via the filing gate is processed to merge without restarting the session | 1 successful end-to-end run | Manual run against a live epic — file a bug mid-run, observe it reach `merged`, confirm the next D.8 gate named it while open |
| SC-002 | Epic-less stabilization run drains scope and exits cleanly | Session processes ≥3 ad-hoc issues to terminal state and exits via the scope-drained gate with an accurate summary | Manual run — count processed refs, verify summary shows `started with N, added M, completed K` matching the ledger |
| SC-003 | Concurrent-tab isolation observed end-to-end | Two tabs on the same repo with distinct tracking issues — neither ledger references the other's refs | Side-by-side manual observation with tab-A ledger and tab-B ledger diffed |
| SC-004 | Playbook-verification suite passes | All four assertions green (invocation forms, filing gate, D.8 enumeration, scope-drained gate) | Automated `NNN-1` verification run |

## Assumptions

- `generacy-ai/generacy#935` ships first and exposes: (a) the scope primitive (a task-list-bearing issue whose membership is live), (b) `cockpit_scope_add` (or equivalent verb), and (c) a first-sight event shape this playbook can dispatch on.
- The existing D.1–D.11 dispatch machinery in `auto.md` is reusable per-issue without modification beyond the D.8 phase-gate presentation and a new first-sight dispatch row.
- Concurrent auto sessions on the same repo already run with distinct MCP server processes and per-ref event buses — isolation-by-construction is an engine property; the playbook's only isolation duty is to never widen scope beyond its own tracking ref.
- The #400 presentation shape (draft-in-full + approve/edit/skip batch gate) is the reusable template for the filing gate.

## Out of Scope

- Engine changes — all owned by generacy-ai/generacy#935.
- Multi-repo scope in one run beyond what full refs (`owner/repo#N`) in a task list already provide.
- Autonomy-policy changes.
- Any change to gate blocking semantics.

---

*Generated by speckit*
