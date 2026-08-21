/**
 * gate-wire-types.ts
 *
 * Reference types for the cockpit remote-gates wire contract (per #449 — part
 * of the Cockpit Remote Gates epic). The playbook prose in
 * `packages/claude-plugin-cockpit/commands/auto.md` § UI-mode gate mapping,
 * § D.12 gate-answer, § UI-mode fallback on cockpit_gate_open call error, and
 * § step-1 `--gates` resolution IS the source of truth per plan.md §
 * Constitution Check. These types are reference-only — they exist so that
 * fixture-verified machine checks can pin the shape of the wire calls the
 * playbook describes, and so a future author can grep the field names to
 * confirm playbook↔library alignment.
 *
 * The wire contract itself is owned by the FROZEN plan + spec:
 *   generacy-ai/tetrad-development/blob/develop/docs/cockpit-remote-gates-plan.md
 *     § "Wire contracts" (Shapes 1/2/3)
 *   generacy-cloud/specs/843-part-cockpit-remote-gates/contracts/gates-wire.md
 * The cloud is the authoritative RECEIVER and MUST NOT be changed; both the
 * cluster (generacy `packages/cockpit/src/gates/schema.ts`) and this plugin
 * conform to it. Deviations must be proposed on the epic tracking issue, not
 * patched here.
 *
 * KEY DESIGN DECISION (approved): the `cockpit_gate_open` MCP tool DERIVES
 * `gateId` and `gateKey` in TypeScript from (issueRef, gateType, generation
 * discriminator) and sets `type: 'gate-open'`. The plugin / LLM NEVER
 * hand-builds a sha256 or the gateKey string — it passes only semantic +
 * presentation fields. See `GateOpenParams` below.
 *
 *   gateKey = "<owner>/<repo>#<issue>:<gateType>:<generation>"
 *           = `${issueRef}:${gateType}:${generation}`  (issueRef is owner/repo#N)
 *   gateId  = sha256(gateKey) hex, first 24 chars.
 */

/**
 * Parsed value of the `--gates=<value>` step-1 flag. Default when the flag
 * is absent: "auto". See auto.md § step-1 `--gates` resolution.
 */
export type GateFlagValue = "ui" | "local" | "auto";

/**
 * The mode the run actually uses after `--gates=auto` resolves per the
 * THREE-part check (#459):
 *   1. Tool binding — cockpit_gate_open AND cockpit_gate_status AND
 *      cockpit_gate_list all bound (all three, so item 3 cannot invoke an
 *      unbound cockpit_gate_list on a cluster mid-upgrade to generacy#1038).
 *   2. Cluster cloud-activation.
 *   3. Pre-flight functional probe — exactly one read-only cockpit_gate_list
 *      call proving the gate-query surface WORKS, not merely that its tools
 *      are bound. DEFERRED until after the ledger header write (the probe
 *      writes a ledger row on both pass and fail). Short-circuited entirely
 *      when item 1 or 2 fails: no probe call, no probe ledger row.
 *
 * Decided ONCE per run — items 1–2 at parse-time pre-flight, item 3 after the
 * header write. Between those two points the resolution is TENTATIVE
 * ("ui pending probe" when items 1–2 both YES; "local" otherwise) and gates
 * firing in that window present under the TENTATIVE mode; it does not flip
 * mid-loop. Item 3 failing alone downgrades to "local" (reason
 * `probe-failed`) EXCEPT when a remote UI gate was already consumed in the
 * TENTATIVE window (currently only Form 3's G.6), which hard-fails with
 * reason `probe-failed-after-remote-gate-consumed` rather than producing an
 * ambiguous partial-UI / partial-local ledger.
 *
 * See auto.md § step-1 `--gates` resolution and pre-flight absence,
 * § TENTATIVE window gate-presentation rule, and § Pre-flight probe (UI mode).
 */
export type ResolvedGateMode = "ui" | "local";

/**
 * Opaque gate identifier — a 24-char lowercase hex string, the first 24 chars
 * of `sha256(gateKey)`. DERIVED by the `cockpit_gate_open` MCP tool from
 * (issueRef, gateType, generation), never hand-built by the plugin/LLM.
 * Idempotent: same durable inputs → same id, so a startup re-sweep, a session
 * restart, or a serial cluster takeover re-derives the SAME id and matches an
 * existing open record instead of creating a duplicate.
 */
export type GateId = string;

/**
 * The `gateKey` string that `gateId` hashes:
 *   `<owner>/<repo>#<issue>:<gateType>:<generation>`.
 * Also DERIVED by the MCP tool. Carried on the down-path `gate-answer` so the
 * cluster can key/audit without re-hashing.
 */
export type GateKey = string;

/**
 * The 9-value gate-type enum — mirrors the cloud `cockpitGateTypeEnum` and the
 * cluster `GateTypeSchema` (`remediation-limit` lands cluster-side via
 * generacy-ai/generacy#1163; the plugin adds it ahead of that so D.13 gate
 * verbs type-check — this PR may merge independently, gated at runtime by the
 * `MIN_GENERACY_VERSION=0.2.0` pre-flight probe). This is the `:<gateType>:`
 * slot of the gateKey and is REQUIRED cloud-side. Net-new to the plugin: every
 * gate-open site must set it per the auto.md § UI-mode gate mapping table.
 *
 * Mapping from the local G.n dispatch classes (see mapping table for the full
 * generation discriminator per class):
 *   - G.1 clarification batch                 → "clarification"
 *   - G.2 spec/clarification/plan/tasks review→ "artifact-review"
 *   - G.2 implementation review               → "implementation-review"
 *   - G.3 manual-validation confirm           → "manual-validation"
 *   - G.4a–G.4d escalations (wire)            → "escalation"
 *   - G.5 phase-queue confirmation            → "phase-queue"  (issueRef slot = epicRef)
 *   - G.6 filing gate (synthetic)             → "filing"
 *   - G.7 scope-drained (synthetic)           → "scope-drained"
 *   - G.9 remediation-limit gate              → "remediation-limit"
 *   - G.4e invalid-cursor escalation          → EXCLUDED from the wire (local
 *                                               AskUserQuestion only; no gateType).
 */
export type GateType =
  | "clarification"
  | "artifact-review"
  | "implementation-review"
  | "manual-validation"
  | "escalation"
  | "phase-queue"
  | "filing"
  | "scope-drained"
  | "remediation-limit";

/**
 * The gateType-specific generation DISCRIMINATOR the plugin passes to
 * `cockpit_gate_open`. The MCP tool folds it into gateKey as the `:<generation>:`
 * slot; the plugin NEVER assembles gateKey itself. Every discriminator is
 * derivable from DURABLE state (GitHub / draft content), never a session-local
 * counter, so the derived gateId is stable across restart/takeover:
 *
 *   - clarification        : batch id = content hash of the open question/answer set
 *   - artifact-review      : `<artifactKind>@<reviewBranchHeadSHA>`
 *   - implementation-review: PR head SHA
 *   - manual-validation    : PR head SHA
 *   - escalation           : `<subtype>:<triggeringLabelOrState>:<occurrence>`
 *   - phase-queue          : `P<nextPhaseNumber>`
 *   - filing               : draft hash over {title, body, labels}
 *   - scope-drained        : `<drainCounter>` (Nth drain for the tracking ref)
 *   - remediation-limit    : PR head SHA (durable). The remediation counter is a
 *                            DATA GAP the parent loop does not yet compute, so the
 *                            discriminator is derived from PR head SHA only today;
 *                            the remaining-findings-hash form is NOT used. The
 *                            non-idempotent re-ask across restart/takeover is an
 *                            accepted follow-up shared with the other gapped
 *                            gateTypes.
 *
 * A number is accepted for the naturally-numeric cases (phase number) and
 * String()-coerced by the MCP tool for a stable key.
 */
export type GateGeneration = string | number;

/**
 * Dispatch classes that map to gates opened via `cockpit_gate_open` under
 * UI mode. D.5 (green merge) and D.9/D.9a–D.9d (ledger-only) are omitted —
 * they never open gates. D.12 is the completion class for gate answers.
 * (The synthetic G.6 filing / G.7 scope-drained opens carry no D.n label.)
 */
export type DispatchClass =
  | "D.1"    // waiting-for:clarification (G.1) → gateType "clarification"
  | "D.2"    // waiting-for:<artifact>-review (G.2) → gateType "artifact-review"
  | "D.3"    // waiting-for:implementation-review (G.2) → gateType "implementation-review"
  | "D.4"    // waiting-for:manual-validation (G.3) → gateType "manual-validation"
  | "D.6"    // completed:validate + red (G.4a) → gateType "escalation"
  | "D.7"    // agent:error / failed:* (G.4b) → gateType "escalation"
  | "D.8"    // phase-complete (G.5) → gateType "phase-queue"
  | "D.10"   // unrecognized (G.4c) → gateType "escalation"
  | "D.11"   // waiting-for:merge-conflicts / blocked:stuck-merge-conflicts (G.4d) → gateType "escalation"
  | "D.12"   // gate-answer (completion class for arriving answers)
  | "D.13";  // waiting-for:remediation-limit (G.9) → gateType "remediation-limit"

/**
 * SHAPE 1 — gate-open (cluster → cloud, up-path) INPUT to `cockpit_gate_open`.
 *
 * These are the SEMANTIC + PRESENTATION fields the plugin passes. The MCP tool
 * assembles the frozen on-wire record from them by:
 *   1. gateKey = `${issueRef}:${gateType}:${generation}`
 *      (for G.5 phase-queue the caller passes the EPIC ref in `issueRef`; for
 *       G.6/G.7 it passes the tracking/filing target)
 *   2. gateId  = sha256(gateKey).slice(0,24)
 *   3. type    = 'gate-open'
 * and validates against the frozen GateOpenSchema before relaying.
 *
 * NO `kind`, NO `scope` wrapper, NO hand-built `gateId`/`gateKey`, NO nested
 * `gate: GateDraft` — the presentation fields are FLAT (title/body/options/
 * allowFreeText), matching the frozen record.
 */
export interface GateOpenParams {
  gateType: GateType;            // the `:<gateType>:` slot (net-new; per mapping table)
  generation: GateGeneration;    // the `:<generation>:` discriminator (durable; see GateGeneration)
  issueRef: string;              // owner/repo#N — the gate's subject (epicRef for G.5; tracking/filing target for G.6/G.7)
  epicRef: string;               // owning epic ref (frozen record requires epicRef; == issueRef for standalone/tracking runs)
  issueTitle: string;            // fetched via cockpit_context
  issueUrl: string;              // FULLY-QUALIFIED https URL (e.g. https://github.com/owner/repo/issues/N) — cloud pins .url()
  branch?: string;              // present when a branch is bound
  prNumber?: number;            // present for PR-scoped gates (implementation-review / manual-validation); positive int
  title: string;                // AskUserQuestion title verbatim
  body: string;                 // drafted presentation block
  options: GateOption[];        // 0..20 buttons
  allowFreeText: boolean;       // REQUIRED cloud-side; derived from GateDraft.freeTextAffordance.kind !== "none"
  sessionId: string;            // REQUIRED cloud-side (min length 1); this run's session id
  askedAt: string;              // ISO-8601 UTC (was openedAt)
}

/**
 * The drafted presentation body the plugin authors ONCE per gate. Handed both
 * to `cockpit_gate_open` (flattened into GateOpenParams: title/body/options and
 * allowFreeText = freeTextAffordance.kind !== "none") AND, on the fallback path
 * (§ UI-mode fallback), to local `AskUserQuestion` — no separate "fallback body".
 * The richer `freeTextAffordance` is retained for the LOCAL prompt; the wire
 * record collapses it to the boolean `allowFreeText`.
 */
export interface GateDraft {
  title: string;                 // AskUserQuestion title verbatim
  body: string;                  // drafted presentation block
  options: GateOption[];
  freeTextAffordance: FreeTextAffordance;
}

/**
 * One option button on the gate — mirrors the frozen `GateOptionSchema`
 * ({ id, label, description?, recommended? }). `id` is stable-across-the-wire
 * and pinned by the § UI-mode gate mapping table; the down-path answer's
 * `optionId` is one of these `id` values. `label` is the operator-facing
 * button text verbatim from the local G.n contract.
 */
export interface GateOption {
  id: string;                    // frozen field name (was optionId)
  label: string;
  description?: string;
  recommended?: boolean;
}

/**
 * How the LOCAL inbox / AskUserQuestion presents a free-text input alongside
 * the options. Collapsed to the boolean `allowFreeText` on the wire
 * (allowFreeText = kind !== "none").
 *
 * - "none": no free-text field shown → allowFreeText:false.
 * - "optional": free-text field shown; submission valid without it → allowFreeText:true.
 *   Used by G.1 (edit-directive alongside make-changes), G.2 (reviewer comment
 *   alongside approve / request-changes / abort), and G.6 (edit directive
 *   alongside make-changes).
 * - "required-if": required only when a specific option is selected → allowFreeText:true.
 *   Used by G.7 (add-more-work carries prose in the same submission — the
 *   Q4=A single-answer collapse).
 */
export type FreeTextAffordance =
  | { kind: "none" }
  | { kind: "optional"; placeholder: string }
  | { kind: "required-if"; ifOptionId: string; placeholder: string };

/**
 * `cockpit_gate_open` response shape. On success carries the `inboxUrl`
 * printed in the § UI-mode fallback / One pointer line rule's verbatim
 * pointer line, plus the DERIVED gateId/gateKey the MCP tool computed (the
 * plugin records these in `GateRecord`). On failure triggers the per-gate
 * US4 / FR-011 fallback — local AskUserQuestion fires for that gate only;
 * loop continues.
 */
export type GateOpenResult =
  | { ok: true; gateId: GateId; gateKey: GateKey; inboxUrl: string }
  | { ok: false; error: string; retryable: boolean };

/**
 * SHAPE 3 — gate-answer (cloud → cluster, down-path). Arriving `gate-answer`
 * event — consumed on the enriched doorbell NDJSON line or as a batch item
 * from `cockpit_await_events`. D.12's dispatch class. FLAT frozen shape
 * (matches generacy-cloud cockpit-gate-delivery.ts DeliveryBody and the
 * cluster GateAnswerSchema):
 *
 *   - `type` is the discriminator (literal "gate-answer") — NOT `kind`.
 *   - NO `generation` field: the down-path carries gateId + gateKey only.
 *     D.12 supersession keys on gateId IDENTITY (a re-open mints a NEW gateId;
 *     a stale answer arrives with the OLD gateId and is superseded), not on an
 *     integer generation-match.
 *   - `optionId` and `freeText` are BOTH nullable and independent: the cloud
 *     SENDS `freeText: null` explicitly on option-only answers (present-and-null),
 *     and `optionId: null` on a pure free-text answer.
 *   - `actor.email` / `actor.displayName` may be null (anonymous / partial
 *     profile); `actor.userId` is always present.
 */
export interface GateAnswerEvent {
  type: "gate-answer";           // discriminator (frozen; NOT "kind")
  gateId: GateId;                // 24-char hex; matches an openGates key
  gateKey: GateKey;              // `<owner>/<repo>#<issue>:<gateType>:<generation>`
  optionId: string | null;       // one of the gate's GateOption.id values; null on pure free-text
  freeText: string | null;       // present-and-null on option-only answers
  actor: {
    userId: string;              // always present
    email: string | null;
    displayName: string | null;
  };
  answeredAt: string;            // ISO-8601 (cloud emits gate.answer.answeredAt.toISOString())
  deliveryId: string;            // UUID, unique per delivery attempt; the cluster dedups on this
}

/**
 * SHAPE 2 — gate-outcome (cluster → cloud, up-path). THE ACK. Request shape for
 * `cockpit_gate_ack`, called by D.12 after resolving the answer per steps 1–5
 * (see auto.md § D.12 — gate-answer). Replaces the old `gate-ack`: the MCP tool
 * sets `type: 'gate-outcome'`; there is NO `generation` field and the timestamp
 * field is `at` (not `ackedAt`).
 *
 * - "applied": handler success; downstream action performed.
 * - "superseded": no matching record OR the gate was re-opened under a new
 *   gateId (stale-gateId answer) OR live-state moved past the transition class (V4).
 * - "failed": downstream handler error; `detail` names the failure.
 */
export interface GateAckParams {
  gateId: GateId;
  outcome: "applied" | "superseded" | "failed";
  detail?: string;               // names the failure on "failed"
  at: string;                    // ISO-8601 UTC
}

/**
 * Plugin-side in-memory record of an open gate — added to the loop's
 * `openGates` map on successful `cockpit_gate_open`; removed on ack.
 * NOT persisted to disk; a session restart re-derives via the § step-3
 * UI-mode startup sweep (Q2=B), keyed by gateId idempotency (which now holds
 * across restart/takeover because the generation discriminator is durable).
 *
 * Supersession is by gateId IDENTITY: a make-changes / revised-draft re-open
 * recomputes the generation discriminator → a NEW gateId → a NEW record; the
 * prior record is marked superseded (or closed by the cloud) so a late answer
 * carrying the OLD gateId is not re-applied.
 */
export interface GateRecord {
  gateId: GateId;
  gateKey: GateKey;
  gateType: GateType;
  generation: GateGeneration;    // the durable discriminator used to derive this gateId
  issueRef: string;
  transitionClass: string;
  dispatchClass?: DispatchClass; // used for the V4 live-state supersession check (absent for synthetic G.6/G.7)
  /**
   * Non-terminal lifecycle state of the record (#457). `open` = awaiting an
   * operator answer; `answered` = the cloud reports an answer that this
   * session has not yet consumed via a D.12 `gate-answer` event.
   *
   * REQUIRED — the FR-009 answered-gate escape hatch filters `openGates` on
   * `status === "answered"` at every sweep tick, so a record that omits the
   * field is invisible to the hatch and its issue parks forever. Records
   * created by a successful `cockpit_gate_open` set `"open"`; records created
   * by a § Dispatch step 0 reuse branch copy the `cockpit_gate_status` return.
   */
  status: "open" | "answered";
  askedAt: string;
  inboxUrl: string;
  originalDraft: GateDraft;      // retained for revised-draft re-open comparisons
  /**
   * Purely LOCAL re-ask ordinal — 1-indexed, session-local, incremented on each
   * make-changes / revised-draft re-open. Used ONLY for the ledger label
   * `make-changes (re-opened g<n>)`. NEVER the wire `generation` (which is the
   * durable discriminator above) and NEVER part of gateId derivation.
   */
  reAskOrdinal?: number;
  superseded?: boolean;          // set when a re-open minted a newer gateId for the same subject
}

/**
 * The `openGates` map lives in the loop's in-memory state alongside
 * `monitorHandle`, `cursor`, `muteSet`, and the C4
 * `heartbeatScheduledWakeupArmed` flag. See auto.md § In-memory loop state
 * additions (UI mode).
 */
export type OpenGatesMap = Map<GateId, GateRecord>;
