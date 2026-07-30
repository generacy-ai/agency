# Feature Specification: cockpit:auto (--gates=ui) — Reuse Existing Pending Gates in Startup Sweep

**Branch**: `457-part-cockpit-remote-gates` | **Date**: 2026-07-24 | **Status**: Draft
**Issue**: [generacy-ai/agency#457](https://github.com/generacy-ai/agency/issues/457)
**Epic**: Cockpit Remote Gates (generacy-ai/generacy-cloud#850)
**Design**: [docs/cockpit-remote-gates-plan.md](https://github.com/generacy-ai/tetrad-development/blob/develop/docs/cockpit-remote-gates-plan.md)

## Summary

When `/cockpit:auto --gates=ui` starts in a new conversation (after the prior one was stopped/closed, or after a cluster restart), its **startup sweep** re-derives pending gates from live GitHub label state and re-dispatches each `D.n` in full. The subagent drafting (clarification drafter, review-verdict analyzer, etc.) runs **before** `cockpit_gate_open`, and no cross-session dedup exists — so operators receive **duplicate gates** in the inbox for issues whose gates are already pending, and the expensive drafting work is repeated.

This spec introduces a **pre-draft existing-gate check** at the top of every `D.n` drafting gate on **both the sweep path and the live (in-session, event-driven) path** — because sweep-synthesized and live events share the same D.n dispatch rows (`auto.md:184`), a "sweep-only" scope would require inventing a per-dispatch provenance flag that does not exist. If a matching gate is already `open`/unanswered in the operator inbox at the current `gateId`, the dispatch **skips the subagent spawn** and re-attaches to the existing gate (recording it in `openGates`). If a matching gate is present at a **different** `generation` (generation drift), the stale gate is acked `superseded` and a fresh gate is drafted. If a gate is present in `answered` state, the dispatch also skips drafting and records it, so downstream D.12 logic consumes the redelivered answer.

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
| FR-001 | On **both the sweep path and the live (in-session, event-driven) path**, every drafting gate (D.1, D.2, D.3, D.4, D.7, D.11) MUST call the durable gate-status query BEFORE spawning its drafting subagent. | P1 | Scope expanded to live path per Q2. Sweep-synthesized and live events share the same D.n dispatch rows (`auto.md:184`); a "sweep-only" flag does not exist in the playbook and would be strictly more complex than an unconditional check. |
| FR-002 | The gate-status query MUST use a `gateId` derived from the same content/SHA-based `generation` as the live path (not the hard-coded `generation=1` currently at `auto.md:198`). | P1 | Required so sweep-derived and live-derived `gateId`s match. |
| FR-003 | When the durable query returns an existing `open`/unanswered gate at the **same** `gateId` (i.e., matching `generation`), the dispatch MUST skip the drafting subagent spawn AND MUST record the existing gate in `openGates` so the session re-attaches to it. | P1 | |
| FR-004 | When the durable query returns no existing gate at the current `gateId`, the current draft-then-open flow MUST run unchanged. | P1 | Coalescing on concurrent racing opens is handled cloud-side by the Firestore `runTransaction` on `cockpitGates/{gateId}` (per Q4); a race in which both sides find "no existing gate" may result in one duplicated drafter spawn but never a duplicated inbox entry, and this residual duplicate-spawn is out of scope. |
| FR-005 | The playbook-verification test suite MUST pin the new pre-draft-check contract for every affected `D.n` gate by exact heading and rule strings. | P1 | Per CLAUDE.md — re-pin, do not weaken. |
| FR-006 | The sweep's `generation=1` default at `auto.md:198` MUST be replaced with the same content/SHA-derived generation used by the live path. | P1 | Prerequisite for FR-002. |
| FR-007 | When the durable query returns an **existing `open`/unanswered gate for the same `(issue, kind)` at a DIFFERENT `generation`** (generation drift), the dispatch MUST ack the stale gate via `cockpit_gate_ack(gateId, outcome: 'superseded')` with a detail string naming generation drift, then run the current draft-then-open flow to open a fresh gate. | P1 | Per Q1. `cockpit_gate_ack` already accepts `superseded` on non-terminal gates (`packages/generacy/src/cli/commands/cockpit/mcp/gates/schemas.ts:46-47`; cloud transitions any open|answered|delivered → terminal in `services/api/src/services/relay/message-handler.ts:934-980`). Drift is detected via `cockpit_gate_list({issueRef, gateType})` which returns each non-terminal gate's `generation` (`query-schemas.ts:58-72`). Re-attaching would apply a verdict computed against an old head SHA to current content — the correctness hazard D.12's supersession checks exist to prevent. |
| FR-008 | When the durable query returns a gate whose status is **`answered`** (which per the #1038 contract collapses cloud `answered`, `delivered`, and `applied`), the dispatch MUST skip drafting AND record the answered gate in `openGates` so downstream D.12 logic can consume the answer when it is (re-)delivered. | P1 | Per Q3. Recording in `openGates` is load-bearing, not cosmetic: D.12 step 1 acks any arriving gate-answer without a matching `openGates` entry as 'superseded (no record)' and drops it (`auto.md:762`). Consuming the answer inline (Q3 option B) is not viable — no layer of the #1038 query stack returns an answer payload (`query-schemas.ts:33-46`; `packages/orchestrator/src/services/cloud-gate-query-client.ts:68-77`). |
| FR-009 | The dispatch MUST include a **bounded escape hatch** for recorded `answered` gates that never produce a D.12 event: after N consecutive sweeps in which a recorded `answered` gate yields no D.12 event, ack it `superseded` and re-derive from labels. The value of N MUST be specified in the plan. | P1 | Per Q3 required follow-on. The MCP `answered` state conflates cloud `answered`, `delivered`, and `applied`, and `packages/generacy/.../cockpit-gate-delivery.ts:147-176` re-delivers only docs whose `status == 'answered' AND clusterId matches`. Without this hatch, a gate stuck at cloud `delivered` (or already `applied`) never produces a D.12 event and the issue is parked forever with no operator-visible signal. |
| FR-010 | D.11's existing in-memory `dispatched-issues` check (`auto.md:706`) MUST be RETAINED alongside the new durable check, as defense in depth. | P1 | Per Q5. The in-memory set does two things the durable check cannot: (a) coalesces the co-occurring label pair (`waiting-for:merge-conflicts` + `blocked:stuck-merge-conflicts`) that hashes to two different `gateId`s under the escalation generation discriminator (`auto.md:1360`); (b) preserves Skip-as-session-mute semantics (`auto.md:717-718, :1636`) that no durable gate query can express since Skip never touches labels. |

## Success Criteria

| ID | Metric | Target | Measurement |
|----|--------|--------|-------------|
| SC-001 | Duplicate gates opened per restart, for issues with a pending gate | 0 | Manual verification via operator inbox across stop→new-conversation restart and cluster restart. |
| SC-002 | Drafting subagent spawns for issues with an **existing open gate at the current `gateId`** (measured on both sweep and live paths) | 0 | Log inspection / subagent invocation count. Explicitly does NOT cover the concurrent-race case in which two sweeps both observe "no existing gate" and both draft before either opens — that residual duplicate-drafter spawn is coalesced cloud-side by the `runTransaction` on `cockpitGates/{gateId}` (per FR-004) and is out of scope for this metric. |
| SC-003 | Coverage of pre-draft-check contract in `playbook-verification.test.ts` | 100% of affected `D.n` gates (D.1, D.2, D.3, D.4, D.7, D.11) | Test file assertions. |
| SC-004 | Verified scenarios | `clarification` (D.1) and `implementation-review` (D.3) both pass end-to-end across a stop→new-conversation restart and a cluster restart | Manual dogfood verification. |
| SC-005 | Answered-gate parked-forever failure mode (FR-009 escape hatch) | Recorded `answered` gates that never produce a D.12 event are acked `superseded` after N sweeps (N specified in the plan) and the issue re-derives from labels | Log inspection / integration test simulating a gate stuck at cloud `delivered` or `applied`. |

## Assumptions

- The read-only gate-status MCP tool and its route (dependency generacy-ai/generacy#1038) will be available before this work merges — this spec assumes it as a hard prerequisite.
- The durable, GitHub-derived `generation` value returned by the new gate-status query is stable enough that sweep-derived and live-derived `gateId`s coalesce **when the underlying content has not changed**. When content HAS changed, generations differ by design and FR-007 applies (supersede-and-redraft).
- Operator inbox state (durable gate docs — `open` or `answered`/`delivered`/`applied`) is authoritative — a gate present there is treated as the source of truth over any in-memory session state.
- Cloud-side coalescing of concurrent `handleGateOpen` calls on identical `gateId` is guaranteed by the Firestore `runTransaction` on `organizations/{orgId}/cockpitGates/{gateId}` (verified: generacy-cloud `services/api/src/services/relay/message-handler.ts:779-796, :823-885`). Client-side leases/locks are therefore not required for gate uniqueness.
- The MCP `answered` status collapses cloud `answered`, `delivered`, and `applied` per the #1038 contract; the durable query does NOT return the answer payload, and any consumption must go through the existing D.12 redelivery path.

## Dependencies

- **Blocking**: generacy-ai/generacy#1038 — read-only gate-status query (MCP tool + route) with stable durable-GitHub-derived `generation`.
- **Sibling epic**: generacy-ai/generacy-cloud#850 — Cockpit Remote Gates.
- **Follow-up filed from**: generacy-ai/agency#450 (`--gates=ui` dogfood run).

## Out of Scope

- Persisting `openGates` or `dispatched-issues` to disk — the fix relies on the durable inbox query, not on local persistence.
- Redesigning the drafting subagent architecture — only the *order* of check-vs-spawn changes.
- Non-UI-mode paths (`--gates=cli`, `--gates=none`) — this bug is specific to UI-mode dispatch behavior.
- Changes to gate content, gate-open payload shape, or the drafting outputs themselves.
- Client-side lock/lease primitives for concurrent-sweep coalescing — cloud-side transactional coalescing on `cockpitGates/{gateId}` is authoritative (see Assumptions and FR-004). One duplicated drafter spawn in the rare both-found-absent race window is accepted.
- Extending the #1038 gate-status query to return the answer payload — Q3 established that this is new work outside the scope of this spec; consumption of `answered`-state answers goes through the existing D.12 redelivery path (FR-008) with the FR-009 escape hatch as safety net.

---

*Generated by speckit — enhanced from generacy-ai/agency#457*
