# Implementation Plan: Cockpit Remote Gates — Pre-flight Functional Probe

**Feature**: Add a one-shot, read-only functional probe against `cockpit_gate_list` at `/cockpit:auto` pre-flight so that under `--gates=ui` a broken gate-query surface aborts non-zero with a single frozen operator-facing line (never silently degrades to `local`), and under `--gates=auto` a broken surface resolves to `local` instead of stalling in `ui`. Adds `preflight · gate-query-probe · ok|error` ledger rows (a new `preflight` transition class and `ui-gate-probe` source), a new `formatGateQueryProbeErrorLine` reference formatter mirroring the pinning shape of `formatPreDraftCheckErrorLine` (test 457-9a), and re-pinned playbook-verification assertions on the pre-flight step ordering and both `ui` / `auto` probe branches.
**Branch**: `459-epic-cockpit-remote-gates`
**Status**: Complete
**Spec**: [spec.md](./spec.md)
**Clarifications**: [clarifications.md](./clarifications.md) (Q1 identity-ref probe target under every invocation form; Q2 inherit query-client's ~20s bound, map timeout to `query-unreachable`; Q3 short-circuit `auto`→`local` when earlier conditions fire; Q4 reuse four-column ledger with `preflight` / `ui-gate-probe`; Q5 exact-wording frozen template)
**Epic**: [generacy-ai/generacy-cloud#850 — Cockpit Remote Gates](https://github.com/generacy-ai/generacy-cloud/issues/850)
**Related deployment gap**: [generacy-ai/generacy-cloud#877](https://github.com/generacy-ai/generacy-cloud/issues/877) (the 404 that exposed this)

## Summary

Playbook-prose-only edit on the plugin side, plus a small addition to `packages/claude-plugin-cockpit/lib/gate-status-check.ts` (a `formatGateQueryProbeErrorLine` reference formatter that mirrors the pinning shape of the existing `formatPreDraftCheckErrorLine`), plus re-pinned playbook-verification tests. **No engine changes, no MCP schema changes, no new MCP tools bound.** The probe consumes `cockpit_gate_list` — already bound by generacy#1038 — with its existing frozen return shape and its existing frozen error taxonomy; both are the same tools and same taxonomy that #457 introduced for the per-event pre-draft check. The blocking upstream #1038 remains a hard prerequisite: on a cluster where the two gate-query tools are absent from the session's MCP binding, the § step 3 tool-presence check (extended by #457 with the same conditional shape) still hard-fails BEFORE this probe would even have a tool to call.

The bug is precisely diagnosed in `spec.md § Problem`: `auto.md` today's `--gates=ui` pre-flight verifies that `cockpit_gate_status` and `cockpit_gate_list` are **bound** to the session's MCP tool binding but never verifies that the surface behind those tools actually **works**. So when the tools are bound but the cluster-cloud query endpoint 404s (or otherwise returns any non-`ok` status), the run starts happily, then every synthetic Step 0 pre-draft check hard-aborts on the exact same error, indefinitely. The operator sees a run that LOOKS alive (doorbell armed, events draining, ledger rows being written) but makes zero forward progress, with the real cause buried in per-event error rows. Diagnosis took a container-log dive and a hand-rolled curl (cluster `snappoll-local-2`, 2026-07-25).

The fix adds one **functional probe** at pre-flight — after the § step 3 tool-presence check confirms the two query tools are bound, before the startup sweep's synthetic-event pass dispatches anything. The probe issues exactly one read-only `cockpit_gate_list({ issueRef, gateType })` call against the run's identity ref (the value in the ledger header's `Tracking ref:` field — the epic ref under Form 1; `trackingRef` under Forms 2/3/4). An empty `gates: []` is a perfectly good pass. Two branches result:

1. **Pass** (`status: 'ok'`, any payload) — write one ledger line `<identity-ref> · preflight · gate-query-probe · ok · source: ui-gate-probe`, proceed unchanged.
2. **Fail** (any `status: 'error'`, any class) — take the existing § step-1 pre-flight fail path: write `<identity-ref> · preflight · gate-query-probe · error: <class> — <detail> · source: ui-gate-probe`, print exactly the operator-facing line `gate-query surface unavailable (class: <class>): <detail> — re-run with --gates=local, or fix the cluster/cloud gate-query deployment`, and exit non-zero. **Do not** start the loop, and **do not** silently degrade to `local` — a `ui` run that quietly becomes `local` would re-introduce the duplicate-drafting hazard the pre-draft check exists to remove, and the operator asked for UI gates.

`--gates=auto` folds the probe in as its **final** condition, with a load-bearing short-circuit — the probe is issued ONLY when both earlier conditions ("`cockpit_gate_open` bound AND cluster cloud-activated") pass. When `cockpit_gate_open` is unbound OR the cluster is not cloud-activated, `auto` resolves to `local` **without** issuing the probe and **without** writing a probe ledger row. Short-circuit is required: auto.md pins auto→local as byte-identical to explicit `--gates=local`; always-probing would break that byte-identity and would call `cockpit_gate_list` at a point where the tool is not even required to be bound (the § step 3 conditional presence check requires it only under `ui`). Only when both earlier conditions pass is the probe issued; probe pass → `ui`, probe fail → `local` via the FR-003 fail path.

**Form 4 sequencing** (per Q1 rationale): F4.6 binds `trackingRef` BEFORE step-1's `--gates` resolution runs to completion — actually, F4.6 runs at the end of step 1, and today the `--gates=auto` two-part check is defined to be decided ONCE at pre-flight. The probe is a THIRD condition that ONLY has a valid target once `trackingRef` is bound. So under Form 4 the probe (and hence the `auto` resolution's probe condition) is sequenced **after F4.6 (or F4.4 reuse)**, not evaluated alongside conditions 1–2 at step 1. Under Forms 1/2/3 the identity ref is bound at parse time or by G.6 approval; the probe fires immediately after step-1's other conditions pass.

**Local-mode is unaffected.** Under `--gates=local` (explicit) OR `--gates=auto` short-circuited to `local`, no probe is issued and no probe ledger row is written. The two query tools are not required under `local` (per #457's conditional tool-presence check) and a `local` run must never fail on a tool it never calls.

**Timeout budget** (per Q2 answer): no new skill-side timer is introduced. The probe inherits the query-client's already-bounded budget (`timeoutMs=5000ms` per attempt × `QUERY_RETRY_SCHEDULE`'s 3 attempts + ~5s of backoff, ≈20s worst case). `fetchOnce` aborts each attempt at `timeoutMs` and rethrows `QueryTransportError`, which `withRetry` exhausts into the `query-unreachable` class — the same class the per-event taxonomy already uses for the same underlying failure mode. A skill-side timer would be redundant (upstream already bounds) and unenforceable (auto.md is prose driving a model with no primitive to cancel an in-flight MCP call). A dedicated `probe-timeout` class would be the only class in the four-class taxonomy the tool layer can never emit.

**Operator-facing line pinning** (per Q5 answer): the line is a single frozen template with `<class>` / `<detail>` placeholders — `gate-query surface unavailable (class: <class>): <detail> — re-run with --gates=local, or fix the cluster/cloud gate-query deployment` — pinned verbatim in `auto.md` and against `formatGateQueryProbeErrorLine` in `lib/gate-status-check.ts`, mirroring the pinning of `formatPreDraftCheckErrorLine` (test 457-9a) and the `--gates=ui` absence string (test 449-4). All four gate-query error classes (`query-unreachable`, `invalid-args`, `internal`, `transport`) share this one template; any change to the wording requires re-pinning both prose and formatter.

**Ledger-clause amendment** (per Q4 answer + FR-003 note): auto.md § Ledger currently excludes "pre-flight failures (before the loop begins)" from what earns a ledger row. That clause needs a narrow amendment for the probe row — safe here precisely because the probe fires **after** the ledger header exists (the header is emitted at F4.7 for Form 4 and at the top of step 3 for Forms 1/2/3, both before the probe). The § step-1 hard-fail path (missing `cockpit_gate_open` under explicit `ui`; usage errors) remains ledger-free by contract because those failures happen BEFORE the ledger directory has been created.

Playbook-verification tests are re-pinned to the new contract — the pre-flight step ordering (F4.6 → tool-presence → probe → synthetic-event pass), both `ui` and `auto` probe branches, the short-circuit rule under `auto`, the frozen operator-facing line template, the `preflight` transition class and `ui-gate-probe` source token, and the "no probe under `local`" invariant.

## Technical Context

**Language / runtime**: The plugin is playbook prose interpreted by the model at slash-command time; no compile-time code path executes it. Reference-implementation TypeScript (if any) lives under `packages/claude-plugin-cockpit/lib/` in the same shape as the existing `lib/gate-status-check.ts` (added by #457) and its unit-testable formatters (`formatPreDraftCheckErrorLine`). Tests run under `vitest`, matching `packages/claude-plugin-cockpit/tests/playbook-verification.test.ts`.

**Frameworks / dependencies**:
- **No new runtime deps.** The wire types for the two gate-query tools live upstream in the generacy MCP surface (per #1038); this feature reuses their frozen return shapes and error taxonomy verbatim.
- **No new MCP tools bound.** The probe consumes only `cockpit_gate_list` — already required to be bound under `ResolvedGateMode === "ui"` by #457's conditional tool-presence check. `cockpit_gate_status` is NOT called by the probe (the probe is a functional health check, not a specific-gate lookup; an empty list is a perfectly good pass and does not need a `gateId` to be constructed).
- **Reused verbatim from the current playbook**: the § step 3 conditional tool-presence check (seven baseline tools always, `cockpit_gate_status` / `cockpit_gate_list` under `ui` only); the § step-1 fail-loud `Print + exit` pattern (extended by #457 to write the `startup · cockpit-mcp-tools-missing · abort` ledger row when the presence check fires); the § step-1 `Auto run starting · gates: …` line and its ledger-header extension; the per-event `pre-draft-check` gate-query error taxonomy (four classes: `query-unreachable`, `invalid-args`, `internal`, `transport`, per `lib/gate-status-check.ts § GateQueryErrorClass`).

**Boundaries preserved**:
- **`--gates=local` byte-path unchanged.** The probe is scoped explicitly to `ResolvedGateMode === "ui"` AND to the `auto` resolution's third condition. Under `local` the probe is dead prose; every existing local-mode test continues to describe correct local behavior. Zero probe calls, zero probe ledger rows, zero new failure modes.
- **`auto`→`local` remains byte-identical to explicit `--gates=local`.** This is what makes Q3's short-circuit load-bearing rather than optional: when `cockpit_gate_open` is unbound or the cluster is not cloud-activated, the probe is not issued; the resulting run is indistinguishable from `--gates=local`. Always-probing would break this pin.
- **Never merge on red / every gate prompts** (auto.md opening paragraph) unaffected. The probe changes only whether the loop STARTS, not what the loop does once running.
- **No engine changes / no MCP schema changes** for the plugin ticket. The probe uses `cockpit_gate_list` with its existing input/output/error contracts; deviations from those shapes must be proposed on generacy#1038, not patched here.
- **Playbook-first, code-second.** The new `formatGateQueryProbeErrorLine` reference formatter under `lib/gate-status-check.ts` is a reference implementation of the prose contract, not the source of truth. Tests pin the prose AND the formatter to prevent drift between them (same shape as `formatPreDraftCheckErrorLine` — test 457-9a).
- **UI mode only for the failure mode being fixed.** The probe under `auto` is what makes the default mode keep working; the probe under `ui` is what makes explicit `ui` fail loud. `local` sees no change.

**Session-state model**: **No new session-state.** The probe is a one-shot pre-flight action with no state that survives it. The pass ledger row is written and the run proceeds; the fail path exits non-zero. No counter, no map, no flag is added to `auto.md § In-memory loop state additions`. FR-010's "at most once per run (no per-event re-probing)" is enforced by construction: the probe is called from exactly one call site (pre-flight, after step-1 resolution / F4.6, before step 3 dispatch).

**Sequencing (all four invocation forms)**:

| Form | Identity ref bound at | Step-1 `--gates` resolution | Probe fires at |
|---|---|---|---|
| 1 (epic) | Parse time (`--epic <ref>`) | End of step 1 | After step 1 completes, before § step 3 sweep dispatches |
| 2 (`--tracking <ref>`) | Parse time | End of step 1 | Same as Form 1 |
| 3 (`--new "<title>"`) | After G.6 approval (mid-step-1) | End of step 1 (after G.6) | Same as Form 1 |
| 4 (fresh-epic bootstrap) | F4.4 reuse OR F4.6 fresh-creation (both inside step 1) | End of step 1 (after F4.7 ledger-header emission) | **After F4.6/F4.4 completes**; NOT evaluated alongside conditions 1–2 |

Under all four forms, the probe fires AFTER the step 3 tool-presence check confirms `cockpit_gate_list` is bound (a mode where the tool is not bound would already have hard-failed under `ui`, or resolved down to `local` under `auto` without ever considering the probe).

## Approach

The change is surgical: exactly one new pre-flight sub-step, one new formatter function in `lib/gate-status-check.ts`, one clarified sentence in the `auto` resolution's two-part check, and re-pinned playbook-verification assertions.

### Pre-flight probe placement in the resolution flow

The current `--gates` resolution runs at end-of-step-1 (`auto.md § step 1 - --gates resolution and pre-flight absence`). Today the resolver evaluates:

1. Explicit `--gates=local` → `ResolvedGateMode = "local"`.
2. Explicit `--gates=ui` → check `cockpit_gate_open` bound; absent → hard-fail (Q3=A precedent from #449); present → `ResolvedGateMode = "ui"`.
3. Default `--gates=auto` → two-part check: (a) `cockpit_gate_open` bound? (b) cluster cloud-activated?; both YES → `ResolvedGateMode = "ui"`; either NO → `ResolvedGateMode = "local"`.

The probe is inserted as an additional condition — the **third** condition of `auto` and an additional pre-flight assertion under explicit `ui`:

1. Under **explicit `--gates=ui`**: after the existing `cockpit_gate_open`-bound check passes, and after F4.6/F4.4 has bound the identity ref, issue the probe. Probe passes → proceed with `ResolvedGateMode = "ui"`. Probe fails → take the § step-1 fail path (ledger row + FR-013 template line + exit non-zero). This DOES exit even though the § step-1 hard-fail path today is ledger-free, because the probe fires AFTER the ledger header exists (per the Q4 amendment); the § step-1 hard-fail path itself (missing `cockpit_gate_open`) remains ledger-free unchanged.
2. Under **`--gates=auto`**: after the two-part check confirms `cockpit_gate_open` bound AND cluster cloud-activated, and after F4.6/F4.4 has bound the identity ref, issue the probe. Probe passes → resolve to `ui`. Probe fails → resolve to `local` (with the probe's ledger row still written — the FR-003 fail path). When EITHER of the first two conditions fails, short-circuit: resolve to `local` immediately with **no probe call and no probe ledger row** (per Q3 answer + FR-005).
3. Under **explicit `--gates=local`**: unchanged; no probe.

The `--gates=auto` two-part check in `auto.md` today is a two-item numbered list; this feature extends it to a three-item numbered list where item 3 is the probe (with the short-circuit rule stated explicitly: "issue item 3 ONLY when items 1 and 2 both pass"). The `Auto run starting · gates: <ui|local> (source: --gates=auto → <resolution reason>)` line's `<resolution reason>` gains a new possible value — `probe-failed` — for the case where items 1–2 pass but item 3 fails.

### Probe call shape

Exactly one MCP call:

```
cockpit_gate_list({ issueRef: <identity-ref>, gateType: <omitted> })
```

Per generacy#1038, `CockpitGateListInputSchema.gateType` is OPTIONAL (a `.strict()` `.optional()` — verified in the `lib/gate-status-check.ts § GateListQuery` note that the tool's input takes `{issueRef, gateType}` with no `askedAt`/ordering/pagination cursor on the input side; the wire schema tolerates omitted `gateType`). Omitting `gateType` returns every non-terminal gate for the identity ref across all gateTypes, which is strictly stronger than probing one gateType — it proves the surface can enumerate at all. Empty `gates: []` on a fresh identity ref is a perfectly good pass.

The identity ref is the value already written into the ledger header's `Tracking ref:` field — under Form 1 the epic ref, under Forms 2/3/4 the `trackingRef`. Q1 rules out alternatives (first-issue-of-list, sentinel, per-issue probes) on identity-ref grounds: any invocation form has exactly one identity ref, and it is already bound by the time the probe fires.

**Why `cockpit_gate_list`, not `cockpit_gate_status`**: the status query requires all three of `{issueRef, gateType, generation}` (per its `.strict()` schema) and returns per-`gateId` state; there is no natural probe target because there is no natural `(gateType, generation)` pair. The list query filters by `{issueRef, gateType?}` and returns whatever exists — the natural shape for a functional health check. `cockpit_gate_status` is also NOT required by this feature to be bound as a distinct probe input — the tool-presence check (already conditional per #457) still requires both, so a cluster without either fails the pre-flight tool-presence check BEFORE the probe is reached.

### Probe pass path

Write one ledger line (via the same ledger primitive used by every other ledger row):

```
<identity-ref> · preflight · gate-query-probe · ok · source: ui-gate-probe
```

`preflight` is a NEW transition class (a sibling of `startup`, `heartbeat`, `cursor-recovery`, `epic-complete`, etc.). `ui-gate-probe` is a NEW source token (a sibling of the existing `ui-gate` / `ui-gate-fallback` / `enriched-line`). Both are one-off additions pinned by the playbook-verification suite. Then proceed to § step 3 (or, under `--gates=auto`, set `ResolvedGateMode = "ui"` and proceed to § step 3).

The FR-005-style "one pointer line" is NOT printed for a passing probe. The probe is functional health, not an operator-visible affordance; the observable output on the pass path is one ledger row.

### Probe fail path

Regardless of which mode invoked the probe (explicit `ui` or `auto` resolution's third condition), a fail follows the exact same shape:

1. Write the ledger line:
   ```
   <identity-ref> · preflight · gate-query-probe · error: <class> — <detail> · source: ui-gate-probe
   ```
   Where `<class>` is one of the four wire classes (`query-unreachable`, `invalid-args`, `internal`, `transport`) and `<detail>` is the tool's `detail` field verbatim.

2. Print the operator-facing line, using the frozen template with `<class>` / `<detail>` interpolated (per Q5 / FR-013):
   ```
   gate-query surface unavailable (class: <class>): <detail> — re-run with --gates=local, or fix the cluster/cloud gate-query deployment
   ```

3. **Under explicit `--gates=ui`** → exit non-zero. Do NOT start the loop. Do NOT fall back to `local`.
4. **Under `--gates=auto`** → resolve to `local` (write the `Auto run starting · gates: local (source: --gates=auto → probe-failed)` line right after this probe row) and proceed to § step 3 in `local` mode.

The FR-004 invariant — "a `ui` run MUST NOT silently degrade to `local`" — is what makes step 3's behavior class-specific to the invoking mode. `auto` degrades because the mode's whole purpose is to resolve down to `local` when `ui` isn't available. Explicit `ui` does NOT degrade because the operator asked for UI gates and got them or nothing.

### Short-circuit rule under `--gates=auto`

The probe is a network call. Issuing it when either earlier condition already forces `local` is:

- **Wasted I/O** — the outcome cannot flip the resolution.
- **Contract-breaking** — auto.md pins auto→local as byte-identical to explicit `--gates=local`, and `--gates=local` never calls `cockpit_gate_list`. Issuing the probe would make the byte-paths differ observably (a ledger row present under `auto`→`local` that is absent under explicit `local`).
- **Tool-binding violation** — the § step 3 conditional presence check (per #457) requires `cockpit_gate_list` to be bound ONLY under `ResolvedGateMode === "ui"`. Under `auto`→`local`, the required set does NOT include it. Issuing the probe there would call an unbound tool.

Short-circuit rule (per Q3): issue the probe (item 3) ONLY when items 1 (`cockpit_gate_open` bound) AND 2 (cluster cloud-activated) BOTH pass. Otherwise resolve to `local` with no probe call and no probe ledger row.

Q3's option-C alternative ("short-circuit AND record a distinguishable ledger row like `probe-skipped: not-cloud-activated`") is mechanically unwritable because the `--gates=auto` two-part check today runs BEFORE the ledger directory is created; adding a ledger row there would require creating the directory earlier, which every existing `--gates=local` path assumes is not done. The resolved mode is already visible in the startup line and the ledger header, so no ledger row is missing for the skip case.

### Timeout budget (per Q2 answer)

No new skill-side timer. The probe inherits the query-client's `timeoutMs` (default 5000ms per attempt) × `QUERY_RETRY_SCHEDULE` (3 attempts + ~5s backoff, ~20s worst case), and a timeout maps to the existing `query-unreachable` class (via `fetchOnce` → `QueryTransportError` → `withRetry` exhaustion → `query-unreachable` — the same path the per-event `pre-draft-check` uses).

Consequences:

- **No new class in the taxonomy.** The four classes `lib/gate-status-check.ts § GateQueryErrorClass` already enumerates cover every reachable outcome.
- **No `probe-timeout` special-case.** A skill-side dedicated class would be the only class in the taxonomy the tool layer can never emit — because the tool's own timeout maps to `query-unreachable`, not to a new class.
- **The ~20s worst case is documented in the plan** (this section) rather than inventing a ~10s budget. Documenting the inherited bound gives the operator a realistic upper-bound expectation for pre-flight latency on a partially-broken cluster.

### `auto.md` prose edits

The prose edits are surgical:

1. **§ step 1 `--gates` resolution** — extend the `--gates=auto` two-part check to a three-item list. Item 3 is the probe, with the short-circuit rule stated verbatim ("issue item 3 ONLY when items 1 AND 2 both pass; otherwise resolve to `local` with NO probe call and NO probe ledger row"). Extend the explicit `--gates=ui` block to add a pre-flight probe step, running AFTER the tool-presence check and AFTER F4.6/F4.4 has bound the identity ref, that hard-fails the run on any probe error.
2. **§ step 1 `Auto run starting` line** — add `probe-failed` as a new possible value of `<resolution reason>` in the `→ <resolution reason>` suffix (fires only under `--gates=auto` when the probe was the reason for resolving down to `local`).
3. **§ Ledger clause "pre-flight failures do not earn a row"** — narrow amendment: the probe row (`preflight · gate-query-probe · ok|error`) IS a ledger row, safe because the probe fires after the ledger header exists at F4.7 / step 3 top. The § step-1 hard-fail path itself (missing `cockpit_gate_open` under explicit `ui`; usage errors) remains ledger-free — those failures happen BEFORE any ledger directory is created.
4. **§ Ledger `preflight` / `ui-gate-probe` vocabulary** — add `preflight` as a new transition class alongside `startup` / `heartbeat` / `cursor-recovery` / `epic-complete`, and `ui-gate-probe` as a new source token alongside `ui-gate` / `ui-gate-fallback` / `enriched-line`.
5. **§ Gate-query error taxonomy** (added by #457) — no new class; the probe's error handling reuses the exact same taxonomy. Add a cross-reference from the taxonomy section to the new pre-flight probe step, so an operator diagnosing a `preflight · gate-query-probe · error: internal` ledger row can find the class definition next to the `pre-draft-check` explanation.

**No other rows change.** § step 3 (tool-presence check, escape-hatch tick, synthetic-event pass) is unchanged. § Dispatch D.1–D.11 is unchanged (each row's Step 0 pre-draft check per #457 is unaffected; the probe is a strictly pre-loop concern). § step 4 (main loop) is unchanged. § step 5 (cursor recovery) is unchanged. § step 6 (exit) is unchanged.

### `lib/gate-status-check.ts` addition

One new exported function, mirroring the shape of the existing `formatPreDraftCheckErrorLine`:

```typescript
export function formatGateQueryProbeErrorLine(error: GateQueryError): string {
  return `gate-query surface unavailable (class: ${error.class}): ${error.message} — re-run with --gates=local, or fix the cluster/cloud gate-query deployment`;
}
```

Note the function does NOT take `issueRef` (unlike the per-event `formatPreDraftCheckErrorLine`, which does). Rationale: the probe is a pre-flight action against a single identity ref; the identity ref is already visible in the `Tracking ref:` header of the ledger and does not need to appear in the operator-facing line. The line's purpose is to name the CLASS and the WORKAROUND — the operator's next action does not depend on which identity ref was probed. This mirrors the pinning shape of the `--gates=ui` absence string (test 449-4), which also does not carry an identity ref.

No new types are added — the existing `GateQueryError` / `GateQueryErrorClass` cover the probe's error surface verbatim. No new state, no new maps, no new counters.

### Test edits (`playbook-verification.test.ts`)

Add a new `describe("459 pre-flight functional probe", () => { ... })` block after the existing `457 sweep-time gate reuse` block. New assertions (numbering `459-N`):

- **459-1**: § step 1 `--gates=auto` resolution declares a three-item list with the probe as item 3 AND states the short-circuit rule verbatim.
- **459-2**: § step 1 explicit `--gates=ui` block declares the probe as a post-tool-presence, post-identity-ref pre-flight step that hard-fails on any error.
- **459-3**: § step 1 `Auto run starting` line's `<resolution reason>` suffix enumerates `probe-failed` as a possible value under `--gates=auto`.
- **459-4**: § step 1 states the Form 4 sequencing rule — probe fires AFTER F4.6/F4.4 has bound `trackingRef`, NOT alongside conditions 1–2.
- **459-5**: The `probe pass` ledger row shape is pinned verbatim: `<identity-ref> · preflight · gate-query-probe · ok · source: ui-gate-probe`.
- **459-6**: The `probe fail` ledger row shape is pinned verbatim: `<identity-ref> · preflight · gate-query-probe · error: <class> — <detail> · source: ui-gate-probe`.
- **459-7**: The operator-facing line template is pinned verbatim in `auto.md`: `gate-query surface unavailable (class: <class>): <detail> — re-run with --gates=local, or fix the cluster/cloud gate-query deployment`.
- **459-7a**: `lib/gate-status-check.ts § formatGateQueryProbeErrorLine` returns the exact same template (mirrors 457-9a's `formatPreDraftCheckErrorLine` pin — a fixture-driven equality assertion on `formatGateQueryProbeErrorLine({class: 'internal', message: 'oops'})`).
- **459-8**: `auto.md` § Ledger declares the narrow amendment — `preflight · gate-query-probe · ok|error` earns a ledger row despite the general "pre-flight failures do not earn a row" clause; the § step-1 hard-fail path remains ledger-free.
- **459-9**: `auto.md` § Ledger declares `preflight` as a transition class and `ui-gate-probe` as a source token.
- **459-10**: § step 1 declares that under `--gates=local` (explicit OR `--gates=auto` short-circuited) NO probe is issued AND NO probe ledger row is written.
- **459-11**: § step 1 declares that on probe failure, `--gates=ui` exits non-zero (no fallback to `local`) and `--gates=auto` resolves to `local` (with the probe's fail ledger row written).
- **459-12**: The probe is issued AT MOST ONCE per run (drift audit — a future edit that adds per-event re-probing breaks this pin, per FR-010).
- **459-13**: The § Gate-query error taxonomy (added by #457) is unchanged (drift audit — the probe must use the same four-class taxonomy; a divergence here would silently break the pre-flight consistency contract). The taxonomy section acquires a new cross-reference to the pre-flight probe step, pinned verbatim.

Existing pins that quote the OLD `--gates=auto` two-part check (as a two-item list) are **re-pinned to the NEW three-item contract in the same PR**, per repo CLAUDE.md § "Cockpit playbook pins" (do not weaken; re-pin). Candidate re-pin targets in the existing suite: any `449 UI-mode gates` assertion that quotes the two-part check verbatim (audit at implementation time).

## Constitution Check

**No `.specify/memory/constitution.md` exists** in this repo (verified above via file-existence check). Applying the plugin-scope `CLAUDE.md` pins:

- **Playbook pin discipline** (CLAUDE.md § "Cockpit playbook pins"): `packages/claude-plugin-cockpit/tests/playbook-verification.test.ts` pins `commands/auto.md` by exact heading strings and contract rules. This plan **re-pins** the `--gates=auto` two-part-check assertion to a three-item contract and adds a `describe("459 pre-flight functional probe", ...)` block for the new prose. No pin is weakened or deleted; the acceptance criterion (spec § US1/US2/US3) is verified by the re-pinned suite going green. `formatGateQueryProbeErrorLine` is a new fixture-verified formatter pinned with the same equality assertion pattern as `formatPreDraftCheckErrorLine` (test 457-9a).
- **Never merge on red / every gate prompts** (auto.md opening paragraph): unchanged. The probe changes only whether the loop STARTS. Once the loop is running, every gate still requires an operator answer, no gate auto-approves.
- **Playbook-first, code-second** (existing pattern at `lib/gate-wire-types.ts`, `lib/gate-status-check.ts`, `lib/clarification-batch-parser.ts`, etc.): `lib/gate-status-check.ts § formatGateQueryProbeErrorLine` is a reference implementation of the prose contract, not the source of truth. Playbook prose in `auto.md` is authoritative.
- **No new external systems / no new APIs bound by this ticket**: `cockpit_gate_list` is already bound by the cluster (per generacy#1038); the § step 3 tool-presence check already requires it under `ui`. No new dependency-graph edges introduced.

## Project Structure

### Documentation (this feature)

```text
specs/459-epic-cockpit-remote-gates/
├── spec.md                                (unchanged — read-only)
├── clarifications.md                      (unchanged — read-only, source of Q1–Q5)
├── plan.md                                (this file)
├── research.md                            (technology decisions + rationale + Q1–Q5 anchors)
├── data-model.md                          (types: probe input/output; no new types beyond the formatter signature)
├── quickstart.md                          (operator scenarios: US1 ui fail-fast, US2 auto fallback-to-local, US3 local unaffected; troubleshooting)
├── contracts/
│   ├── gate-query-probe.md                (probe call shape, pass/fail branches, ledger row shape, operator-facing line pinning)
│   ├── auto-resolution-fold-in.md         (three-item list under --gates=auto; short-circuit rule; Form 4 sequencing; probe-failed resolution-reason value)
│   └── error-line-formatter.md            (formatGateQueryProbeErrorLine contract; equality fixtures for all four classes; pinning shape mirrors formatPreDraftCheckErrorLine — test 457-9a)
├── checklists/                            (empty; populated by /checklist if invoked)
└── tasks.md                               (Generated by /speckit:tasks)
```

### Source Code (repository root)

```text
packages/claude-plugin-cockpit/
├── commands/auto.md                       (EDIT — § step 1 --gates resolution extended to three-item list; explicit --gates=ui path gains probe step; Auto run starting line gains probe-failed reason; § Ledger clause amended for probe row; preflight / ui-gate-probe vocabulary added)
├── lib/gate-status-check.ts               (EDIT — add formatGateQueryProbeErrorLine reference formatter; NO new types)
└── tests/playbook-verification.test.ts    (EDIT — new describe("459 pre-flight functional probe") block; re-pin existing --gates=auto two-part-check assertions to the new three-item contract; formatter equality fixtures for all four error classes)
```

**Files intentionally not touched**:
- **Engine / cluster / MCP server code** — `cockpit_gate_list` implementation lives in generacy-ai/generacy#1038 (blocking upstream, already merged and deployed at the cluster layer). The gap this feature exposes is on the cloud side ([generacy-ai/generacy-cloud#877](https://github.com/generacy-ai/generacy-cloud/issues/877) — the 404); THAT gap is out of scope for this feature (per spec § Out of Scope). This feature makes the gap LEGIBLE, it does not close it.
- **Cloud code** (`generacy-cloud/services/api/src/services/relay/...` and the gate-query endpoint) — the 404 lives here, but fixing it is generacy-cloud#877's job.
- **The other five `commands/*.md` playbooks** (clarify, queue, review, merge, status, watch) — unchanged. The `readdirSync(COMMANDS_DIR)` sweep in `playbook-verification.test.ts` (per CLAUDE.md § "Cockpit playbook pins") pins all `commands/*.md` for invocation-vs-`--help` drift; the edit to `auto.md` must not break that sweep.
- **`cockpit-remote-gates-plan.md`** in tetrad-development — this plan cross-references the epic doc. Contract changes must be proposed on the epic tracking issue.
- **§ Dispatch D.1–D.11** — the per-event pre-draft check (added by #457) is unaffected. The probe is a pre-loop concern; the per-event check is a per-dispatch concern.
- **§ step 4 (main loop), § step 5 (cursor recovery), § step 6 (exit)** — unchanged. FR-010 forbids re-probing per event; the probe is a one-shot pre-flight action.

## Key technical decisions (details in research.md)

| Decision | Choice | Rationale (short) | Clarification anchor |
|----------|--------|-------------------|----------------------|
| Probe target under every invocation form | The run's identity ref — the value in the ledger header's `Tracking ref:` field (epic ref under Form 1; `trackingRef` under Forms 2/3/4) | Ad-hoc issue lists do not exist as an invocation form without an identity ref (Q1 corrected the spec's premise); an identity-ref probe target is invocation-shape-independent and matches the ledger header | Q1 |
| Probe timeout budget | Inherit the query-client's `timeoutMs` (default 5000ms) × `QUERY_RETRY_SCHEDULE` (3 attempts + ~5s backoff, ~20s worst case); no skill-side timer | A skill-side timer would be redundant (upstream already bounds) AND unenforceable (prose can't cancel an in-flight MCP call); a dedicated `probe-timeout` class would be the only class the tool layer can never emit | Q2 |
| Probe timeout class mapping | Existing `query-unreachable` from the per-event taxonomy | Timeout is a transport failure, not a caller/server bug; `internal` would mislabel it as a deterministic bug (its documented bucket); a new class doubles the frozen surface for no operator benefit | Q2 |
| `--gates=auto` short-circuit under earlier-condition-fail | Skip the probe when `cockpit_gate_open` is unbound OR cluster is not cloud-activated; resolve to `local` with NO probe call and NO probe ledger row | auto.md pins `auto`→`local` as byte-identical to explicit `--gates=local`; always-probing breaks that pin AND calls a tool the § step 3 conditional presence check does not require to be bound in `local` | Q3 |
| Probe ledger row schema | Reuse the four-column shape with NEW `preflight` transition class and NEW `ui-gate-probe` source token (sibling of `ui-gate` / `ui-gate-fallback`) | Option C (reuse `source: ui-gate`) would make probe-failure rows grep-identical to per-event `pre-draft-check` rows — exactly the indistinguishability that buried the real cause in the motivating incident; option B (new event kind) would break "four-column format preserved verbatim" that every ledger consumer and playbook pin depends on | Q4 |
| Operator-facing failure line | Single frozen template with `<class>` / `<detail>` placeholders, pinned verbatim in `auto.md` AND against `formatGateQueryProbeErrorLine` in `lib/` | Both existing operator-visible strings on this path are pinned verbatim as single templates (449-4 for absence, 457-9a for pre-draft-check); pinning shape-only would make this the one string on the playbook free to drift — exactly how drift ships. Option C (per-class wording) quadruples the frozen surface for no diagnostic gain since the class is already interpolated | Q5 |
| Ledger clause amendment | Narrow amendment: probe rows earn a ledger row despite the general "pre-flight failures do not earn a row" clause; § step-1 hard-fail path remains ledger-free | Probe fires AFTER F4.7 / step-3 ledger-header emission, so the ledger surface exists; the pre-#1038 hard-fail path fires BEFORE the ledger directory is created and continues to leave no ledger row | Q4 (implicit) + FR-003 |
| No new session state | Zero counters, zero maps, zero flags in `§ In-memory loop state additions` | The probe is one-shot pre-flight; FR-010's "at most once per run" is enforced by construction (one call site); per-event re-probing is explicitly out of scope | FR-010 |
| Reuse `cockpit_gate_list` (not `cockpit_gate_status`) | Empty `gates: []` is a perfectly good pass; `list` naturally probes the surface, `status` needs a synthetic `(gateType, generation)` pair with no natural value | The identity ref lookup has no natural `(gateType, generation)` to construct; the list query is the natural functional-health shape | FR-001 (implicit) |

## Complexity Tracking

No constitution file → no violations to justify.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| — | — | — |

## Next step

Run `/speckit:tasks` to generate `tasks.md` with dependency-ordered work items derived from this plan + the three contracts.
