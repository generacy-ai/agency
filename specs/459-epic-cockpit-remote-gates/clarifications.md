# Clarifications: Cockpit Remote Gates — Pre-flight Functional Probe

**Issue**: generacy-ai/agency#459
**Spec**: [spec.md](./spec.md)

---

## Batch 1 — 2026-07-25

### Q1: Probe target for non-epic scopes
**Context**: The spec's Assumptions state "The tracking ref's `issueRef` is always resolvable at pre-flight time (the run already requires it for later steps)." However, `/cockpit:auto` (per its plugin description) drives "an epic, a tracking-issue scope, **or an ad-hoc issue list**." For an ad-hoc list of N independent issues, no single tracking ref exists — so FR-001's probe target ("the tracking ref's own `issueRef`") is undefined for that shape.
**Question**: What is the probe target when the invocation is an ad-hoc issue list with no single tracking ref?
**Options**:
- A: Use the first issue in the list as the probe target.
- B: Probe against a fixed sentinel `issueRef` (e.g., the repo's issue #1 or a well-known reserved ref) so probe targeting is invocation-shape-independent.
- C: Ad-hoc lists are out of scope for this feature — either reject the invocation with an operator-facing error, or fall back to the tool-presence-only pre-flight (skip the functional probe).
- D: Issue one probe per top-level issue in the list (violates FR-010's "at most once per run" — flag if this is intended).

**Answer**: *Pending*

---

### Q2: Probe timeout budget and timeout-class taxonomy
**Context**: The problem the spec fixes is "a run that looks alive but makes zero progress." The most severe form is a gate-query endpoint that accepts a connection but never responds — a hang. If the probe inherits that hang (no timeout), pre-flight itself blocks indefinitely, which reproduces the very failure mode we're trying to prevent, only earlier. FR-003 handles all `status: 'error'` classes but does not specify a bounded time budget or the class a timeout is reported under.
**Question**: What is the probe's maximum time budget, and what error class does a timeout map to?
**Options**:
- A: Bounded budget (e.g., 10 seconds), timeout mapped to existing `query-unreachable` class from the per-event taxonomy.
- B: Bounded budget (e.g., 10 seconds), timeout mapped to a new dedicated `probe-timeout` class distinct from per-event classes.
- C: Bounded budget (e.g., 10 seconds), timeout mapped to `internal` class (uniform with the 404 case documented in the spec).
- D: No explicit timeout — inherit the underlying `cockpit_gate_list` transport's default timeout, whatever that is.

**Answer**: *Pending*

---

### Q3: Auto-resolution — probe when cluster is not cloud-activated?
**Context**: FR-005 defines `--gates=auto` resolution as `cockpit_gate_open` bound AND cluster cloud-activated AND probe passes → `ui`; otherwise → `local`. It does not say whether the probe is conditionally skipped when the cluster is not cloud-activated. A cluster that fails the cloud-activated check already resolves to `local`, so the probe's result cannot flip the outcome — running it is wasted network I/O. But short-circuiting adds a branch (and a test surface) that the always-probe form avoids.
**Question**: When `--gates=auto` and the cluster is not cloud-activated, should pre-flight skip the probe?
**Options**:
- A: Short-circuit — skip the probe when `cockpit_gate_open` is not bound or the cluster is not cloud-activated. Resolution is `local` without a probe call.
- B: Always probe when the tools are bound, regardless of cloud-activated status. Uniform behavior; probe result is recorded but does not affect the `local` outcome in this case.
- C: Short-circuit AND record a distinguishable ledger row (e.g., `probe-skipped: not-cloud-activated`) so operators can see why no probe was attempted.

**Answer**: *Pending*

---

### Q4: Ledger row schema for probe pass/fail
**Context**: FR-002 (pass) and FR-003 (fail) both require a ledger row recording the probe result. The existing per-event ledger uses `<issue-ref> · <transition-class> · pre-draft-check · error: internal — … · source: ui-gate`. It's unclear whether probe rows reuse this exact shape (with what `transition-class` and what `source`), or use a distinct pre-flight-specific event name so downstream dashboards can filter probe rows separately from per-event failures.
**Question**: What ledger row schema does the probe use?
**Options**:
- A: Reuse the existing per-event shape with `transition-class: preflight` and `source: ui-gate-probe`. Ledger consumers filter by these two fields.
- B: Introduce a distinct pre-flight ledger row type (e.g., a `preflight-probe` event kind) so probe rows are structurally distinguishable, not just filter-distinguishable.
- C: Reuse the existing shape with `source: ui-gate` (unchanged) and a new `transition-class: probe`; do not introduce a new event kind.
- D: Defer this to the /plan phase — spec need only require "a ledger row is written," schema details determined during design.

**Answer**: *Pending*

---

### Q5: Operator-facing failure line — exact wording pinned by playbook-verification?
**Context**: The Proposal gives an example: `gate-query surface unavailable (class: internal) — the cluster's gate-query endpoint is not answering. Re-run with --gates=local, or fix the cluster/cloud deployment.` FR-011 requires `playbook-verification.test.ts` to pin "the new pre-flight step ordering and both `ui`/`auto` probe branches by exact heading strings and contract rules." SC-003's measurement says "the printed line names the error class and the workaround verbatim." It's unclear whether the exact wording is contract-frozen and playbook-pinned, or whether only the shape (must include the class name and a workaround) is normative.
**Question**: Is the operator-facing failure line's exact wording pinned by playbook-verification, or only its shape?
**Options**:
- A: Exact wording is contract-frozen and pinned — the example line in the spec is normative and any change requires re-pinning the playbook test.
- B: Only the shape is pinned — the printed line must include the observed error class name and a suggested workaround, but exact phrasing can evolve.
- C: Exact wording is pinned per error class — different classes (e.g., `internal`, `unauthorized`, `query-unreachable`) get distinct pre-approved wordings, each pinned separately.

**Answer**: *Pending*

---
