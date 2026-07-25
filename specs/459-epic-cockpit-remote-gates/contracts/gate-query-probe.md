# Contract: Pre-flight gate-query probe

Load-bearing prose for the new pre-flight probe step in `packages/claude-plugin-cockpit/commands/auto.md` § step 1 `--gates` resolution. Prose fragments below are meant to be pinned by `packages/claude-plugin-cockpit/tests/playbook-verification.test.ts` in the `describe("459 pre-flight functional probe", ...)` block. Any edit that alters the pinned phrases MUST be accompanied by a re-pin in the same PR (per repo CLAUDE.md § "Cockpit playbook pins").

## Scope

Applies at pre-flight, from exactly ONE call site in `auto.md` § step 1 (after F4.6/F4.4 has bound the identity ref; after the existing conditions have been evaluated; before § step 3's tool-presence check dispatches anything).

The probe is issued under **exactly two conditions**:

1. **Explicit `--gates=ui`** — after the existing `cockpit_gate_open`-bound check passes. Failure → hard-fail (exit non-zero) via the § step-1 fail path.
2. **`--gates=auto` third condition** — only after items 1 (`cockpit_gate_open` bound) AND 2 (cluster cloud-activated) BOTH pass. Failure → resolve to `local` (with the fail ledger row written).

The probe is **NEVER** issued under `--gates=local` (explicit) OR under `--gates=auto` short-circuited to `local` by an earlier condition (per FR-005 short-circuit + Q3 answer).

FR-010 is enforced by construction: exactly one call site in the prose means "at most once per run" is structural, not procedural. A future edit that adds a second call site (per-event, per-wake, per-anything) breaks pin 459-12.

## Probe call shape

Exactly one MCP call, no retry orchestration on the plugin side (the upstream `withRetry(QUERY_RETRY_SCHEDULE)` provides all bounded retry):

```
cockpit_gate_list({ issueRef: <identity-ref> })
```

Where `<identity-ref>` is the value already written into the ledger header's `Tracking ref:` field — under Form 1 the epic ref, under Forms 2/3/4 the `trackingRef` bound at F4.4 (reuse) or F4.6 (fresh-creation).

`gateType` is **omitted** from the input — the wire schema (per generacy `mcp/gates/query-schemas.ts § CockpitGateListInputSchema`) declares it optional (`.optional()`), and omitting it returns every non-terminal gate for the identity ref across all gateTypes. This is strictly stronger evidence of endpoint health than probing one gateType would be: an empty `{gates: []}` return proves the endpoint enumerates and responds; a non-empty return proves the same thing; only a non-`ok` return means the surface is broken.

**Why not `cockpit_gate_status`**: the status query requires `.strict()` `{issueRef, gateType, generation}`. There is no natural `(gateType, generation)` pair for a pre-flight probe against an identity ref — the ref does not yet have a specific gate to look up, and constructing a synthetic pair would probe a specific `gateId` that most likely does not exist (giving a false pass every time the surface is reachable regardless of whether it works). The list query is the natural functional-health shape.

**Test assertion 459-1 (three-item list under `--gates=auto`)**: § step 1 `--gates=auto` resolution declares a three-item list with the probe as item 3 AND states the short-circuit rule verbatim.

**Test assertion 459-2 (explicit `--gates=ui` probe step)**: § step 1 explicit `--gates=ui` block declares the probe as a post-tool-presence, post-identity-ref pre-flight step that hard-fails on any error.

## Timeout budget

**No new skill-side timer.** The probe inherits the query-client's already-bounded budget:

- `timeoutMs = 5000ms` per attempt (default, per generacy #1038's query-client `fetchOnce`).
- `QUERY_RETRY_SCHEDULE` provides 3 attempts + ~5s of backoff.
- Worst-case ~20s total before the tool boundary returns a `query-unreachable` error.

A timeout inside `fetchOnce` maps to `QueryTransportError` → `withRetry` exhaustion → `{status: 'error', class: 'query-unreachable'}` — the SAME class the per-event pre-draft-check uses for the same underlying failure mode.

**Why no skill-side timer** (per Q2 answer + research.md § R3):
- **Redundant.** Upstream already bounds.
- **Unenforceable.** `auto.md` is prose driving a model with no primitive to cancel an in-flight MCP call.
- **Would create a class the tool layer can never emit.** A dedicated `probe-timeout` class would be the only class in the taxonomy the tool boundary cannot produce; `internal` would mislabel a transport failure as a deterministic bug.

The plan.md records the ~20s upper bound explicitly so operators diagnosing a hung endpoint know to wait up to ~20s at pre-flight, not indefinitely.

## Error classification (reused verbatim from #457)

Both `cockpit_gate_list` returns `ToolResult<T>`: `{status: 'ok', data}` or `{status: 'error', class, detail, hint?}`. FOUR error classes are reachable at this call site (per generacy `mcp/errors.ts § ErrorClass` and `lib/gate-status-check.ts § GateQueryErrorClass`):

| class | Produced by | Handling |
|---|---|---|
| `query-unreachable` | `QueryTransportError` after `withRetry(QUERY_RETRY_SCHEDULE)` exhaustion (sustained cloud/relay outage; timeout maps here) | Fail the probe (write error ledger row + print FR-013 line + exit-or-resolve) |
| `invalid-args` | `.strict()` `safeParse` rejecting the input OR `QueryInvalidArgsError` (deterministic CALLER bug) | Fail the probe (same handling) |
| `internal` | `QueryInternalError`, or any throw wrapped by `wrapToolBoundary` (deterministic SERVER/TOOL bug) | Fail the probe (same handling) — this is the class the motivating 404 incident produces |
| `transport` | `mapCockpitExitToToolError` on `CockpitExit` code 1 (call never reached the query surface) | Fail the probe (same handling) |

**No class collapses to "pass".** Only a literal `{status: 'ok'}` return passes the probe. An unrecognized class from a newer tool build routes to the same fail path (unknown classes are surfaced loudly, matching `classifyGateQueryError`'s `default:` behavior).

**Test assertion 459-13**: § Gate-query error taxonomy (added by #457 at `auto.md:481-517`) is unchanged AND acquires a new cross-reference to the pre-flight probe step. The taxonomy drift audit prevents the probe from silently diverging from the per-event pre-draft check's error handling.

## Pass path

On `{status: 'ok', data: {gates: [...], truncated?: ...}}`:

1. Write ONE ledger line:
   ```
   <identity-ref> · preflight · gate-query-probe · ok · source: ui-gate-probe
   ```
2. Proceed. Under explicit `--gates=ui`: set `ResolvedGateMode = "ui"` and continue to § step 3. Under `--gates=auto` third condition passing: set `ResolvedGateMode = "ui"` and continue to § step 3.

**No FR-005-style "one pointer line" is printed on a passing probe.** The probe is functional health, not an operator-visible affordance; a pass writes a single ledger row and produces no other transcript output.

**Test assertion 459-5**: The pass ledger row shape is pinned verbatim.

## Fail path

On `{status: 'error', class: <one of four>, detail: <string>, hint?: <string>}`:

1. Write ONE ledger line:
   ```
   <identity-ref> · preflight · gate-query-probe · error: <class> — <detail> · source: ui-gate-probe
   ```

2. Print the operator-facing line, using the FR-013 frozen template with `<class>` and `<detail>` interpolated:
   ```
   gate-query surface unavailable (class: <class>): <detail> — re-run with --gates=local, or fix the cluster/cloud gate-query deployment
   ```
   The line is produced by `lib/gate-status-check.ts § formatGateQueryProbeErrorLine(error)`; the auto.md prose pins the exact string, and the formatter's fixture-equality assertions pin the same string against the same four class values.

3. Mode-specific tail:
   - **Under explicit `--gates=ui`** → exit non-zero. Do NOT start the loop. Do NOT fall back to `local`. (Per FR-004: `--gates=ui` never silently degrades to `local` on probe failure.)
   - **Under `--gates=auto`** → resolve to `local` (the fail ledger row above is already written); print the `Auto run starting · gates: local (source: --gates=auto → probe-failed)` line; continue to § step 3 in `local` mode. (Per FR-005: the second condition of `auto` folds in the probe.)

**Test assertion 459-6**: The fail ledger row shape is pinned verbatim with `<class>` and `<detail>` placeholders.

**Test assertion 459-7**: The operator-facing line template is pinned verbatim in `auto.md`.

**Test assertion 459-11**: On probe failure, `--gates=ui` exits non-zero (no fallback to `local`) AND `--gates=auto` resolves to `local` (with the probe's fail ledger row written).

## Ledger clause amendment

`auto.md` § Ledger today excludes "pre-flight failures (before the loop begins)" from what earns a ledger row. This contract narrows that exclusion:

- **Probe pass row** (`preflight · gate-query-probe · ok · source: ui-gate-probe`) — earns a ledger row.
- **Probe fail row** (`preflight · gate-query-probe · error: <class> — <detail> · source: ui-gate-probe`) — earns a ledger row.
- **§ step-1 hard-fail path** (missing `cockpit_gate_open` under explicit `ui`; usage errors; F4.6 `gh issue create` non-zero exit) — remains ledger-free. These failures happen BEFORE any ledger directory is created; a ledger row there would require creating the directory earlier.

The amendment is narrow: only rows carrying the `preflight` transition class are subject to it. It is safe because the probe fires AFTER F4.7 (Form 4) / top of step 3 (Forms 1/2/3), by which point the ledger header exists.

**Test assertion 459-8**: `auto.md` § Ledger declares the narrow amendment: `preflight · gate-query-probe · ok|error` earns a ledger row despite the general "pre-flight failures do not earn a row" clause; the § step-1 hard-fail path remains ledger-free.

## Ledger vocabulary additions

Two new ledger vocabulary tokens are introduced:

- `preflight` — new transition class (sibling of `startup`, `heartbeat`, `cursor-recovery`, `epic-complete`). A grep for `· preflight ·` finds every probe row and nothing else.
- `ui-gate-probe` — new source token (sibling of `ui-gate`, `ui-gate-fallback`, `enriched-line`). Applied in the outcome slot per the E6 marker convention. A grep for `· source: ui-gate-probe` finds every probe row and nothing else.

**Why not reuse `startup` and `ui-gate`** (per Q4 answer):
- Reusing `startup` would grep-conflate probe failures with tool-presence-check failures (a completely different failure mode).
- Reusing `ui-gate` would make probe-failure rows grep-identical to per-event `pre-draft-check · error … · source: ui-gate` rows — exactly the indistinguishability that buried the real cause in the motivating incident (cluster `snappoll-local-2`, 2026-07-25).

The new tokens buy operators two independent grep filters for the cost of one new token in each vocabulary.

**Test assertion 459-9**: `auto.md` § Ledger declares `preflight` as a transition class AND `ui-gate-probe` as a source token.

## No probe under `--gates=local`

Under `--gates=local` (explicit) OR `--gates=auto` short-circuited to `local` by an earlier condition:

- **Zero probe calls.** No `cockpit_gate_list` invocation. The tool may not even be bound (§ step 3 tool-presence check requires it only under `ui`).
- **Zero probe ledger rows.** No `preflight · gate-query-probe` row is written.
- **No new failure mode.** Every existing local-mode test continues to describe correct behavior.

This is the byte-identity contract: `auto`→`local` must be indistinguishable from explicit `--gates=local` (per auto.md's existing pin). Always-probing would break this pin and would call an unbound tool.

**Test assertion 459-10**: § step 1 declares that under `--gates=local` (explicit OR `--gates=auto` short-circuited) NO probe is issued AND NO probe ledger row is written.

## Interaction with existing pre-flight structure

The probe extends the existing pre-flight structure at exactly two points; nothing else changes.

### § step 1 explicit `--gates=ui`

Today: parse → check `cockpit_gate_open` bound → hard-fail if absent, otherwise proceed.

After this feature: parse → check `cockpit_gate_open` bound → hard-fail if absent → (wait for F4.6/F4.4 to bind identity ref if under Form 4) → issue probe → hard-fail on error, otherwise proceed.

The additional step is entirely additive; the existing hard-fail behavior on missing `cockpit_gate_open` is unchanged and still ledger-free.

### § step 1 `--gates=auto` two-part check → three-part check

Today (verbatim from `auto.md:56–60`):
```
**`--gates=auto` resolution (two-part check, decided ONCE)**. When the parsed value is `auto`, resolve to `ResolvedGateMode` via a two-part check performed at this point in pre-flight:

1. **Tool binding**: Is `cockpit_gate_open` present in the session's MCP tool binding? (same shape as the `cockpit_*` tool-presence check at step 3 below — and, like that check's two gate-query tools, `cockpit_gate_open` is a UI-mode-only requirement.)
2. **Cluster cloud-activation**: (…)
```

After this feature: this becomes a three-part check with the short-circuit rule stated verbatim:
```
**`--gates=auto` resolution (three-part check, decided ONCE)**. When the parsed value is `auto`, resolve to `ResolvedGateMode` via a three-part check performed at this point in pre-flight (with a load-bearing short-circuit — item 3 is issued ONLY when items 1 AND 2 both pass):

1. **Tool binding**: … (unchanged)
2. **Cluster cloud-activation**: … (unchanged)
3. **Gate-query surface functional probe**: Issue one read-only `cockpit_gate_list({ issueRef: <identity-ref> })` call — an empty `{gates: []}` return is a perfectly good pass. Pass → resolve to `ui`; fail (any `{status: 'error'}`, any class) → resolve to `local` via the pre-flight probe fail path (write the fail ledger row, print the FR-013 template line, print `Auto run starting · gates: local (source: --gates=auto → probe-failed)`, proceed to § step 3).

**Short-circuit rule**: when item 1 fails (`cockpit_gate_open` unbound) OR item 2 fails (cluster not cloud-activated), resolve to `local` with NO probe call and NO probe ledger row. Always-probing would break the byte-identity pin `auto`→`local` = explicit `--gates=local`, and would call `cockpit_gate_list` at a point where § step 3's conditional presence check does not require it to be bound.

**Form 4 sequencing**: item 3 requires `trackingRef` to be bound. Under Form 4 that binding happens at F4.4 (reuse) or F4.6 (fresh-creation), both inside step 1. Sequencing: items 1–2 (which do not need `trackingRef`) evaluate first; F4.4/F4.6 run per their own contracts; THEN item 3 fires only when items 1–2 both passed.
```

**Test assertion 459-3**: The `Auto run starting · gates: local (source: --gates=auto → <reason>)` line's `<resolution reason>` suffix enumerates `probe-failed` as a possible value under `--gates=auto`.

**Test assertion 459-4**: § step 1 states the Form 4 sequencing rule — probe fires AFTER F4.6/F4.4 has bound `trackingRef`, NOT alongside conditions 1–2.

**Test assertion 459-12**: The probe is issued AT MOST ONCE per run (drift audit — a future edit that adds per-event re-probing breaks this pin, per FR-010).

## Interaction with existing per-event pre-draft-check (from #457)

The pre-flight probe and the per-event pre-draft-check are complementary, not redundant:

| Aspect | Per-event pre-draft-check (#457) | Pre-flight probe (this feature) |
|---|---|---|
| When | Top of each drafting D.n dispatch, per event | Once per run, at end of § step 1 |
| Purpose | Coalesce duplicate gates on the same `gateId` | Fail fast when the surface itself is broken |
| Call | `cockpit_gate_status(...)` + optional `cockpit_gate_list(...)` | `cockpit_gate_list({issueRef})` |
| Frequency | 1–N per event (N = number of drafting rows dispatched) | Exactly 1 per run |
| Fail action | Abort THAT event, continue with next | Abort THE WHOLE RUN (`ui`) or resolve to `local` (`auto`) |
| Ledger row | `<issue-ref> · <D.n's class> · pre-draft-check · error … · source: ui-gate` | `<identity-ref> · preflight · gate-query-probe · error … · source: ui-gate-probe` |

The probe does NOT replace the per-event check. Mid-run outages (a surface that was healthy at pre-flight but goes down later) remain the responsibility of the per-event `query-unreachable` taxonomy — the probe is about failing fast at startup, not about health-checking the loop.

## Interaction with revised drafts / mid-run edits

None. The probe fires exactly once at pre-flight. Revised drafts (G.1 `make-changes`, G.2 `request-changes`, G.6 `make-changes`) run inside the loop; the probe does not re-fire for them. If the query surface breaks mid-run, the per-event pre-draft-check catches it via `query-unreachable`.

## Interaction with the § UI-mode fallback path

The probe does NOT interact with the § UI-mode fallback path (`auto.md:1386-1418`), which is scoped to `cockpit_gate_open` errors during per-event dispatch. The probe uses `cockpit_gate_list`, and a probe failure is handled by exit (`ui`) or mode-resolution (`auto`), never by fallback to local `AskUserQuestion`.

There is also no per-run "first-probe-failure noted" flag equivalent to `firstGateOpenFailureNoted`. The probe fires at most once by construction (FR-010), so a once-only suppression flag would have nothing to suppress.
