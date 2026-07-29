# Data Model: Startup sweep adopts pre-existing non-terminal gates instead of duplicating them across runs

**Feature**: [spec.md](./spec.md)
**Plan**: [plan.md](./plan.md)
**Branch**: `471-problem-once-phase-c`

This document specifies the in-memory record shapes, extended types, and validation rules that fall out of the plan. TypeScript signatures below are the reference-implementation shape; the source of truth is the prose in `packages/claude-plugin-cockpit/commands/auto.md` per plan.md § Constitution Check.

## Entities

### `GateRecord` (extended — per-entry `runId` is now mandatory)

**Location**: `openGates: Map<GateId, GateRecord>` on the UI-mode loop state (per `auto.md § In-memory loop state additions (UI mode)`; per #449 / #457 / #469).

**Change from pre-#471**: adds `runId: RunId` as a mandatory field. Pre-#471 the run's `runId` lived on loop state as a single run-wide value (shared across every `openGates` entry). Post-#471 the field lives PER-ENTRY: current-run entries carry the current run's `runId`; adopted entries carry the originating `runId` read from the `cockpit_gate_list` row.

```ts
import type { RunId } from "./runid.js"; // #469

/**
 * Composite gate identifier, hash(issueRef, gateType, generation, runId).
 * String on the wire; the plugin never hand-builds the hash — the
 * `cockpit_gate_open` MCP tool derives `gateKey` and `gateId` from the
 * semantic inputs the plugin passes (per auto.md § step 3 sweep gateId
 * idempotency).
 */
export type GateId = string;

/**
 * The four dispatch classes that map 1:1 onto a gateType with a live-path
 * generation-drift branch (per auto.md § UI-mode gate mapping).
 */
export type DriftEnabledGateType =
  | "clarification"
  | "artifact-review"
  | "implementation-review"
  | "manual-validation";

/**
 * The full gateType enum on the wire (per generacy mcp/gates/schemas.ts).
 * `escalation` is the drift-disabled row (four dispatch rows share the one
 * enum value — auto.md § Pre-draft check — shared rules → generation-drift
 * branch guard, upstream generacy#1046).
 */
export type GateType = DriftEnabledGateType | "escalation";

/**
 * The non-terminal statuses `cockpit_gate_list` returns (terminal statuses
 * are invisible to list by construction — per FR-007).
 */
export type NonTerminalGateStatus = "open" | "answered";

/**
 * The dispatch class the mapping-table rule derives from
 * (gateType, generation). Same rule the current-run sweep uses (per plan
 * § step 3 § Adoption pass, step 4.i).
 */
export type DispatchClass =
  | "D.1" | "D.2" | "D.3" | "D.4"
  | "D.6" | "D.7" | "D.8" | "D.10" | "D.11";

/**
 * The in-memory record for every `openGates` entry. Post-#471 the `runId`
 * field is mandatory and per-entry. Fields marked `?` are unavailable on
 * adopted / reuse-answered entries because the `cockpit_gate_list` /
 * `cockpit_gate_status` return shapes do not carry them — this is the
 * documented DATA GAP the reuse path already tolerates.
 */
export interface GateRecord {
  readonly gateId: GateId;
  readonly gateType: GateType;
  readonly generation: string;
  readonly issueRef: string;
  readonly status: NonTerminalGateStatus | "superseded";
  readonly transitionClass: string;
  readonly dispatchClass: DispatchClass;

  /**
   * The `runId` that OPENED this gate. Not necessarily the current run's
   * `runId`.
   *
   * - Current-run entries: equals the current run's loop-state `runId`.
   * - Adopted entries: equals the row's `runId` read from
   *   `cockpit_gate_list` (surfaced by generacy-cloud#892).
   *
   * Every downstream `cockpit_gate_ack` for THIS entry reads this field,
   * NOT the run-wide loop-state `runId` (per FR-003 / FR-004).
   */
  readonly runId: RunId;

  // DATA GAP: unavailable on reuse-answered and adopted entries. See
  // auto.md § step 3 sweep 'gateId idempotency' → 'Plugin-side, on a
  // cockpit_gate_status reuse-return'.
  readonly inboxUrl?: string;
  readonly title?: string;
  readonly askedAt?: string;
  readonly originalDraft?: unknown;
}
```

**Provenance discriminator (optional, non-load-bearing)**: implementations MAY carry a `provenance: "current-run" | "adopted-same-gen" | "adopted-non-matching" | "reuse-answered"` field on the record for ledger observability. Not required by any FR; useful for post-mortem grep of `.ledger` files. The spec does not mandate it.

### `CockpitGateListRow` (row shape from the list return)

**Location**: return shape of `cockpit_gate_list({ issueRef, gateType })` (per generacy `mcp/gates/query-schemas.ts` + generacy-cloud#892).

```ts
/**
 * A single non-terminal gate row returned by `cockpit_gate_list`. Terminal
 * statuses are excluded by construction (per FR-007).
 */
export interface CockpitGateListRow {
  readonly gateId: GateId;
  readonly gateType: GateType;
  readonly generation: string;
  readonly status: NonTerminalGateStatus;

  /**
   * The `runId` that opened this gate. First-class field per
   * generacy-cloud#892. Adoption preserves it verbatim into the
   * `GateRecord.runId` field for the adopted entry (per FR-003).
   */
  readonly runId: RunId;
}

/**
 * The full return envelope from `cockpit_gate_list` — either an `ok`
 * envelope carrying zero or more rows, or an `error` envelope. On error,
 * the plan mandates the per-issue defer rule (FR-014).
 */
export type CockpitGateListReturn =
  | { readonly status: "ok"; readonly gates: readonly CockpitGateListRow[] }
  | {
      readonly status: "error";
      readonly class: string;
      readonly detail: string;
    };
```

### `AdoptionClassification` (adoption classifier decision)

**Location**: internal to the § step 3 § Adoption pass block. Not on the wire; not persisted. Documented here so the reference module `lib/adoption.ts` can pin the branch structure.

```ts
/**
 * The three branches the adoption classifier picks for each returned row,
 * evaluated per row for the given in-scope issue (per plan § step 3
 * § Adoption pass, step 4.ii).
 *
 * Precedence rule: `drift-supersede` wins over `broad-adopt` where it
 * applies. Same-generation matches take the `adopt-natural` branch and
 * never fall through to `broad-adopt` (per FR-009's precedence sentence).
 *
 * The classifier does NOT decide "skip" for any row — every non-terminal
 * row for an in-scope issue is either adopted or supersede-and-redrafted
 * (per FR-009's broad-adoption rule).
 */
export type AdoptionClassification =
  /** (issueRef, gateType, generation) matches a natural gate the current
   *  run's sweep would draft for this issue. Adopt as-is. */
  | { readonly branch: "adopt-natural"; readonly row: CockpitGateListRow }
  /** (issueRef, gateType) matches; generation differs; gateType is drift-
   *  enabled (∉ {'escalation'}). Ack the row `superseded` targeting the
   *  row's runId; let the current-run sweep's synthetic-event pass draft
   *  fresh at the current-run generation. Per FR-013. */
  | {
      readonly branch: "drift-supersede";
      readonly row: CockpitGateListRow;
      readonly currentGeneration: string;
    }
  /** Neither of the above. The row does not match any natural gate the
   *  current run would draft, OR it matches but gateType is 'escalation'
   *  (drift-disabled carve-out). Adopt as-is per FR-009's broad-adoption
   *  rule. */
  | { readonly branch: "broad-adopt"; readonly row: CockpitGateListRow };
```

### `AnsweredCounterState` (unchanged shape; adoption seeds initial value)

**Location**: `answeredGateSweepCounter: Map<GateId, number>` on the UI-mode loop state (per `auto.md § step 3 / § step 4 sub-step 0 § Answered-gate parked-forever escape hatch`; per #457).

```ts
/**
 * The escape-hatch counter. Shape unchanged from #457. Adoption seeds
 * entries at value `1` for adopted rows whose `status === 'answered'`
 * (per FR-010 / SC-012), matching the reuse-answered branch semantics.
 * The threshold `3` remains the load-bearing literal per
 * specs/457-part-cockpit-remote-gates/research.md § R5.
 */
export type AnsweredCounterMap = ReadonlyMap<GateId, number>;
```

### `AdoptionLedgerRow` (per-issue defer ledger row shape)

**Location**: appended to the run's `.ledger` file when FR-014 fires (per plan § step 3 § Deferred-to-loop behavior on adoption-path `cockpit_gate_list` failure).

```ts
/**
 * The ledger row shape written on a per-issue `cockpit_gate_list` error
 * (per FR-014 / SC-013). Names the failing issue and the error class.
 * Follows the same one-line format used by the sweep-time
 * `cockpit_gate_open` failure ledger row (per auto.md § step 3
 * § Deferred-to-loop behavior on sweep-time cockpit_gate_open failure).
 *
 * Format (informal, exact wording pinned in the playbook prose):
 *
 *   startup · adoption-list-error · <issueRef> · <errorClass> · deferred-to-next-wake
 *
 * Grep recipes:
 *   grep '· adoption-list-error ·' *.ledger  # all adoption defers
 *   grep '· adoption-list-error · owner/repo#N ·' *.ledger  # specific issue
 */
export interface AdoptionLedgerRow {
  readonly kind: "adoption-list-error";
  readonly issueRef: string;
  readonly errorClass: string;
  readonly detail?: string;
}
```

## Validation rules

### V1 — Per-entry `runId` is mandatory (post-#471)

Every `GateRecord` in `openGates` MUST have a defined, non-empty `runId`. Validation site: the code path that adds an entry to `openGates` (both the current-run open path and the adoption path). No entry MAY be added without a `runId`.

**Rationale**: FR-003 / FR-004. Downstream ack sites read `openGates[gateId].runId`; an entry without one would either crash or default to the run-wide loop-state `runId`, silently reintroducing the pre-#471 shape for adopted entries.

### V2 — Adopted `runId` is the row's `runId`, verbatim

For adoption-path entries, `GateRecord.runId` MUST equal `CockpitGateListRow.runId` for the row that produced the entry. Adoption MUST NOT re-derive, transform, normalise, or fallback the field.

**Rationale**: FR-003. Any transformation breaks the "ack the originating run" property that makes adopted-entry acks land correctly for audit/trace purposes.

### V3 — Same-generation-match precedence

The classifier MUST evaluate the `adopt-natural` branch before the `drift-supersede` branch. A row that same-generation-matches a natural current-run gate MUST NOT fall through to `drift-supersede` even though its `(issueRef, gateType)` also matches.

**Rationale**: `(issueRef, gateType, generation)` match is definitionally a superset condition of `(issueRef, gateType)` match. Evaluating them in the wrong order would supersede a still-valid gate.

### V4 — Drift branch carve-out for `escalation`

The classifier MUST NOT return `drift-supersede` for `row.gateType === 'escalation'` regardless of generation match. Any row with `gateType === 'escalation'` and a generation mismatch takes the `broad-adopt` branch (adopted at its stale generation, left non-terminal).

**Rationale**: FR-013 / SC-011 — four dispatch rows share the one `escalation` enum value and the wire carries no subtype discriminator. Superseding would potentially destroy an escalation the current run has no way to recreate correctly.

### V5 — Broad adoption covers every returned row (no silent skips)

For every non-terminal `CockpitGateListRow` returned for an in-scope issue, the classifier MUST return exactly one of the three branches. No row MAY be silently dropped.

**Rationale**: FR-009's broad-adoption rule exists because narrower rules leave orphaned inbox entries — the exact symptom this spec eliminates. A silent skip is the same failure mode by another name.

### V6 — Adopted `answered` counter initialisation

For every entry adopted with `status === 'answered'`, the classifier MUST set `answeredGateSweepCounter[gateId] = 1` in the SAME atomic step as adding the entry to `openGates`. No sweep can tick the counter for that entry until after this initialisation.

**Rationale**: FR-010 / SC-012. Failing to seed at 1 means the entry either never triggers the escape hatch (starts at 0; needs 3 sweeps not 2) or triggers it too early. Matches the reuse-answered branch semantics established by #457.

### V7 — Per-issue defer on `cockpit_gate_list` error is exclusive-or with drafting

When FR-014 fires for issue X (any `class` in the error envelope), the sweep MUST NOT dispatch a drafting D.n Step 0 for any natural gate on X in this pass. The defer skips adoption AND drafting; a partial defer that skips adoption but still drafts would produce the exact duplicate-inbox symptom FR-014's rationale exists to remove.

**Rationale**: FR-014. This is the branch the spec's Q5 analysis explicitly rejected (option B, "soft-fail then draft").

### V8 — `runId` is NOT on the wire for the functional `cockpit_gate_list` call

The adoption path's `cockpit_gate_list({ issueRef, gateType: <omitted> })` call MUST NOT carry a `runId` field on the payload — omitted, not `null`, not `undefined`, not an empty string.

**Rationale**: FR-005 (reinforces #469 FR-011). The cloud contract refines `runId requires generation`; list mode has no `generation`; forwarding `runId` 400s at the cloud endpoint. Phase B's handler drops the field locally for the probe (which is why the probe is safe) but the plan asserts the invariant at the payload construction site so no future refactor can silently attach it.

### V9 — UI-mode-only guard

The § Adoption pass block MUST be a no-op under `ResolvedGateMode === "local"`. No `cockpit_gate_list` calls, no `openGates` writes, no ledger rows.

**Rationale**: FR-006 / SC-005. `--gates=local` invariance is a hard boundary.

## Relationships

### `openGates` after § Adoption pass

For an epic-mode run against an epic with N in-scope children under `ResolvedGateMode === "ui"`:

- The § Adoption pass fires N+1 `cockpit_gate_list` calls (per FR-001 / SC-008).
- Zero, some, or all of the returned non-terminal rows are adopted; the exact count depends on prior-run state. Empty returns (fresh invocation, no prior runs) are the normative case and cost N+1 empty calls with no `openGates` writes.
- Same-generation-matches produce adopted natural-gate entries.
- Generation-drift matches produce ONE ack (`superseded` targeting the row's `runId`) and NO `openGates` entry — the current-run sweep's synthetic-event pass produces the fresh open below.
- Non-matching rows produce adopted broad-adopt entries.
- Per-issue error returns produce ONE ledger row per failing issue and NO `openGates` entries.

### `GateRecord.runId` vs run-wide loop-state `runId`

Post-#471 these two are DIFFERENT concepts:

| Concept | Value | Site |
|---------|-------|------|
| Run-wide loop-state `runId` | Current run's `runId`, derived once at pre-flight per #469 | Every current-run `cockpit_gate_open` payload (per #469); the § D.12 step 1 no-record ack payload |
| Per-entry `GateRecord.runId` | The `runId` of the run that OPENED this specific gate | Every `cockpit_gate_ack` payload for an `openGates` entry (§ step 3 / § step 4 sub-step 0 escape hatch; § D.12 steps 3 and 5) |

The two coincide for current-run entries. They differ for adopted entries.

### FR precedence graph

```
FR-001 (N+1 count) ──┐
                     ├─→ FR-002 (adopt matching) ────┐
FR-005 (no runId on list) ─┘                         ├─→ FR-003 (ack originating runId)
                                                     │         │
FR-006 (UI-mode-only) ─────────────────────────────→ │         └─→ FR-004 (per-entry runId)
                                                     │
                            FR-009 (broad adoption) ─┤
                                                     │
                            FR-013 (drift branch) ───┘ ← precedence over FR-009
                            FR-013 escalation carve-out
                            FR-010 (answered counter = 1)
                            FR-014 (per-issue defer)
```

## Enums

### `ResolvedGateMode` (unchanged; guards adoption)

Values: `"ui" | "local"` (per `auto.md § step 1 § --gates resolution`). The adoption pass runs under `ui` and is dead prose under `local` (per V9 / FR-006).

### `NonTerminalGateStatus` (unchanged shape)

Values: `"open" | "answered"` (per FR-007). `cockpit_gate_list` returns only these; terminal statuses (`applied`, `superseded`, `failed`, `expired`) are invisible to list by construction.

### `GateType` enum (unchanged shape)

Values: `"clarification" | "artifact-review" | "implementation-review" | "manual-validation" | "escalation"`. Drift-enabled subset: all except `"escalation"` (per V4).

## Fixtures (for the optional `lib/adoption.ts` reference module)

The plan defers the `lib/adoption.ts` decision to the tasks phase. If added, these fixtures pin the classifier branches and are the source of the corresponding pins in `playbook-verification.test.ts`:

| Fixture | Input | Expected branch |
|---------|-------|-----------------|
| `same-gen-match` | row `(gateType: 'clarification', generation: 'sweep:1')`, current sweep would draft `(gateType: 'clarification', generation: 'sweep:1')` | `adopt-natural` |
| `drift-match` | row `(gateType: 'implementation-review', generation: 'pr-sha:abc123')`, current sweep would draft `(gateType: 'implementation-review', generation: 'pr-sha:def456')` | `drift-supersede` |
| `non-matching` | row `(gateType: 'implementation-review', ...)`, current sweep would draft `(gateType: 'manual-validation', ...)` | `broad-adopt` |
| `escalation-drift` | row `(gateType: 'escalation', generation: 'occurrence:2')`, current sweep would draft `(gateType: 'escalation', generation: 'occurrence:3')` | `broad-adopt` (V4 carve-out) |
| `escalation-same-gen` | row `(gateType: 'escalation', generation: 'occurrence:2')`, current sweep would draft `(gateType: 'escalation', generation: 'occurrence:2')` | `adopt-natural` |
| `adopted-answered-counter` | row `(status: 'answered', ...)` (any branch) | `answeredGateSweepCounter[gateId] === 1` after adoption |
