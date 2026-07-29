# Contract: § step 3 § Adoption pass (UI mode)

**Feature**: [../spec.md](../spec.md)
**Plan**: [../plan.md](../plan.md)
**Data model**: [../data-model.md](../data-model.md)

This contract pins the call shape, ordering, count, guard, and adoption-classification behaviour of the new § step 3 § Adoption pass block in `packages/claude-plugin-cockpit/commands/auto.md`. Companion contracts: [`adoption-drift.md`](./adoption-drift.md) (FR-013 generation-drift branch), [`adoption-error-defer.md`](./adoption-error-defer.md) (FR-014 per-issue error handling).

## Scope

Applies to the new § step 3 § Adoption pass (UI mode) block inserted between the § Answered-gate parked-forever escape hatch and the § Synthetic-event dispatch block. Does NOT apply to:

- The § Synthetic-event dispatch block itself (unchanged, runs immediately after).
- The pre-flight capability probe (per #469; separate contract).
- Any live-path (main-loop) `cockpit_gate_list` call — the adoption pass fires only during § step 3 startup sweep.
- `ResolvedGateMode === "local"` — the block is dead prose under `local` (per FR-006).

## Call shape

### Functional list call

```
cockpit_gate_list({ issueRef: <ref>, gateType: <omitted> })
```

**Invariants**:

- Exactly one such call per in-scope issue (per FR-001).
- `gateType` field MUST be omitted from the payload (per FR-001 — the sweep enumerates every non-terminal row for the ref across all gateTypes).
- **`runId` field MUST NOT be present on the payload** (per FR-005 — omitted, not `null`, not `undefined`, not `""`). Reinforces #469 FR-011 from the consumer end.
- Return envelope conforms to `CockpitGateListReturn` (per [data-model.md § `CockpitGateListRow`](../data-model.md)):
  - `{ status: 'ok', gates: readonly CockpitGateListRow[] }` on success.
  - `{ status: 'error', class: string, detail: string }` on any error class after `QUERY_RETRY_SCHEDULE` exhaustion.

### In-scope issue enumeration

The set of in-scope issues for a given run:

- **Epic mode (`invocationForm: epic`)**: `[<epic-ref>] ++ epic.inScopeChildren`. Read from the same `cockpit_status(epic=<epic-ref>, json=true)` call the § Synthetic-event dispatch block immediately below already issues.
- **Epic-less modes (`invocationForm: tracking-existing | tracking-new | tracking-list`)**: `[<tracking-ref>] ++ trackingIssue.taskListRefs`. Read from the same `cockpit_status(issue=<tracking-ref>, json=true)` call the sweep reuses.

**One shared `cockpit_status` call per run**. Adoption does NOT issue a second `cockpit_status`.

## Count invariant

For a run against a scope with `k` in-scope issues (`k = 1 + inScopeChildCount`), the adoption pass issues **exactly `k` `cockpit_gate_list` calls**.

- Epic mode with N in-scope children: `k = N + 1` (per FR-001 / SC-008).
- Epic-less tracking mode with M task-list refs: `k = M + 1`.
- Bare `--tracking` invocation with no task list yet (fresh tracking issue): `k = 1` (the tracking ref itself).

**Test hook**: SC-008 asserts the count equals `1 + inScopeChildCount` on integration test runs via log grep.

## Ordering

The adoption pass MUST run at this position within § step 3, in this order:

1. § step 3 tool-presence check (existing).
2. § step 3 § Answered-gate parked-forever escape hatch (existing; ticks the counter and re-derives per hatch fires from the PRIOR run's `openGates`).
3. **§ step 3 § Adoption pass (this block)** — inserted here.
4. § step 3 § Synthetic-event dispatch (existing; produces synthetic events that route through the D.n dispatch table).

**Why between (2) and (4)**:

- **After (2)** — the escape-hatch tick reads/writes `openGates` from prior-run state (if any). Running adoption first would let adopted `answered` entries be ticked in the same sweep as their initialisation (their counter is 1 → after tick 2 → after next-sweep tick 3 → hatch fires next-sweep-plus-one), which is fine functionally but obscures the ordering. Placing adoption AFTER the escape-hatch tick keeps the tick site's "reads and writes prior-run state" semantic clean.
- **Before (4)** — sweep-time `cockpit_gate_open` calls in the § step 3 extended trigger set fire from the § Synthetic-event dispatch block through the D.n rows. Those opens need adopted entries already in `openGates` at the moment they run, so the sweep-time open finds the adopted entry and issues no duplicate `cockpit_gate_open` for the natural gate (per SC-006). On the drift branch (per [`adoption-drift.md`](./adoption-drift.md)), the adoption pass acks the stale gate `superseded` FIRST, so the sweep's fresh `cockpit_gate_open` at the current-run generation and current-run `runId` produces the sole remaining open for the natural gate.

## Adoption classification per row

For each `CockpitGateListRow` returned for an in-scope issue, the classifier produces exactly one of three branches (per [data-model.md § `AdoptionClassification`](../data-model.md)):

### Branch: `adopt-natural`

**When**: `(row.issueRef, row.gateType, row.generation)` matches a natural gate the current-run sweep would draft for THIS issue.

**Action**:
1. Add a `GateRecord` to `openGates` under `row.gateId` with:
   - `gateId = row.gateId`
   - `gateType = row.gateType`
   - `generation = row.generation`
   - `status = row.status`
   - `runId = row.runId` (per FR-003 — the originating `runId`)
   - `issueRef = row.issueRef`
   - `dispatchClass = mapDispatchClass(row.gateType, row.generation)` (per FR-008 — same mapping-table rule the current-run sweep uses)
   - `transitionClass = mapTransitionClass(row.gateType, row.generation)` (same mapping rule)
   - `inboxUrl`, `title`, `askedAt`, `originalDraft` — NOT populated (DATA GAP)
2. If `row.status === 'answered'`, set `answeredGateSweepCounter[row.gateId] = 1` (per FR-010 / SC-012).
3. No ack fires. No fresh `cockpit_gate_open` fires for this natural gate this pass — the sweep-time `cockpit_gate_open` in step (4) of the ordering above finds the adopted entry under the same 4-segment `gateId` and skips (per SC-006).

### Branch: `drift-supersede`

**When**: `(row.issueRef, row.gateType)` matches a natural gate the current-run sweep would draft for THIS issue, `row.generation` differs from the current-run derived generation, AND `row.gateType ∈ {clarification, artifact-review, implementation-review, manual-validation}` (drift-enabled subset; NOT `escalation`).

**Action**: see [`adoption-drift.md`](./adoption-drift.md). Summary:
1. Ack `superseded` targeting `row.gateId` and `row.runId`.
2. Do NOT add to `openGates`.
3. Do NOT draft here — the § Synthetic-event dispatch block below produces the fresh open at the current-run generation and `runId`.

### Branch: `broad-adopt`

**When**: none of the above. Includes:
- Row with no natural-gate match for THIS issue in the current-run sweep's would-draft set (per FR-009 — most obviously prior-run `implementation-review` on a child that has moved to `manual-validation`).
- Row with `(issueRef, gateType)` match, generation drift, AND `row.gateType === 'escalation'` (per V4 escalation carve-out).

**Action**: same as `adopt-natural` — add a `GateRecord` to `openGates` under `row.gateId` with the same fields (per FR-008), including the row's originating `runId`, `dispatchClass` derived from `(row.gateType, row.generation)`, and the answered-counter initialisation to `1` if `row.status === 'answered'`.

**Key property**: an adopted `broad-adopt` entry with `status === 'open'` sits in `openGates` and does nothing — the escape hatch only ticks `answered` entries, so nothing churns. If the operator answers it, D.12 routes on `(dispatchClass, optionId)`.

## Guard: `ResolvedGateMode === "ui"` only

The entire § Adoption pass block is a no-op under `ResolvedGateMode === "local"` (per FR-006 / V9 / SC-005). No `cockpit_gate_list` calls, no `openGates` writes, no ledger rows. Prose in the playbook MUST state this verbatim.

## Ledger rows

- **Success path (any adoption result — natural, drift, broad, empty return)**: NO ledger row. The adoption pass is control flow, not a dispatch event. Adopted-entry state is observable via post-mortem inspection of the `.ledger` alongside the run's other rows (the adopted gate's `openGates` state is implicitly encoded in the absence of a duplicate `cockpit_gate_open` row for the same natural gate).
- **Failure path (per-issue `cockpit_gate_list` error)**: ONE ledger row per failing issue (per FR-014 / [`adoption-error-defer.md`](./adoption-error-defer.md)).

## Test assertions

The following pins from the plan's test-edits list are validated by this contract:

- **471-1**: § step 3 declares § Adoption pass (UI mode) block positioned as (3) in the ordering above.
- **471-2**: § Adoption pass declares the call shape verbatim with no `runId` field.
- **471-3**: § Adoption pass declares the N+1 count rule.
- **471-4**: § Adoption pass declares the broad-adoption rule (FR-009).
- **471-9**: § Adoption pass declares the FR-006 UI-mode-only guard.
- **471-10**: § Adoption pass declares the FR-005 no-`runId` invariant.

Companion contract test-hook pins (471-5, 471-6, 471-7, 471-8) are pinned by [`adoption-drift.md`](./adoption-drift.md) and [`adoption-error-defer.md`](./adoption-error-defer.md).
