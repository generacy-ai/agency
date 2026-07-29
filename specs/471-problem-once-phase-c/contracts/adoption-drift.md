# Contract: § step 3 § Adoption pass — generation-drift branch (FR-013)

**Feature**: [../spec.md](../spec.md)
**Plan**: [../plan.md](../plan.md)
**Data model**: [../data-model.md](../data-model.md)
**Related**: [`adoption-sweep.md`](./adoption-sweep.md) (parent contract)

This contract pins the generation-drift branch of the § step 3 § Adoption pass classifier — the `drift-supersede` branch of [data-model.md § `AdoptionClassification`](../data-model.md).

## Scope

Applies when a `CockpitGateListRow` returned by the adoption pass has:
- `(row.issueRef, row.gateType)` matches a natural gate the current-run sweep would draft for THIS issue,
- `row.generation` differs from the current-run derived generation, AND
- `row.gateType ∈ {clarification, artifact-review, implementation-review, manual-validation}` (the four drift-enabled gateTypes — same set as the live-path drift branch per `auto.md § Pre-draft check — shared rules → generation-drift branch guard`).

**Escalation carve-out** (per FR-013 / V4 / SC-011): for `row.gateType === 'escalation'`, this contract DOES NOT apply. Those rows take the `broad-adopt` branch and are adopted at their stale generation, left non-terminal. See [`adoption-sweep.md`](./adoption-sweep.md).

## Action

For each qualifying row, the adoption pass MUST:

1. **Ack the stale gate `superseded`**:

   ```
   cockpit_gate_ack({
     gateId: row.gateId,
     outcome: 'superseded',
     detail: '<live-path drift-branch detail string, verbatim>',
     runId: row.runId
   })
   ```

   - `gateId` targets the STALE gate (the one the row represents).
   - `outcome` is `'superseded'`.
   - `detail` is the SAME string the live-path drift branch uses in D.1/D.2/D.3/D.4 Step 0 (e.g. `'generation drift — content changed since original draft (was <staleGen>; now <currentGen>)'`, or whatever the live-path uses at the time). Sourced verbatim from the playbook, not re-invented. If the live-path string changes, the adoption path inherits.
   - `runId` is the ROW's `runId` (the originating run's `runId`, per FR-003), NOT the current run's. Server-side accept-and-ignore semantics (per generacy `mcp/gates/schemas.ts § GateAckInputSchema`; `GateOutcomeWireSchema` drops `runId` before the wire — ack targets an existing `gateId` and performs no key derivation) mean the ack still succeeds regardless; encoding the originating `runId` on the wire is for audit/trace parity with `cockpit_gate_open`.

2. **Do NOT add the row to `openGates`.** The gate is now terminal (`superseded`) and invisible to future `cockpit_gate_list` calls. Adding a `superseded` entry to `openGates` would confuse the escape hatch and D.12 routing (both expect only non-terminal statuses).

3. **Do NOT draft a fresh gate in this branch.** The current-run sweep's § Synthetic-event dispatch block (which runs immediately after § Adoption pass per [`adoption-sweep.md § Ordering`](./adoption-sweep.md)) produces the natural-gate event for this issue. That event routes through the drafting D.n dispatch and opens the fresh gate at the current-run generation via `cockpit_gate_open` — which carries the CURRENT run's `runId` (per #469). The adoption pass's job on the drift branch is to CLEAR the stale gate; the drafting is the sweep's job. This ordering keeps the sweep and the live path symmetric: at both, the ack-supersede-then-draft happens as one operator-visible transition (one gate goes away, one gate appears).

## Precedence

The drift branch takes precedence over broad adoption (per FR-009's precedence sentence and FR-013's precedence sentence). A row whose `(issueRef, gateType, generation)` matches nothing but whose `(issueRef, gateType)` matches with generation drift takes the DRIFT branch, not the broad-adopt branch. The classifier evaluates in this order (per V3 / V4):

1. `adopt-natural` — same-generation match.
2. `drift-supersede` — `(issueRef, gateType)` match, generation drift, gateType ∈ drift-enabled set.
3. `broad-adopt` — everything else (including `escalation` gateType with generation drift).

## Symmetry with the live-path drift branch

The live-path drift branch fires in D.1/D.2/D.3/D.4 Step 0 (per `auto.md § Pre-draft check — shared rules`) when a pre-draft `cockpit_gate_status` returns `absent` for the current 4-segment `gateId` AND a subsequent `cockpit_gate_list({issueRef, gateType})` finds a non-terminal gate at a DIFFERENT `generation`. It:

1. Acks the stale gate `superseded` with the same detail string.
2. Drafts fresh at the current generation via `cockpit_gate_open`.

The adoption path fires the SAME first action (ack), and DEFERS the SAME second action (draft) to the subsequent § Synthetic-event dispatch pass. The observable outcome is identical: one gate goes away, one gate appears. The internal control flow differs (two blocks vs one block) so the sweep can enumerate ALL prior-run gates BEFORE any drafting begins — the FR-009 broad-adoption rule requires this ordering.

## Rationale (see also research.md § R4)

Adopting a gate at its prior `generation` would apply an operator verdict computed against **old content** to **current content** (a new PR head SHA, a revised answer-set, an advanced phase). `auto.md § Pre-draft check — shared rules → generation-drift branch guard` states this hazard verbatim: *"Re-attaching would apply an operator verdict computed against an old head SHA to current content — the correctness hazard D.12's supersession checks exist to prevent."* The adoption path does not get a different answer to the same question just because the gate arrived by a different route.

Keeping the sweep and the live path symmetric leaves ONE drift rule to reason about, not two that can diverge.

## Escalation carve-out (V4 / SC-011)

**`row.gateType === 'escalation'` disables this branch.** Four dispatch rows (D.6 G.4a, D.7 G.4b, D.10 G.4c, D.11 G.4d) share the one `escalation` enum value; the wire carries no subtype discriminator (upstream generacy#1046). The drift branch cannot tell them apart, so superseding a prior-run `escalation` gate would potentially destroy an escalation the current run has no way to correctly recreate.

Prior-run `escalation` rows with generation drift take the `broad-adopt` branch instead — adopted at their stale generation, left non-terminal. Same treatment #457 established for the live path.

## Test assertions

- **471-5**: § Adoption pass declares the FR-013 drift branch action verbatim (ack `superseded` + row's `runId` + defer drafting to synthetic-event pass).
- **471-6**: § Adoption pass declares the `escalation` carve-out verbatim.
- **SC-010**: integration test seeds a drift scenario for each of `clarification`, `artifact-review`, `implementation-review`, `manual-validation`; asserts exactly 1 ack + 1 open per scenario, operator sees exactly one gate in the inbox.
- **SC-011**: integration test seeds a prior-run `escalation` at a drifted generation; asserts 0 acks and 1 `openGates` entry with the seeded `gateId`.
