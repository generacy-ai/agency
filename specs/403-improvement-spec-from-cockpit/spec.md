# Feature Specification: Improvement spec from the cockpit v1

**Branch**: `403-improvement-spec-from-cockpit` | **Date**: 2026-07-11 | **Status**: Draft

## Summary

Improvement spec from the cockpit v1.5 auto-mode smoke test efficiency workstream (data: generacy-ai/tetrad-development#92, run-7 ledger). Companion to the generacy-side MCP/event-coalescing spec (filed separately); this issue is independently shippable and delivers the larger share of the win.

## Problem

A 12-issue epic run (snappoll, 2026-07-10) grew the auto session's context monotonically to ~508k tokens over 233 API turns — compaction-threshold territory for one small epic; a 30-issue epic would not fit. The census of the 2.9MB transcript:

| Component | chars | share |
|---|---|---|
| assistant thinking (179 blocks, retained) | 674k | 48% |
| tool results | 227k | 16% |
| tool inputs | 221k | 16% |
| task-notifications (~100 watch events) | 98k | 7% |
| assistant status prose | 97k | 7% |
| playbook injection (one-time) | 67k | 5% |

Subagent delegation is already healthy (29 agents; ~2.5k-char prompts + summary returns). The dominant cost is **per-event dispatch overhead**: every watch event — including transient no-ops like `phase:plan → phase:tasks` — triggered a full round of live-state re-check (Bash) + reasoning + status prose + ledger write ≈ 4–5k tokens of permanent context growth. Thinking volume is proportional to dispatch rounds, so reducing round weight/count attacks the 48% too.

## Changes (auto.md; clarify.md untouched)

1. **Ledger-only rows become cheap by contract.** For D.9-class transitions (ledger-only: transient `phase:*` movements, server-side-owned states, satisfied-gate resume artifacts): write the one mandatory ledger line and do **nothing else** — no `cockpit status` live-state re-check, no status table, no prose recap. The re-check exists to make *actions* idempotent; a row whose only action is a ledger line has nothing to protect. Re-check remains mandatory for every actionable class (D.1–D.8, D.10, D.11) exactly as today.
2. **Status recaps only at phase boundaries.** The run emitted a status table after most gates; between `phase-complete` events these restate known state. Permit the full epic table only on `phase-complete`, `epic-complete`, and escalation-gate presentations (where the operator needs orientation); everywhere else the ledger line is the record.
3. **Extend "analysis in subagents" to failure diagnosis (D.7/D.11).** Observed in-parent: the gh-2.96.0 merge-resolver root-cause hunt and the #4 base-sync forensics each ran many main-loop Bash+reasoning rounds. Rule: fetching the failure-alert evidence is parent work (one CLI call); anything beyond that — reproducing, reading logs, bisecting versions, inspecting branches — goes to a diagnosis subagent returning `{root_cause, evidence, recommended_action, confidence}` (same report-and-stop contract as the #390 review analyzers). The parent presents the escalation gate from the structured verdict.
4. **State the cost contract in the playbook's invariants** so it survives rewrites (the S6/decay-countermeasures pattern): "a transition that dispatches to a ledger-only row must add no tool calls beyond the ledger append and no prose; playbook edits that add per-event output are efficiency regressions."

## Explicitly unchanged

Mandatory ledger line per dispatch (transcript + file); startup sweep; live-state re-check for actionable rows; gate presentation content (#400's five-element display is operator-facing and stays); the never-content-filter rule for event consumption (agency#394) — change 1 alters what the session *does* per event, never which events it sees.

## Success criteria

- Transient/ledger-only event handling adds ≤1 tool call and no prose block (audit: transcript of the next comparable epic run).
- No epic status tables between phase boundaries except on escalation gates.
- Zero multi-command in-parent diagnostics; every D.7/D.11 gate presentation cites a subagent verdict.
- A comparable 12-issue epic completes in roughly half the context (~250k or less), measured from the session transcript's final cache-read size.

## Regression coverage

Playbook-verification suite (S6 pattern): D.9 section text asserts the no-re-check/no-prose contract; D.7/D.11 sections assert the diagnosis-subagent contract; invariants section contains the cost-contract line.


## User Stories

### US1: Ledger-only rows are cheap by contract

**As** the cockpit auto-mode session,
**I want** D.9-class ledger-only transitions to skip the live-state re-check and any prose/status output,
**So that** transient events (e.g. `phase:plan → phase:tasks`, server-side-owned state changes, satisfied-gate resume artifacts) stop adding ~4–5k tokens of permanent context per dispatch.

**Acceptance Criteria**:
- [ ] For every dispatch class currently marked ledger-only in `auto.md` (D.9 and equivalents), the handler performs exactly the ledger append and no other tool call.
- [ ] No status table, cockpit-status re-check, or prose recap is emitted on a ledger-only dispatch.
- [ ] Actionable classes (D.1–D.8, D.10, D.11) retain the live-state re-check unchanged.

### US2: Status recaps only at phase boundaries

**As** the human operator,
**I want** the full epic status table only when I need re-orientation,
**So that** the transcript does not restate known state after every gate.

**Acceptance Criteria**:
- [ ] Full epic status table appears only on `phase-complete`, `epic-complete`, and escalation-gate presentations.
- [ ] Between phase boundaries, the ledger line is the sole record of a dispatch.
- [ ] Escalation-gate presentations retain the #400 five-element display unchanged.

### US3: Failure diagnosis runs in subagents

**As** the auto-mode session,
**I want** any D.7/D.11 investigation beyond fetching the failure-alert evidence to be delegated to a diagnosis subagent,
**So that** multi-round Bash + reasoning traces do not accumulate in the parent transcript.

**Acceptance Criteria**:
- [ ] Parent performs exactly one CLI call to fetch failure-alert evidence.
- [ ] Any further work (repro, log reads, version bisection, branch inspection) is dispatched to a subagent.
- [ ] Subagent returns a structured verdict `{ root_cause, evidence, recommended_action, confidence }`.
- [ ] Parent presents the escalation gate directly from that verdict; no in-parent re-analysis.

### US4: Cost contract survives playbook rewrites

**As** a maintainer of `auto.md`,
**I want** the ledger-only cost contract stated in the playbook's invariants section,
**So that** future rewrites that add per-event output are recognized as efficiency regressions (S6/decay-countermeasures pattern).

**Acceptance Criteria**:
- [ ] Invariants section contains a line to the effect of: "a transition that dispatches to a ledger-only row must add no tool calls beyond the ledger append and no prose; playbook edits that add per-event output are efficiency regressions."
- [ ] The playbook-verification suite asserts the presence of that line.

## Functional Requirements

| ID | Requirement | Priority | Notes |
|----|-------------|----------|-------|
| FR-001 | `auto.md` D.9 (ledger-only) section states: no `cockpit status` re-check, no status table, no prose — only the mandatory ledger append. | P1 | Contract change; keeps the ledger line mandatory. |
| FR-002 | `auto.md` restricts the full epic status table to `phase-complete`, `epic-complete`, and escalation-gate presentations. | P1 | All other dispatches emit ledger line only. |
| FR-003 | `auto.md` D.7 and D.11 sections mandate a diagnosis subagent for any work beyond the first failure-alert fetch, and specify the `{root_cause, evidence, recommended_action, confidence}` return contract. | P1 | Mirrors the #390 review-analyzer report-and-stop contract. |
| FR-004 | `auto.md` invariants section contains the cost-contract line quoted in US4. | P1 | Ensures survival across rewrites. |
| FR-005 | Playbook-verification suite (S6 pattern) asserts: D.9 no-re-check/no-prose contract; D.7/D.11 diagnosis-subagent contract; invariants section cost-contract line. | P1 | Regression coverage. |
| FR-006 | `clarify.md` is not modified. | P1 | Explicitly scoped out. |
| FR-007 | Mandatory ledger line per dispatch (transcript + file), startup sweep, live-state re-check for actionable rows, #400 five-element gate display, and the never-content-filter rule (agency#394) are preserved. | P1 | Explicitly unchanged. |

## Success Criteria

| ID | Metric | Target | Measurement |
|----|--------|--------|-------------|
| SC-001 | Tool calls per transient/ledger-only event dispatch | ≤ 1 (the ledger append) | Audit next comparable epic run transcript. |
| SC-002 | Prose blocks per transient/ledger-only event dispatch | 0 | Audit next comparable epic run transcript. |
| SC-003 | Epic status tables between phase boundaries (excluding escalation gates) | 0 | Audit next comparable epic run transcript. |
| SC-004 | In-parent multi-command failure diagnostics | 0 (every D.7/D.11 gate cites a subagent verdict) | Audit next comparable epic run transcript. |
| SC-005 | Context growth for a 12-issue epic comparable to snappoll 2026-07-10 | ≤ ~250k tokens final cache-read size (≈ 50% of the 508k baseline) | Session transcript final cache-read size. |
| SC-006 | Playbook-verification suite passes with the three new assertions (D.9 contract, D.7/D.11 subagent contract, invariants cost-contract line). | Green | CI run of the verification suite. |

## Assumptions

- The current D.9 taxonomy in `auto.md` correctly identifies all ledger-only transition classes; if any actionable transition is currently misclassified as D.9, it must be re-classified before this contract change lands.
- The companion generacy-side MCP/event-coalescing spec is filed separately and does not depend on this issue landing first (this issue is "independently shippable").
- Subagent dispatch for diagnosis is already supported by the harness (as used by #390 review analyzers); no new infrastructure is required.
- The playbook-verification suite (S6 pattern) exists and can be extended with new assertions.

## Out of Scope

- Any changes to `clarify.md`.
- The companion generacy-side MCP/event-coalescing spec (filed separately).
- Changes to the mandatory ledger line format, startup sweep behavior, live-state re-check semantics for actionable rows, the #400 five-element escalation-gate display, or the never-content-filter rule for event consumption (agency#394).
- Reducing the volume of retained assistant thinking blocks directly — this spec attacks thinking indirectly by reducing dispatch rounds; further reductions are a separate workstream.
- Compaction / summarization strategy changes.

---

*Generated by speckit*
