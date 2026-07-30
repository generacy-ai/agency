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
- The printed line is a **single frozen template** with `<class>` / `<detail>`
  placeholders, pinned verbatim in `auto.md` and against a reference formatter in `lib/`
  (mirroring `formatPreDraftCheckErrorLine` — test 457-9a):
  `gate-query surface unavailable (class: <class>): <detail> — re-run with --gates=local,
  or fix the cluster/cloud gate-query deployment`
  All four gate-query error classes share this one template; any change to the wording
  requires re-pinning the playbook test.

`--gates=auto` resolution should use the same probe as its second condition: today it
checks "`cockpit_gate_open` bound AND cluster cloud-activated → ui". A cluster whose
query surface 404s satisfies both and resolves to `ui`, which then stalls. Folding the
probe into the `auto` check makes it resolve to `local` and keep working — which is the
correct behavior for the default mode. **Short-circuit rule**: when `cockpit_gate_open`
is not bound OR the cluster is not cloud-activated, `auto` resolves to `local` *without*
issuing the probe and *without* writing a probe ledger row — otherwise auto→local would
observably diverge from explicit `--gates=local`, which auto.md pins as byte-identical.
**Sequencing under Form 4 (fresh-epic bootstrap)**: because F4.6 binds `trackingRef`
after step-1's `--gates` resolution, the probe (and hence the `auto` resolution's probe
condition) must be sequenced *after* F4.6, not evaluated alongside conditions 1–2 at
step 1.

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
| FR-001 | Under `--gates=ui`, pre-flight MUST issue exactly one read-only `cockpit_gate_list` probe after the tool-presence check and before the startup sweep dispatches. | P1 | Probe target: the run's identity ref — the value written into the ledger header's `Tracking ref:` field (the epic ref under Form 1; `trackingRef` under Forms 2/3/4). Empty `gates: []` is a pass. |
| FR-002 | Probe success (`status: 'ok'`) MUST write one ledger row recording the probe result and allow the run to proceed unchanged. | P1 | Row shape: `<identity-ref> · preflight · gate-query-probe · ok · source: ui-gate-probe`. `preflight` is a new transition class; `ui-gate-probe` is a sibling of the existing `ui-gate` / `ui-gate-fallback` source tokens. |
| FR-003 | Probe failure (any `status: 'error'`, any class) MUST write a ledger row, print one operator-facing line naming the observed error class and detail, and exit non-zero with no events dispatched. | P1 | Row shape: `<identity-ref> · preflight · gate-query-probe · error: <class> — <detail> · source: ui-gate-probe`. Reuses the existing § step-1 pre-flight fail path. The § Ledger exclusion of "pre-flight failures (before the loop begins)" needs a narrow amendment — safe here because the probe fires after the ledger header exists. |
| FR-004 | A `ui` run MUST NOT silently degrade to `local` on probe failure. | P1 | Preserves the duplicate-drafting guarantee of the pre-draft check. |
| FR-005 | `--gates=auto` resolution MUST fold the probe in as its final condition, short-circuiting when earlier conditions already force `local`: if `cockpit_gate_open` is not bound OR the cluster is not cloud-activated → resolve to `local` *without* issuing the probe and *without* writing a probe ledger row; only when both earlier conditions pass MUST the probe be issued, and then probe passes → `ui`, probe fails → `local` via the FR-003 fail path. | P1 | Short-circuit is required: auto.md pins auto→local as byte-identical to explicit `--gates=local`; always-probing would break that and would call `cockpit_gate_list` at a point where step 3 does not require it to be bound. |
| FR-006 | The `auto` resolution decision MUST be made once at pre-flight and MUST NOT flip mid-run. | P1 | Under Form 4 (fresh-epic bootstrap), the probe and hence the `auto` resolution's probe condition MUST be sequenced *after* F4.6's `trackingRef` binding, not evaluated at step 1 alongside conditions 1–2. |
| FR-007 | Under `--gates=local`, pre-flight MUST NOT attempt the probe. | P1 | |
| FR-008 | Under `--gates=local`, absence of `cockpit_gate_status` / `cockpit_gate_list` MUST remain a non-error. | P1 | Preserves auto.md § startup sweep contract. |
| FR-009 | The existing tool-presence check MUST be preserved and MUST run before the probe. | P1 | Catches pre-#1038 clusters before the probe would have a tool to call. |
| FR-010 | The probe MUST be issued at most once per run (no per-event re-probing). | P1 | Mid-run outages remain the responsibility of the per-event `query-unreachable` taxonomy. |
| FR-011 | `packages/claude-plugin-cockpit/tests/playbook-verification.test.ts` MUST pin the new pre-flight step ordering and both `ui`/`auto` probe branches by exact heading strings and contract rules. | P1 | Per CLAUDE.md: playbook pins are drift audits; re-pin, do not weaken. |
| FR-012 | The probe MUST NOT introduce a new skill-side timeout. It inherits the query-client's bounded budget (`timeoutMs` default 5000ms per attempt × QUERY_RETRY_SCHEDULE's 3 attempts + ~5s of backoff, ≈20s worst case). A timeout MUST map to the existing `query-unreachable` class from the per-event taxonomy. | P1 | `fetchOnce` aborts each attempt at `timeoutMs` and rethrows `QueryTransportError`, which `withRetry` exhausts into `query-unreachable`. A skill-side timer would be unenforceable — auto.md is prose driving a model with no primitive to cancel an in-flight MCP call. A dedicated `probe-timeout` class would be the only class the tool layer can never emit. |
| FR-013 | The operator-facing failure line MUST use a single frozen template with `<class>` / `<detail>` placeholders — `gate-query surface unavailable (class: <class>): <detail> — re-run with --gates=local, or fix the cluster/cloud gate-query deployment` — pinned verbatim in `auto.md` and against a reference formatter in `lib/`. All four gate-query error classes share this one template. | P1 | Mirrors the pinning of the pre-draft-check line (test 457-9a) and the `--gates=ui` absence string (test 449-4). Any wording change requires re-pinning. |

## Success Criteria

| ID | Metric | Target | Measurement |
|----|--------|--------|-------------|
| SC-001 | Broken gate-query surface produces a pre-flight abort, not a stalled loop. | 100% of runs against a cluster whose gate-query endpoint returns any non-`ok` status exit non-zero at pre-flight with no events dispatched. | Integration test: point `--gates=ui` at a stub cluster returning `class: 'internal'`; assert one probe call, one `<identity-ref> · preflight · gate-query-probe · error: internal — … · source: ui-gate-probe` ledger row, one printed line matching the FR-013 template with `<class>=internal`, exit code non-zero, zero events dispatched. |
| SC-002 | Auto mode remains usable on partially-deployed clusters. | `--gates=auto` against a cluster with bound tools + cloud-activated flag but a broken query surface resolves to `local` and completes the run. Under a cluster that is not cloud-activated or lacks `cockpit_gate_open`, `--gates=auto` short-circuits to `local` with zero probe calls. | Integration test A: same stub cluster as SC-001 with `--gates=auto`; assert one probe call, resolution `local` via probe fail, no abort, run proceeds. Integration test B: cluster with `cockpit_gate_open` unbound or cloud-activated=false; assert zero probe calls, zero probe ledger rows, resolution `local`. |
| SC-003 | Diagnosis time for a broken query surface. | Operator can identify the cause from stdout alone (no container-log dive, no manual curl). | Manual verification and unit test: the printed line matches the FR-013 template verbatim with `<class>` and `<detail>` interpolated; a `formatGateQueryProbeErrorLine` (or equivalent) reference formatter is pinned. |
| SC-004 | Local mode is unchanged. | Zero probe calls under `--gates=local`; zero probe ledger rows under `--gates=auto` when the short-circuit fires; zero regressions in existing `local` startup-sweep tests. | Existing `local` tests continue to pass; new assertion that probe helper is never invoked when mode resolves to `local` (via explicit `local` or via `auto` short-circuit). |
| SC-005 | Playbook drift is caught. | Playbook-verification tests fail if the pre-flight ordering or probe branches are removed or reordered. | Deliberately break each pinned heading/step in a scratch commit; assert each break produces a test failure. |

## Assumptions

- `cockpit_gate_list` is genuinely side-effect-free per generacy#1038 FR-012 (observer
  independence) and safe to call unconditionally at pre-flight under `ui`.
- The gate-query error taxonomy is stable: every non-`ok` return has a `class` field, and
  no class is collapsed to `absent` by the tool layer.
- The run's identity ref (ledger header `Tracking ref:`) is bound before the probe fires
  under every invocation form — including Form 4 (fresh-epic bootstrap), where F4.6
  creates `trackingRef` before the tool-presence check. This is what makes FR-006's
  post-F4.6 sequencing feasible.
- The query-client's built-in per-attempt `timeoutMs` (default 5000ms), 3-attempt
  `QUERY_RETRY_SCHEDULE`, and `withRetry`→`query-unreachable` mapping are the effective
  probe budget; no skill-side timer is added.
- The `--gates=auto` second condition ("`cockpit_gate_open` bound AND cluster
  cloud-activated") is the only current path to a `ui` resolution; no other resolver
  branch reaches `ui`.
- Ledger writes at pre-flight (after the ledger header exists) are cheap and cannot
  themselves fail the run. The § Ledger clause excluding "pre-flight failures" earns a
  narrow amendment for the probe row; the § step-1 hard-fail path remains ledger-free.

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
