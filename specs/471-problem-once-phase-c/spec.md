# Feature Specification: Startup sweep adopts pre-existing non-terminal gates instead of duplicating them across runs

**Branch**: `471-problem-once-phase-c` | **Date**: 2026-07-29 | **Status**: Draft
**Issue**: [generacy-ai/agency#471](https://github.com/generacy-ai/agency/issues/471)
**Depends on**: #469 (Phase C — per-run `runId` threading) must be deployed first
**Related**: repairs the accepted consequence documented in #469 spec "Assumptions → Behaviour change introduced by this phase"

## Summary

Once #469 (Phase C) threads a per-run `runId` into gate identity, a re-invocation of `/cockpit:auto` against the same tracking ref (context exhaustion, `Ctrl-C`, cluster restart, machine reboot — all routine) starts a new run with a new `runId`. The startup sweep's pre-draft `cockpit_gate_status` check derives a 4-segment key that includes the new `runId`, returns `absent` for gates opened by the previous run, and drafts duplicates. The prior run's gate is orphaned — no `openGates` entry tracks it, so an operator answer routes nowhere.

This feature changes the startup sweep to **adopt** pre-existing non-terminal gates for the tracking ref into `openGates` before drafting anything, using the run-agnostic `cockpit_gate_list({ issueRef, gateType: <omitted> })` surface. Adopted entries carry their **originating** `runId` and use it for `cockpit_gate_ack`, so `openGates` entries can no longer assume a single run-wide `runId`.

## Problem

`gateId` after #469 is `hash(issueRef, gateType, generation, runId)`. A re-invocation is definitionally a new run (per #469 FR-001, the ledger filename mints the `runId` at pre-flight). The failure trace:

1. Run 1 (`runId: R1`) opens gate **G1** for an issue. The operator has not answered it.
2. The session ends.
3. The operator re-invokes `/cockpit:auto <same-ref>` → new ledger file → `runId: R2`.
4. The startup sweep's pre-draft check asks `cockpit_gate_status({ issueRef, gateType, generation, runId: R2 })` → `absent`, because G1 carries `R1`.
5. A second gate **G2** is drafted. The operator sees two inbox gates for one decision. G1 is orphaned: no `openGates` entry in R2 tracks it, so answering it resolves no `dispatchClass` and routes nowhere.

This is the same duplicate-inbox-gate symptom generacy#1053 exists to eliminate, reintroduced by the mechanism that fixes it. #469's spec accepts this deliberately (Q6=C, no session-resume surface in that phase); this issue is the repair.

## Why this is cheap — the surface already exists and is deliberately runId-free

`cockpit_gate_list({ issueRef, gateType: <omitted> })` returns **every non-terminal gate** for a ref, regardless of run:

- It is runId-agnostic by construction. #469 Phase B accepts `runId` on `CockpitGateListInputSchema` for MCP-surface parity but the handler **drops it** before the cloud call, because the deployed cloud contract refines `runId requires generation` and list mode has no `generation`. (#469 FR-011.)
- Its rows now carry `runId` as a first-class field (generacy-cloud#892), so the sweep can see not just that G1 exists but which run owns it.
- The pre-flight capability probe already issues exactly this call shape (#469 FR-012), so the sweep is not introducing a new dependency.

## User Stories

### US1: Re-invoke after an unanswered gate — see one gate, not two

**As an** operator re-invoking `/cockpit:auto <tracking-ref>` after a prior run left a gate `open` (context exhaustion, `Ctrl-C`, cluster restart),
**I want** the startup sweep to adopt the prior run's gate rather than drafting a duplicate,
**So that** my inbox shows one gate per natural decision and my answer routes to the right handler instead of being ignored.

**Acceptance Criteria**:
- [ ] After a re-invocation against a ref with an `open` prior-run gate, the inbox shows exactly one gate for that natural decision.
- [ ] The adopted gate appears in the new run's `openGates` with `dispatchClass` resolvable.
- [ ] Answering the adopted gate routes to the correct handler (no orphan).
- [ ] No second `cockpit_gate_open` fires for the natural gate the sweep adopted.

### US2: Adopted gate ack targets the originating run

**As** the auto skill acking an adopted gate that the operator has now answered,
**I want** `cockpit_gate_ack` to target the gate's **originating** `runId` (the run that opened it), not the current run's,
**So that** the ack lands on the key that actually exists in the cloud rather than being log-dropped for identity mismatch.

**Acceptance Criteria**:
- [ ] `cockpit_gate_ack` for an adopted gate carries the originating `runId` read from the `cockpit_gate_list` row, not the current run's `runId`.
- [ ] `openGates` entries no longer assume a single run-wide `runId`; each entry carries its own.
- [ ] Ack of an adopted gate succeeds (gate transitions to terminal on both cloud and cluster).

### US3: `cockpit_gate_list` stays runId-agnostic

**As** the sweep author relying on `cockpit_gate_list` to see cross-run gates,
**I want** `cockpit_gate_list` to remain runId-agnostic by default (functional call omits `runId`; the pre-flight capability probe from #469 FR-012 is the sole exception),
**So that** the adoption path is not silently foreclosed by a future "improvement" to list-mode filtering.

**Acceptance Criteria**:
- [ ] The adoption sweep's `cockpit_gate_list` call carries no `runId` field.
- [ ] Adding default `runId` filtering to `cockpit_gate_list` (generacy-cloud#894) would break the adoption sweep; the spec pins this dependency so the constraint survives a schema refactor.

### US4: `--gates=local` is unaffected

**As an** operator using `/cockpit:auto --gates=local`,
**I want** the local-gates path to remain identical to today,
**So that** offline / cluster-only workflows continue working with no cloud dependency.

**Acceptance Criteria**:
- [ ] `--gates=local` runs issue zero `cockpit_gate_list` calls on the adoption path (as today; the whole adoption pass is UI-mode only).
- [ ] No adoption logic runs under `ResolvedGateMode === "local"`.

## Functional Requirements

| ID | Requirement | Priority | Notes |
|----|-------------|----------|-------|
| FR-001 | On startup, before drafting any gate, the sweep MUST call `cockpit_gate_list({ issueRef: <tracking-ref>, gateType: <omitted> })` exactly once per tracking ref and enumerate every returned non-terminal row. | P1 | Runs after #469's pre-flight capability probe, before the sweep's synthetic-event pass and before any D.n Step-0 pre-draft check. |
| FR-002 | For each returned non-terminal row whose `(issueRef, gateType, generation)` matches a natural gate the current run's sweep would draft, the sweep MUST adopt the row into `openGates` instead of drafting a duplicate. | P1 | Adoption prevents the duplicate-inbox-gate regression. |
| FR-003 | An adopted `openGates` entry MUST carry the originating `runId` read from the list row's `runId` field. `cockpit_gate_ack` for that entry MUST target the originating `runId`, not the current run's. | P1 | The list row's `runId` field is guaranteed by generacy-cloud#892. |
| FR-004 | `openGates` entries no longer assume a single run-wide `runId`; every entry MUST carry its own. Adopted entries carry the originating `runId`; entries opened by the current run carry the current run's `runId`. | P1 | Structural change to `openGates` record shape. |
| FR-005 | The sweep's `cockpit_gate_list` call in FR-001 MUST NOT carry a `runId` field. `cockpit_gate_list` remains runId-agnostic on the adoption path. | P1 | Reinforces #469 FR-011. generacy-cloud#894 (list-mode `runId` filtering) MUST stay strictly opt-in; if it became the default, this repair would be foreclosed before it is built. |
| FR-006 | The adoption pass MUST run only under `ResolvedGateMode === "ui"`. Under `local`, this block is dead prose (`cockpit_gate_list` is not called; no adoption occurs). | P1 | Matches #469 FR-007's local-invariance stance. |
| FR-007 | Adoption applies to non-terminal gates only. `cockpit_gate_list` already excludes terminal statuses by construction. Statuses in scope: `open`, `answered`. | P1 | Terminal gates (`applied` / `superseded` / `failed` / `expired`) are invisible to list. |
| FR-008 | An adopted entry MUST include enough fields for the current run to ack it and route an answer: at minimum `gateId`, `issueRef`, `gateType`, `generation`, `status`, `runId` (from the list row), and `dispatchClass` (derived from `gateType` + `generation`, same rule the current-run sweep uses). Fields not returned by `cockpit_gate_list` (`inboxUrl`, `title`, `askedAt`, `originalDraft`) are unavailable and treated as the same DATA GAP the reuse path already tolerates. | P1 | `cockpit_gate_list` returns `{ gateId, gateType, generation, status, runId }`. The current-run sweep already derives `dispatchClass` from `gateType` + `generation`; the adoption path uses the same derivation. |
| FR-009 | If `cockpit_gate_list` returns a non-terminal row whose `(gateType, generation)` does NOT match any natural gate the current run's sweep would draft, [NEEDS CLARIFICATION: adopt anyway (any non-terminal gate for the ref) OR skip (only gates the current run would have drafted)? Adopting broader keeps every prior-run inbox entry answerable; skipping keeps `openGates` scoped to what the current run understands.] | P2 | Trade-off in issue's "Scope of adoption" design question. |
| FR-010 | An adopted gate whose status is `answered` MUST be dispatched through the same answered-gate handling the current run uses for its own answered entries (the § "Answered-gate parked-forever escape hatch" block in `auto.md`). | P1 | Preserves an answer the operator may have already given (per issue's "Adopt or ack-and-redraft?" design question — adoption is the correct branch for status `open` and `answered`). |
| FR-011 | The `auto.md` prose describing the § step-3 startup sweep MUST be updated in the same PR as the code, naming the adoption pass explicitly and pinning it before the synthetic-event pass. The `openGates` record-shape section MUST be updated to document the per-entry `runId` field. | P1 | Same load-bearing-prose discipline as #469 FR-010; leaving stale prose is worse than no prose because it will be trusted. |
| FR-012 | An automated test MUST assert that, given a seeded non-terminal gate with `runId: R1`, a new run with `runId: R2` calling the startup sweep adopts the gate into its `openGates` with the row's `R1` preserved, issues zero duplicate `cockpit_gate_open` calls, and that a subsequent `cockpit_gate_ack` for the adopted entry carries `R1` on the wire. | P1 | Sole mechanism that catches silent regressions where a new dispatch path forgets to propagate the originating `runId`. |

## Success Criteria

| ID | Metric | Target | Measurement |
|----|--------|--------|-------------|
| SC-001 | Re-invocation-after-unanswered-gate deduplication | Re-invoking `/cockpit:auto <ref>` after a prior run left one gate `open` produces exactly one inbox gate for that natural decision, not two. | Integration test: seed a non-terminal gate under `runId: R1`, invoke a new run, assert inbox count = 1 for the natural decision. |
| SC-002 | Adopted-gate answer routes correctly | 100% of operator answers on adopted gates resolve a `dispatchClass` and dispatch to the correct handler. | Test: seed adopted gate of each `gateType`, answer it, assert dispatch runs. |
| SC-003 | Ack targets originating `runId` | 100% of `cockpit_gate_ack` calls for adopted gates carry the originating `runId` from the list row, not the current run's `runId`. | Wire-log assertion in the test in FR-012. |
| SC-004 | `cockpit_gate_list` remains runId-agnostic | Zero `cockpit_gate_list` calls on the adoption path carry a `runId` field. | Log grep on integration test runs; static check on the sweep code path. |
| SC-005 | `--gates=local` invariance | Zero `cockpit_gate_list` calls fire under `--gates=local`. | Log grep on a `--gates=local` run. |
| SC-006 | No duplicate `cockpit_gate_open` for adopted natural gates | Given a seeded non-terminal gate matching a natural gate the current run would draft, the sweep issues zero `cockpit_gate_open` for that natural gate. | Integration test wire-log assertion. |
| SC-007 | Ack success on adopted gate | 100% of ack attempts for adopted gates transition the gate to terminal on both cloud and cluster (no log-drop for identity mismatch). | End-to-end test against the cloud emulator. |

## Assumptions

- #469 (Phase C) is deployed and every `cockpit_gate_open` / `cockpit_gate_ack` carries a `runId`.
- `cockpit_gate_list` returns rows with `runId` as a first-class field (generacy-cloud#892 deployed).
- `cockpit_gate_list` remains runId-agnostic by default; generacy-cloud#894 (optional list-mode `runId` filtering) is strictly opt-in.
- The current run's sweep already derives `dispatchClass` from `(gateType, generation)`; the adoption path reuses that derivation without introducing new mapping logic.
- Terminal gates (`applied` / `superseded` / `failed` / `expired`) are invisible to `cockpit_gate_list` and therefore never adopted.
- `openGates` becoming per-entry `runId`-carrying is a **local structural change** to the auto session's in-memory record — no on-wire or on-disk schema change beyond what #469 already introduces.

## Out of Scope

- Any change to how `runId` is derived, threaded, or passed on the write side (that is #469).
- Any change to `cockpit_gate_list` / `cockpit_gate_status` MCP tool schemas (that is #469 Phase B / generacy).
- Any change to generacy-cloud storage of gate documents (that is #469 Phase A / generacy-cloud).
- Any change to the local-gates code path (`--gates=local`).
- Adding default `runId` filtering to `cockpit_gate_list` (generacy-cloud#894). That is a separate opt-in feature and MUST NOT become default while this adoption path depends on runId-agnostic list behaviour.
- Backfilling `runId` onto pre-#469 gates that predate the field.
- Session-resume semantics for `/cockpit:auto` itself; a re-invocation is definitionally a new run (per #469). This spec repairs cross-run gate visibility, not session identity.
- Rejected: ack-`superseded`-then-redraft. Simpler than adoption but throws away a pending decision and churns the inbox; not acceptable for `open` gates the operator may already be considering, and outright destructive for `answered` gates.
- Rejected: filtering `cockpit_gate_list` to only the current run's `runId`. That would foreclose the adoption path by construction.

## Provenance

Raised while answering #469 clarify batch 2 (Q6=C). Filed so the accepted consequence documented in #469's spec "Assumptions → Behaviour change introduced by this phase" has a tracked repair rather than living only as a spec note. See #469 spec lines 123–137 for the original write-up.

---

*Generated by speckit*
