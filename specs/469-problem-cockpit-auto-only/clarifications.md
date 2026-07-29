# Clarifications: Thread run-scoped `runId` from `/cockpit:auto` into gate open/ack calls

**Issue**: [generacy-ai/agency#469](https://github.com/generacy-ai/agency/issues/469)
**Branch**: `469-problem-cockpit-auto-only`

---

## Batch 1 — 2026-07-29

### Q1: Pre-draft `cockpit_gate_status` scope

**Context**: The spec's FR-004/FR-005 thread `runId` into `cockpit_gate_open` and `cockpit_gate_ack` only. But `auto.md:283` documents the pre-draft dedup invariant explicitly: every Step-0 `cockpit_gate_status({issueRef, gateType, generation})` check "names the same three inputs" as `cockpit_gate_open`, so live-derived and sweep-derived `gateId`s coalesce. If `runId` is threaded into the write side only, the identity split is:

| call | key derived | gateId |
|---|---|---|
| `cockpit_gate_open` (with `runId`) | `issueRef:gateType:generation:runId` | **A** |
| pre-draft `cockpit_gate_status` (3 inputs) | `issueRef:gateType:generation` | **B ≠ A** |

Every pre-draft check returns `absent`, Step 0 concludes no gate is open, the drafting subagent re-runs on every wake, and duplicate inbox gates accumulate against a `gateId` the loop never tracks. This is the exact regression `runId` was introduced to eliminate. FR-002's acceptance criterion "the pre-draft dedup invariant continues to hold" implies status is in scope, but the FR list doesn't say so.

**Question**: Should the per-event pre-draft `cockpit_gate_status` call in all six Step 0 blocks (D.1, D.2, D.3, D.4, D.7, D.11) also carry the run's `runId`?

**Options**:
- A: Yes — add FR-004b (or FR-009) requiring `runId` on every pre-draft `cockpit_gate_status` invocation in an auto run; add an AC to US2 asserting "a second wake for an already-open gate takes the Step 0 reuse branch, not the draft branch"; and assert `cockpit_gate_open` and pre-draft `cockpit_gate_status` for the same natural gate in the same run derive the same `gateId`.
- B: No — status stays 3-input; accept that the pre-draft dedup invariant is intentionally relaxed for this phase and duplicates will be tolerated (please justify).
- C: Something else — please specify.

**Answer**: *Pending*

---

### Q2: `cockpit_gate_list` exclusion

**Context**: Phase B (generacy#1067, merged `82077f1a`) added `runId` to `CockpitGateListInputSchema` for MCP-surface parity, but the handler drops it before the cloud call. The deployed cloud contract refines `runId requires generation`, and the pre-flight sweep probe (`cockpit_gate_list({issueRef, gateType: <omitted>})`) has no `generation` — forwarding `runId` returns 400 and breaks the sweep's primary dedup primitive. List-mode `runId` filtering is separately tracked as generacy-cloud#894.

The spec's "Out of Scope" section does not mention `cockpit_gate_list`. Given the strict-schema-and-refinement failure mode, silence here is risky.

**Question**: Should the spec explicitly forbid threading `runId` into `cockpit_gate_list` (both the pre-flight probe and any other list call) as an in-scope constraint?

**Options**:
- A: Yes — add an explicit FR (e.g. FR-007b) stating "`cockpit_gate_list` MUST NOT carry `runId` during this phase" and add "adding `runId` to `cockpit_gate_list` calls" to Out of Scope with a pointer to generacy-cloud#894.
- B: No — leave unstated (implementer discretion / covered by "no change to schemas" clause).
- C: Something else — please specify.

**Answer**: *Pending*

---

### Q3: `auto.md:283` documentation update

**Context**: `auto.md:283` currently reads: "The pre-draft `cockpit_gate_status({issueRef, gateType, generation})` check … **names the same three inputs**, so sweep-derived and live-derived `gateId`s coalesce". This is load-bearing prose — a future reader consults it to decide whether two `gateId`s should coalesce. If Q1 is answered `A`, the pre-draft check names FOUR inputs, and the prose becomes actively misleading. Spec doesn't currently touch `auto.md`.

**Question**: Is updating `auto.md:283`'s prose (three → four inputs) part of this feature's deliverable?

**Options**:
- A: Yes — the doc line lands in the same PR as the caller wiring; add an FR requiring the prose to reflect the actual pre-draft check shape after Q1.
- B: No — spec ships without touching `auto.md`; the drift is filed as a follow-up doc issue.
- C: Only if Q1 = A (auto-yes when scope expands, auto-no otherwise).
- D: Something else — please specify.

**Answer**: *Pending*

---

### Q4: `runId` value shape

**Context**: FR-001 says `runId` is "sourced from the ledger filename timestamp (`<tracking-ref-slug>-<timestamp>`)". Read strictly, that string is the whole ledger filename stem — slug + timestamp. Two options give different semantics and observability:

- Full composite (`<tracking-ref-slug>-<timestamp>`): human-readable in cloud logs, embeds the epic/tracking-ref in every gate document; longer.
- Timestamp only (`<timestamp>`): compact, epic-agnostic; requires cross-referencing to reconstruct the run's target.

They also differ in edge cases: two runs against different epics in the same second are trivially distinct under the full composite; under timestamp-only they collide across epics (same second → same runId on unrelated gates). SC-003's "distinct across two consecutive runs against the same epic/phase" is satisfied by either, but SC-004's cross-epic implications are only satisfied by the full composite.

**Question**: What is the exact value of `runId` on the wire?

**Options**:
- A: Full composite `<tracking-ref-slug>-<timestamp>` — the ledger filename stem verbatim.
- B: Timestamp only — the trailing timestamp component of the ledger filename.
- C: Something else — please specify (e.g. hash of the composite).

**Answer**: *Pending*

---

### Q5: Runtime cluster prerequisite (Phase B strict-schema hazard)

**Context**: `CockpitGateStatusInputSchema` is `.strict()`, and `runId` was added to it only in Phase B (generacy#1067, `82077f1a`). If Q1 = A and this code runs against a cluster that has NOT yet picked up #1067, the pre-draft `cockpit_gate_status` call is a strict-schema violation → `invalid-args` on every pre-draft check, which fails closed into the same duplicate-drafting path this feature exists to eliminate. `cockpit_gate_open` / `cockpit_gate_ack` already accept `runId` (generacy#1055), so the open side would appear to work while the read side rejected — an asymmetric, confusing failure.

Spec's Assumptions section says "Generacy Phase B is deployed" but doesn't say what "deployed" means for a heterogeneous fleet, nor how the caller behaves if the assumption is violated.

**Question**: How should the spec pin the Phase-B prerequisite and the failure behaviour if it's violated?

**Options**:
- A: Preflight check — on session start, verify the connected cockpit MCP server is at ≥ #1067 (e.g. by version probe or capability advertisement); if not, refuse to enable `runId` threading for this session (fall back to 3-input identity) and log a startup warning. Add as an FR.
- B: Fail closed on first `invalid-args` — on the first pre-draft `cockpit_gate_status` returning `invalid-args`, disable `runId` for the remainder of the session and revert to 3-input identity, logging once. Add as an FR + AC.
- C: Assumption only — extend the Assumptions section to explicitly name commit `82077f1a` (or a version bound) and state behaviour is undefined if violated; no runtime guard.
- D: Something else — please specify.

**Answer**: *Pending*

---
