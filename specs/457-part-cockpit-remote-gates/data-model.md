# Data Model: `cockpit:auto (--gates=ui)` — Reuse Existing Pending Gates in Startup Sweep

Reference types for the pre-draft check, the answered-gate sweep counter, and the (already-existing but extended) `openGates` record shape. The wire contract for `cockpit_gate_status` / `cockpit_gate_list` is owned upstream by [generacy-ai/generacy#1038](https://github.com/generacy-ai/generacy/issues/1038); the shapes reproduced here are what the playbook prose references. Deviations must be proposed on #1038, not patched here.

## Overview

Three surfaces (in addition to the existing #449 wire surfaces):

1. **Pre-draft gate-status query** — the plugin invokes `cockpit_gate_status(gateId)` (read-only, retry-wrapped in the MCP layer) at the top of each drafting D.n dispatch. Returns one of two shapes: `{ gateId, status: 'open' | 'answered' }` or `{ gateId: null, status: 'absent' }`.
2. **Pre-draft gate-list query (drift check)** — on `absent`, the plugin invokes `cockpit_gate_list({ issueRef, gateType })` to detect generation-drift (a stale gate at a different `generation`). Returns an array of non-terminal gates for the `(issue, kind)` pair.
3. **Answered-gate sweep counter** — plugin-side in-memory `Map<GateId, number>` that tracks consecutive sweeps with no D.12 event for each `answered` entry in `openGates`. The N=3 escape hatch reads this counter at the top of every sweep.

## Types

### `GateStatusQuery` — input to `cockpit_gate_status`

```typescript
interface GateStatusQuery {
  gateId: GateId;                 // DERIVED by the plugin using the same generation function the live path uses (per § UI-mode gate mapping generation-discriminator table at auto.md:1354-1366)
}
```

### `GateStatusResult` — return from `cockpit_gate_status`

Per generacy `specs/1038-issue-1038/contracts/gate-query.md` and MCP query-schemas.ts:33-46:

```typescript
type GateStatusResult =
  | { gateId: GateId; status: 'open' | 'answered' }
  | { gateId: null; status: 'absent' };
```

**Key contract point (per Q3=C rationale)**: the `answered` status COLLAPSES cloud `answered`, `delivered`, AND `applied`. The return payload does NOT include the answer itself — consumption goes through the existing D.12 redelivery path.

### `GateListQuery` — input to `cockpit_gate_list`

```typescript
interface GateListQuery {
  issueRef: string;               // owner/repo#N
  gateType: string;               // one of: 'clarification' | 'artifact-review' | 'implementation-review' | 'manual-validation' | 'escalation' | 'phase-queue' | 'filing' | 'scope-drained'
}
```

### `GateListResult` — return from `cockpit_gate_list`

Per generacy `query-schemas.ts:58-72`:

```typescript
type GateListResult = ReadonlyArray<{
  gateId: GateId;
  generation: string;             // the durable generation discriminator (per per-gateType table)
  status: 'open' | 'answered';    // non-terminal only; terminal gates are filtered out server-side
  askedAt: string;                // ISO-8601 UTC (for the operator-facing "how long has this been pending" signal, unused by this feature but present in the shape)
}>;
```

**Ordering**: The list is returned in `askedAt` descending order (most recent first). The plugin uses this to identify the most-recent non-terminal gate as the "stale" one to supersede in the drift branch — older entries were already superseded by the more-recent one.

### `PreDraftCheckOutcome` — plugin-side branching after step 0

Not a wire type; a plugin-side type describing the three branches the pre-draft check takes:

```typescript
type PreDraftCheckOutcome =
  | { kind: 'reuse-open';           record: GateRecord }            // Q1=B / status: 'open'
  | { kind: 'reuse-answered';       record: GateRecord }            // Q3=C / status: 'answered' → tick sweep counter
  | { kind: 'supersede-and-redraft'; staleGateId: GateId; staleGeneration: string; freshGeneration: string }  // Q1=C
  | { kind: 'draft-fresh' };                                        // absent + no drift → current flow
```

The plugin does not persist this type; it is a control-flow tag consumed immediately in the dispatch step and then discarded.

### `GateRecord` — extended (existing type from #449)

The `openGates: Map<GateId, GateRecord>` established by #449 gains a `status` field so the sweep counter's N=3 check can distinguish `open` from `answered` entries without an additional MCP call. Additive change; no field removed.

```typescript
interface GateRecord {
  gateId: GateId;
  generation: string;                       // durable content-derived discriminator
  issueRef: string;
  transitionClass: string;
  dispatchClass: 'D.1' | 'D.2' | 'D.3' | 'D.4' | 'D.6' | 'D.7' | 'D.8' | 'D.10' | 'D.11';
  openedAt: string;                         // ISO-8601 UTC; may be earlier than the run's start on a takeover/restart (populated from `cockpit_gate_status` return in the reuse branches, or from the fresh `cockpit_gate_open` return in the draft-fresh branch)
  inboxUrl: string;
  originalDraft: GateDraft;                 // retained for revised-draft comparisons
  status: 'open' | 'answered';              // NEW: added by this feature; drives the sweep counter's N=3 check
}
```

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
                    cockpit_gate_status(gateId)
                            │
                    ┌───────┼───────────────┐
                    │       │               │
                    ▼       ▼               ▼
              status=      status=       status=
              'open'    'answered'      'absent'
                    │       │               │
                    │       │               ▼
                    │       │       cockpit_gate_list({issueRef, gateType})
                    │       │               │
                    │       │       ┌───────┴────────┐
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
              record in openGates (status={'open' | 'answered'})
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

                    (parallel: top-of-sweep, before synthetic-event dispatch)
                            │
                            ▼
                    for each (gateId, count) in answeredGateSweepCounter:
                        if count >= 3 [V6]:
                            cockpit_gate_ack(gateId, 'superseded',
                                detail: 'answered-not-consumed — presumed stuck at cloud delivered/applied')
                            openGates.delete(gateId)
                            answeredGateSweepCounter.delete(gateId)
                            (event will re-derive from labels on this same sweep)
```

**D.11 defense-in-depth ordering** (per R6):

```
step 0: pre-draft cockpit_gate_status check    [NEW]
        │
        ├─ same-gateId reuse → record + continue
        ├─ generation drift  → ack stale + fall through to draft-fresh
        └─ absent + no drift → fall through to draft-fresh
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

The pre-draft check (step 0) is ABOVE the in-memory check (step 1) because the cross-session case (durable gate survived a restart) must be caught before the in-memory case would even have a chance to fire (a restarted session's in-memory set is empty).

## Reference implementation notes

The reference module `packages/claude-plugin-cockpit/lib/gate-status-check.ts` (optional; not load-bearing) may expose:

```typescript
export function classifyPreDraftCheck(
  statusResult: GateStatusResult,
  listResult: GateListResult,
  currentGeneration: string,
): PreDraftCheckOutcome;

export function tickAnsweredSweepCounter(
  openGates: Map<GateId, GateRecord>,
  counter: AnsweredGateSweepCounter,
): void;

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
