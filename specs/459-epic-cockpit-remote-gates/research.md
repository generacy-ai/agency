# Research: Cockpit Remote Gates — Pre-flight Functional Probe

Rationale, alternatives considered, and prior art referenced during planning. Every load-bearing choice traces to either a clarification answer (Q1–Q5 in [clarifications.md](./clarifications.md)), the frozen wire contract from #449 / #457 / #1038 / the epic plan, or an existing pattern in `packages/claude-plugin-cockpit/commands/auto.md`.

## R1 — Where does the probe slot in the pre-flight flow?

**Decision**: One new pre-flight sub-step, issued from exactly one call site — the `--gates` resolution at end-of-step-1, AFTER F4.6/F4.4 has bound the identity ref, AFTER the existing conditions (explicit `--gates=ui` tool-binding check; `--gates=auto` two-part check), and BEFORE § step 3's tool-presence check dispatches anything. Under `--gates=auto` the probe is the third condition, gated by a short-circuit rule (R4). Under explicit `--gates=ui` the probe is an additional pre-flight assertion whose failure hard-fails the run.

**Why one call site**: FR-010 requires "at most once per run (no per-event re-probing)." A single call site enforces this by construction — there is no other place in the playbook prose from which the probe can be issued, so a future edit that adds per-event re-probing would obviously violate the invariant and be caught by pin 459-12.

**Alternatives considered**:
- **Probe from inside § step 3's tool-presence check** — rejected. The presence check is per-tool-binding (does the tool exist in the session?); the probe is per-surface (does the endpoint respond?). Mixing them would blur the failure modes each covers and would move the probe below the `--gates=auto` resolution, breaking the FR-005 short-circuit (`auto`→`local` without a probe call).
- **Probe from § step 4 sub-step 0 (per-wake)** — rejected by FR-010. Per-wake re-probing would re-introduce the exact symptom the fix removes (a run that looks alive but stalls per-event); the per-event `pre-draft-check` already handles mid-run outages via the `query-unreachable` class.
- **Probe from every § Dispatch D.n row's Step 0** — rejected. Redundant with the per-event `pre-draft-check` (which already calls the query surface); would multiply the pre-draft-check latency and would not address the pre-flight fast-fail requirement.

## R2 — Probe target under every invocation form (Q1)

**Decision**: The run's identity ref — the value in the ledger header's `Tracking ref:` field. Under Form 1 that is the epic ref; under Forms 2/3/4 it is `trackingRef` (bound at parse time / after G.6 approval / at F4.4 reuse / at F4.6 fresh-creation, respectively).

**Why (per Q1 rationale)**: The spec initially framed "the tracking ref's own `issueRef`" as the probe target, and Q1 raised the question of what target applies under an ad-hoc issue list. The clarification's answer corrected the premise: `/cockpit:auto` has no invocation form without a single identity ref. Every one of the four Forms binds an identity ref by end-of-step-1:

| Form | Identity ref | Bound at |
|---|---|---|
| 1 (epic) | The epic ref itself | Parse time (`--epic <ref>`) |
| 2 (`--tracking <ref>`) | `trackingRef = <ref>` | Parse time |
| 3 (`--new "<title>"`) | `trackingRef` = the ref returned by G.6-approved `gh issue create` | After G.6 approval |
| 4 (fresh-epic bootstrap) | `trackingRef` = F4.4 reuse hit OR F4.6 fresh-creation return | Inside step 1 (F4.4 or F4.6) |

The identity ref is what gets written into the ledger header's `Tracking ref: …` line at F4.7 (Form 4) or at the top of step 3 (Forms 1/2/3), so using it as the probe target keys the probe on the SAME identifier the ledger and every subsequent operator diagnosis will already reference.

**Alternatives rejected** (per Q1 answer):
- **First issue in an ad-hoc list** — the premise (that ad-hoc lists have no identity ref) is false; and even if it were true, Form 4's F4.4 reuse path and F4.6 fresh-creation path would probe different targets, so the probe would not have a stable meaning across the two paths.
- **Fixed sentinel `issueRef`** — a sentinel probes a DIFFERENT issue's authorization path, so a pass proves strictly less than the probe claims (the surface may be broken specifically for the identity ref the run cares about).
- **One probe per top-level issue in an ad-hoc list** — violates FR-010's "at most once per run"; not an intended design.
- **Skip the probe / fail-back to tool-presence-only pre-flight for ad-hoc lists** — carves out the most common invocation form for a problem it does not have; leaves the operator with the exact symptom the feature exists to fix under exactly the shape most commonly used.

**Design consequence** (per Q1's follow-on): under Form 4, `trackingRef` is bound at F4.4 / F4.6 which run INSIDE step 1, but the `--gates=auto` two-part check today is described as a single pre-flight action at "end of step 1". The probe (third condition) MUST be sequenced AFTER F4.6/F4.4, not evaluated alongside conditions 1–2 at step 1's start. This is one of the drift-audit pins (459-4).

## R3 — Probe timeout budget and error class (Q2)

**Decision (Q2 answer, D-mechanism + A-class)**: No new skill-side timer. Inherit the query-client's already-bounded budget — `timeoutMs` (default 5000ms per attempt) × `QUERY_RETRY_SCHEDULE` (3 attempts + ~5s of backoff, ~20s worst case). A timeout maps to the existing `query-unreachable` class from the per-event taxonomy (`lib/gate-status-check.ts § GateQueryErrorClass`), not a new dedicated class.

**Why (per Q2 rationale)**: The hang premise the spec raises — a gate-query endpoint that accepts a connection but never responds — is already answered upstream. `fetchOnce` (in the query-client) aborts each attempt at `timeoutMs` and rethrows `QueryTransportError`, which `withRetry(QUERY_RETRY_SCHEDULE)` exhausts into the `query-unreachable` class after 3 attempts. An unbounded pre-flight hang is therefore not reachable at the tool boundary the probe uses.

A skill-side 10-second budget was rejected on three counts:

1. **Redundant.** Upstream already bounds. Adding a second bound layer would either sit above the upstream bound (never fire) or below it (arbitrarily cut short a legitimate attempt in mid-flight).
2. **Unenforceable.** `auto.md` is prose driving a model with no primitive to cancel an in-flight MCP call. A prose-level "abort at 10s" is not an actual timeout; it is at most an instruction the model may ignore, and there is no way to test for its enforcement.
3. **Creates a class the tool layer can never emit.** A dedicated `probe-timeout` class would be the ONLY class in the taxonomy the tool boundary cannot produce, forcing the plugin to synthesize it — creating a class-of-error that no tool test ever exercises. `internal` would be worse: that bucket is documented to hold deterministic server/tool bugs exclusively; mislabeling a transport failure as a deterministic bug would mis-route operators diagnosing the class.

**Documented consequence**: the plan.md records the ~20s upper bound explicitly, so an operator running `--gates=ui` against a hung endpoint knows to wait up to ~20s at pre-flight, not indefinitely and not the arbitrary 10s a skill-side timer would suggest.

**Contract**: `contracts/gate-query-probe.md § Timeout budget`.

## R4 — `--gates=auto` short-circuit under earlier-condition-fail (Q3)

**Decision (Q3 answer A)**: Short-circuit — skip the probe when `cockpit_gate_open` is not bound OR the cluster is not cloud-activated. Resolution is `local` with no probe call AND no probe ledger row.

**Why (per Q3 rationale)**: Three independent reasons, any one of which is sufficient:

1. **Byte-identity pin.** `auto.md` pins `auto`→`local` as byte-identical to explicit `--gates=local`. FR-007 forbids the probe under `local`, so an always-probe form would make `auto`→`local` observably differ from explicit `--gates=local` (one has a probe row, the other does not). The pin is load-bearing (a downstream operator diagnosis assumes the two paths are indistinguishable).
2. **Tool-binding violation.** #457's conditional tool-presence check requires `cockpit_gate_status` / `cockpit_gate_list` to be bound ONLY under `ResolvedGateMode === "ui"`. Under `auto`→`local` the required set does NOT include them. Issuing the probe there would call an unbound tool — producing a harness error with no row in the four-class gate-query taxonomy to classify it.
3. **No informational value.** The outcome of the probe under `auto`→`local` (already resolved by an earlier condition) cannot flip the resolution; it is wasted network I/O.

**Alternative Q3 option C rejected** (short-circuit AND record a distinguishable `probe-skipped: not-cloud-activated` ledger row):

- **Mechanically unwritable.** The `--gates` resolution today runs BEFORE the ledger directory is created. Writing a ledger row at this point would require creating the directory earlier — every existing `--gates=local` path currently assumes the directory is not created until step 3 for a `local` run. Adding a row would either break that assumption or split it (create for the row but not for anything else). Both add complexity for no user benefit.
- **Redundant signal.** The resolved mode is already visible in the `Auto run starting · gates: local (source: --gates=auto → <reason>)` startup line AND in the ledger header. An operator diagnosing "why did auto resolve to local?" reads that line first, not per-condition ledger rows.
- **Would fire on every non-cloud dev cluster.** Most local development clusters are not cloud-activated; a probe-skipped row would appear on every dev run, adding noise to no signal (the run resolved to local for the reason it always does on dev — there is nothing to diagnose).

**Q3 alternative B** (always probe, ignore outcome under earlier-fail) — rejected for the reasons in #1 (byte-identity pin) and #2 (tool-binding violation).

**Contract**: `contracts/auto-resolution-fold-in.md § Short-circuit rule`.

## R5 — Ledger row schema (Q4)

**Decision (Q4 answer A)**: Reuse the existing four-column ledger shape with a NEW `preflight` transition class and a NEW `ui-gate-probe` source token (a sibling of `ui-gate` / `ui-gate-fallback`).

Row shapes:
- Pass: `<identity-ref> · preflight · gate-query-probe · ok · source: ui-gate-probe`
- Fail: `<identity-ref> · preflight · gate-query-probe · error: <class> — <detail> · source: ui-gate-probe`

**Why (per Q4 rationale)**:
- **Q4 option C rejected** (reuse `source: ui-gate` and add a new `transition-class: probe`) — this would make probe-failure rows grep-identical to per-event `pre-draft-check · error: internal … · source: ui-gate` rows, which is EXACTLY the indistinguishability that buried the real cause in the motivating incident (cluster `snappoll-local-2`, 2026-07-25). The whole point of the row is to be distinguishable from the per-event rows. `ui-gate-probe` costs one new source token and buys two independent grep filters — a cheap improvement for the load-bearing property.
- **Q4 option B rejected** (introduce a distinct `preflight-probe` event kind) — breaks the "four-column ledger format preserved verbatim" contract that every ledger consumer and every playbook-verification pin depends on. Structural distinguishability is not needed; filter distinguishability via `preflight` + `ui-gate-probe` is sufficient (option A).
- **Q4 option D rejected** (defer schema to /plan) — leaves FR-011 with nothing to pin. The FR requires the playbook-verification suite to pin "the new pre-flight step ordering and both `ui`/`auto` probe branches by exact heading strings and contract rules" — impossible without a concrete row shape.

**Vocabulary additions**:
- `preflight` — a new transition class, sibling of `startup` (used by `startup · cockpit-mcp-tools-missing · abort · see cluster-base#75`), `heartbeat` (used by C4's heartbeat lifecycle), `cursor-recovery` (used by § step 5), and `epic-complete`. A grep for `· preflight ·` finds every probe row and nothing else.
- `ui-gate-probe` — a new source token, sibling of `ui-gate` / `ui-gate-fallback` (both from #449) and `enriched-line` (from the E6 marker convention). Suffix appears in the outcome slot per the existing marker rule.

**Ledger clause amendment** (per FR-003 note): auto.md § Ledger currently excludes "pre-flight failures (before the loop begins)" from what earns a row. That clause needs a narrow amendment for the probe row — safe here precisely because the probe fires AFTER the ledger header exists (F4.7 for Form 4, top of step 3 for Forms 1/2/3). The § step-1 hard-fail path (missing `cockpit_gate_open` under explicit `ui`; usage errors) remains ledger-free because those failures happen BEFORE any ledger directory is created.

**Contract**: `contracts/gate-query-probe.md § Ledger row shape` and `contracts/gate-query-probe.md § Ledger clause amendment`.

## R6 — Operator-facing failure line pinning (Q5)

**Decision (Q5 answer A)**: The line is a single frozen template with `<class>` / `<detail>` placeholders — `gate-query surface unavailable (class: <class>): <detail> — re-run with --gates=local, or fix the cluster/cloud gate-query deployment` — pinned verbatim in `auto.md` AND against `formatGateQueryProbeErrorLine` in `lib/gate-status-check.ts`. Any change requires re-pinning both.

**Why (per Q5 rationale)**:

- **Prior art forces this choice.** Both existing operator-facing strings on this path are already pinned verbatim as single templates:
  - The `--gates=ui` absence string (test 449-4): `--gates=ui specified but cockpit_gate_open is not available in this session; re-invoke with --gates=local or --gates=auto`.
  - The pre-draft-check line (test 457-9a): pinned twice — once in the auto.md prose AND once against `formatPreDraftCheckErrorLine` in `lib/gate-status-check.ts`.

  Pinning shape-only for the probe would make this the ONE operator-visible string on the `--gates=ui` path free to drift — precisely the mechanism by which drift ships. Q5 option B (shape-only) is rejected on this "one drift-free anchor" ground alone.

- **Q5 option C rejected** (per-class wording, e.g. different lines for `internal` / `unauthorized` / `query-unreachable`) — quadruples the frozen surface for no diagnostic gain. The class token is already interpolated into the single template, and all four classes share the same workaround (`--gates=local`, or fix the deployment). A per-class template would say the same workaround four times.

**Formatter shape** (mirrors `formatPreDraftCheckErrorLine`):

```typescript
export function formatGateQueryProbeErrorLine(error: GateQueryError): string {
  return `gate-query surface unavailable (class: ${error.class}): ${error.message} — re-run with --gates=local, or fix the cluster/cloud gate-query deployment`;
}
```

The function does NOT take `issueRef`, unlike the per-event `formatPreDraftCheckErrorLine`. The pre-flight probe operates on a single identity ref already named by the `Tracking ref:` header; the line's purpose is to name the CLASS and the WORKAROUND, and the operator's next action does not depend on which identity ref was probed. This mirrors the `--gates=ui` absence string (test 449-4), which also does not carry an identity ref.

**Contract**: `contracts/error-line-formatter.md`.

## R7 — Playbook-verification pin discipline

**Decision**: Every existing pin that quotes the OLD `--gates=auto` two-part check (as a two-item list) is re-pinned to the NEW three-item contract in the SAME PR. Not weakened, not deleted. New pins added under a `describe("459 pre-flight functional probe", () => { ... })` block for the three-item resolution, the short-circuit rule, the Form 4 sequencing, the probe pass/fail ledger row shapes, the operator-facing line template, the formatter equality fixtures, the ledger-clause amendment, the `preflight` / `ui-gate-probe` vocabulary, the "no probe under local" invariant, the "at most once per run" invariant, and the gate-query error taxonomy drift audit.

**Why**: Per repo CLAUDE.md § "Cockpit playbook pins" — heading renames, loop-shape edits, and new/removed steps break the pins on purpose (drift audit, not smoke test). Re-pinning to the new contract preserves the drift-audit value while allowing the intentional contract change.

**Coverage sketch** (final task list is generated by `/speckit:tasks`):

- 459-1: § step 1 three-item `--gates=auto` list + short-circuit rule
- 459-2: § step 1 explicit `--gates=ui` probe step + hard-fail on error
- 459-3: `Auto run starting` line's `<resolution reason>` enumerates `probe-failed`
- 459-4: Form 4 sequencing — probe AFTER F4.6/F4.4
- 459-5: Probe pass ledger row shape verbatim
- 459-6: Probe fail ledger row shape verbatim (with `<class>` / `<detail>` placeholders)
- 459-7: Operator-facing failure line verbatim in `auto.md`
- 459-7a: `formatGateQueryProbeErrorLine` equality fixtures for all four classes
- 459-8: § Ledger clause amendment for the probe row (narrow exception to "pre-flight failures do not earn a row")
- 459-9: `preflight` transition class + `ui-gate-probe` source token declared in § Ledger vocabulary
- 459-10: No probe under `--gates=local` (explicit OR `auto`-short-circuited)
- 459-11: Probe failure — `ui` exits non-zero; `auto` resolves to `local` with the fail row written
- 459-12: Probe issued AT MOST ONCE per run (FR-010 drift audit — a per-event re-probe pattern breaks the pin)
- 459-13: § Gate-query error taxonomy unchanged + new cross-reference to the pre-flight probe step

Re-pin targets (existing tests that must be updated to match the new prose): any `449-*` block assertion that quotes the two-part `--gates=auto` check verbatim. Audit needed at implementation time.

## R8 — Why `cockpit_gate_list` and not `cockpit_gate_status` (FR-001 implementation choice)

**Decision**: The probe issues `cockpit_gate_list({ issueRef: <identity-ref> })` (with `gateType` omitted). It does NOT call `cockpit_gate_status`.

**Why**:

- **`cockpit_gate_status` requires `(issueRef, gateType, generation)`** (per its `.strict()` schema). There is no natural `(gateType, generation)` pair for a pre-flight probe against an identity ref — the ref does not yet have a specific gate to look up. Constructing a synthetic pair would probe a specific `gateId` that most likely does not exist, giving a pass every time the surface is reachable regardless of whether it works.
- **`cockpit_gate_list` filters by `{issueRef, gateType?}`** with `gateType` optional (per `CockpitGateListInputSchema.gateType` being `.optional()`). Omitting `gateType` returns every non-terminal gate for the identity ref across all gateTypes. An empty `gates: []` is a perfectly good pass — it proves the endpoint enumerates. A non-empty list proves the same thing. Only a non-`ok` return means the surface is broken.
- **List is the natural functional-health shape.** The probe is asking "can we enumerate gates?", not "does a specific gate exist?". `list` is the query that answers that; `status` is not.

**Tool-binding**: `cockpit_gate_status` remains required under `ResolvedGateMode === "ui"` per #457's conditional tool-presence check — a `ui` run needs BOTH tools for the per-event pre-draft check. The pre-flight probe does not add a NEW tool requirement; it just calls one of the two tools already required.

## R9 — Why no new session state

**Decision**: Zero new state added to `auto.md § In-memory loop state additions`. No counter, no flag, no map introduced by this feature.

**Why**:
- **FR-010 requires "at most once per run".** Enforcing this by having only one call site is simpler and more directly checkable than adding a "probe-attempted" flag and checking it before every call.
- **The probe's outcome does not survive it.** A passing probe writes a ledger row and the run proceeds; a failing probe either exits non-zero (`ui`) or resolves the mode down and proceeds (`auto`). In neither case does the outcome need to be inspected later in the run.
- **The four-class error taxonomy is upstream state.** The plugin does not need to track "which class did the last probe attempt return?" — no downstream code asks.

A future feature that DID want per-run health snapshots (e.g., "add a probe-fired-at timestamp") could add state at that point; this feature does not need it.

## Key sources

- Spec: [spec.md](./spec.md)
- Clarifications: [clarifications.md](./clarifications.md) — Q1 (identity-ref probe target), Q2 (inherit ~20s bound, map timeout to `query-unreachable`), Q3 (short-circuit `auto`→`local`), Q4 (four-column ledger with `preflight` / `ui-gate-probe`), Q5 (exact-wording frozen template)
- Playbook target: `packages/claude-plugin-cockpit/commands/auto.md` — § step 1 `--gates` resolution (`:52–:73`), § step 1 F4.4/F4.6/F4.7 (`:96–:132`), § step 1 `Auto run starting` line (`:158–:169`), § step 3 tool-presence check (`:176–:186`), § step 3 escape-hatch tick (`:188–:212`), § Ledger vocabulary (existing transition classes + source tokens), § Gate-query error taxonomy (added by #457 at `:481–:517`)
- Playbook-verification pins: `packages/claude-plugin-cockpit/tests/playbook-verification.test.ts` — existing `449 UI-mode gates` block and `457 sweep-time gate reuse` block are the templates for the new `459 pre-flight functional probe` block; existing formatter equality pin 457-9a (`formatPreDraftCheckErrorLine`) is the template for 459-7a (`formatGateQueryProbeErrorLine`)
- Reference formatter: `packages/claude-plugin-cockpit/lib/gate-status-check.ts § formatPreDraftCheckErrorLine` (lines 220–225) — the pattern this feature mirrors for `formatGateQueryProbeErrorLine`
- Upstream (blocking dependency): [generacy-ai/generacy#1038](https://github.com/generacy-ai/generacy/issues/1038) — read-only gate-status query MCP tools, four-class error taxonomy (`mcp/errors.ts § ErrorClass`), `withRetry(QUERY_RETRY_SCHEDULE)` bounded retry budget, `fetchOnce` `timeoutMs` abort behavior
- Related deployment gap: [generacy-ai/generacy-cloud#877](https://github.com/generacy-ai/generacy-cloud/issues/877) — the 404 that exposed this bug; out of scope for this feature (making the gap legible is; closing it is not)
- Cluster incident: cluster `snappoll-local-2`, 2026-07-25 — the concrete incident that motivated this issue, and the observability pattern (`<issue-ref> · <transition-class> · pre-draft-check · error: internal — … · source: ui-gate` on every Step 0) the fix is designed to make impossible to produce silently
- Repo pin rule: `/workspaces/agency/CLAUDE.md § "Cockpit playbook pins"` — never weaken assertions; re-pin to new contract in the same PR
- Prior parallel work: `specs/449-part-cockpit-remote-gates/` (introduces `--gates=ui|local|auto` and the `Auto run starting` line); `specs/457-part-cockpit-remote-gates/` (introduces the per-event pre-draft check with the four-class error taxonomy this feature reuses); `specs/450-part-cockpit-remote-gates/` (the P4 dogfood run report — one of the nine latent wire/deployment bugs the `--gates=ui` path has now peeled off, per spec § Problem)
