# Data Model: `cockpit:auto (--gates=ui)` — Reuse Existing Pending Gates in Startup Sweep

Reference types for the pre-draft check, the answered-gate sweep counter, and the (already-existing but extended) `openGates` record shape. The wire contract for `cockpit_gate_status` / `cockpit_gate_list` is owned upstream by [generacy-ai/generacy#1038](https://github.com/generacy-ai/generacy/issues/1038); the shapes reproduced here are what the playbook prose references. Deviations must be proposed on #1038, not patched here.

## Overview

Three surfaces (in addition to the existing #449 wire surfaces):

1. **Pre-draft gate-status query** — the plugin invokes `cockpit_gate_status({ issueRef, gateType, generation })` (read-only, retry-wrapped in the MCP layer) at the top of each drafting D.n dispatch. The tool's `.strict()` input schema requires all three semantic inputs — the tool server derives `gateKey` and `gateId` internally; the plugin never hand-builds them. Returns one of two shapes: `{ gateId, status: 'open' | 'answered' }` or `{ gateId: null, status: 'absent' }`.
2. **Pre-draft gate-list query (drift check)** — on `absent`, the plugin invokes `cockpit_gate_list({ issueRef, gateType })` to detect generation-drift (a stale gate at a different `generation`). Returns `{ gates: [{gateId, gateType, generation, status}, ...], truncated?: boolean }`. The plugin iterates `result.gates` — NOT the raw return object.
3. **Answered-gate sweep counter** — plugin-side in-memory `Map<GateId, number>` that tracks consecutive sweeps with no D.12 event for each `answered` entry in `openGates`. The N=3 escape hatch reads this counter at the top of EVERY sweep — both the once-per-session startup sweep AND every per-wake iteration of the main loop (per auto.md § step 4 sub-step 0).

## Types

### `GateStatusQuery` — input to `cockpit_gate_status`

Per generacy `mcp/gates/query-schemas.ts § CockpitGateStatusInputSchema` — a `.strict()` object requiring all three semantic inputs (the tool server derives `gateKey`/`gateId` internally; a hand-built `{gateId}` payload would be rejected with `invalid-args`):

```typescript
interface GateStatusQuery {
  issueRef: string;               // owner/repo#N
  gateType: GateType;             // one of: 'clarification' | 'artifact-review' | 'implementation-review' | 'manual-validation' | 'escalation' | 'phase-queue' | 'filing' | 'scope-drained'
  generation: string;             // durable content-derived discriminator (per § UI-mode gate mapping generation-discriminator table at auto.md:1354-1366)
}
```

### `GateStatusResult` — return from `cockpit_gate_status`

Per generacy `mcp/gates/query-schemas.ts § CockpitGateStatusDataSchema`:

```typescript
type GateStatusResult =
  | { gateId: GateId; status: 'open' | 'answered' }
  | { gateId: null; status: 'absent' };
```

**Key contract point (per Q3=C rationale)**: the `answered` status COLLAPSES cloud `answered`, `delivered`, AND `applied`. The return payload does NOT include the answer itself — consumption goes through the existing D.12 redelivery path. **Does NOT include `openedAt`, `inboxUrl`, `title`, or any presentation fields** — the reuse-path plugin record is partial by contract (see auto.md § step 3 sweep `gateId idempotency` DATA GAP note); the "one pointer line" per FR-005 is NOT printed on the reuse path (it requires `inboxUrl`, which the query does not return).

### `GateListQuery` — input to `cockpit_gate_list`

Per generacy `mcp/gates/query-schemas.ts § CockpitGateListInputSchema`:

```typescript
interface GateListQuery {
  issueRef: string;               // owner/repo#N
  gateType: GateType;             // one of the 8 frozen enum values (see GateStatusQuery)
}
```

### `GateListResult` — return from `cockpit_gate_list`

Per generacy `mcp/gates/query-schemas.ts § CockpitGateListDataSchema`. **Object, NOT a bare array** — the plugin iterates `result.gates`; calling `.find()` directly on the raw return would throw ("not a function"):

```typescript
interface GateListResult {
  gates: ReadonlyArray<{
    gateId: GateId;
    gateType: GateType;
    generation: string;           // the durable generation discriminator (per per-gateType table)
    status: 'open' | 'answered';  // non-terminal only; terminal gates are filtered out server-side
  }>;
  truncated?: boolean;            // present-and-`true` when the returned page hides additional non-terminal gates
}
```

**No wire ordering guarantee**: the `gates` array carries no `askedAt` field and no ordering contract in the #1038 spec. Drift detection picks the first entry whose `generation !== <current event's fresh generation>`; when multiple drift entries are present, the plugin acks whichever it observes first and re-runs the check on subsequent sweeps to catch the rest.

**Truncated pages**: `truncated: true` combined with no drift entry in the returned page MUST be treated as `query-unreachable` (a drift entry may exist on a subsequent page the plugin cannot see). Falling through to draft-fresh in that case re-introduces the duplicate-drafting hazard this feature exists to prevent.

**Drift-branch dispatch-identity precondition (guard)**: the drift branch acks another gate `superseded`, so it may fire ONLY when the listed entry's `gateType` AND its dispatch-identifying discriminator (which D.n row opened it) both match the current dispatch. A list entry carries only `{gateId, gateType, generation, status}`; when the discriminator is not recoverable from that, the branch MUST NOT supersede — skip it (do not even issue the list query) and proceed as "no existing gate".

`gateType: 'escalation'` is exactly that case: **four** dispatch rows — D.6 (G.4a), D.7 (G.4b), D.10 (G.4c), D.11 (G.4d) — share the single frozen enum value, and `CockpitGateListInputSchema` filters no finer than `{issueRef, gateType}`. So the drift branch is DISABLED for `escalation`. Without the guard, a D.7 `agent:error` event would find the operator's live D.11 merge-conflict gate at a different `generation`, ack it `superseded`, and destroy it with no replacement (the ack touches no label, so D.11's dedup returns `already-dispatched` on re-fire). The `generation` string MUST NOT be parsed to recover the subtype — it is an opaque `z.string().min(1)` on the wire with no format contract.

**Residual limitation**: escalation-subtype generation drift is therefore undetectable — a genuinely stale escalation gate is left non-terminal alongside the fresh one. This cannot be fixed client-side; it requires a subtype discriminator (or a finer `gateType`) on the query surface. Tracked upstream as [generacy-ai/generacy#1046](https://github.com/generacy-ai/generacy/issues/1046).

### `GateQueryError` — typed error surface

Per generacy `mcp/errors.ts § ErrorClass` and the two query tools' `catch` blocks (`mcp/tools/cockpit_gate_status.ts`, `cockpit_gate_list.ts`). **Four** classes are reachable at these call sites — not a two-way "unreachable vs transient" split:

| class | Produced by | Nature |
|---|---|---|
| `query-unreachable` | `QueryTransportError` AFTER `withRetry(QUERY_RETRY_SCHEDULE)` is exhausted (~3 attempts / ~5s) | sustained cloud/relay outage — retry later |
| `invalid-args` | the tool's `.strict()` `safeParse` rejecting the input, or `QueryInvalidArgsError` | deterministic CALLER bug |
| `internal` | `QueryInternalError`, or any throw wrapped by `wrapToolBoundary` | deterministic SERVER/TOOL bug |
| `transport` | `mapCockpitExitToToolError` on `CockpitExit` code 1 — the call never reached the query surface | unreachable |

```typescript
interface GateQueryError {
  class: 'query-unreachable' | 'invalid-args' | 'internal' | 'transport';
  message: string;
}
```

**No class may be collapsed to `status: 'absent'`, and no class may fall through to draft-fresh.** Only a literal `{status: 'absent'}` ok-return means "no existing gate". Collapsing `query-unreachable` re-introduces the duplicate-drafting hazard (per generacy #1038 FR-014 the sweep aborts and the operator sees a visible error). Collapsing `invalid-args` / `internal` is worse: that bucket is populated exclusively by deterministic bugs, never by a race, so one payload mismatch would silently degrade the whole feature to a no-op. An unrecognized class from a newer tool build routes to the loud bug branch rather than being guessed at.

### `PreDraftCheckOutcome` — plugin-side branching after step 0

Not a wire type; a plugin-side type describing the six branches the pre-draft check takes:

```typescript
type PreDraftCheckOutcome =
  | { kind: 'reuse-open';            gateId: GateId }               // Q1=B / status: 'open'
  | { kind: 'reuse-answered';        gateId: GateId }               // Q3=C / status: 'answered' → tick sweep counter
  | { kind: 'supersede-and-redraft'; staleGateId: GateId; staleGeneration: string; freshGeneration: string }  // Q1=C — only when the drift guard is satisfied
  | { kind: 'draft-fresh' }                                         // absent + no drift (or drift branch disabled by the guard) → current flow
  | { kind: 'abort-query-unreachable'; error: GateQueryError }      // query-unreachable / transport / truncated-hidden-page — retry later
  | { kind: 'abort-gate-query-bug';   error: GateQueryError };      // invalid-args / internal / unknown class — deterministic bug, surfaced loudly
```

The plugin does not persist this type; it is a control-flow tag consumed immediately in the dispatch step and then discarded.

**On `reuse-open` / `reuse-answered`**: the plugin records a PARTIAL `openGates` entry — `{gateId, gateType, generation, issueRef, status, transitionClass, dispatchClass}`. **`dispatchClass` is MANDATORY on this record**: it is known at record time (it is the D.n row performing the reuse) and is NOT recoverable from the query return, while D.12 step 3 keys its live-state supersession check on it and D.12 step 4 routes on `(dispatchClass, optionId)` — an undefined `dispatchClass` resolves no downstream handler, so the operator's answer to a reused gate lands nowhere. The `inboxUrl`, `title`, `askedAt`, and `originalDraft` fields on `GateRecord` are NOT populated (the query returns none of them). This is sufficient for the FR-009 escape hatch's `status === 'answered'` filter and for D.12's `gateId`-identity supersession check; a full record can only be reconstructed by an idempotent `cockpit_gate_open` call, which the reuse path deliberately skips. Extending the query surface to return these fields is tracked as an upstream generacy #1038 follow-up.

### `GateRecord` — extended (existing type from #449)

The `openGates: Map<GateId, GateRecord>` established by #449 gains a `status` field so the sweep counter's N=3 check can distinguish `open` from `answered` entries without an additional MCP call. Additive change; no field removed. The canonical shape lives in `packages/claude-plugin-cockpit/lib/gate-wire-types.ts § GateRecord` (which uses `askedAt`, NOT `openedAt`, and does NOT include `openedAt`). The shape below reflects the canonical field names:

```typescript
interface GateRecord {
  gateId: GateId;
  gateKey: GateKey;
  gateType: GateType;                       // frozen enum value (drives the `hash(issueRef, gateType, generation)` derivation)
  generation: string;                       // durable content-derived discriminator
  issueRef: string;
  transitionClass: string;
  dispatchClass?: 'D.1' | 'D.2' | 'D.3' | 'D.4' | 'D.6' | 'D.7' | 'D.8' | 'D.10' | 'D.11';  // plugin-local; used for D.12 live-state supersession; NOT part of gateId
  askedAt: string;                          // ISO-8601 UTC (canonical field name is `askedAt`, not `openedAt` — see gate-wire-types.ts)
  inboxUrl: string;
  originalDraft: GateDraft;                 // retained for revised-draft comparisons
  status: 'open' | 'answered';              // NEW: added by this feature; drives the sweep counter's N=3 check
}
```

`status` is REQUIRED (not optional) on the canonical type — the FR-009 escape hatch filters `openGates` on `status === 'answered'` at every sweep tick, so a record omitting the field is invisible to the hatch and its issue parks forever. `tickAnsweredSweepCounter` therefore takes a plain `Map<GateId, GateRecord>`; no ad-hoc intersection patching an optional `status` onto the record is permitted (that intersection would let a field-less record type-check against the very filter it must satisfy).

**Reuse-path records are PARTIAL** — the `cockpit_gate_status` query returns only `{gateId, status}`, so `askedAt`, `inboxUrl`, and `originalDraft` cannot be populated on the reuse branches. The plugin stores what it has (`gateId`, `gateType`, `generation`, `issueRef`, `transitionClass`, `status`, **`dispatchClass`**) and marks the missing fields nullable/absent in the reuse-path shape. `dispatchClass` is NOT part of the gap — it is plugin-local knowledge available at record time and is mandatory (see § PreDraftCheckOutcome above). This partial-record limitation is a DATA GAP tracked as a follow-up on generacy #1038.

Rationale for storing `status` on the record rather than in a separate map: it lives with the rest of the gate's identity, so the sweep counter's per-entry test is a single map lookup, and the D.12 handler that resets the counter also removes the entry from `openGates`, so lifecycle is coupled.

### `AnsweredGateSweepCounter` — NEW plugin-side map

```typescript
type AnsweredGateSweepCounter = Map<GateId, number>;
```

Added to § In-memory loop state additions (UI mode), alongside the existing `openGates` and `firstGateOpenFailureNoted`. Lifecycle:

- **Initialize**: `new Map()` at run start (empty).
- **Seed**: the D.n Step 0 `reuse-answered` branch that records the entry increments it to `1`. **That increment IS the entry's count for the sweep in which it was added** — see § V6 counter semantics.
- **Tick**: on each SUBSEQUENT sweep entry, for every `openGates` entry with `status === 'answered'`, `counter.set(gateId, (counter.get(gateId) ?? 0) + 1)`. Both tick sites (startup sweep, per-wake iteration) run BEFORE any dispatch, so an entry seeded during sweep S is never also ticked in sweep S — no sweep is counted twice.
- **Reset**: `counter.delete(gateId)` when a D.12 event resolves the gate (in § D.12 gate-answer step 6).
- **Ack + remove + ACTIVELY re-derive**: on any sweep entry, for every `counter` entry where `count >= N`, invoke the escape hatch — ack `superseded`, remove from `openGates`, delete from counter, then re-read the record's `issueRef` live state with `cockpit_status(issue=<issueRef>, json=true)` and dispatch a synthesized event through the normal D.n path **in the same pass**. Re-derivation MUST NOT be deferred to the next `cockpit_await_events` drain: the ack changes no label and the drain returns only NEW transitions, so no batch would ever carry the re-derived event and the issue would be parked forever with the operator's only surface destroyed. (At the startup-sweep site the synthetic-event pass that immediately follows performs this re-read for every in-scope issue, so the hatch does not synthesize a second time there; at the per-wake site there is no such pass and the hatch's own re-derivation is the sole path.)

## Validation rules

### V1 — `gateId` MUST use the live-path generation function

The pre-draft check's `gateId` MUST be derived using the SAME per-gateType generation function the live path uses (§ UI-mode gate mapping generation-discriminator table at `auto.md:1354-1366`). Deviating (e.g. hard-coding `generation=1` as the sweep does today) produces a `gateId` that cannot coalesce with the live path — the check silently fails and the fix is a no-op. This is the load-bearing invariant FR-002 pins.

### V2 — Presence of `cockpit_gate_status` AND `cockpit_gate_list` — **conditional on `ResolvedGateMode === 'ui'`**

The § step 3 tool-presence check MUST verify both tools are bound **when, and only when, `ResolvedGateMode === 'ui'`**. Under `ui`, absence is a hard-fail (`Print + exit`) matching the seven-baseline-tools precedent — no operator prompt, no ledger dir created; the pre-draft check is unconditional under `ui`, so a silent degradation there would reintroduce exactly the duplicate-drafting symptom this feature removes.

**Under `ResolvedGateMode === 'local'` the two tools are NOT required and their absence is NOT an error.** They are called from exactly one site — § Dispatch step 0 — which is skipped entirely under `local`. Requiring them unconditionally would hard-abort every `--gates=local` run (and every `--gates=auto` run that resolved to `local`, which is the default) on any cluster predating generacy#1038, breaking the § step-1 guarantee that `--gates=local` "preserves today's byte-path exactly". A `local` run MUST NOT fail on a tool it never calls. The conditional mirrors the § step-1 `--gates=ui` pre-flight absence check, where `cockpit_gate_open` absence hard-fails under explicit `ui` but resolves the mode down under `auto`.

So the check names **seven tools under `local`, nine under `ui`**. See R8.

### V3 — Generation-drift ack detail-string

The `cockpit_gate_ack` call in the supersede-and-redraft branch MUST carry a `detail` string naming generation drift explicitly (canonical form: `'generation drift — content changed since original draft (was g<old>, now g<new>)'`). This lets the post-mortem ledger and cloud audit trail distinguish drift-driven supersessions from operator-driven ones. Mirrors the D.12 `superseded (stale generation)` outcome vocabulary at `auto.md:764`.

This ack MUST NOT appear in a Step 0 block whose `gateType` fails the drift-branch guard (i.e. D.7 and D.11, both `gateType: 'escalation'`) — see § GateListResult → drift-branch dispatch-identity precondition.

### V4 — Sweep counter reset on D.12 delivery

Every D.12 `gate-answer` event MUST reset `answeredGateSweepCounter[event.gateId]` (via `delete`) as part of its handler, even in the ack-and-drop paths (step 1 no-record, step 2 stale-generation, step 3 live-state supersession). Without this, a D.12 event that acks superseded without an `openGates` entry would still leave the counter alive — but by V5 the counter can only exist alongside an `openGates` entry, so this validation is defensive.

### V5 — Counter membership implies openGates membership

For every `gateId` in `answeredGateSweepCounter`, `openGates.has(gateId)` MUST be true. The counter is added ONLY during a sweep entry that just recorded an `answered` gate; it is removed either by D.12 delivery (which also removes from `openGates`) or by the N=3 escape hatch (which also removes from `openGates`). An entry violating V5 is a state-machine bug; the plugin does not need to defensively handle it, but the invariant is documented for auditors.

### V6 — N=3 is a load-bearing literal (and the semantics it is measured in)

The escape hatch's threshold N MUST be the literal `3` in the playbook prose. Not "a small integer", not "the value in the config", not "3 (adjustable)". A future edit that changes N re-triggers this spec's clarify phase (per the R5 rationale on how the value was chosen).

**Counter semantics — ONE definition, and all seven sites (the six D.n Step 0 `reuse-answered` branches plus § step 3 / § step 4 tick sites) MUST agree with it.** The counter value is the number of SWEEPS during which the entry has been recorded `answered` and unresolved, **counting the sweep in which it was recorded as sweep 1**. The `answeredGateSweepCounter[gateId]` increment performed by a D.n Step 0 `reuse-answered` branch IS that entry's count for the sweep in which it was added; the tick sites supply every subsequent sweep's increment, and both tick sites run before any dispatch, so no sweep is counted twice for the same entry. An entry recorded during sweep S therefore reaches `3` at sweep S+2 — the "two full sweeps of margin between 'recorded answered' and 'declared stuck'" R5 specifies. The playbook states this semantics explicitly next to the literal.

## Relationships

```
                    step 0 of each drafting D.n dispatch
                            │
                            ▼
                    compute (gateType, generation)   [V1: same function as live path]
                            │
                            ▼
                    cockpit_gate_status({issueRef, gateType, generation})
                            │
                    ┌───────┼───────────────┬────────────────┐
                    │       │               │                │
                    ▼       ▼               ▼                ▼
              status=      status=       status=       ANY typed error
              'open'    'answered'      'absent'      (query-unreachable |
                    │       │               │          transport | invalid-args
                    │       │               │          | internal | unknown)
                    │       │               │                │
                    │       │               ▼                ▼
                    │       │   drift guard: is this   abort this event;
                    │       │   gateType's dispatch    write ledger error row +
                    │       │   row recoverable from   print visible operator
                    │       │   a list entry?          error line; continue with
                    │       │       │                  next event in batch.
                    │       │  ┌────┴──── NO (escalation: D.6/D.7/D.10/D.11
                    │       │  │          share the enum value; #1046) ──┐
                    │       │  │ YES                                     │
                    │       │  ▼                                         ▼
                    │       │  cockpit_gate_list                  draft-fresh
                    │       │  ({issueRef, gateType})             (never supersede
                    │       │       │                              a gate this row
                    │       │  ┌────┴────────┐                     did not open)
                    │       │  │             │
                    │       │  ▼             ▼
                    │       │  drift    no gate → draft-fresh
                    │       │  (different    (unchanged flow)
                    │       │   generation)
                    │       │       │
                    │       │       ▼
                    │       │  cockpit_gate_ack(stale, 'superseded',
                    │       │      detail: 'generation drift …') [V3]
                    │       │       │
                    │       │       ▼
                    │       │  proceed to draft-fresh with new generation
                    │       │
                    ▼       ▼
              record PARTIAL entry in openGates
              (status={'open' | 'answered'}, dispatchClass MANDATORY)
                    │       │
                    │       ▼
                    │  answeredGateSweepCounter.set(gateId, (get ?? 0) + 1)
                    │       │   ← this IS the recording sweep's count [V6]
                    ▼       ▼
              skip drafting subagent; continue to next event
                            │
                            ▼
                (D.12 event later drops in with matching gateId)
                            │
                            ▼
              handler runs; answeredGateSweepCounter.delete(gateId) [V4]
              + openGates.delete(gateId)

                    (parallel: EVERY sweep entry — startup sweep AND every
                     per-wake iteration of the main loop, per FR-009 reachability;
                     ticks only entries seeded in an EARLIER sweep, since both
                     tick sites run before any dispatch)
                            │
                            ▼
                    for each (gateId, count) in answeredGateSweepCounter:
                        if count >= 3 [V6]:
                            cockpit_gate_ack(gateId, 'superseded',
                                detail: 'answered-not-consumed — presumed stuck at cloud delivered/applied')
                            issueRef = openGates.get(gateId).issueRef   ← read BEFORE delete
                            openGates.delete(gateId)
                            answeredGateSweepCounter.delete(gateId)
                            ACTIVELY re-derive, same pass:
                                cockpit_status(issue=issueRef, json=true)
                                → synthesize event from live labels
                                → dispatch through the normal D.n path
                            (NEVER "wait for the next drain": the ack changes no
                             label and cockpit_await_events yields only NEW
                             transitions, so no batch would ever carry it and the
                             issue would park forever with no operator surface)
```

**D.11 defense-in-depth ordering** (per R6; updated per #458 review comment 3, then again per #458 round-3 F1 — the drift branch is now disabled for `escalation` outright, so the ordering exception is belt-and-braces rather than the sole protection):

```
step 0: pre-draft cockpit_gate_status check    [NEW]
        │
        ├─ same-gateId reuse → record + continue (does NOT touch step 1)
        └─ absent:
              │  (drift branch DISABLED — gateType 'escalation' is shared by
              │   D.6/D.7/D.10/D.11 and the wire carries no subtype
              │   discriminator; no cockpit_gate_list call, no drift-ack)
              ├─ IF <issue-ref> in dispatched-issues (sibling label
              │  already dispatched this incident) → ledger
              │  'already-dispatched', return
              └─ ELSE → fall through to draft-fresh
                │
                ▼
step 1: dispatched-issues in-memory set check  [UNCHANGED]
        │
        ├─ already present  → ledger 'already-dispatched' + continue
        └─ not present      → add + fall through to step 1a
                │
                ▼
step 1a: cockpit_context(issue=<issue-ref>)    [UNCHANGED]
        │
        ▼
step 1.5: spawn diagnosis subagent             [UNCHANGED]
        │
        ▼
step 2: present G.4d gate                      [UNCHANGED]
        │
        ▼
step 3: apply verdict                          [UNCHANGED]
```

The pre-draft check (step 0) is ABOVE the in-memory check (step 1) so cross-session reuse (durable gate survived a restart) fires before the in-memory check would even have a chance (a restarted session's in-memory set is empty). The step-0 `absent` branch consults the in-memory `dispatched-issues` set so the sibling merge-conflicts label does not open a SECOND gate for one incident (the two labels hash to different `gateId`s under the escalation discriminator). The two checks are complementary.

**Why D.11-only scoping was not sufficient**: round 2 scoped the guard to "in D.11 ONLY", which merely moved the hazard — a D.7 `agent:error` event would run its own drift branch, find D.11's live gate at a different `generation`, and ack it `superseded` with no replacement. The fix is the general dispatch-identity precondition (see § GateListResult), which disables the drift branch for every `gateType: 'escalation'` row. The D.11 ordering exception is retained on top of it: it suppresses the duplicate second gate per incident and saves a pointless list query.

## Reference implementation notes

The reference module `packages/claude-plugin-cockpit/lib/gate-status-check.ts` (optional; not load-bearing) exposes:

```typescript
export function classifyPreDraftCheck(
  statusResult: GateStatusResult,
  listResult: GateListResult | null,    // {gates, truncated?} — object, not array; `null` when the caller
                                        // deliberately skipped the query (drift branch disabled by the guard)
  currentGeneration: string,
  gateType: GateType,                    // load-bearing: drives the drift-branch dispatch-identity guard
): PreDraftCheckOutcome;                 // `abort-query-unreachable` when the list is truncated with no drift
                                         // entry visible; `draft-fresh` (never supersede) when the guard fails

export function driftBranchMaySupersede(gateType: GateType): boolean;   // false for 'escalation' only
export const DRIFT_GUARD_UNRESOLVABLE_GATE_TYPES: ReadonlySet<GateType>; // { 'escalation' }
export const ESCALATION_DISPATCH_ROWS: readonly ['D.6', 'D.7', 'D.10', 'D.11'];

export function classifyGateQueryError(error: GateQueryError): PreDraftCheckOutcome;
// query-unreachable | transport → abort-query-unreachable (retry later)
// invalid-args | internal | unknown → abort-gate-query-bug (loud)
// NO class maps to draft-fresh — an error is never evidence a gate is absent.

export function formatPreDraftCheckErrorLine(
  issueRef: string,
  error: GateQueryError,
): string;                               // the verbatim visible operator-facing line

export function tickAnsweredSweepCounter(
  openGates: Map<GateId, GateRecord>,    // plain GateRecord — `status` is required on the canonical type
  counter: AnsweredGateSweepCounter,
): void;                                 // called at BOTH tick sites (startup sweep + every per-wake iteration) per FR-009 reachability

export function selectEscapeHatchTargets(
  counter: AnsweredGateSweepCounter,
  threshold: 3,  // literal to match V6
): ReadonlyArray<GateId>;
```

Playbook prose in `commands/auto.md` remains the source of truth per plan.md § Constitution Check. The library exists so fixture-verified machine checks can pin the shape of the branches the prose describes, and so a future author can grep the function names to confirm playbook↔library alignment.

## Fields NOT in scope

- **Answer payload on the query** — Q3=C rules this out; consumption goes through D.12 redelivery. The MCP `status` return has NO answer field. See R4.
- **Per-gate leases / locks** — Q4=B rules this out; cloud-side transactional coalescing on `cockpitGates/{gateId}` is authoritative. See R9.
- **Persisting `openGates` to disk** — spec § Out of scope. Restart safety comes from the durable inbox query, not local persistence.
