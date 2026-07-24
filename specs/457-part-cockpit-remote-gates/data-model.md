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

### `GateQueryError` — typed error surface

Per generacy #1038 `mcp/errors.ts`. The `query-unreachable` class fires ONLY after the tool's internal retry budget is exhausted (~3 attempts / ~5s) — it signifies a sustained cloud/relay outage, NOT a transient race. The plugin MUST NOT collapse it to `status: 'absent'` (per generacy #1038 FR-014: sweep aborts on `query-unreachable`; operator sees a visible error).

```typescript
interface GateQueryError {
  class: 'query-unreachable' | 'transient';
  message: string;
}
```

### `PreDraftCheckOutcome` — plugin-side branching after step 0

Not a wire type; a plugin-side type describing the five branches the pre-draft check takes:

```typescript
type PreDraftCheckOutcome =
  | { kind: 'reuse-open';            gateId: GateId }               // Q1=B / status: 'open'
  | { kind: 'reuse-answered';        gateId: GateId }               // Q3=C / status: 'answered' → tick sweep counter
  | { kind: 'supersede-and-redraft'; staleGateId: GateId; staleGeneration: string; freshGeneration: string }  // Q1=C
  | { kind: 'draft-fresh' }                                         // absent + no drift → current flow
  | { kind: 'abort-query-unreachable'; error: GateQueryError };     // sustained cloud/relay outage — MUST NOT collapse to draft-fresh
```

The plugin does not persist this type; it is a control-flow tag consumed immediately in the dispatch step and then discarded.

**On `reuse-open` / `reuse-answered`**: the plugin records a PARTIAL `openGates` entry — `{gateId, gateType, generation, issueRef, status, transitionClass}`. The `inboxUrl`, `title`, `askedAt`, and `originalDraft` fields on `GateRecord` are NOT populated (the query returns none of them). This is sufficient for the FR-009 escape hatch's `status === 'answered'` filter and for D.12's `gateId`-identity supersession check; a full record can only be reconstructed by an idempotent `cockpit_gate_open` call, which the reuse path deliberately skips. Extending the query surface to return these fields is tracked as an upstream generacy #1038 follow-up.

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

**Reuse-path records are PARTIAL** — the `cockpit_gate_status` query returns only `{gateId, status}`, so `askedAt`, `inboxUrl`, and `originalDraft` cannot be populated on the reuse branches. The plugin stores what it has (`gateId`, `gateType`, `generation`, `issueRef`, `transitionClass`, `status`) and marks the missing fields nullable/absent in the reuse-path shape. This partial-record limitation is a DATA GAP tracked as a follow-up on generacy #1038.

Rationale for storing `status` on the record rather than in a separate map: it lives with the rest of the gate's identity, so the sweep counter's per-entry test is a single map lookup, and the D.12 handler that resets the counter also removes the entry from `openGates`, so lifecycle is coupled.

### `AnsweredGateSweepCounter` — NEW plugin-side map

```typescript
type AnsweredGateSweepCounter = Map<GateId, number>;
```

Added to § In-memory loop state additions (UI mode), alongside the existing `openGates` and `firstGateOpenFailureNoted`. Lifecycle:

- **Initialize**: `new Map()` at run start (empty).
- **Tick**: on each sweep entry, for every `openGates` entry with `status === 'answered'`, `counter.set(gateId, (counter.get(gateId) ?? 0) + 1)`.
- **Reset**: `counter.delete(gateId)` when a D.12 event resolves the gate (in § D.12 gate-answer step 6).
- **Ack + remove**: on any sweep entry, for every `counter` entry where `count >= N`, invoke the escape hatch (ack `superseded`, remove from `openGates`, delete from counter).

## Validation rules

### V1 — `gateId` MUST use the live-path generation function

The pre-draft check's `gateId` MUST be derived using the SAME per-gateType generation function the live path uses (§ UI-mode gate mapping generation-discriminator table at `auto.md:1354-1366`). Deviating (e.g. hard-coding `generation=1` as the sweep does today) produces a `gateId` that cannot coalesce with the live path — the check silently fails and the fix is a no-op. This is the load-bearing invariant FR-002 pins.

### V2 — Presence of `cockpit_gate_status` AND `cockpit_gate_list`

At pre-flight, the § step 3 tool-presence check MUST verify both tools are bound. Absence is a hard-fail (`Print + exit`) matching the seven-cockpit-tools precedent — no operator prompt, no ledger dir created. See R8.

### V3 — Generation-drift ack detail-string

The `cockpit_gate_ack` call in the supersede-and-redraft branch MUST carry a `detail` string naming generation drift explicitly (canonical form: `'generation drift — content changed since original draft (was g<old>, now g<new>)'`). This lets the post-mortem ledger and cloud audit trail distinguish drift-driven supersessions from operator-driven ones. Mirrors the D.12 `superseded (stale generation)` outcome vocabulary at `auto.md:764`.

### V4 — Sweep counter reset on D.12 delivery

Every D.12 `gate-answer` event MUST reset `answeredGateSweepCounter[event.gateId]` (via `delete`) as part of its handler, even in the ack-and-drop paths (step 1 no-record, step 2 stale-generation, step 3 live-state supersession). Without this, a D.12 event that acks superseded without an `openGates` entry would still leave the counter alive — but by V5 the counter can only exist alongside an `openGates` entry, so this validation is defensive.

### V5 — Counter membership implies openGates membership

For every `gateId` in `answeredGateSweepCounter`, `openGates.has(gateId)` MUST be true. The counter is added ONLY during a sweep entry that just recorded an `answered` gate; it is removed either by D.12 delivery (which also removes from `openGates`) or by the N=3 escape hatch (which also removes from `openGates`). An entry violating V5 is a state-machine bug; the plugin does not need to defensively handle it, but the invariant is documented for auditors.

### V6 — N=3 is a load-bearing literal

The escape hatch's threshold N MUST be the literal `3` in the playbook prose. Not "a small integer", not "the value in the config", not "3 (adjustable)". A future edit that changes N re-triggers this spec's clarify phase (per the R5 rationale on how the value was chosen).

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
              status=      status=       status=       query-unreachable
              'open'    'answered'      'absent'    (typed error, retries
                    │       │               │        exhausted per FR-014)
                    │       │               │                │
                    │       │               ▼                ▼
                    │       │       cockpit_gate_list      abort this event
                    │       │       ({issueRef, gateType}) write ledger error;
                    │       │               │              continue with next
                    │       │       ┌───────┴────────┐     event in batch
                    │       │       │                │
                    │       │       ▼                ▼
                    │       │  drift (different  no gate → draft-fresh
                    │       │   generation)         (unchanged flow)
                    │       │       │
                    │       │       ▼
                    │       │  cockpit_gate_ack(stale, 'superseded',
                    │       │      detail: 'generation drift …') [V3]
                    │       │       │
                    │       │       ▼
                    │       │  proceed to draft-fresh with new generation
                    │       │
                    ▼       ▼
              record PARTIAL entry in openGates (status={'open' | 'answered'})
                    │       │
                    │       ▼
                    │  answeredGateSweepCounter.set(gateId, (get ?? 0) + 1)
                    │       │
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
                     per-wake iteration of the main loop, per FR-009 reachability)
                            │
                            ▼
                    for each (gateId, count) in answeredGateSweepCounter:
                        if count >= 3 [V6]:
                            cockpit_gate_ack(gateId, 'superseded',
                                detail: 'answered-not-consumed — presumed stuck at cloud delivered/applied')
                            openGates.delete(gateId)
                            answeredGateSweepCounter.delete(gateId)
                            (event will re-derive from labels on the next drain)
```

**D.11 defense-in-depth ordering** (per R6, updated per #458 review comment 3):

```
step 0: pre-draft cockpit_gate_status check    [NEW]
        │
        ├─ same-gateId reuse → record + continue (does NOT touch step 1)
        ├─ absent + no drift → fall through to draft-fresh
        └─ absent + generation drift:
              ├─ IF <issue-ref> in dispatched-issues (sibling label
              │  already dispatched this incident) → skip drift-ack,
              │  ledger 'already-dispatched', return
              └─ ELSE → ack stale superseded + fall through to draft-fresh
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

The pre-draft check (step 0) is ABOVE the in-memory check (step 1) so cross-session reuse (durable gate survived a restart) fires before the in-memory check would even have a chance (a restarted session's in-memory set is empty). **BUT** the step-0 drift-ack sub-branch checks the in-memory `dispatched-issues` set FIRST — without this coupling, the sibling label's drift-ack would destroy the operator's live gate and step 1's dedup would then block the replacement (the exact hazard called out in #458 review comment 3). The two checks are complementary; the ordering exception in the drift-ack sub-branch is load-bearing.

## Reference implementation notes

The reference module `packages/claude-plugin-cockpit/lib/gate-status-check.ts` (optional; not load-bearing) exposes:

```typescript
export function classifyPreDraftCheck(
  statusResult: GateStatusResult,
  listResult: GateListResult,           // {gates, truncated?} — object, not array
  currentGeneration: string,
): PreDraftCheckOutcome;                 // adds `abort-query-unreachable` branch when list is truncated with no drift entry visible

export function tickAnsweredSweepCounter(
  openGates: Map<GateId, GateRecord>,
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
