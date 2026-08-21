# Feature Specification: UI-mode remediation-limit gate (wire type + D.13 dispatch reachability)

**Branch**: `503-severity-major-p1-ui` | **Date**: 2026-08-21 | **Status**: Draft

## Summary

**Severity: major (P1).** UI-mode handling of the new remediation-limit gate is dead on arrival: auto.md D.13 Step 0 mandates `gateType = remediation-limit` on `cockpit_gate_status`/`cockpit_gate_open` (auto.md:1039-1040, drift set :335, discriminator table :1555), but the plugin's own `GateType` union lacks it (lib/gate-wire-types.ts:105-113) and the generacy MCP `GateTypeSchema` is a closed 8-value enum without it (tracked generacy-side as generacy-ai/generacy#1163). Every D.13 gate verb returns `invalid-args`, the pre-draft taxonomy aborts the event, and the cap gate never reaches the operator inbox. Local mode unaffected.

Also fix the two dispatch gaps that leave the gate unreachable even in local mode after a restart:
- **Startup sweep can't recover a parked remediation-limit issue**: the synthetic-event sweep covers only D.1–D.9 (auto.md:349) and the UI-mode extended trigger set (:355-356) omits D.13 — restarting auto with an issue at `waiting-for:remediation-limit` leaves it invisible until an unrelated event fires (the label never re-fires on its own).
- **D.10 contradiction**: D.10's trigger is "any state token not matching D.1–D.9c or D.11" (auto.md:1014 clause d) — read literally, `waiting-for:remediation-limit` routes to unknown-state escalation, contradicting D.13's own ":1032 MUST be recognized" invariant. Extend the enumeration.

Coordinate with generacy-ai/generacy#1163 so both schema sides land before UI-mode dogfood; re-pin affected playbook-verification rows (500-5, 500-7, 500-9).


---
Filed from a post-merge code review of epic generacy-ai/generacy#1120 / agency#500. Part of follow-up epic generacy-ai/generacy#1153. auto.md refs at agency develop 1455ce5; engine refs at generacy develop 155b3464.

## User Stories

### US1: Remediation-limit gate reaches the operator inbox in UI mode (Priority: P1)

**As an** operator running `/cockpit:auto` in UI mode,
**I want** an issue that hits `waiting-for:remediation-limit` to surface a gate in my operator inbox,
**So that** I can adjudicate the remaining findings when the engine's remediate loop exhausts its retry cap instead of the event silently aborting.

**Why this priority**: This is the dead-on-arrival defect. Without `remediation-limit` in the wire `GateType` union, every D.13 gate verb (`cockpit_gate_status` / `cockpit_gate_open`) returns `invalid-args`, the pre-draft taxonomy aborts the event, and the cap gate never appears. The feature is unusable in UI mode.

**Independent Test**: Drive an issue to `waiting-for:remediation-limit` under UI mode with `runIdEnabled` both true and false; confirm `cockpit_gate_status`/`cockpit_gate_open` accept `gateType: remediation-limit` and a gate appears in the inbox with the remaining findings.

**Acceptance Scenarios**:

1. **Given** an issue at `waiting-for:remediation-limit` in UI mode, **When** the D.13 Step 0 pre-draft check runs, **Then** `cockpit_gate_status({ gateType: 'remediation-limit', ... })` returns a valid status (not `invalid-args`) and, on `absent`, the draft-then-open flow opens a gate carrying the remaining findings.
2. **Given** the plugin `GateType` union, **When** a developer references `remediation-limit`, **Then** the type checks without error and the discriminator comment block documents its generation discriminator.

---

### US2: Parked remediation-limit issue is recoverable after restart (Priority: P1)

**As an** operator who restarts `auto` while an issue sits at `waiting-for:remediation-limit`,
**I want** the startup synthetic-event sweep to pick that issue up,
**So that** the gate is not invisible until some unrelated event happens to fire (the label never re-fires on its own).

**Why this priority**: Even with the wire type fixed, a parked issue is unreachable across a restart because the sweep's trigger set omits D.13. This is a silent-stall path.

**Independent Test**: Park an issue at `waiting-for:remediation-limit`, restart `auto`, and confirm the startup sweep dispatches a D.13 gate (or adopts a prior-run one) without waiting for an unrelated event.

**Acceptance Scenarios**:

1. **Given** an issue parked at `waiting-for:remediation-limit`, **When** `auto` restarts and runs the startup sweep, **Then** the extended UI-mode trigger set includes D.13 and a `cockpit_gate_open` (or adoption) fires for that issue.

---

### US3: Remediation-limit is a recognized state, not unknown-state escalation (Priority: P1)

**As an** operator,
**I want** `waiting-for:remediation-limit` to route to D.13,
**So that** it never falls through to D.10 unknown-state escalation, which would contradict D.13's own "MUST be recognized" invariant.

**Why this priority**: D.10 clause (d) currently reads "any state token not matching D.1–D.9c or D.11" — read literally, `remediation-limit` routes to unknown-state escalation. This is an internal contradiction that must be resolved for the dispatch to be well-defined.

**Independent Test**: Confirm that with the D.10 enumeration extended, a `waiting-for:remediation-limit` line dispatches to D.13 and D.10 does not fire for it.

**Acceptance Scenarios**:

1. **Given** a `waiting-for:remediation-limit` doorbell line, **When** the loop classifies the transition, **Then** it matches the D.13 dispatch row and D.10's unknown-state escalation does NOT fire.

### Edge Cases

- **Schema-side coordination**: The generacy MCP `GateTypeSchema` is a closed 8-value enum without `remediation-limit` (tracked as generacy-ai/generacy#1163). Both schema sides MUST land before UI-mode dogfood, or gate verbs still reject the value at the MCP boundary even after the plugin union is fixed.
- **runId on/off**: The fix must hold under both `runIdEnabled === true` (four-input identity) and `runIdEnabled === false` (three-input, `runId` omitted).
- **Local mode**: Local mode is unaffected by the wire-type defect but the two dispatch gaps (startup sweep, D.10 enumeration) must be closed for local mode too.

## Requirements

### Functional Requirements

| ID | Requirement | Priority | Notes |
|----|-------------|----------|-------|
| FR-001 | The plugin `GateType` union (`lib/gate-wire-types.ts`) MUST include `remediation-limit`. | P1 | Union at :105-113; keep discriminator comment block in sync. |
| FR-002 | The generation-discriminator documentation MUST describe `remediation-limit`'s discriminator (PR head SHA + remediation counter, or remediation counter + remaining-findings hash) consistent with auto.md's discriminator table. | P1 | auto.md :1555 row. |
| FR-003 | The startup synthetic-event sweep's UI-mode extended trigger set MUST include D.13 so a parked `waiting-for:remediation-limit` issue is dispatched (or adopted) at startup. | P1 | auto.md :349, :355-356. |
| FR-004 | The D.10 unknown-state enumeration MUST be extended so `waiting-for:remediation-limit` matches D.13 and does not route to unknown-state escalation. | P1 | auto.md :1014 clause (d). |
| FR-005 | Changes MUST coordinate with generacy-ai/generacy#1163 so the plugin union and the MCP `GateTypeSchema` enum both admit `remediation-limit` before UI-mode dogfood. | P1 | Cross-repo dependency. |
| FR-006 | Affected `playbook-verification` rows 500-5, 500-7, 500-9 MUST be re-pinned to the new contract (per CLAUDE.md drift-audit rule: re-pin, never weaken). | P1 | playbook-verification.test.ts. |

### Key Entities

- **GateType (wire)**: The discriminated union the plugin passes on `cockpit_gate_status`/`cockpit_gate_open`; must gain the `remediation-limit` member.
- **D.13 dispatch row**: The auto.md playbook row that handles `waiting-for:remediation-limit`; already present but unreachable due to the wire-type and enumeration gaps.
- **remediation-limit gate**: The operator-inbox gate raised when the engine's remediate loop exhausts its retry cap, carrying the remaining findings in the body.

## Success Criteria

### Measurable Outcomes

| ID | Metric | Target | Measurement |
|----|--------|--------|-------------|
| SC-001 | D.13 gate verbs accepted | `cockpit_gate_status`/`cockpit_gate_open` with `gateType: remediation-limit` return valid results (no `invalid-args`) | UI-mode dispatch test at `waiting-for:remediation-limit`. |
| SC-002 | Gate reaches inbox | A remediation-limit gate with remaining findings appears in the operator inbox for a capped issue | End-to-end UI-mode run. |
| SC-003 | Restart recovery | Restarting `auto` with a parked `remediation-limit` issue dispatches/adopts a D.13 gate in the startup sweep | Restart test. |
| SC-004 | No unknown-state misroute | `waiting-for:remediation-limit` never triggers D.10 escalation | Classification test. |
| SC-005 | Both schema sides land | Plugin union and generacy `GateTypeSchema` both admit `remediation-limit` before dogfood | Cross-repo verification with generacy#1163. |
| SC-006 | Playbook pins re-pinned | Rows 500-5, 500-7, 500-9 assert the new contract and pass | `playbook-verification.test.ts` green. |

## Assumptions

- auto.md at develop `1455ce5` already contains the D.13 row and the `remediation-limit` discriminator-table entry; the work is closing the wire-type, sweep, and enumeration gaps, not authoring D.13 from scratch.
- The generation discriminator for `remediation-limit` is durable-state-derived (PR head SHA + remediation counter), consistent with the other gateTypes, so derived `gateId`s are stable across restart/takeover.
- generacy-ai/generacy#1163 is the coordinating counterpart and will land the MCP `GateTypeSchema` change.

## Out of Scope

- The engine-side remediate-loop cap logic that raises the gate (owned generacy-side).
- Local-mode behavior of the remediation-limit gate beyond the two dispatch-gap fixes (local mode is otherwise unaffected).
- Any new gateType beyond `remediation-limit`.
- The MCP `GateTypeSchema` enum change itself (tracked and delivered in generacy-ai/generacy#1163; this spec only depends on it).

---

*Generated by speckit*
