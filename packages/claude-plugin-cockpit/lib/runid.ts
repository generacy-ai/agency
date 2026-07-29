/**
 * runid.ts
 *
 * Reference guard functions for the #469 pre-flight `runId` derivation and the
 * write-side threading of `runId` through every `cockpit_gate_open`,
 * `cockpit_gate_ack`, and pre-draft `cockpit_gate_status` call `/cockpit:auto`
 * issues. Playbook prose in `packages/claude-plugin-cockpit/commands/auto.md`
 * (§ step 1 pre-flight `runId` derivation, § step 1 § Pre-flight probe (UI
 * mode), § In-memory loop state additions, § Dispatch step 0 in D.1/D.2/D.3/
 * D.4/D.7/D.11, § D.12 gate-answer, and § UI-mode gate mapping) IS the source
 * of truth per plan.md § Constitution Check. This module exists so
 * fixture-verified machine checks can pin the shape of the branches the prose
 * describes.
 *
 * Non-load-bearing: the plugin does not import from this module at runtime.
 * It is a machine-checkable mirror of the prose contract in
 * `specs/469-problem-cockpit-auto-only/data-model.md` and the three contracts
 * `specs/469-problem-cockpit-auto-only/contracts/runid-{derivation,threading,probe}.md`.
 */

import type { GateAckParams, GateOpenParams } from "./gate-wire-types.js";
import type { GateStatusQuery } from "./gate-status-check.js";

/**
 * The run-scoped identifier — the full ledger filename stem verbatim, of the
 * form `<tracking-ref-slug>-<timestamp>` (e.g. `epic-1053-20260729-143012`).
 * MUST NOT contain the `:` character (V1 / FR-013). MUST be identical to the
 * ledger filename stem (without the `.ledger` suffix).
 */
export type RunId = string;

/**
 * The session-scoped capability flag. Decided ONCE at pre-flight after the
 * extended capability probe (per FR-012 / V5). MUST NOT flip mid-run.
 */
export type RunIdEnabled = boolean;

/**
 * Plugin-side outcome of the extended pre-flight capability probe (per
 * `contracts/runid-probe.md § Outcome branches`).
 */
export type GateQueryProbeOutcome =
  | { kind: "ok"; runIdEnabled: true }
  | { kind: "graceful-degrade"; runIdEnabled: false; warning: string }
  | {
      kind: "hard-fail-ui";
      reason: "query-unreachable" | "internal" | "transport" | "unknown-class";
      class: string;
      detail: string;
    }
  | {
      kind: "downgrade-to-local";
      reason: "query-unreachable" | "internal" | "transport" | "unknown-class";
      class: string;
      detail: string;
    }
  | {
      kind: "hard-fail-tentative-ui";
      reason: "query-unreachable" | "internal" | "transport" | "unknown-class";
      class: string;
      detail: string;
    };

/**
 * The pre-flight `--gates` mode the probe was issued under. Determines whether
 * a non-`invalid-args` error routes to hard-fail (explicit UI or Form-3
 * TENTATIVE UI) or to `local` downgrade (`--gates=auto` items 1+2 both YES).
 */
export type ProbeGatesMode =
  | "ui-explicit"
  | "auto-resolved-ui"
  | "form3-tentative-ui";

/**
 * The verbatim startup warning fired on the `graceful-degrade` branch (per
 * `contracts/runid-probe.md § Graceful-degradation warning`). Exposed as an
 * exported constant so a change to the wording tips both the playbook prose
 * pin and this fixture at the same time.
 */
export const GRACEFUL_DEGRADE_WARNING =
  "runId threading disabled for this session — cluster's cockpit MCP server does not accept runId on cockpit_gate_list (pre-generacy#1067). Run continues under today's 3-input gate identity; generacy#1053 (re-run terminal gates) will not be fixed for this session. Upgrade the cluster's generacy build to ≥ commit 82077f1a to enable runId threading.";

/**
 * `deriveRunId` — derive the run-scoped `runId` from the ledger filename
 * components. Enforces the no-`:` invariant (V1 / FR-013) via a runtime
 * assertion. Sole derivation site is `auto.md § step 1` per V2 / FR-014.
 *
 * @param trackingRefSlug the tracking reference with `/` replaced by `-` and
 *   `#` stripped (e.g. `generacy-ai-generacy-1053`).
 * @param timestamp `YYYYMMDD-HHMMSS` in the operator's local time captured at
 *   pre-flight.
 * @returns the run's `runId`.
 * @throws if the derived value contains the `:` character.
 */
export function deriveRunId(trackingRefSlug: string, timestamp: string): RunId {
  const runId = `${trackingRefSlug}-${timestamp}`;
  assertRunIdColonFree(runId);
  return runId;
}

/**
 * `assertRunIdColonFree` — throw if `runId` contains the `:` character. Pinned
 * in the derivation prose so a future ledger-filename-format change cannot
 * silently introduce one. `runId` is the trailing composite-key segment
 * (`gateKey = ${issueRef}:${gateType}:${generation}[:${runId}]`), and
 * `generation` may already contain colons; a colon-bearing `runId` would make
 * the tail ambiguous to anything parsing keys by position.
 */
export function assertRunIdColonFree(runId: RunId): void {
  if (runId.indexOf(":") !== -1) {
    throw new Error(
      `runId invariant violated: value contains ':': ${runId}`,
    );
  }
}

/**
 * `GateOpenParams` extended with the optional `runId` field.
 */
export type GateOpenParamsWithMaybeRunId = GateOpenParams & { runId?: RunId };

/**
 * `GateAckParams` extended with the optional `runId` field.
 */
export type GateAckParamsWithMaybeRunId = GateAckParams & { runId?: RunId };

/**
 * `GateStatusQuery` extended with the optional `runId` field.
 */
export type GateStatusQueryWithMaybeRunId = GateStatusQuery & {
  runId?: RunId;
};

/**
 * `serializeGateOpenParams` — attach `runId` to a `cockpit_gate_open` payload
 * under `runIdEnabled === true`; OMIT the field entirely under
 * `runIdEnabled === false` (V6). Omission is the safe way to be a no-op
 * against a `.strict()` schema on a pre-#1067 cluster — not `null`, not
 * `undefined`, not an empty string.
 */
export function serializeGateOpenParams(
  base: GateOpenParams,
  runId: RunId | null,
  runIdEnabled: boolean,
): GateOpenParamsWithMaybeRunId {
  if (runIdEnabled && runId !== null) {
    return { ...base, runId };
  }
  return { ...base };
}

/**
 * `serializeGateAckParams` — attach `runId` to a `cockpit_gate_ack` payload
 * under `runIdEnabled === true`; OMIT the field entirely under
 * `runIdEnabled === false` (V6). The ack MUST target the SAME `runId` the
 * corresponding `cockpit_gate_open` used, so the ack derives the same
 * `gateId` and targets the same gate identity.
 */
export function serializeGateAckParams(
  base: GateAckParams,
  runId: RunId | null,
  runIdEnabled: boolean,
): GateAckParamsWithMaybeRunId {
  if (runIdEnabled && runId !== null) {
    return { ...base, runId };
  }
  return { ...base };
}

/**
 * `serializeGateStatusQuery` — attach `runId` to a pre-draft
 * `cockpit_gate_status` payload under `runIdEnabled === true`; OMIT the field
 * entirely under `runIdEnabled === false` (V6). Without the read side, the
 * pre-draft check derives a 3-segment key while `cockpit_gate_open` derives a
 * 4-segment one — every check returns `absent`, the drafting subagent re-runs
 * on every wake, and duplicate inbox gates accumulate.
 */
export function serializeGateStatusQuery(
  base: GateStatusQuery,
  runId: RunId | null,
  runIdEnabled: boolean,
): GateStatusQueryWithMaybeRunId {
  if (runIdEnabled && runId !== null) {
    return { ...base, runId };
  }
  return { ...base };
}

/**
 * Union of the probe result shapes the classifier accepts. Mirrors
 * `ToolResult<T>` at the two gate-query sites.
 */
export type ProbeResult =
  | { status: "ok"; data: unknown }
  | { status: "error"; class: string; detail: string };

/**
 * `classifyProbeOutcome` — map the pre-flight capability probe's return to the
 * plugin-side outcome tag (per `contracts/runid-probe.md § Outcome branches`
 * and `data-model.md § GateQueryProbeOutcome`).
 *
 * `{status: 'ok'}`                 → `runIdEnabled: true`.
 * `{status: 'error', class: 'invalid-args'}` → `graceful-degrade` (pre-#1067
 *   cluster's `.strict()` schema rejects the field; the surface WORKS, the
 *   capability is ABSENT — run continues under today's 3-input identity with
 *   the startup warning fired).
 * Every other class (`query-unreachable`, `internal`, `transport`, or an
 *   unrecognized class token) is a broken surface, not a capability gap;
 *   `runIdEnabled` is NOT downgraded on those. Routing depends on the mode
 *   the probe was issued under:
 *   - `ui-explicit`         → `hard-fail-ui`.
 *   - `auto-resolved-ui`    → `downgrade-to-local`.
 *   - `form3-tentative-ui`  → `hard-fail-tentative-ui`.
 */
export function classifyProbeOutcome(
  probeResult: ProbeResult,
  gatesMode: ProbeGatesMode,
): GateQueryProbeOutcome {
  if (probeResult.status === "ok") {
    return { kind: "ok", runIdEnabled: true };
  }
  if (probeResult.class === "invalid-args") {
    return {
      kind: "graceful-degrade",
      runIdEnabled: false,
      warning: GRACEFUL_DEGRADE_WARNING,
    };
  }
  const reason: "query-unreachable" | "internal" | "transport" | "unknown-class" =
    probeResult.class === "query-unreachable" ||
    probeResult.class === "internal" ||
    probeResult.class === "transport"
      ? probeResult.class
      : "unknown-class";
  if (gatesMode === "ui-explicit") {
    return {
      kind: "hard-fail-ui",
      reason,
      class: probeResult.class,
      detail: probeResult.detail,
    };
  }
  if (gatesMode === "auto-resolved-ui") {
    return {
      kind: "downgrade-to-local",
      reason,
      class: probeResult.class,
      detail: probeResult.detail,
    };
  }
  return {
    kind: "hard-fail-tentative-ui",
    reason,
    class: probeResult.class,
    detail: probeResult.detail,
  };
}
