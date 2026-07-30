# Data Model: Cockpit Remote Gates — Pre-flight Functional Probe

Reference types for the pre-flight functional probe and the operator-facing failure-line formatter. The wire contract for `cockpit_gate_list` is owned upstream by [generacy-ai/generacy#1038](https://github.com/generacy-ai/generacy/issues/1038); the shapes reproduced here are the ones the plugin already consumes for the #457 per-event pre-draft check. **This feature adds NO new wire types and NO new plugin-side state types.** It adds exactly one new formatter function and one new pair of ledger vocabulary tokens; both are pinned by playbook-verification.

## Overview

Three surfaces (all already established by #457 / #1038, listed here for pin discoverability):

1. **The MCP call the probe issues** — `cockpit_gate_list({ issueRef: <identity-ref> })` with `gateType` omitted. Returns `{ gates: [{gateId, gateType, generation, status}, ...], truncated?: boolean }` on `status: 'ok'`, or a typed `{status: 'error', class, detail, hint?}` shape on any error. The plugin does not iterate `gates` on the probe path — a passing probe checks only that the return is `ok`; the contents of `gates` are ignored (empty `[]` is a perfectly good pass, and any non-empty payload is equally good).
2. **The four-class gate-query error taxonomy** — reused verbatim from `lib/gate-status-check.ts § GateQueryErrorClass`. Any non-`ok` return maps to one of `query-unreachable`, `invalid-args`, `internal`, `transport`; unknown classes route to the loud "gate-query bug" bucket by the same logic that classifies per-event pre-draft-check errors.
3. **The operator-facing line + ledger row** — new pair of ledger vocabulary tokens (`preflight` transition class, `ui-gate-probe` source) plus a new reference formatter `formatGateQueryProbeErrorLine`. No new state, no counter, no map.

## Types

### `GateListQuery` — input to `cockpit_gate_list` (probe form)

Per generacy `mcp/gates/query-schemas.ts § CockpitGateListInputSchema`. `gateType` is OPTIONAL on the wire (`.optional()`), and the probe deliberately omits it — omitting returns every non-terminal gate for the identity ref across all gateTypes, which is strictly stronger evidence that the endpoint enumerates than probing a single gateType would be:

```typescript
interface GateListQuery {
  issueRef: string;               // the run's identity ref (Form 1: epic ref; Forms 2/3/4: trackingRef)
  gateType?: GateType;            // OMITTED by the probe
}
```

**Why omit `gateType`**: the probe is asking "can we enumerate gates for this identity ref?", not "does a specific gateType have any gates open?". Omitting the filter proves the surface responds AT ALL, and a `{gates: []}` pass on a fresh identity ref is unambiguous evidence of health. Passing a specific `gateType` would additionally probe filter-by-gateType behavior — irrelevant to whether the surface works at all.

### `GateListResult` — return from `cockpit_gate_list` (probe path)

Per generacy `mcp/gates/query-schemas.ts § CockpitGateListDataSchema`. **Object, NOT a bare array.** The probe path uses ONLY the fact that the return is `{status: 'ok'}` — it does not inspect `gates` or `truncated`:

```typescript
interface GateListResult {
  gates: ReadonlyArray<{
    gateId: GateId;
    gateType: GateType;
    generation: string;
    status: 'open' | 'answered';
  }>;
  truncated?: boolean;
}
```

**On the probe path, `truncated: true` is NOT a failure.** The per-event pre-draft check treats `truncated: true` + no drift entry as `query-unreachable` (because a drift entry might exist on a later page). The probe does not have that concern — it is not looking for anything specific; enumeration proving the surface responds is the pass condition. A `{gates: [some entry], truncated: true}` return passes the probe; a `{gates: [], truncated: true}` return also passes (the endpoint responded, which is all the probe verifies).

### `GateQueryError` — typed error surface (reused verbatim)

Per `lib/gate-status-check.ts § GateQueryError` and generacy `mcp/errors.ts § ErrorClass`. FOUR classes are reachable at this call site — the same four the per-event `pre-draft-check` handles:

```typescript
type GateQueryErrorClass =
  | 'query-unreachable'   // transport/relay outage after withRetry(QUERY_RETRY_SCHEDULE) exhaustion
  | 'invalid-args'        // .strict() parse rejection — deterministic CALLER bug
  | 'internal'            // wrapped throw / malformed upstream payload — deterministic SERVER bug
  | 'transport';          // the call never reached the query surface — CockpitExit code 1

interface GateQueryError {
  class: GateQueryErrorClass;
  message: string;
}
```

**No class maps to `status: 'absent'` on the probe path** (there is no "absent" state to distinguish — the probe does not look up a specific gate). No class maps to "proceed as pass" either. Every reachable error class fails the probe; the classification is used only for the operator-facing line's `<class>` placeholder and for the `<class>` slot in the ledger row.

**Timeout mapping** (per Q2 answer, R3): a timeout inside `fetchOnce` maps to `QueryTransportError` → `withRetry` exhaustion → `query-unreachable`. The probe adds NO new skill-side timer; the ~20s worst case is the upstream budget's, not a plugin-defined one.

**Unknown-class handling**: an unrecognized class from a newer tool build routes to the same failure path (write the fail ledger row, print the operator-facing line, exit non-zero under `ui` / resolve to `local` under `auto`). This matches `classifyGateQueryError`'s `default:` branch in `lib/gate-status-check.ts` — unknown classes are surfaced loudly, not silently collapsed.

### `ProbeOutcome` — plugin-side branching after the probe call

Not a wire type; a plugin-side type describing the two branches the probe takes:

```typescript
type ProbeOutcome =
  | { kind: 'ok' }                                     // proceed; write ok ledger row
  | { kind: 'error'; error: GateQueryError };          // fail; write error ledger row + print line + exit-or-resolve
```

The plugin does not persist this type; it is a control-flow tag consumed immediately in the resolution step and then discarded. **No enum for "which mode invoked the probe"** — the caller (either the explicit-`ui` branch or the `auto`-third-condition branch of § step 1) knows its own mode and applies the mode-specific tail action (`ui` exits non-zero; `auto` resolves to `local` with the fail row already written).

**Contrast with `PreDraftCheckOutcome`** (from #457's `lib/gate-status-check.ts`): the per-event pre-draft check has six branches (`reuse-open`, `reuse-answered`, `supersede-and-redraft`, `draft-fresh`, `abort-query-unreachable`, `abort-gate-query-bug`) because it does gate-identity work — a match affects subsequent draft/open behavior. The probe has just two because it does no identity work — pass or fail, then continue with the resolved mode. Different callsites, different granularities; both use the same underlying error taxonomy.

### No new session state

**Zero additions to `auto.md § In-memory loop state additions`.**

FR-010 requires "at most once per run"; the invariant is enforced by construction because the probe has exactly one call site in the playbook prose. No `probeAttempted: boolean`, no `lastProbeError: GateQueryError | null`, no `probeAttemptCount: number` — all rejected as unnecessary state (see R9 in `research.md`).

## Formatter

### `formatGateQueryProbeErrorLine`

New exported function in `packages/claude-plugin-cockpit/lib/gate-status-check.ts`. Signature:

```typescript
export function formatGateQueryProbeErrorLine(error: GateQueryError): string {
  return `gate-query surface unavailable (class: ${error.class}): ${error.message} — re-run with --gates=local, or fix the cluster/cloud gate-query deployment`;
}
```

**Contract**:
- **Single template.** All four error classes produce the SAME phrasing; the class is interpolated at `<class>`, the `detail`/`message` at `<detail>`. Per Q5 answer + R6.
- **No `issueRef` argument.** Unlike `formatPreDraftCheckErrorLine`, the probe formatter does not carry an identity ref. The pre-flight probe is against a single identity ref already named in the `Tracking ref:` header; the operator's next action does not depend on which ref was probed. This mirrors the `--gates=ui` absence string (test 449-4), which also does not carry an identity ref.
- **Em-dash pinned.** The `—` (U+2014) between `<detail>` and `re-run with…` is intentional and pinned, matching the em-dash convention in `formatPreDraftCheckErrorLine`.
- **Frozen wording.** A change to the wording requires re-pinning both the auto.md prose (test 459-7) AND the formatter's equality fixtures (test 459-7a). CLAUDE.md § "Cockpit playbook pins" applies: do not weaken, re-pin.

**Fixture-verified assertions (test 459-7a)** — one equality per class:

```typescript
expect(formatGateQueryProbeErrorLine({class: 'query-unreachable', message: 'gate-query-service: connect ETIMEDOUT'}))
  .toBe('gate-query surface unavailable (class: query-unreachable): gate-query-service: connect ETIMEDOUT — re-run with --gates=local, or fix the cluster/cloud gate-query deployment');

expect(formatGateQueryProbeErrorLine({class: 'invalid-args', message: 'unrecognized key issueId (expected: issueRef)'}))
  .toBe('gate-query surface unavailable (class: invalid-args): unrecognized key issueId (expected: issueRef) — re-run with --gates=local, or fix the cluster/cloud gate-query deployment');

expect(formatGateQueryProbeErrorLine({class: 'internal', message: 'cluster query endpoint returned 404'}))
  .toBe('gate-query surface unavailable (class: internal): cluster query endpoint returned 404 — re-run with --gates=local, or fix the cluster/cloud gate-query deployment');

expect(formatGateQueryProbeErrorLine({class: 'transport', message: 'cockpit process exited with code 1 before responding'}))
  .toBe('gate-query surface unavailable (class: transport): cockpit process exited with code 1 before responding — re-run with --gates=local, or fix the cluster/cloud gate-query deployment');
```

These four equality fixtures mirror the assertion shape of test 457-9a for `formatPreDraftCheckErrorLine`.

## Ledger vocabulary additions

Two new tokens are added to the ledger vocabulary. Both are pinned by playbook-verification (test 459-9).

### `preflight` — new transition class

Sibling of the existing transition classes:

| Class | Emitting rule | Example row |
|---|---|---|
| `startup` | § step 3 tool-presence-check fail | `startup · cockpit-mcp-tools-missing · abort · see cluster-base#75` |
| `heartbeat` | § step 4 C4 heartbeat fire | `<ref> · heartbeat · schedule-wakeup · fired · drain empty` |
| `cursor-recovery` | § step 5 Branch A / Branch B recovery | `<epic-ref> · cursor-recovery · invalid-cursor · 1` |
| `epic-complete` | § step 6 exit | `<epic-ref> · epic-complete · exit · zero` |
| **`preflight`** (NEW) | § step 1 gate-query probe | `<identity-ref> · preflight · gate-query-probe · ok · source: ui-gate-probe` |

**Why a new class**: distinguishability. `startup` fires for tool-presence failures (which happen BEFORE the ledger directory is even created — the exception clause in § Ledger applies); `preflight` fires for the probe (which happens AFTER the ledger header exists but BEFORE step 3's sweep dispatches). Reusing `startup` would grep-conflate the two failure modes; a new class buys unambiguous grep for the probe outcome.

### `ui-gate-probe` — new source token

Sibling of the existing source tokens (all UI-mode gate-related, all applied in the outcome slot per the E6 marker convention):

| Token | Emitting rule |
|---|---|
| `ui-gate` | Per-event dispatch under UI mode (introduced by #449) |
| `ui-gate-fallback` | Per-event fallback when `cockpit_gate_open` errored (introduced by #449) |
| `enriched-line` | Dispatch derived from the enriched doorbell line (E6 marker) |
| **`ui-gate-probe`** (NEW) | Pre-flight functional probe |

**Why a new token**: per Q4 answer, using `ui-gate` here would make probe-failure rows grep-identical to per-event `pre-draft-check · error … · source: ui-gate` rows — exactly the indistinguishability that buried the real cause in the motivating incident. `ui-gate-probe` gives the operator two independent grep filters for the cost of one new token.

## Ledger row shapes (pinned)

### Pass (test 459-5)

```
<identity-ref> · preflight · gate-query-probe · ok · source: ui-gate-probe
```

Written exactly once per run when the probe succeeds. `<identity-ref>` is the same value as the ledger header's `Tracking ref:` field (epic ref under Form 1; `trackingRef` under Forms 2/3/4).

### Fail (test 459-6)

```
<identity-ref> · preflight · gate-query-probe · error: <class> — <detail> · source: ui-gate-probe
```

Written exactly once per run when the probe fails. `<class>` is one of the four `GateQueryErrorClass` values verbatim; `<detail>` is the tool's `detail` / `message` field verbatim.

**Distinction from per-event pre-draft-check fail rows** (added by #457):

| Feature | Per-event pre-draft-check | Pre-flight probe |
|---|---|---|
| Transition class | `<transition-class>` (D.n's live class) | `preflight` (fixed) |
| Action slot | `pre-draft-check` | `gate-query-probe` |
| Source slot | `· source: ui-gate` | `· source: ui-gate-probe` |
| Emit frequency | Per event that hit the query error | Exactly one per run (per FR-010) |

A grep for `preflight · gate-query-probe` finds every probe row and nothing else; a grep for `pre-draft-check · error` finds every per-event row and no probe rows. These are independent filters — exactly what the Q4 answer optimized for.

## Ledger clause amendment (pinned by test 459-8)

The § Ledger section of `auto.md` currently excludes "pre-flight failures (before the loop begins)" from what earns a ledger row. This feature narrows that exclusion:

- **Probe pass row** — earns a ledger row (safe because probe fires AFTER F4.7 / step 3 ledger-header emission, so the ledger directory exists).
- **Probe fail row** — earns a ledger row (same reason).
- **§ step-1 hard-fail path** (missing `cockpit_gate_open` under explicit `ui`; usage errors; F4.6 `gh issue create` non-zero exit) — remains ledger-free. These failures happen BEFORE any ledger directory is created; a ledger row there would require creating the directory earlier, breaking every existing test that assumes the directory is not created until after step 1 completes cleanly.

The amendment is narrow: only rows carrying the `preflight` transition class are subject to it. Every other pre-loop failure mode is unchanged.

## Validation rules

### V1 — probe fires from exactly one call site

The probe is invoked from EXACTLY one place in `auto.md`: § step 1 after F4.6/F4.4 has bound the identity ref and after the existing conditions have been evaluated. A future edit that adds a second call site (per-event, per-wake, per-anything) breaks the FR-010 "at most once per run" invariant AND breaks pin 459-12.

### V2 — probe fires ONLY under `ui` (explicit) or `auto`'s third condition

Under `--gates=local` (explicit) OR `--gates=auto` short-circuited to `local` by an earlier condition failing, the probe MUST NOT be called AND no probe ledger row MUST be written. This is the byte-identity contract for `auto`→`local` matching explicit `--gates=local` (per R4). Pin 459-10 audits this.

### V3 — probe pass writes exactly the pass row shape

Any deviation from the verbatim row shape (missing `· source: ui-gate-probe`, wrong transition-class, wrong action-slot) is a drift that pin 459-5 catches.

### V4 — probe fail writes exactly the fail row shape

Same as V3 for the fail path (pin 459-6). The `error: <class> — <detail>` slot mirrors the per-event `pre-draft-check` row's error slot verbatim; the difference is in the transition-class (`preflight` vs live D.n's class) and the source (`ui-gate-probe` vs `ui-gate`).

### V5 — probe fail prints exactly the FR-013 template

The `formatGateQueryProbeErrorLine` return value MUST match the FR-013 template verbatim, with the `<class>` and `<detail>` placeholders filled from the `GateQueryError`. Fixture equality assertions pin this (test 459-7a); prose equality pins the same string in `auto.md` (test 459-7).

### V6 — under `--gates=ui`, probe fail exits non-zero (never resolves to `local`)

Per FR-004: `--gates=ui` never silently degrades to `local`. Pin 459-11 audits this. A `try/catch` in the resolution flow that "falls back to local on probe error under `ui`" is exactly the failure mode this feature exists to prevent — the duplicate-drafting hazard the pre-draft check removes.

### V7 — under `--gates=auto`, probe fail resolves to `local` WITH the fail row written

The fail ledger row is written FIRST, then the resolution is set to `local` and the `Auto run starting · gates: local (source: --gates=auto → probe-failed)` line follows. This makes the resolution visible in both the ledger AND the transcript, matching the shape of the other `→ <resolution reason>` outcomes today.

## Relationships

```
                    § step 1 --gates resolution (end of step 1;
                     after F4.6/F4.4 has bound the identity ref)
                            │
                            ▼
                    parse --gates value
                            │
              ┌─────────────┼──────────────────┐
              │             │                  │
              ▼             ▼                  ▼
        --gates=local   --gates=ui         --gates=auto
              │             │                  │
              │             ▼                  ▼
              │      cockpit_gate_open   Item 1: cockpit_gate_open bound?
              │      bound in binding?    │
              │             │             ├─ NO  → resolve to local (SHORT-CIRCUIT: no probe)
              │             ├─ NO  → hard-fail
              │             │       (verbatim
              │             │        --gates=ui absence
              │             │        string; exit non-zero;
              │             │        no ledger dir created)
              │             ├─ YES → proceed
              │                       │
              │                       │        Item 2: cluster cloud-activated?
              │                       │             │
              │                       │             ├─ NO  → resolve to local (SHORT-CIRCUIT: no probe)
              │                       │             ├─ YES → proceed
              │                       │                       │
              │                       │                       ▼
              │                       │              [both earlier conditions
              │                       │               passed; probe fires next]
              │                       │                       │
              │                       ▼                       │
              │            probe: cockpit_gate_list           │
              │             ({issueRef: <identity-ref>})      │
              │                       │                       │
              │             ┌─────────┼──────────┐            │
              │             │         │          │            │
              │             ▼         ▼          ▼            │
              │           status=  status=    (n/a; probe    │
              │            ok       error      pass path      │
              │             │        │         same           │
              │             │        │         under          │
              │             │        │         auto)          │
              │             │        │                        │
              │             │        │                        │
              │             ▼        ▼                        │
              │       write ok   write error                  │
              │       ledger row  ledger row                  │
              │             │        │                        │
              │             │        ▼                        │
              │             │   print FR-013                  │
              │             │   template line                 │
              │             │        │                        │
              │             │        ▼                        │
              │             │   exit non-zero                 │
              │             │   (--gates=ui only)             │
              │             │                                 │
              │             ▼                                 │
              │      set ResolvedGateMode = "ui"              │
              │                                               │
              │                                               ▼
              │                              [same probe branches, but on FAIL
              │                               under auto: write fail ledger row +
              │                               print FR-013 template line +
              │                               resolve to local (with fail row) +
              │                               print `Auto run starting · gates:
              │                               local (source: --gates=auto →
              │                               probe-failed)` line]
              │                                               │
              ▼                                               ▼
        ResolvedGateMode = "local"                    ResolvedGateMode = "ui" (probe pass)
        (no probe called;                              or "local" (probe fail)
         no probe ledger row)                          (fail row written iff probe was issued)
              │                                               │
              └───────────────────┬───────────────────────────┘
                                  │
                                  ▼
                     § step 3 startup sweep
                     (unchanged; runs after the resolution)
```

## Reference implementation notes

The reference module `packages/claude-plugin-cockpit/lib/gate-status-check.ts` (already present per #457) gains ONE new exported function:

```typescript
export function formatGateQueryProbeErrorLine(error: GateQueryError): string;
```

No other exports are added or changed. The existing `classifyGateQueryError`, `driftBranchMaySupersede`, `DRIFT_GUARD_UNRESOLVABLE_GATE_TYPES`, `ESCALATION_DISPATCH_ROWS`, `classifyPreDraftCheck`, `formatPreDraftCheckErrorLine`, `ANSWERED_SWEEP_THRESHOLD`, and `tickAnsweredSweepCounter` are unchanged and unaffected.

Playbook prose in `commands/auto.md` remains the source of truth per plan.md § Constitution Check. The library exists so fixture-verified machine checks can pin the shape of the error line the prose describes, and so a future author can grep the function name to confirm playbook↔library alignment.

## Fields NOT in scope

- **Per-run probe history** — the probe is one-shot; no history to record. Q3's option-C `probe-skipped` ledger row is explicitly rejected by R4.
- **Probe latency measurement / telemetry** — out of scope. If a future feature needs pre-flight timing telemetry, it can be added then; this feature focuses only on making the failure legible.
- **Distinguishing `probe-timeout` from `query-unreachable` in the ledger** — rejected by Q2. A timeout maps to `query-unreachable` in the four-class taxonomy; there is no new class in the ledger vocabulary.
- **Re-probing after a `local` resolution** — rejected by FR-006. The resolution is decided ONCE at pre-flight; a mid-run flip would reintroduce cross-mode consistency hazards. A future run can re-invoke `/cockpit:auto` to re-probe.
