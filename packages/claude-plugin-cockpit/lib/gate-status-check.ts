/**
 * gate-status-check.ts
 *
 * Reference guard functions for the #457 pre-draft gate-status check and the
 * FR-009 answered-gate parked-forever escape hatch. Playbook prose in
 * `packages/claude-plugin-cockpit/commands/auto.md` (§ step 3 startup sweep,
 * § Dispatch D.1/D.2/D.3/D.4/D.7/D.11 step 0, § D.12 gate-answer step 6, and
 * § In-memory loop state additions) IS the source of truth per plan.md §
 * Constitution Check. This module exists so fixture-verified machine checks
 * can pin the shape of the branches the prose describes.
 *
 * Non-load-bearing: the plugin does not import from this module at runtime.
 * It is a machine-checkable mirror of the prose contract in
 * `specs/457-part-cockpit-remote-gates/data-model.md`.
 */

import type { GateId, GateRecord } from "./gate-wire-types.js";

/**
 * Return shape of the `cockpit_gate_status(gateId)` MCP tool (per generacy#1038
 * query-schemas.ts:33-46 and data-model.md § GateStatusResult).
 *
 * The `answered` status COLLAPSES cloud `answered`, `delivered`, AND `applied`
 * (per the #1038 contract). The return payload does NOT include the answer
 * itself — consumption goes through the existing D.12 redelivery path.
 */
export type GateStatusResult =
  | { gateId: GateId; status: "open" | "answered" }
  | { gateId: null; status: "absent" };

/**
 * One element in the return of `cockpit_gate_list({ issueRef, gateType })`
 * (per generacy#1038 query-schemas.ts:58-72). The list is returned in
 * `askedAt` descending order (most recent first) — the plugin uses the
 * most-recent non-terminal gate as the "stale" one to supersede in the drift
 * branch.
 */
export interface GateListEntry {
  gateId: GateId;
  generation: string;
  status: "open" | "answered";
  askedAt: string;
}

export type GateListResult = ReadonlyArray<GateListEntry>;

/**
 * Plugin-side type describing the three branches the pre-draft check takes
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
  | { kind: "draft-fresh" };

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
  const drift = listResult.find((entry) => entry.generation !== currentGeneration);
  if (drift) {
    return {
      kind: "supersede-and-redraft",
      staleGateId: drift.gateId,
      staleGeneration: drift.generation,
      freshGeneration: currentGeneration,
    };
  }
  return { kind: "draft-fresh" };
}

/**
 * Tick the sweep counter for every `openGates` entry currently in status
 * `answered`. Called at the top of every sweep (before synthetic-event
 * dispatch) per auto.md § step 3 escape-hatch block step 1.
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
 * Per auto.md § step 3 escape-hatch block step 2.
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
