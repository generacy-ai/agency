# Feature Specification: Thread run-scoped `runId` from `/cockpit:auto` into gate open/ack calls

**Branch**: `469-problem-cockpit-auto-only` | **Date**: 2026-07-29 | **Status**: Draft
**Issue**: [generacy-ai/agency#469](https://github.com/generacy-ai/agency/issues/469)
**Depends on**: generacy-cloud Phase A, generacy Phase B (both must be deployed first)
**Unblocks**: generacy#1053

## Summary

`/cockpit:auto` computes a per-run identity at pre-flight (the ledger timestamp) but never passes it downstream. Every `cockpit_gate_open` / `cockpit_gate_ack` call therefore derives an identical `gateId` from `issueRef:gateType:generation`, which is stable across runs by construction. Once a gate reaches a terminal status (`applied` / `superseded` / `failed` / `expired`) the cloud log-drops any re-open attempt, silently on both sides: the cluster gets a 202, the cloud emits only a `console.warn`, and the auto session hangs waiting for an answer that will never appear in the inbox.

This feature threads a **run-scoped `runId`**, derived from the existing ledger timestamp, into every `cockpit_gate_open` and `cockpit_gate_ack` call issued during an auto run. This is **Phase C** of a three-phase change (cloud storage → MCP read/query threading → caller wiring); the write-side runId is only safe to land after the read side already understands the field.

## Problem

`/cockpit:auto` is the only component that knows what a "run" is, and it never tells anyone. Every `cockpit_gate_open` / `cockpit_gate_ack` call goes out without a run discriminator, so gate identity is `issueRef:gateType:generation` — stable across runs by construction.

The consequence is generacy#1053: a gate that reached a terminal status permanently blocks its own re-open. Re-running the same epic phase derives an identical `gateId`, the cloud log-drops it as terminal, and the inbox correctly shows zero open gates while the auto session says the gate needs an answer. A grep for `runId` across the entire `claude-plugin-cockpit` package returns zero hits.

## Ordering — this is Phase C, and it is the switch

generacy#1059 declared steps 4–7 atomic. They are not, if the plumbing lands before the caller:

- **Phase A** (generacy-cloud): store `generation` as a doc field; accept an **optional** `runId` on both the write and read paths.
- **Phase B** (generacy): declare optional `runId` on `cockpit_gate_status` / `cockpit_gate_list` inputs and thread it through the query client.
- **Phase C** (this issue): actually start passing one.

A and B are both no-ops while nothing supplies a `runId`. This issue is where behaviour changes, and by the time it lands both sides already understand the field. **Do not land this before A and B are deployed** — a `runId` on the write side without the matching read side makes every `cockpit_gate_status` return `absent`, which breaks the pre-draft dedup invariant `auto.md:283` states verbatim and causes the drafting subagent to re-run on every wake, producing duplicate inbox gates.

## User Stories

### US1: Re-run a completed epic phase and see a fresh gate in the inbox

**As an** operator re-running an auto session against an epic whose previous run answered and applied a gate,
**I want** the new run to open a fresh gate that is visible in the inbox,
**So that** I can continue iterating on the epic instead of hitting a silent-block from a terminal-status gate whose identity collides with the new run's.

**Acceptance Criteria**:
- [ ] Re-running an epic/phase whose previous gate reached `applied` opens a NEW gate visible in the inbox (the generacy#1053 acceptance criterion).
- [ ] The new gate's identity differs from the terminal gate's identity in the `runId` component only.
- [ ] No `console.warn` "log-dropped as terminal" appears in the cloud logs for the re-open.

### US2: One run, one identity — end-to-end

**As** `/cockpit:auto` running an epic phase,
**I want** every gate verb I issue during this run to carry the same `runId`,
**So that** the ack targets the gate the open created, and the pre-draft `cockpit_gate_status` check finds the run's own gate rather than treating it as absent and re-drafting on every wake.

**Acceptance Criteria**:
- [ ] Every `cockpit_gate_open` and `cockpit_gate_ack` in one auto run carries the same `runId`.
- [ ] Every pre-draft `cockpit_gate_status` call in the six Step 0 blocks (D.1, D.2, D.3, D.4, D.7, D.11) also carries the run's `runId`.
- [ ] `cockpit_gate_open` and pre-draft `cockpit_gate_status` for the same natural gate in the same run derive the same `gateId`.
- [ ] A second wake for an already-open gate takes the Step 0 reuse branch, not the draft branch (proves pre-draft dedup coalesces the run's own writes).
- [ ] A mid-run MCP reconnect does not change the `runId`.
- [ ] The pre-draft dedup invariant (`auto.md:283`) continues to hold: `cockpit_gate_status` for a gate this run just opened returns non-`absent`.

### US3: Two runs, two identities

**As an** operator observing gate history for a given epic,
**I want** distinct auto runs to produce distinct gate identities,
**So that** the ledger, inbox, and gate documents remain mutually traceable during a post-mortem.

**Acceptance Criteria**:
- [ ] Two runs against the same epic/phase produce different `runId`s.
- [ ] The `runId` value corresponds 1:1 with the ledger filename timestamp for the same run.

### US4: `--gates=local` is unaffected

**As an** operator using `/cockpit:auto --gates=local`,
**I want** the local-gates path to remain identical to today,
**So that** offline / cluster-only workflows continue working with no cloud dependency and no runId field on any call.

**Acceptance Criteria**:
- [ ] `--gates=local` runs issue zero `cockpit_gate_open` / `cockpit_gate_ack` calls (as today).
- [ ] No `runId` appears anywhere on the local-gates path.

## Functional Requirements

| ID | Requirement | Priority | Notes |
|----|-------------|----------|-------|
| FR-001 | `/cockpit:auto` derives a run-scoped `runId` at pre-flight. The value on the wire is the **full ledger filename stem** verbatim: `<tracking-ref-slug>-<timestamp>` (e.g. `epic-1053-20260729T143012Z`), NOT the trailing timestamp alone. | P1 | Traceability: `runId` appears in gate documents and `cockpit_gate_list` rows (per generacy-cloud#892); only the full stem greps directly against `.generacy/cockpit/auto-runs/` and is self-describing to a post-mortem operator. Cross-epic `runId` collisions at the same second are cosmetic (not functional), because `issueRef` is already the leading key segment. |
| FR-002 | The `runId` is stable for the entire lifetime of one auto run (all wakes, all gate verbs, all subagent dispatches). | P1 | Must survive mid-run MCP reconnects. |
| FR-003 | The `runId` is distinct across separate auto runs, even against the same epic and phase. | P1 | Verified by comparing two consecutive runs. |
| FR-004 | Every `cockpit_gate_open` invocation in an auto run passes the current run's `runId`. | P1 | Spec FR-006 on generacy#1053. |
| FR-005 | Every `cockpit_gate_ack` invocation in an auto run passes the current run's `runId`. | P1 | Ack must target the same identity the open created. |
| FR-006 | The `runId` MUST NOT be sourced from a per-process or per-MCP-connection value (e.g. the rejected `INSTANCE_NONCE` from generacy#1055). | P1 | Cockpit MCP server is long-lived; per-process values are stable across runs — the opposite of what's needed. |
| FR-007 | The `--gates=local` code path issues no `cockpit_gate_open` / `cockpit_gate_ack` calls and therefore carries no `runId`. | P1 | Preserves today's local-only behaviour. |
| FR-008 | Landing order: this change MUST NOT ship before generacy-cloud Phase A (`runId` read/write acceptance) AND generacy Phase B (`runId` on `cockpit_gate_status` / `cockpit_gate_list` inputs) are deployed. | P1 | Otherwise `cockpit_gate_status` returns `absent` on the run's own gates and the drafting subagent duplicates inbox entries every wake. |
| FR-009 | Every per-event pre-draft `cockpit_gate_status` invocation in all six Step 0 blocks (D.1, D.2, D.3, D.4, D.7, D.11) MUST carry the current run's `runId`. | P1 | Without this, `cockpit_gate_open` derives a 4-segment key while pre-draft `cockpit_gate_status` derives a 3-segment one; every check returns `absent` and the drafting subagent re-runs on every wake, producing exactly the duplicate-gate regression this feature exists to eliminate. |
| FR-010 | `auto.md:283` prose MUST be updated in the same PR as the caller wiring to reflect the pre-draft check naming four inputs (`issueRef`, `gateType`, `generation`, `runId`) rather than three. | P1 | The line is the load-bearing contract for when two `gateId`s coalesce; leaving stale prose that says "the same three inputs" is worse than no prose because it will be trusted. |
| FR-011 | No functional `cockpit_gate_list` call in an auto run may carry `runId`. The pre-flight capability probe (FR-012) is the sole exception, and only because Phase B's handler drops the field before it reaches the cloud endpoint that would 400. | P1 | Phase B accepts `runId` on `CockpitGateListInputSchema` for surface parity only; the cloud contract refines `runId requires generation`, and the sweep probe has no `generation`. See generacy-cloud#894 for list-mode `runId` filtering as a separate concern. |
| FR-012 | On session start, `/cockpit:auto` MUST run a pre-flight capability probe that extends the existing `cockpit_gate_list({ issueRef: <identity-ref>, gateType: <omitted> })` call with a `runId` field. If the strict schema returns `invalid-args`, disable `runId` threading for the entire session, log a startup warning naming the pre-#1067 cluster condition, and fall back to today's 3-input identity. If the probe passes, enable `runId` threading for the session. The decision is made ONCE at pre-flight and MUST NOT flip mid-run. | P1 | Probes `CockpitGateListInputSchema`, but the dependency in FR-009 is `CockpitGateStatusInputSchema`. Both live in `mcp/gates/query-schemas.ts` and both gained `runId` in commit `82077f1a` (Phase B / generacy#1067), so no deployment can split them. Mid-run flipping is forbidden because the startup sweep opens gates before any Step-0 check runs — reverting the read side after opens would orphan sweep-opened 4-segment gates for the rest of the session. |
| FR-013 | `runId` MUST NOT contain the `:` character. | P1 | `runId` is the trailing composite-key segment (`${issueRef}:${gateType}:${generation}[:${runId}]`), and `generation` may already contain colons (`spec-review:<sha>`, `sweep:needs-clarification:2`); a colon-bearing `runId` would make the tail ambiguous to anything parsing keys by position. Both candidate values today (full ledger stem, timestamp-only) are colon-free; pin the invariant so a future change to the ledger filename format cannot silently introduce one. |

## Success Criteria

| ID | Metric | Target | Measurement |
|----|--------|--------|-------------|
| SC-001 | Re-run terminal-gate resurrection | Re-running an epic phase whose previous gate reached `applied` produces a new inbox-visible gate on the first attempt. | Manual: run auto against a completed epic phase, observe fresh gate in inbox. Automated: integration test seeded with a terminal gate. |
| SC-002 | Within-run gate identity stability | 100% of `cockpit_gate_open` / `cockpit_gate_ack` calls in a single auto run share the same `runId`. | Log inspection / test assertion across a full run trace. |
| SC-003 | Across-run gate identity distinctness | 100% of consecutive-run pairs against the same epic/phase produce distinct `runId`s. | Compare ledger filenames and gate documents between two runs. |
| SC-004 | Mid-run reconnect stability | `runId` value unchanged after an MCP-connection restart mid-run. | Force MCP reconnect during a test run; assert `runId` unchanged in the next gate call. |
| SC-005 | `--gates=local` invariance | Zero occurrences of `runId` in `--gates=local` traces. | Log grep on a `--gates=local` run. |
| SC-006 | Silent-block regression prevention | Zero `console.warn` "log-dropped as terminal" entries in cloud logs when re-running a completed epic phase. | Cloud log audit over a re-run window. |
| SC-007 | Pre-draft dedup coalescing under `runId` | A second wake for an already-open gate in the same run takes the Step 0 reuse branch (not the draft branch); zero duplicate inbox gates against the same natural-gate identity within one run. | Integration test: force two wakes for the same gate; assert exactly one `cockpit_gate_open`, one inbox entry, and the second wake logs "gate exists, reusing". |
| SC-008 | Pre-#1067 cluster graceful fallback | On a cluster where `CockpitGateStatusInputSchema` does not accept `runId`, the pre-flight probe disables `runId` threading for the whole session, logs the startup warning once, and completes the run using 3-input identity — no mid-run identity flip, no orphaned gates. | Test against a stubbed pre-#1067 MCP server; assert one warning at startup, zero `runId` fields on any subsequent gate call, and no mid-run reversion. |
| SC-009 | `runId` colon-free invariant | Zero occurrences of `:` in any observed `runId` on the wire. | Static assertion in the pre-flight `runId` derivation code path; log-grep assertion in test runs. |

## Assumptions

- Generacy-cloud Phase A is deployed and accepting an optional `runId` on both write (`cockpit_gate_open` / `cockpit_gate_ack` handlers) and read (`cockpit_gate_status` / `cockpit_gate_list` handlers) paths.
- Generacy Phase B is deployed: specifically, the cockpit MCP server is at or above commit `82077f1a` (generacy#1067), which added `runId` to `CockpitGateStatusInputSchema` and `CockpitGateListInputSchema` (both live in `mcp/gates/query-schemas.ts` and both gained the field in the same commit, so no deployment can split them).
- Behaviour on a pre-#1067 cluster is well-defined by FR-012: the pre-flight probe fails closed at startup, `runId` threading is disabled for the entire session, a warning is logged once, and the run continues under today's 3-input identity (i.e. status quo, with generacy#1053 still unfixed for that session).
- The ledger filename stem (`<tracking-ref-slug>-<timestamp>`) is already computed at pre-flight, is unique across runs at second (or finer) granularity, and is colon-free by construction (slug is `/`→`-` with `#` stripped; timestamp is `YYYYMMDD-HHMMSS`).
- The cockpit MCP server is long-lived in the orchestrator container (a re-established design assumption from generacy#1055).
- Existing gate identity components (`issueRef`, `gateType`, `generation`) remain unchanged; `runId` extends the composite key rather than replacing any part of it. The full key shape is `${issueRef}:${gateType}:${generation}[:${runId}]`.

## Out of Scope

- Changes to `cockpit_gate_status` / `cockpit_gate_list` MCP tool schemas or query-client wiring (that is Phase B / generacy).
- Changes to generacy-cloud storage of gate documents or the `generation` field (that is Phase A / generacy-cloud).
- Any changes to the local-gates code path (`--gates=local`).
- Any change to how `generation` is derived, incremented, or stored.
- Backfilling existing terminal gates with a `runId`; existing gates remain as-is and the new field applies to new opens only.
- Introducing a `runId` on gate verbs beyond `cockpit_gate_open`, `cockpit_gate_ack`, and pre-draft `cockpit_gate_status` (per FR-009) — e.g. non-gate cockpit verbs.
- Adding `runId` to functional `cockpit_gate_list` calls. Per FR-011, `runId` is forbidden on `cockpit_gate_list` in this phase; list-mode `runId` filtering is tracked separately as generacy-cloud#894. The pre-flight capability probe (FR-012) is the sole exception and is only safe because Phase B's handler drops the field before it reaches the cloud endpoint.
- Rejected: sourcing `runId` from `INSTANCE_NONCE` or any per-process / per-MCP-connection value (see FR-006).
- Rejected: mid-run reversion from `runId` threading to 3-input identity (see FR-012 rationale — mixed-identity runs orphan sweep-opened gates).

## Provenance

Split from generacy#1059 (step 7). Depends on the generacy-cloud Phase A and generacy Phase B issues. Unblocks generacy#1053.

---

*Generated by speckit*
