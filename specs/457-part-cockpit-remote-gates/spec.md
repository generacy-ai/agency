# Feature Specification: cockpit:auto (--gates=ui) — Reuse Existing Pending Gates in Startup Sweep

**Branch**: `457-part-cockpit-remote-gates` | **Date**: 2026-07-24 | **Status**: Draft
**Issue**: [generacy-ai/agency#457](https://github.com/generacy-ai/agency/issues/457)
**Epic**: Cockpit Remote Gates (generacy-ai/generacy-cloud#850)
**Design**: [docs/cockpit-remote-gates-plan.md](https://github.com/generacy-ai/tetrad-development/blob/develop/docs/cockpit-remote-gates-plan.md)

## Summary

When `/cockpit:auto --gates=ui` starts in a new conversation (after the prior one was stopped/closed, or after a cluster restart), its **startup sweep** re-derives pending gates from live GitHub label state and re-dispatches each `D.n` in full. The subagent drafting (clarification drafter, review-verdict analyzer, etc.) runs **before** `cockpit_gate_open`, and no cross-session dedup exists — so operators receive **duplicate gates** in the inbox for issues whose gates are already pending, and the expensive drafting work is repeated.

This spec introduces a **pre-draft existing-gate check** at the top of every `D.n` drafting gate on the sweep path. If a matching gate is already `open`/unanswered in the operator inbox, the session **skips the subagent spawn** and re-attaches to the existing gate (recording it in `openGates`) instead of re-drafting and opening a new one.

## Root Cause (as of `packages/claude-plugin-cockpit/commands/auto.md` at HEAD)

- Startup sweep re-derives pending gates from labels — `auto.md:174-202` (UI-mode re-open trigger set `:187-192`).
- Every drafting gate spawns its subagent **before** presenting the gate:
  - D.1 clarification drafter `:421` → gate `:428`
  - D.2 `:475` → `:482`
  - D.3 `:509` → `:516`
  - D.4 `:528` → `:535`
  - D.7 `:608` → `:624`
  - D.11 `:708` → `:715`
- Under UI mode, "present gate" == `cockpit_gate_open` (mapping table `:1335-1382`).
- Only D.11 has any pre-draft dedup, and it checks the **in-memory, session-scoped** `dispatched-issues` set (`:706`) — empty after a restart, so it cannot dedup across sessions. `openGates` is likewise not persisted (`:1424`).
- The sweep's idempotency claim (`:198`) relies on the cloud recognizing a duplicate `gateId`, but (a) even then the sweep still adds an entry to `openGates` rather than short-circuiting the draft, and (b) the `gateId` does not coalesce because the sweep hard-codes `generation=1` while the live path uses a content-derived generation.

## User Stories

### US1: Operator does not see duplicate gates after restart

**As an** operator running `/cockpit:auto --gates=ui`,
**I want** the startup sweep to reuse gates that are already pending in my inbox,
**So that** I do not receive duplicate gates for the same issue when my conversation restarts or the cluster restarts.

**Acceptance Criteria**:
- [ ] After stop → new-conversation restart, no duplicate gate appears in the operator inbox for any issue whose gate was already `open` and unanswered.
- [ ] After a cluster restart, the same holds.
- [ ] The startup sweep records the existing gate in `openGates` and continues awaiting its answer, exactly as if the gate had been opened in the current session.

### US2: Drafting subagents do not re-run on the sweep path when a gate is already open

**As a** cost-conscious operator,
**I want** expensive drafting subagents (clarification drafter, implementation-review verdict analyzer, etc.) to be skipped when their gate is already open,
**So that** compute is not wasted re-generating drafts an operator has already been shown.

**Acceptance Criteria**:
- [ ] On the sweep path, each `D.n` drafting gate performs a pre-draft check for an existing open gate keyed on a **durable** gate identity (not session-scoped in-memory state).
- [ ] When an existing open gate is found, no drafting subagent is spawned for that gate.
- [ ] When no existing open gate is found, the current draft-then-open flow runs unchanged.

### US3: Playbook-verification tests pin the new sweep contract

**As a** maintainer,
**I want** the playbook-verification test suite to pin the new pre-draft-check contract,
**So that** future edits to `auto.md` cannot silently re-introduce the duplicate-gate regression.

**Acceptance Criteria**:
- [ ] `packages/claude-plugin-cockpit/tests/playbook-verification.test.ts` asserts, by exact heading/rule strings, that each affected `D.n` gate performs the pre-draft check on the sweep path.
- [ ] Existing pins that conflict with the new contract are **re-pinned to the new contract** in the same PR (per CLAUDE.md rule — never weakened or deleted).

## Functional Requirements

| ID | Requirement | Priority | Notes |
|----|-------------|----------|-------|
| FR-001 | On the sweep path, every drafting gate (D.1, D.2, D.3, D.4, D.7, D.11) MUST call the durable gate-status query BEFORE spawning its drafting subagent. | P1 | Mirrors D.11's existing dedup at `auto.md:706`, but keyed on durable identity. |
| FR-002 | The gate-status query MUST use a `gateId` derived from the same content/SHA-based `generation` as the live path (not the hard-coded `generation=1` currently at `auto.md:198`). | P1 | Required so sweep-derived and live-derived `gateId`s match. |
| FR-003 | When the durable query returns an existing `open`/unanswered gate, the sweep MUST skip the drafting subagent spawn AND MUST record the existing gate in `openGates` so the session re-attaches to it. | P1 | |
| FR-004 | When the durable query returns no existing gate, the current draft-then-open flow MUST run unchanged. | P1 | |
| FR-005 | The playbook-verification test suite MUST pin the new pre-draft-check contract for every affected `D.n` gate by exact heading and rule strings. | P1 | Per CLAUDE.md — re-pin, do not weaken. |
| FR-006 | The sweep's `generation=1` default at `auto.md:198` MUST be replaced with the same content/SHA-derived generation used by the live path. | P1 | Prerequisite for FR-002. |

## Success Criteria

| ID | Metric | Target | Measurement |
|----|--------|--------|-------------|
| SC-001 | Duplicate gates opened per restart, for issues with a pending gate | 0 | Manual verification via operator inbox across stop→new-conversation restart and cluster restart. |
| SC-002 | Drafting subagent spawns on the sweep path for issues with an existing open gate | 0 | Log inspection / subagent invocation count during a restart sweep. |
| SC-003 | Coverage of pre-draft-check contract in `playbook-verification.test.ts` | 100% of affected `D.n` gates (D.1, D.2, D.3, D.4, D.7, D.11) | Test file assertions. |
| SC-004 | Verified scenarios | `clarification` (D.1) and `implementation-review` (D.3) both pass end-to-end across a stop→new-conversation restart and a cluster restart | Manual dogfood verification. |

## Assumptions

- The read-only gate-status MCP tool and its route (dependency generacy-ai/generacy#1038) will be available before this work merges — this spec assumes it as a hard prerequisite.
- The durable, GitHub-derived `generation` value returned by the new gate-status query is stable enough that sweep-derived and live-derived `gateId`s coalesce.
- Operator inbox state (`open`/unanswered gates) is authoritative — a gate present there is treated as the source of truth over any in-memory session state.

## Dependencies

- **Blocking**: generacy-ai/generacy#1038 — read-only gate-status query (MCP tool + route) with stable durable-GitHub-derived `generation`.
- **Sibling epic**: generacy-ai/generacy-cloud#850 — Cockpit Remote Gates.
- **Follow-up filed from**: generacy-ai/agency#450 (`--gates=ui` dogfood run).

## Out of Scope

- Persisting `openGates` or `dispatched-issues` to disk — the fix relies on the durable inbox query, not on local persistence.
- Redesigning the drafting subagent architecture — only the *order* of check-vs-spawn changes.
- Non-UI-mode paths (`--gates=cli`, `--gates=none`) — this bug is specific to UI-mode sweep behavior.
- Changes to gate content, gate-open payload shape, or the drafting outputs themselves.

---

*Generated by speckit — enhanced from generacy-ai/agency#457*
