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
 * The wire contract itself is owned by:
 *   generacy-ai/tetrad-development/blob/develop/docs/cockpit-remote-gates-plan.md
 * (§ Wire contract — GateOpen / GateAnswer / GateAck). Deviations must be
 * proposed on the epic tracking issue, not patched here.
 *
 * The types mirror `specs/449-part-cockpit-remote-gates/data-model.md § Types`
 * — reproduced for pin discoverability. If the plan-doc's wire contract
 * evolves, this file must be re-synced.
 */

/**
 * Parsed value of the `--gates=<value>` step-1 flag. Default when the flag
 * is absent: "auto". See auto.md § step-1 `--gates` resolution.
 */
export type GateFlagValue = "ui" | "local" | "auto";

/**
 * The mode the run actually uses after `--gates=auto` resolves per the
 * two-part check (cockpit_gate_open bound AND cluster cloud-activated).
 * Decided ONCE at pre-flight; does not flip mid-run.
 */
export type ResolvedGateMode = "ui" | "local";

/**
 * Opaque gate identifier — produced by `hash(issueRef, dispatchClass,
 * generation)` per plan-doc rules. Idempotent: same triple → same id, so a
 * startup re-sweep matches an existing open record instead of creating a
 * duplicate.
 */
export type GateId = string;

/**
 * 1-indexed generation counter. Incremented on the `make-changes` edit-
 * directive re-open path (G.1 / G.2 / G.6 revised drafts). Prior-generation
 * answers arriving after re-open are `superseded` per V3.
 */
export type GateGeneration = number;

/**
 * Label-driven dispatch classes that map to gates opened via
 * `cockpit_gate_open` under UI mode. D.5 (green merge) and D.9/D.9a–D.9d
 * (ledger-only) are omitted — they never open gates. D.12 is the completion
 * class for gate answers.
 *
 * Synthetic gates G.6 (filing) and G.7 (scope-drained) are NOT covered by
 * this union — they fire from the § Add-issue path and the scope-drain
 * check, not from a label transition, and have no D.x label class to
 * re-check in V4. On their `GateRecord`, `dispatchClass` is `undefined`;
 * their identifier lives in `transitionClass` (`"filing-gate"` /
 * `"scope-drained"`) per data-model.md § DispatchClass.
 */
export type DispatchClass =
  | "D.1"    // waiting-for:clarification (G.1)
  | "D.2"    // waiting-for:<artifact>-review (G.2)
  | "D.3"    // waiting-for:implementation-review (G.2)
  | "D.4"    // waiting-for:manual-validation (G.3)
  | "D.6"    // completed:validate + red (G.4a)
  | "D.7"    // agent:error / failed:* (G.4b)
  | "D.8"    // phase-complete (G.5)
  | "D.10"   // unrecognized (G.4c)
  | "D.11"   // waiting-for:merge-conflicts / blocked:stuck-merge-conflicts (G.4d)
  | "D.12";  // gate-answer (NEW — completion class for arriving answers)

/**
 * `cockpit_gate_open` request shape. Field set matches the wire contract in
 * cockpit-remote-gates-plan.md § Wire contract — GateOpen.
 */
export interface GateOpenParams {
  gateId: GateId;
  generation: GateGeneration;
  issueRef: string;              // owner/repo#N — the issue the gate resolves for
  issueTitle: string;            // fetched via cockpit_context
  issueUrl: string;              // computed from issueRef
  branch?: string;               // present when a branch is bound
  transitionClass: string;       // e.g., "waiting-for:clarification", "phase-complete"
  gate: GateDraft;
  epicRef?: string;              // present in epic mode (invocationForm=epic)
  trackingRef?: string;          // present in epic-less mode (invocationForm=tracking-*)
  openedAt: string;              // ISO-8601 UTC
}

/**
 * The drafted presentation body handed to `cockpit_gate_open`. Under the
 * fallback path (§ UI-mode fallback), the same drafted body/options/free-
 * text affordance are handed to local `AskUserQuestion` — authored once
 * per gate, no separate "fallback body".
 */
export interface GateDraft {
  title: string;                 // AskUserQuestion title verbatim
  body: string;                  // drafted presentation block
  options: GateOption[];
  freeTextAffordance: FreeTextAffordance;
}

/**
 * One option button on the gate. `optionId` is stable-across-the-wire and
 * pinned by the § UI-mode gate mapping table; `label` is the operator-
 * facing button text verbatim from the local G.n contract.
 */
export interface GateOption {
  optionId: string;
  label: string;
  recommended?: boolean;
  description?: string;
}

/**
 * How the inbox presents a free-text input alongside the options.
 *
 * - "none": no free-text field shown (default for most gates).
 * - "optional": free-text field shown; submission valid without it.
 *   Used by G.1 (edit-directive alongside make-changes) and G.2 (reviewer
 *   comment alongside approve / request-changes / abort) and G.6 (edit
 *   directive alongside make-changes).
 * - "required-if": required only when a specific option is selected.
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
 * pointer line. On failure triggers the per-gate US4 / FR-011 fallback —
 * local AskUserQuestion fires for that gate only; loop continues.
 */
export type GateOpenResult =
  | { ok: true; gateId: GateId; inboxUrl: string }
  | { ok: false; error: string; retryable: boolean };

/**
 * Arriving `gate-answer` event — consumed on the enriched doorbell NDJSON
 * line (parsed object with `kind: "gate-answer"`) or as a batch item from
 * `cockpit_await_events`. D.12's dispatch class. Field names match
 * cockpit-remote-gates-plan.md § Wire contract — GateAnswer.
 */
export interface GateAnswerEvent {
  kind: "gate-answer";           // discriminator
  gateId: GateId;
  generation: GateGeneration;    // MUST match openGates[gateId].generation (V3)
  issueRef: string;
  transitionClass: string;
  answer: {
    optionId: string;            // one of the gate's GateOption.optionId values
    freeText?: string;           // required when optionId === "add-more-work" for G.7 (Q4=A)
  };
  answeredAt: string;
  answeredBy?: string;           // operator identity (opaque handle from the inbox)
}

/**
 * `cockpit_gate_ack` request shape. Called by D.12 after resolving the
 * answer per steps 1–5 (see auto.md § D.12 — gate-answer).
 *
 * - "applied": handler success; downstream action performed.
 * - "superseded": no matching record OR stale generation (V3) OR live-
 *   state moved past the transition class (V4).
 * - "failed": downstream handler error; `detail` names the failure.
 */
export interface GateAckParams {
  gateId: GateId;
  generation: GateGeneration; // the answered delivery's generation (event.generation)
  outcome: "applied" | "superseded" | "failed";
  detail?: string;
}

/**
 * Plugin-side in-memory record of an open gate — added to the loop's
 * `openGates` map on successful `cockpit_gate_open`; removed on ack.
 * NOT persisted to disk; a session restart re-derives via the § step-3
 * UI-mode startup sweep (Q2=B), keyed by gateId idempotency.
 */
export interface GateRecord {
  gateId: GateId;
  generation: GateGeneration;
  issueRef: string;
  transitionClass: string;
  dispatchClass?: DispatchClass; // used for the V4 live-state supersession check; `undefined` for synthetic G.6 / G.7 gates (no D.x label class to re-check — they're driven by the § Add-issue path and scope-drain check, respectively)
  openedAt: string;
  inboxUrl: string;
  originalDraft: GateDraft;      // retained for revised-draft re-open comparisons
}

/**
 * The `openGates` map lives in the loop's in-memory state alongside
 * `monitorHandle`, `cursor`, `muteSet`, `activeGeneration`, and the C4
 * `heartbeatScheduledWakeupArmed` flag. See auto.md § In-memory loop state
 * additions (UI mode).
 */
export type OpenGatesMap = Map<GateId, GateRecord>;
