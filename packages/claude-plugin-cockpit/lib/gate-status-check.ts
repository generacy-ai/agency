/**
 * gate-status-check.ts
 *
 * Reference guard functions for the #457 pre-draft gate-status check and the
 * FR-009 answered-gate parked-forever escape hatch. Playbook prose in
 * `packages/claude-plugin-cockpit/commands/auto.md` (§ step 3 startup sweep,
 * § step 4 per-wake tick site, § Dispatch D.1/D.2/D.3/D.4/D.7/D.11 step 0,
 * § D.12 gate-answer step 6, and § In-memory loop state additions) IS the
 * source of truth per plan.md § Constitution Check. This module exists so
 * fixture-verified machine checks can pin the shape of the branches the prose
 * describes.
 *
 * Non-load-bearing: the plugin does not import from this module at runtime.
 * It is a machine-checkable mirror of the prose contract in
 * `specs/457-part-cockpit-remote-gates/data-model.md`.
 */

import type { GateId, GateRecord, GateType } from "./gate-wire-types.js";

/**
 * Input to the `cockpit_gate_status` MCP tool. The tool's frozen `.strict()`
 * input schema (per generacy `mcp/gates/query-schemas.ts § CockpitGateStatusInputSchema`)
 * requires all three of `{issueRef, gateType, generation}` — the tool server
 * derives `gateKey` and `gateId` internally. Passing `{gateId}` would be
 * rejected as `invalid-args` (unrecognized key + three missing required keys).
 */
export interface GateStatusQuery {
  issueRef: string;
  gateType: GateType;
  generation: string;
}

/**
 * Return shape of the `cockpit_gate_status` MCP tool (per generacy #1038
 * `mcp/gates/query-schemas.ts § CockpitGateStatusDataSchema` and
 * `data-model.md § GateStatusResult`).
 *
 * The `answered` status COLLAPSES cloud `answered`, `delivered`, AND `applied`
 * (per the #1038 contract). The return payload does NOT include the answer
 * itself — consumption goes through the existing D.12 redelivery path. Does
 * NOT include `openedAt`, `inboxUrl`, or `title` — the reuse-path record on
 * the plugin side is partial by contract (see auto.md § step 3 sweep
 * `gateId idempotency` DATA GAP note).
 */
export type GateStatusResult =
  | { gateId: GateId; status: "open" | "answered" }
  | { gateId: null; status: "absent" };

/**
 * Input to the `cockpit_gate_list` MCP tool. The tool's frozen `.strict()`
 * input schema (per generacy `mcp/gates/query-schemas.ts § CockpitGateListInputSchema`)
 * takes `{issueRef, gateType}` — no `askedAt` / ordering / pagination cursor
 * on the input side.
 */
export interface GateListQuery {
  issueRef: string;
  gateType: GateType;
}

/**
 * One element in the `gates` array returned by `cockpit_gate_list` (per
 * generacy `mcp/gates/query-schemas.ts § CockpitGateListEntrySchema`).
 * The entry carries only `{gateId, gateType, generation, status}` — there is
 * NO `askedAt` field on the wire. The plugin's drift-detection uses
 * `generation` (comparing to the current event's fresh generation), not
 * `askedAt` ordering.
 */
export interface GateListEntry {
  gateId: GateId;
  gateType: GateType;
  generation: string;
  status: "open" | "answered";
}

/**
 * Return shape of the `cockpit_gate_list` MCP tool (per generacy
 * `mcp/gates/query-schemas.ts § CockpitGateListDataSchema`). NOT a bare array —
 * a `{gates, truncated?}` object; `.find()` on the raw return would throw
 * ("not a function"). On `truncated === true` the plugin MUST treat a missing
 * drift entry as query-unreachable rather than falling through to draft-fresh
 * (the missing entry may be on a later page).
 */
export interface GateListResult {
  gates: ReadonlyArray<GateListEntry>;
  truncated?: boolean;
}

/**
 * Typed error surface for `cockpit_gate_status` / `cockpit_gate_list` (per
 * generacy #1038 `mcp/errors.ts`). The `query-unreachable` class fires ONLY
 * after the tool's internal retry budget is exhausted (~3 attempts / ~5s) —
 * it signifies a sustained cloud/relay outage, NOT a transient race. The
 * plugin MUST NOT collapse `query-unreachable` to `status: 'absent'` (that
 * would re-introduce the duplicate-drafting hazard this feature fixes; per
 * generacy #1038 FR-014 the sweep aborts on `query-unreachable` and the
 * operator sees a visible error).
 */
export type GateQueryErrorClass =
  | "query-unreachable"
  | "transient";

export interface GateQueryError {
  class: GateQueryErrorClass;
  message: string;
}

/**
 * Plugin-side type describing the four branches the pre-draft check takes
 * (per data-model.md § PreDraftCheckOutcome). Not a wire type; a control-flow
 * tag consumed immediately in the dispatch step and then discarded.
 */
export type PreDraftCheckOutcome =
  | { kind: "reuse-open"; gateId: GateId }
  | { kind: "reuse-answered"; gateId: GateId }
  | {
      kind: "supersede-and-redraft";
      staleGateId: GateId;
      staleGeneration: string;
      freshGeneration: string;
    }
  | { kind: "draft-fresh" }
  | { kind: "abort-query-unreachable"; error: GateQueryError };

/**
 * Sweep-time counter for consecutive sweeps in which a recorded `answered`
 * gate has produced no D.12 event. Per data-model.md § AnsweredGateSweepCounter
 * and auto.md § In-memory loop state additions (UI mode).
 */
export type AnsweredGateSweepCounter = Map<GateId, number>;

/**
 * The load-bearing N=3 escape-hatch threshold (V6 in data-model.md).
 * A future edit that changes this value re-triggers the spec's clarify phase.
 */
export const ANSWERED_SWEEP_THRESHOLD = 3 as const;

/**
 * Classify a pre-draft check outcome given the `cockpit_gate_status` and
 * `cockpit_gate_list` returns and the freshly-computed generation for the
 * current event. Implements the three-branch rule in
 * `contracts/pre-draft-check.md § Verbatim step-0 block` step 2.
 *
 * `listResult.truncated === true` combined with no drift entry in the returned
 * page returns `abort-query-unreachable` — the plugin cannot safely fall
 * through to draft-fresh because a drift entry may exist on a later page.
 */
export function classifyPreDraftCheck(
  statusResult: GateStatusResult,
  listResult: GateListResult,
  currentGeneration: string,
): PreDraftCheckOutcome {
  if (statusResult.status === "open") {
    return { kind: "reuse-open", gateId: statusResult.gateId };
  }
  if (statusResult.status === "answered") {
    return { kind: "reuse-answered", gateId: statusResult.gateId };
  }
  // status === "absent" — check for generation drift via the list.
  // No ordering is specified by the #1038 contract; the plugin picks the first
  // non-terminal entry whose generation differs from the current event's.
  const drift = listResult.gates.find(
    (entry) => entry.generation !== currentGeneration,
  );
  if (drift) {
    return {
      kind: "supersede-and-redraft",
      staleGateId: drift.gateId,
      staleGeneration: drift.generation,
      freshGeneration: currentGeneration,
    };
  }
  if (listResult.truncated === true) {
    // A truncated page with no drift entry in the visible page may hide a
    // drift entry on a subsequent page. Treat as unreachable per FR-014
    // rather than falling through to draft-fresh — the latter would risk
    // re-drafting a gate that already exists on a later page.
    return {
      kind: "abort-query-unreachable",
      error: {
        class: "query-unreachable",
        message:
          "cockpit_gate_list returned truncated: true with no drift entry in the visible page — a hidden drift entry cannot be ruled out",
      },
    };
  }
  return { kind: "draft-fresh" };
}

/**
 * Tick the sweep counter for every `openGates` entry currently in status
 * `answered`. Called at the top of every sweep (per auto.md § step 3
 * escape-hatch block step 1) AND at the top of every per-wake iteration
 * (per auto.md § step 4 sub-step 0) — both tick sites apply this same
 * function, and the load-bearing reachability property (FR-009) requires
 * both to fire.
 */
export function tickAnsweredSweepCounter(
  openGates: Map<GateId, GateRecord & { status?: "open" | "answered" }>,
  counter: AnsweredGateSweepCounter,
): void {
  for (const [gateId, record] of openGates) {
    if (record.status === "answered") {
      counter.set(gateId, (counter.get(gateId) ?? 0) + 1);
    }
  }
}

/**
 * Return the gateIds whose sweep-counter has reached the N=3 threshold and
 * therefore require the FR-009 escape-hatch ack (`superseded` with detail
 * `answered-not-consumed — presumed stuck at cloud delivered/applied`).
 * Per auto.md § step 3 escape-hatch block step 2 / § step 4 sub-step 0.
 */
export function selectEscapeHatchTargets(
  counter: AnsweredGateSweepCounter,
  threshold: 3 = ANSWERED_SWEEP_THRESHOLD,
): ReadonlyArray<GateId> {
  const targets: GateId[] = [];
  for (const [gateId, count] of counter) {
    if (count >= threshold) targets.push(gateId);
  }
  return targets;
}

/**
 * The exact detail string the escape-hatch ack MUST carry (pinned literally
 * by playbook test 457-3 and by data-model.md § V6).
 */
export const ESCAPE_HATCH_ACK_DETAIL =
  "answered-not-consumed — presumed stuck at cloud delivered/applied" as const;

/**
 * The canonical generation-drift ack detail template (per V3 / contract
 * § Generation-drift ack detail-string convention). Callers substitute
 * `<old>` and `<new>` with the observed generation strings.
 */
export function formatGenerationDriftDetail(oldGen: string, newGen: string): string {
  return `generation drift — content changed since original draft (was g${oldGen}, now g${newGen})`;
}
