# Feature Specification: D.12 foreign-run / out-of-scope gate-answer no-op guard

**Branch**: `519-symptom-when-gate-answer` | **Date**: 2026-09-04 | **Status**: Draft

## Summary

`auto.md` D.12 step 1 currently instructs the session: when a `gate-answer` event
arrives whose `event.gateId` has no matching record in `openGates`, ack it
`superseded (no record)`. Because the doorbell's answers-file source is
repo-scoped and replays history, a run routinely receives answers belonging to
*other* epics and *other* runs (sibling issues in the same repo). Followed
literally, this makes run A `cockpit_gate_ack(superseded)` a concurrent run B's
**live** gate record — and terminate historical records for epics that finished
weeks earlier.

In production (`Painworth/doc-intel`, 2026-09-02, run
`Painworth-doc-intel-93-20260902-204407`) three foreign gates were wrongly
superseded, and a concurrent run's live gate escaped only because the driving
model **improvised** an unspecified guard — reading the `runId` out of the
`gateKey` and choosing not to ack. The correct behaviour exists in production
transcripts but has **zero coverage** in the playbook.

This feature makes the guard explicit: an arriving `gate-answer` whose `gateKey`
names an issue outside the run's in-scope set, or whose `gateKey` `runId` segment
names a run other than this one, becomes a **logged no-op** — no
`cockpit_gate_ack`, no downstream dispatch. Only same-run / in-scope answers with
no record retain the existing `superseded (no record)` ack (a genuine startup
race or duplicate delivery). It is defence in depth: the source-side doorbell
scoping fix lands separately in this epic, but sessions running an older doorbell
must still not damage foreign records.

## User Stories

### US1: Concurrent runs do not damage each other's gates

**As a** cockpit operator running `/cockpit:auto` on multiple issues in the same
repo concurrently,
**I want** each run to ignore `gate-answer` events that belong to a different run
or issue,
**So that** one run never supersedes another run's live pending gate and my
answers land on the gate I actually answered.

**Acceptance Criteria**:
- [ ] A `gate-answer` whose `gateKey` `runId` segment ≠ this run's `runId` is a logged no-op — no `cockpit_gate_ack` is issued.
- [ ] A `gate-answer` whose `gateKey` issue is outside this run's in-scope set is a logged no-op — no `cockpit_gate_ack` is issued.
- [ ] A same-run, in-scope `gate-answer` with no `openGates` record still acks `superseded (no record)` (genuine startup race / duplicate delivery).

### US2: The no-op case is auditable

**As a** cockpit operator reviewing a run's ledger after the fact,
**I want** every ignored foreign/out-of-scope answer recorded verbatim,
**So that** I can distinguish "quietly dropped a foreign delivery" from "did
nothing / lost the event."

**Acceptance Criteria**:
- [ ] Each no-op writes exactly one ledger row naming the owning run: `foreign-run delivery — not acked (owner run: <runId>)`.
- [ ] The ledger vocabulary matches the shape the model already improvised in production, verbatim.

### US3: The guard cannot be silently edited away

**As a** maintainer of the cockpit playbook,
**I want** the D.12 no-op guard pinned by the playbook-verification suite,
**So that** a future edit to `auto.md` that removes or weakens the guard fails CI
instead of regressing silently.

**Acceptance Criteria**:
- [ ] A test in `packages/claude-plugin-cockpit/tests/playbook-verification.test.ts` pins the D.12 branch distinction and the verbatim ledger vocabulary.

## Functional Requirements

| ID | Requirement | Priority | Notes |
|----|-------------|----------|-------|
| FR-001 | D.12 step 1 MUST distinguish *no record, mine* (same run, in scope → ack `superseded (no record)`) from *not mine* (foreign run or out-of-scope issue → logged no-op, no ack, no downstream dispatch). | P1 | Core behaviour change. |
| FR-002 | The guard MUST derive "mine" from the `gateKey`'s `runId` segment (segment 4) compared against the run's pre-flight-derived `runId`, and "in scope" from the `gateKey`'s issue ref against the run's in-scope set. | P1 | Depends on FR-005 payload-shape documentation. |
| FR-003 | The no-op case MUST NOT call `cockpit_gate_ack` (neither `superseded` nor any other outcome) and MUST NOT invoke any downstream handler or dispatch. | P1 | This is the defect being fixed. |
| FR-004 | The no-op case MUST write exactly one ledger row using the verbatim vocabulary `foreign-run delivery — not acked (owner run: <runId>)`, where `<runId>` is the owning run read from the `gateKey` segment. | P1 | Matches the improvised production shape; preserves Invariant #8 one-line-per-dispatch. |
| FR-005 | The D.12 **Payload shape** section MUST document `gateKey` as a 4-segment composite key: `<owner>/<repo>#<issue>:<gateType>:<generation>:<runId>`, since the guard parses the `runId` segment. | P1 | Current text documents 3 segments; the trailing `runId` segment must be described. |
| FR-006 | The same-run / in-scope no-record path MUST retain the existing `superseded (no record)` ack and its ledger row unchanged. | P1 | Preserves the genuine startup-race / duplicate-delivery behaviour. |
| FR-007 | A test in the playbook-verification suite MUST pin (a) the two-way D.12 step 1 branch and (b) the verbatim no-op ledger vocabulary. | P1 | Per CLAUDE.md playbook-pin contract: re-pin to the new contract, never weaken. |

## Success Criteria

| ID | Metric | Target | Measurement |
|----|--------|--------|-------------|
| SC-001 | Foreign/out-of-scope `gate-answer` events that reach a session are acked. | 0 | Ledger inspection: no `superseded (no record)` row for a `gateKey` whose issue is out of scope or whose `runId` ≠ this run. |
| SC-002 | Foreign/out-of-scope `gate-answer` events are recorded. | 1 ledger row each | Ledger inspection: one `foreign-run delivery — not acked (owner run: <runId>)` row per ignored event. |
| SC-003 | Concurrent-run live gates survive a sibling run's replayed history. | 100% survive | No live gate belonging to run B is `superseded` by run A. |
| SC-004 | The guard is regression-protected. | Pass | `pnpm test` in `packages/claude-plugin-cockpit` fails if the guard branch or ledger vocabulary is removed. |

## Assumptions

- The `gateKey` down-path payload carries a 4th `runId` segment; the guard reads
  `runId` from that segment, not from the flat payload (which carries no
  `generation` and no standalone `runId` field per the frozen Shape 3).
- The run's in-scope issue set is available to D.12 at event-handling time (the
  loop already tracks scope for dispatch routing).
- `runId` was derived exactly once at pre-flight (compute-once invariant) and is
  available verbatim to D.12; the guard compares against that literal, it does
  not re-derive.
- This is a **documentation / playbook** change to `auto.md` plus a pinning test;
  it does not change any MCP tool implementation.

## Out of Scope

- The source-side doorbell scoping fix (repo-scoped answers-file replaying
  foreign history) — filed separately in this epic. This spec is defence in depth
  for the case where an out-of-scope answer still reaches a session, including
  sessions running an older doorbell.
- Any change to `cockpit_gate_ack` / `cockpit_gate_open` / `cockpit_gate_status`
  MCP tool behaviour or wire schema.
- The `--gates=local` byte-path (no `openGates`, no D.12 dispatch) — unaffected.
- Changes to D.12 steps 2–6 (stale-gate, live-state supersession, routing, ack,
  cleanup) beyond the step-1 branch split.

---

*Generated by speckit*
