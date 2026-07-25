# Feature Specification: Cockpit Remote Gates — Pre-flight Functional Probe

**Epic**: Cockpit Remote Gates (generacy-ai/generacy-cloud#850)
**Related**: generacy-ai/generacy-cloud#877 (the deployment gap that exposed this)
**Branch**: `459-epic-cockpit-remote-gates` | **Date**: 2026-07-25 | **Status**: Draft

## Summary

`/cockpit:auto --gates=ui` pre-flight verifies that `cockpit_gate_status` and
`cockpit_gate_list` are bound to the session's MCP tool binding, but never verifies
that the surface behind those tools actually works. When the tools are registered
but the backing query endpoint is broken or absent, the loop starts, then hard-aborts
at every Step 0 pre-draft check, indefinitely. Add a one-shot functional probe at
pre-flight so `ui` runs fail fast with a clear operator-facing cause, and so `auto`
resolves to `local` instead of stalling in `ui`.

## Problem

`/cockpit:auto --gates=ui` pre-flight checks that `cockpit_gate_status` and
`cockpit_gate_list` are **bound to the session's MCP tool binding** (auto.md § step 3
startup sweep, tool-presence check). It never checks that the surface behind those tools
actually **works**.

So when the tools are registered but the backing query endpoint is broken or absent, the
run starts happily, then hard-aborts at **every single** Step 0 pre-draft check — per the
gate-query error taxonomy, which correctly forbids collapsing any error class to
`absent`. The loop keeps waking, keeps aborting, and dispatches nothing, indefinitely.

The operator sees a run that looks alive (doorbell armed, events draining, ledger rows
being written) but makes zero progress, with the real cause buried in per-event error
rows. Diagnosing it took a container-log dive and a hand-rolled curl against the cloud
API.

## How it surfaced (2026-07-25, cluster `snappoll-local-2`)

generacy#1038 shipped the cluster half of the gate-query surface; generacy-cloud never
implemented the endpoint it calls (`GET /api/clusters/:clusterId/cockpit/gates` → 404 →
`class: 'internal'`). Both tools were correctly bound, so pre-flight passed. Every
subsequent Step 0 aborted:

```
<issue-ref> · <transition-class> · pre-draft-check · error: internal — … · source: ui-gate
```

This is not hypothetical drift: the `--gates=ui` path has now peeled off nine distinct
latent wire/deployment bugs across generacy / generacy-cloud / agency, each of which
would have produced exactly this "registered but non-functional" shape.

## Proposal

Add a **functional probe** to `--gates=ui` pre-flight, after the tool-presence check and
before the startup sweep dispatches anything.

- Issue one cheap, read-only, side-effect-free `cockpit_gate_list` call — the tracking
  ref's own `issueRef` is a natural probe target (an empty `gates: []` is a perfectly
  good pass).
- **Pass** (`status: 'ok'`, any payload) → proceed; write one ledger line recording the
  probe result.
- **Fail** (any `status: 'error'`, any class) → take the existing § step-1 pre-flight
  fail path: ledger + a visible operator-facing line naming the observed class and
  detail + exit non-zero. **Do not** start the loop, and **do not** silently degrade to
  `local` — a `ui` run that quietly becomes `local` re-introduces the duplicate-drafting
  hazard the pre-draft check exists to remove, and the operator asked for UI gates.
- The printed line should name the likely cause and the workaround, e.g.:
  `gate-query surface unavailable (class: internal) — the cluster's gate-query endpoint
  is not answering. Re-run with --gates=local, or fix the cluster/cloud deployment.`

`--gates=auto` resolution should use the same probe as its second condition: today it
checks "`cockpit_gate_open` bound AND cluster cloud-activated → ui". A cluster whose
query surface 404s satisfies both and resolves to `ui`, which then stalls. Folding the
probe into the `auto` check makes it resolve to `local` and keep working — which is the
correct behavior for the default mode.

## Design notes / constraints

- **One probe per run**, at pre-flight only. Do not re-probe per event — the per-event
  error taxonomy already handles mid-run outages (`query-unreachable` aborts that event
  and retries on the next natural wake). This is about failing fast at startup, not
  about health-checking the loop.
- **Read-only.** `cockpit_gate_list` mutates nothing (generacy#1038 FR-012, observer
  independence), so the probe is safe to run unconditionally under `ui`.
- **Do not probe under `local`.** The two query tools are not required there and a
  `local` run must never fail on a tool it never calls (auto.md § startup sweep).
- Keep the existing tool-presence check — it catches a pre-#1038 cluster before the probe
  would even have a tool to call.

## User Stories

### US1: UI-mode run fails fast on a broken gate-query surface

**As an** operator running `/cockpit:auto --gates=ui`,
**I want** the run to abort at pre-flight with a clear cause when the gate-query surface
is registered but non-functional,
**So that** I stop wasting a live loop on a cluster that will hard-abort every Step 0
and can diagnose the deployment gap without a container-log dive.

**Acceptance Criteria**:
- [ ] Pre-flight issues exactly one `cockpit_gate_list` probe after the tool-presence
      check and before any events dispatch.
- [ ] On probe failure, the operator sees a single line naming the error class and a
      suggested workaround, the ledger records the failure, and the process exits
      non-zero with no events dispatched.
- [ ] A `ui` run never silently degrades to `local` on probe failure.

### US2: Auto-mode resolution treats a broken surface as "not really ui"

**As an** operator running `/cockpit:auto` (default `--gates=auto`),
**I want** `auto` to resolve to `local` when the gate-query surface is broken, even if
the tools are bound and the cluster is cloud-activated,
**So that** the default mode keeps working on partially-deployed clusters instead of
stalling in `ui`.

**Acceptance Criteria**:
- [ ] `--gates=auto` folds the probe into its resolution as the second condition.
- [ ] When the probe fails, `auto` resolves to `local` and the run proceeds.
- [ ] The resolution is decided once at pre-flight and does not flip mid-run.

### US3: Local-mode is unaffected by the probe

**As an** operator running `/cockpit:auto --gates=local` on a cluster without any
gate-query surface,
**I want** the run to proceed without attempting the probe,
**So that** `local` mode remains usable on pre-#1038 clusters and never fails on a tool
it does not call.

**Acceptance Criteria**:
- [ ] Under `--gates=local`, no probe is attempted.
- [ ] Absence of `cockpit_gate_status` / `cockpit_gate_list` remains a non-error under
      `local`.

## Functional Requirements

| ID | Requirement | Priority | Notes |
|----|-------------|----------|-------|
| FR-001 | Under `--gates=ui`, pre-flight MUST issue exactly one read-only `cockpit_gate_list` probe after the tool-presence check and before the startup sweep dispatches. | P1 | Probe target: the tracking ref's own `issueRef`; empty `gates: []` is a pass. |
| FR-002 | Probe success (`status: 'ok'`) MUST write one ledger row recording the probe result and allow the run to proceed unchanged. | P1 | |
| FR-003 | Probe failure (any `status: 'error'`, any class) MUST write a ledger row, print one operator-facing line naming the observed error class and a suggested workaround, and exit non-zero with no events dispatched. | P1 | Reuses the existing § step-1 pre-flight fail path. |
| FR-004 | A `ui` run MUST NOT silently degrade to `local` on probe failure. | P1 | Preserves the duplicate-drafting guarantee of the pre-draft check. |
| FR-005 | `--gates=auto` resolution MUST fold the probe in as its second condition: `cockpit_gate_open` bound AND cluster cloud-activated AND probe passes → `ui`; otherwise → `local`. | P1 | |
| FR-006 | The `auto` resolution decision MUST be made once at pre-flight and MUST NOT flip mid-run. | P1 | |
| FR-007 | Under `--gates=local`, pre-flight MUST NOT attempt the probe. | P1 | |
| FR-008 | Under `--gates=local`, absence of `cockpit_gate_status` / `cockpit_gate_list` MUST remain a non-error. | P1 | Preserves auto.md § startup sweep contract. |
| FR-009 | The existing tool-presence check MUST be preserved and MUST run before the probe. | P1 | Catches pre-#1038 clusters before the probe would have a tool to call. |
| FR-010 | The probe MUST be issued at most once per run (no per-event re-probing). | P1 | Mid-run outages remain the responsibility of the per-event `query-unreachable` taxonomy. |
| FR-011 | `packages/claude-plugin-cockpit/tests/playbook-verification.test.ts` MUST pin the new pre-flight step ordering and both `ui`/`auto` probe branches by exact heading strings and contract rules. | P1 | Per CLAUDE.md: playbook pins are drift audits; re-pin, do not weaken. |

## Success Criteria

| ID | Metric | Target | Measurement |
|----|--------|--------|-------------|
| SC-001 | Broken gate-query surface produces a pre-flight abort, not a stalled loop. | 100% of runs against a cluster whose gate-query endpoint returns any non-`ok` status exit non-zero at pre-flight with no events dispatched. | Integration test: point `--gates=ui` at a stub cluster returning `class: 'internal'`; assert one probe call, one ledger row, one printed line, exit code non-zero, zero events dispatched. |
| SC-002 | Auto mode remains usable on partially-deployed clusters. | `--gates=auto` against a cluster with bound tools + cloud-activated flag but a broken query surface resolves to `local` and completes the run. | Integration test: same stub cluster as SC-001 with `--gates=auto`; assert resolution `local`, no probe-failure abort, run proceeds. |
| SC-003 | Diagnosis time for a broken query surface. | Operator can identify the cause from stdout alone (no container-log dive, no manual curl). | Manual verification: the printed line names the error class and the workaround verbatim. |
| SC-004 | Local mode is unchanged. | Zero probe calls under `--gates=local`; zero regressions in existing `local` startup-sweep tests. | Existing `local` tests continue to pass; new assertion that probe helper is never invoked when mode resolves to `local`. |
| SC-005 | Playbook drift is caught. | Playbook-verification tests fail if the pre-flight ordering or probe branches are removed or reordered. | Deliberately break each pinned heading/step in a scratch commit; assert each break produces a test failure. |

## Assumptions

- `cockpit_gate_list` is genuinely side-effect-free per generacy#1038 FR-012 (observer
  independence) and safe to call unconditionally at pre-flight under `ui`.
- The gate-query error taxonomy is stable: every non-`ok` return has a `class` field, and
  no class is collapsed to `absent` by the tool layer.
- The tracking ref's `issueRef` is always resolvable at pre-flight time (the run already
  requires it for later steps).
- The `--gates=auto` second condition ("`cockpit_gate_open` bound AND cluster
  cloud-activated") is the only current path to a `ui` resolution; no other resolver
  branch reaches `ui`.
- Ledger writes at pre-flight are cheap and cannot themselves fail the run.

## Out of Scope

- Per-event re-probing or continuous health-checking of the gate-query surface mid-run.
  Mid-run outages remain the responsibility of the existing per-event `query-unreachable`
  taxonomy.
- Retrying the probe or degrading gracefully on transient failures. One probe, one
  decision — retry policy belongs to the operator via re-invocation.
- Fixing the underlying generacy-cloud endpoint (generacy-ai/generacy-cloud#877). This
  spec makes the failure legible; it does not close the deployment gap.
- Changing the behavior of `cockpit_gate_list` itself, its transport, or the error
  taxonomy it returns.
- Auto-fallback from `--gates=ui` to `--gates=local`. Explicitly rejected — a `ui` run
  that silently becomes `local` re-introduces the duplicate-drafting hazard.
- Probing under `--gates=local` even as a diagnostic. A `local` run must never depend on
  the query surface.

---

*Generated by speckit*
