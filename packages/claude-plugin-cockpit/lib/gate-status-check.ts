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
 * Typed error surface for `cockpit_gate_status` / `cockpit_gate_list`.
 *
 * These are the FOUR classes actually reachable at these two call sites, read
 * off the shipped implementation — NOT a two-way "unreachable vs transient"
 * split:
 *
 * - `query-unreachable` — `QueryTransportError` surfaced only AFTER
 *   `withRetry(QUERY_RETRY_SCHEDULE)` is exhausted (~3 attempts / ~5s); a
 *   sustained cloud/relay outage, not a race
 *   (generacy `mcp/tools/cockpit_gate_status.ts`, `cockpit_gate_list.ts`).
 * - `invalid-args` — the tool's `.strict()` `safeParse` REJECTED the input, or
 *   the client raised `QueryInvalidArgsError`. A deterministic CALLER bug.
 * - `internal` — `QueryInternalError`, or any throw wrapped by
 *   `wrapToolBoundary`. A deterministic SERVER/TOOL bug.
 * - `transport` — `mapCockpitExitToToolError` on `CockpitExit` code 1: the
 *   call never reached the query surface (generacy `mcp/errors.ts`).
 *
 * NONE of them may be collapsed to `status: 'absent'`. `query-unreachable`
 * collapsed to absent re-introduces the duplicate-drafting hazard this feature
 * fixes (per generacy #1038 FR-014 the sweep aborts and the operator sees a
 * visible error). `invalid-args` / `internal` collapsed to absent is worse:
 * that bucket is populated exclusively by deterministic bugs, never by a race,
 * so one payload mismatch would silently degrade the whole check to a no-op.
 */
export type GateQueryErrorClass =
  | "query-unreachable"
  | "invalid-args"
  | "internal"
  | "transport";

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
  /** Cloud/relay could not be read — retry-later. Abort this event, visible error. */
  | { kind: "abort-query-unreachable"; error: GateQueryError }
  /** Deterministic caller/server bug — abort this event, LOUD visible error. */
  | { kind: "abort-gate-query-bug"; error: GateQueryError };

/**
 * Sweep-time counter for consecutive sweeps in which a recorded `answered`
 * gate has produced no D.12 event. Per data-model.md § AnsweredGateSweepCounter
 * and auto.md § In-memory loop state additions (UI mode).
 *
 * Counter semantics (single definition, per auto.md § step 3 **Counter
 * semantics**): the value is the number of SWEEPS during which the entry has
 * been recorded `answered` and unresolved, counting the sweep in which it was
 * recorded as sweep 1. The D.n Step 0 `reuse-answered` branch seeds the entry
 * at 1; `tickAnsweredSweepCounter` supplies every SUBSEQUENT sweep's increment.
 * Both tick sites run before any dispatch, so a given sweep is never counted
 * twice for the same entry.
 */
export type AnsweredGateSweepCounter = Map<GateId, number>;

/**
 * gateTypes whose **dispatch row is NOT recoverable** from a `cockpit_gate_list`
 * entry, and for which the generation-drift branch is therefore DISABLED (per
 * auto.md § Pre-draft check — shared rules → generation-drift branch guard).
 *
 * `escalation` is the only member: four dispatch rows — D.6 (G.4a), D.7 (G.4b),
 * D.10 (G.4c), D.11 (G.4d) — all open gates under the single frozen enum value
 * `escalation` (generacy `mcp/gates/schemas.ts § GateTypeSchema`), while
 * `cockpit_gate_list` filters no finer than `{issueRef, gateType}` and its
 * entries carry only `{gateId, gateType, generation, status}`
 * (`mcp/gates/query-schemas.ts`). Nothing on the wire says WHICH row opened a
 * listed gate, so a drift-ack from one row would silently destroy another row's
 * live operator gate — with no replacement, because the ack touches no label.
 *
 * The `generation` string MUST NOT be parsed to recover the subtype: it is an
 * opaque `z.string().min(1)` on the wire with no format contract.
 *
 * Residual limitation, tracked upstream as generacy-ai/generacy#1046.
 */
export const DRIFT_GUARD_UNRESOLVABLE_GATE_TYPES: ReadonlySet<GateType> = new Set<GateType>([
  "escalation",
]);

/** The four dispatch rows that share `gateType: 'escalation'`. */
export const ESCALATION_DISPATCH_ROWS = ["D.6", "D.7", "D.10", "D.11"] as const;

/**
 * The generation-drift branch's dispatch-identity precondition. `false` means
 * the caller MUST skip the drift branch entirely (do not even issue the
 * `cockpit_gate_list` query) and proceed as "no existing gate".
 */
export function driftBranchMaySupersede(gateType: GateType): boolean {
  return !DRIFT_GUARD_UNRESOLVABLE_GATE_TYPES.has(gateType);
}

/**
 * Route a typed gate-query error onto its abort branch. Every class aborts —
 * NO class maps to `draft-fresh`. Only a literal `{status: 'absent'}` ok-return
 * means "no existing gate"; an error is never evidence that a gate is absent.
 *
 * An unrecognized class (from a newer tool build) routes to the loud
 * `abort-gate-query-bug` branch rather than being guessed at.
 */
export function classifyGateQueryError(error: GateQueryError): PreDraftCheckOutcome {
  switch (error.class) {
    case "query-unreachable":
    case "transport":
      return { kind: "abort-query-unreachable", error };
    case "invalid-args":
    case "internal":
      return { kind: "abort-gate-query-bug", error };
    default:
      return { kind: "abort-gate-query-bug", error };
  }
}

/**
 * The visible operator-facing line the pre-draft check prints on ANY gate-query
 * error (pinned literally by auto.md § Pre-draft check — shared rules →
 * Gate-query error taxonomy). Printed in addition to the ledger row.
 */
export function formatPreDraftCheckErrorLine(
  issueRef: string,
  error: GateQueryError,
): string {
  return `pre-draft gate check failed for ${issueRef} (${error.class}): ${error.message} — not drafting; see the run ledger`;
}

/**
 * The visible operator-facing line the pre-flight gate-query probe prints on
 * ANY error (pinned literally by auto.md § step 1 --gates resolution → probe
 * fail path). Printed AFTER the fail ledger row and BEFORE the mode-specific
 * tail action (exit non-zero under explicit --gates=ui; resolve to local under
 * --gates=auto).
 *
 * Deliberately does NOT take issueRef — the probe is against a single identity
 * ref already named in the ledger header's Tracking ref: field, and the
 * operator's next action (--gates=local, or fix the cluster/cloud deployment)
 * does not depend on which ref was probed. This mirrors the --gates=ui absence
 * string (test 449-4), which also carries no identity ref.
 *
 * Single frozen template for all four `GateQueryErrorClass` values; any change
 * to the wording requires re-pinning both the auto.md prose (test 459-7) and
 * the fixture-equality assertions (test 459-7a).
 */
export function formatGateQueryProbeErrorLine(error: GateQueryError): string {
  return `gate-query surface unavailable (class: ${error.class}): ${error.message} — re-run with --gates=local, or fix the cluster/cloud gate-query deployment`;
}

/**
 * The load-bearing N=3 escape-hatch threshold (V6 in data-model.md).
 * A future edit that changes this value re-triggers the spec's clarify phase.
 */
export const ANSWERED_SWEEP_THRESHOLD = 3 as const;

/**
 * Classify a pre-draft check outcome given the `cockpit_gate_status` and
 * `cockpit_gate_list` returns, the freshly-computed generation for the current
 * event, and the dispatch's `gateType`. Implements the three-branch rule in
 * `contracts/pre-draft-check.md § Verbatim step-0 block` step 2 plus the
 * generation-drift branch guard (auto.md § Pre-draft check — shared rules).
 *
 * `gateType` is load-bearing, not decoration: when `driftBranchMaySupersede`
 * is false for it (i.e. `escalation`), the drift branch is DISABLED and an
 * `absent` status resolves straight to `draft-fresh` — no supersession, no
 * list consultation. The caller passes `listResult: null` in that case because
 * it never issued the query.
 *
 * `listResult.truncated === true` combined with no drift entry in the returned
 * page returns `abort-query-unreachable` — the plugin cannot safely fall
 * through to draft-fresh because a drift entry may exist on a later page.
 */
export function classifyPreDraftCheck(
  statusResult: GateStatusResult,
  listResult: GateListResult | null,
  currentGeneration: string,
  gateType: GateType,
): PreDraftCheckOutcome {
  if (statusResult.status === "open") {
    return { kind: "reuse-open", gateId: statusResult.gateId };
  }
  if (statusResult.status === "answered") {
    return { kind: "reuse-answered", gateId: statusResult.gateId };
  }
  // status === "absent".
  //
  // GUARD (auto.md § generation-drift branch guard): the drift branch acks
  // another gate `superseded`, so it may only fire when the listed entry's
  // dispatch row is recoverable and matches this dispatch. For `escalation`
  // it is not (four rows share the enum value) — skip the branch entirely and
  // proceed as "no existing gate". Superseding blind would destroy a live gate
  // this row did not open, with no replacement.
  if (!driftBranchMaySupersede(gateType)) {
    return { kind: "draft-fresh" };
  }
  // The caller skipped the list query (or it returned nothing to consult).
  if (listResult === null) {
    return { kind: "draft-fresh" };
  }
  // Check for generation drift via the list. No ordering is specified by the
  // #1038 contract; the plugin picks the first non-terminal entry whose
  // generation differs from the current event's.
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
 *
 * `status` is a REQUIRED field on `GateRecord` (lib/gate-wire-types.ts), so
 * this signature takes the plain `OpenGatesMap` element type — no ad-hoc
 * intersection patching an optional `status` onto the record. A record that
 * omitted the field would be invisible to this filter and its issue would park
 * forever, which is exactly why the field is not optional.
 */
export function tickAnsweredSweepCounter(
  openGates: Map<GateId, GateRecord>,
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
