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

**Answer**: The premise is false — there is no invocation form without a single identity ref. The probe target is the run's identity ref under EVERY form: the epic ref under Form 1, and `trackingRef` under Forms 2/3/4 (Form 4 binds it at F4.4 reuse or F4.6 fresh creation, which both run before step 3's tool-presence check and therefore before the probe). Amend FR-001 to read "the run's identity ref — the value in the ledger header's `Tracking ref:` field" rather than "the tracking ref's own issueRef". Rationale: A would probe a different target on the F4.4 reuse path than on the F4.6 fresh-creation path; B's sentinel exercises a different issue's authorization path, so a pass proves strictly less than the probe claims; C carves out the most common invocation form for a problem it does not have. One real design consequence: because Form 4 binds `trackingRef` after the step-1 `--gates` resolution, the probe — and hence the `auto` resolution's probe condition — must be sequenced after F4.6, not evaluated at step 1 alongside conditions 1–2.

---

### Q2: Probe timeout budget and timeout-class taxonomy
**Context**: The problem the spec fixes is "a run that looks alive but makes zero progress." The most severe form is a gate-query endpoint that accepts a connection but never responds — a hang. If the probe inherits that hang (no timeout), pre-flight itself blocks indefinitely, which reproduces the very failure mode we're trying to prevent, only earlier. FR-003 handles all `status: 'error'` classes but does not specify a bounded time budget or the class a timeout is reported under.
**Question**: What is the probe's maximum time budget, and what error class does a timeout map to?
**Options**:
- A: Bounded budget (e.g., 10 seconds), timeout mapped to existing `query-unreachable` class from the per-event taxonomy.
- B: Bounded budget (e.g., 10 seconds), timeout mapped to a new dedicated `probe-timeout` class distinct from per-event classes.
- C: Bounded budget (e.g., 10 seconds), timeout mapped to `internal` class (uniform with the 404 case documented in the spec).
- D: No explicit timeout — inherit the underlying `cockpit_gate_list` transport's default timeout, whatever that is.

**Answer**: D's mechanism with A's class mapping: no new skill-side timer — inherit the tool layer's already-bounded budget (query-client `timeoutMs`, default 5000ms, aborting each attempt, times QUERY_RETRY_SCHEDULE's 3 attempts plus ~5s of backoff, so ~20s worst case) — and map a timeout to the existing `query-unreachable` class. Record the inherited ~20s bound in the spec rather than inventing a ~10s budget. Rationale: the hang premise is already answered upstream, since `fetchOnce` aborts each attempt at `timeoutMs` and rethrows `QueryTransportError`, which `withRetry` exhausts into `query-unreachable` — an unbounded pre-flight hang is not reachable. A 10s skill-side budget is both redundant and unenforceable, because auto.md is prose driving a model with no primitive to cancel an in-flight MCP call. A dedicated `probe-timeout` class would be the only class in the taxonomy the tool layer can never actually emit, and `internal` would mislabel a transport failure as the deterministic server/tool bug that bucket is documented to hold exclusively.

---

### Q3: Auto-resolution — probe when cluster is not cloud-activated?
**Context**: FR-005 defines `--gates=auto` resolution as `cockpit_gate_open` bound AND cluster cloud-activated AND probe passes → `ui`; otherwise → `local`. It does not say whether the probe is conditionally skipped when the cluster is not cloud-activated. A cluster that fails the cloud-activated check already resolves to `local`, so the probe's result cannot flip the outcome — running it is wasted network I/O. But short-circuiting adds a branch (and a test surface) that the always-probe form avoids.
**Question**: When `--gates=auto` and the cluster is not cloud-activated, should pre-flight skip the probe?
**Options**:
- A: Short-circuit — skip the probe when `cockpit_gate_open` is not bound or the cluster is not cloud-activated. Resolution is `local` without a probe call.
- B: Always probe when the tools are bound, regardless of cloud-activated status. Uniform behavior; probe result is recorded but does not affect the `local` outcome in this case.
- C: Short-circuit AND record a distinguishable ledger row (e.g., `probe-skipped: not-cloud-activated`) so operators can see why no probe was attempted.

**Answer**: A — short-circuit: skip the probe when `cockpit_gate_open` is not bound or the cluster is not cloud-activated. The resolution is `local` with no probe call and no probe ledger row. Rationale: auto.md pins the `auto`→`local` outcome as "byte-identical to explicit `--gates=local`", and FR-007 forbids the probe under `local`, so always-probing would make auto→local observably different from the mode it is defined to equal — and would call `cockpit_gate_list` at a point where step 3 does not even require it to be bound, producing an unbound-tool harness error with no row in the gate-query taxonomy to classify it. Option C's ledger row is mechanically unwritable at the moment of the skip decision, because the `--gates` resolution is specified to run before ledger-directory creation; it would also fire on every non-cloud dev cluster, while the resolved mode is already visible in the startup line and the ledger header.

---

### Q4: Ledger row schema for probe pass/fail
**Context**: FR-002 (pass) and FR-003 (fail) both require a ledger row recording the probe result. The existing per-event ledger uses `<issue-ref> · <transition-class> · pre-draft-check · error: internal — … · source: ui-gate`. It's unclear whether probe rows reuse this exact shape (with what `transition-class` and what `source`), or use a distinct pre-flight-specific event name so downstream dashboards can filter probe rows separately from per-event failures.
**Question**: What ledger row schema does the probe use?
**Options**:
- A: Reuse the existing per-event shape with `transition-class: preflight` and `source: ui-gate-probe`. Ledger consumers filter by these two fields.
- B: Introduce a distinct pre-flight ledger row type (e.g., a `preflight-probe` event kind) so probe rows are structurally distinguishable, not just filter-distinguishable.
- C: Reuse the existing shape with `source: ui-gate` (unchanged) and a new `transition-class: probe`; do not introduce a new event kind.
- D: Defer this to the /plan phase — spec need only require "a ledger row is written," schema details determined during design.

**Answer**: A — reuse the existing four-column ledger shape: `<identity-ref> · preflight · gate-query-probe · ok · source: ui-gate-probe` on pass, and `<identity-ref> · preflight · gate-query-probe · error: <class> — <detail> · source: ui-gate-probe` on fail. `preflight` is a new transition class; `ui-gate-probe` is a sibling of the existing `ui-gate` / `ui-gate-fallback` source tokens, and the suffix sits inside the outcome slot per the existing marker rule. Rationale: option C's reuse of `source: ui-gate` would make the probe-failure row grep-identical to the per-event `pre-draft-check · error: internal … · source: ui-gate` rows whose indistinguishability is exactly why the real cause stayed buried in the incident that motivated this issue, whereas A buys two independent filters for the cost of one new token in a vocabulary that already carries `ui-gate-fallback`. B breaks the "four-column ledger format preserved verbatim" rule that every ledger consumer and every playbook-verification pin depends on, and D leaves FR-011 with nothing to pin. Implementation note: § Ledger currently excludes "pre-flight failures (before the loop begins)" from what earns a row, so that clause needs a narrow amendment — safe here precisely because the probe fires after the ledger header exists, unlike the § step-1 hard-fail that forbids touching the filesystem at all.

---

### Q5: Operator-facing failure line — exact wording pinned by playbook-verification?
**Context**: The Proposal gives an example: `gate-query surface unavailable (class: internal) — the cluster's gate-query endpoint is not answering. Re-run with --gates=local, or fix the cluster/cloud deployment.` FR-011 requires `playbook-verification.test.ts` to pin "the new pre-flight step ordering and both `ui`/`auto` probe branches by exact heading strings and contract rules." SC-003's measurement says "the printed line names the error class and the workaround verbatim." It's unclear whether the exact wording is contract-frozen and playbook-pinned, or whether only the shape (must include the class name and a workaround) is normative.
**Question**: Is the operator-facing failure line's exact wording pinned by playbook-verification, or only its shape?
**Options**:
- A: Exact wording is contract-frozen and pinned — the example line in the spec is normative and any change requires re-pinning the playbook test.
- B: Only the shape is pinned — the printed line must include the observed error class name and a suggested workaround, but exact phrasing can evolve.
- C: Exact wording is pinned per error class — different classes (e.g., `internal`, `unauthorized`, `query-unreachable`) get distinct pre-approved wordings, each pinned separately.

**Answer**: A — exact wording contract-frozen and pinned: one template with `<class>` / `<detail>` placeholders (e.g. `gate-query surface unavailable (class: <class>): <detail> — re-run with --gates=local, or fix the cluster/cloud gate-query deployment`), pinned verbatim in auto.md and against a reference formatter in `lib/`, exactly as the pre-draft-check line already is. Any change requires re-pinning. Rationale: both existing operator-facing strings on this path are already pinned verbatim as single templates — the `--gates=ui` absence string (test 449-4) and the pre-draft-check line, which is pinned twice, once in the prose and once against `formatPreDraftCheckErrorLine` (test 457-9a) — so pinning only the shape would make this the one operator-visible string in the playbook free to drift, which is precisely how drift ships. Option C quadruples the frozen surface for no diagnostic gain, since the class token is already interpolated into the single template and all four classes share the same workaround (`--gates=local`, or fix the deployment).

---
