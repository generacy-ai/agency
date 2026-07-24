# Contract: Answered-gate parked-forever escape hatch (FR-009)

Load-bearing prose for the **N=3 escape hatch** that acks parked `answered` gates `superseded` when no D.12 event lands for them. Prose fragments below are meant to be pinned by `packages/claude-plugin-cockpit/tests/playbook-verification.test.ts` in the `describe("457 sweep-time gate reuse", ...)` block.

## Why this is required

Q3 (answered-but-unconsumed gates) established option C (record in `openGates`, let downstream D.12 delivery consume) as the correct behavior. But Q3's required follow-on named the failure mode:

- The MCP `answered` status collapses cloud `answered`, `delivered`, AND `applied` (per generacy `specs/1038-issue-1038/contracts/gate-query.md:62-73`).
- Cluster-side `packages/generacy/.../cockpit-gate-delivery.ts:147-176` re-delivers only docs whose `status == 'answered' AND clusterId matches`.
- A gate stuck at cloud `delivered` (or already `applied` in a prior cluster) will NEVER produce a D.12 event under the new cluster. The `openGates` record persists across sweeps indefinitely, and the issue is parked forever with no operator-visible signal.

The escape hatch is the safety net that eventually surfaces the stuck issue back to the operator by re-deriving from labels.

## Verbatim escape-hatch block (canonical form)

Added at the TOP of § step 3 startup sweep (before the synthetic-event dispatch) AND as sub-step 0 of § step 4's per-wake iteration (before the drain). Both tick sites apply the same block; a "sweep" is defined as either the once-per-session startup sweep OR any single per-wake main-loop iteration. The per-wake tick site is load-bearing for FR-009 reachability: `openGates` entries FIRST added mid-run by a D.n Step 0 `reuse-answered` branch cannot reach `count >= 3` if only the startup sweep ticks (the startup sweep runs before any such entry can be added — the exact reachability hazard called out in #458 review comment 2).

```markdown
**Answered-gate parked-forever escape hatch (UI mode only).** Before dispatching any synthetic event, iterate `openGates` and tick the sweep counter for every entry in `status: 'answered'`:

1. For each `(gateId, record)` in `openGates` where `record.status === 'answered'`:
   `answeredGateSweepCounter.set(gateId, (answeredGateSweepCounter.get(gateId) ?? 0) + 1)`.
2. For each `(gateId, count)` in `answeredGateSweepCounter` where `count >= 3`:
   - Call `cockpit_gate_ack(gateId, outcome: 'superseded', detail: 'answered-not-consumed — presumed stuck at cloud delivered/applied')`.
   - `openGates.delete(gateId)`.
   - `answeredGateSweepCounter.delete(gateId)`.
   - The underlying label is unchanged, so the synthetic-event dispatch that follows this block will re-derive the event from labels; the fresh event proceeds through § Dispatch step 0 (pre-draft check) with a freshly-computed `gateId`. The just-acked gate is now terminal, so `cockpit_gate_status` returns `absent` and drafting proceeds.

The threshold `3` is a load-bearing literal (per `specs/457-part-cockpit-remote-gates/research.md § R5` — provides two full sweeps of margin between "recorded answered" and "declared stuck"; short enough to avoid parking a genuinely-stuck gate for user-perceptible time; long enough to tolerate a slow redelivery). A future edit that changes the value re-triggers the spec's clarify phase.

Under `ResolvedGateMode === "local"` this block is dead prose. `answeredGateSweepCounter` is undefined under `local`; `openGates` has no `status: 'answered'` entries because local mode does not read remote gate state.
```

The verbatim heading `**Answered-gate parked-forever escape hatch (UI mode only).**` is pinned literally. The threshold `3` is pinned literally in the phrase `where count >= 3` (assertion 457-3).

## D.12 counter reset (add to § D.12 gate-answer)

Every D.12 `gate-answer` handler (per `auto.md:743-802`) MUST reset the sweep counter for the resolved gate. Verbatim addition, inserted alongside `openGates.delete(event.gateId)` in step 6 of § D.12:

```markdown
6. **Remove from openGates and reset sweep counter**: on `applied` / `superseded` / `failed`, `openGates.delete(event.gateId)` AND `answeredGateSweepCounter.delete(event.gateId)` (no-op if not present; defensive against V5 violations). A revised-draft re-open (step 5 handler-ambiguity path) creates a NEW record under a fresh `gateId` — the prior record is marked `superseded` and retained in `openGates` per today's rules, and its counter (if any) is deleted so the escape hatch does not fire on a record that is already flagged superseded.
```

**Test assertion 457-12**: § D.12 step 6 heading is `**Remove from openGates and reset sweep counter**` and contains both `openGates.delete(event.gateId)` and `answeredGateSweepCounter.delete(event.gateId)`.

## `answeredGateSweepCounter` state declaration

Added to § In-memory loop state additions (UI mode) at `auto.md:1420-1427`, alongside the existing `openGates` and `firstGateOpenFailureNoted`:

```markdown
- `answeredGateSweepCounter: Map<GateId, number>` — per-sweep counter of consecutive sweeps in which a recorded `answered` gate has produced no D.12 event. Ticked at the top of every sweep by the § step 3 escape-hatch block; reset by every D.12 handler; entries reaching `count >= 3` trigger the FR-009 supersede-and-re-derive path (ack `superseded` with detail `answered-not-consumed — presumed stuck at cloud delivered/applied`, remove from `openGates`, delete the counter entry, re-derive from labels on the same sweep). Under `local` the map is unused.
```

**Test assertion 457-11**: § In-memory loop state additions declares `answeredGateSweepCounter: Map<GateId, number>` verbatim.

## Interactions

- **With the pre-draft check** (contract `pre-draft-check.md`): the pre-draft check WRITES to the counter (increments on `reuse-answered`); the escape hatch READS the counter (fires on `>= 3`). Coupling is one-way; no shared state beyond the map itself.
- **With cloud-side coalescing** (Q4=B / R9): the escape hatch's `cockpit_gate_ack` call is idempotent — a race where two sweeps both fire the escape hatch on the same `gateId` results in one successful ack and one no-op (the second call sees the gate is already terminal). Cloud-side `handleGateOutcome` handles this per `services/api/src/services/relay/message-handler.ts:934-980`.
- **With revised-draft re-open**: a revised-draft re-open marks the original record `superseded` (retained in `openGates` per `auto.md:786`). The escape hatch does NOT fire on `superseded` records — it filters on `status === 'answered'` only. If a revised-draft re-open happens AFTER the pre-draft check recorded the original as `answered`, the counter for the original `gateId` is deleted by the revised-draft flow (via the D.12 counter reset), so the escape hatch does not double-fire.

## Test coverage sketch (for `/speckit:tasks`)

- **457-3**: § step 3 escape-hatch block heading verbatim + `count >= 3` literal + `'answered-not-consumed — presumed stuck at cloud delivered/applied'` detail literal.
- **457-11**: § In-memory loop state additions declares `answeredGateSweepCounter: Map<GateId, number>`.
- **457-12**: § D.12 step 6 heading + both `openGates.delete` and `answeredGateSweepCounter.delete` present.
- **Integration test (SC-005)**: simulate a gate stuck at cloud `delivered` — verify that after N=3 sweeps with no D.12 event, the gate is acked `superseded` with the exact detail string, `openGates` no longer contains the entry, and the next sweep synthesizes a fresh event from the underlying label. The integration test lives under `packages/claude-plugin-cockpit/tests/` in a shape TBD by `/speckit:tasks`.
