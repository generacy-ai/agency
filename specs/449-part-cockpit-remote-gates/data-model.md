# Data Model: `/cockpit:auto` — Cockpit Remote Gates (UI-mode dispatch)

Reference types for the wire contract and the loop's in-memory state additions. The wire contract itself is owned by [cockpit-remote-gates-plan.md](https://github.com/generacy-ai/tetrad-development/blob/develop/docs/cockpit-remote-gates-plan.md); the shapes reproduced here are what the playbook prose references. Deviations must be proposed on the epic tracking issue, not patched here.

## Overview

Three surfaces:
1. **Gate-open call** — the plugin invokes `cockpit_gate_open(GateOpenParams)`; the tool returns a `GateOpenResult` on success or an error object on failure.
2. **Gate-answer event** — the operator's inbox answer arrives as a typed event on the existing wake paths (enriched doorbell NDJSON line + `cockpit_await_events` batch item). Payload shape: `GateAnswerEvent`.
3. **Gate-ack call** — the plugin invokes `cockpit_gate_ack(GateAckParams)` to close the record with `applied` / `superseded` / `failed`.

Per-run, the loop tracks open gates in `openGates: Map<gateId, GateRecord>` — an addition to the § In-memory loop state block at auto.md's data-model reference.

## Types

### `GateFlagValue`

```typescript
type GateFlagValue = "ui" | "local" | "auto";
```

Parsed from `--gates=<value>` at step-1 pre-flight. Default: `"auto"`.

### `ResolvedGateMode`

```typescript
type ResolvedGateMode = "ui" | "local";
```

The mode the run actually uses after `auto` resolves (per R2 two-part check). Decided ONCE at pre-flight; does not flip mid-run.

### `GateId` and `GateGeneration`

```typescript
type GateId = string;         // opaque, produced by hash(issueRef, dispatchClass, generation) per plan-doc rules
type GateGeneration = number; // 1-indexed; incremented on Make-changes → re-open (revised drafts)
```

Idempotent: the same `(issueRef, dispatchClass, generation)` triple always produces the same `gateId`, so a startup re-sweep matches an existing open record instead of creating a duplicate.

### `DispatchClass` (subset relevant to gates)

```typescript
type DispatchClass =
  | "D.1"    // waiting-for:clarification
  | "D.2"    // waiting-for:<artifact>-review
  | "D.3"    // waiting-for:implementation-review
  | "D.4"    // waiting-for:manual-validation
  | "D.6"    // completed:validate + red (fixer + G.4a)
  | "D.7"    // agent:error / failed:* (G.4b)
  | "D.8"    // phase-complete (G.5)
  | "D.10"   // unrecognized (G.4c)
  | "D.11"   // waiting-for:merge-conflicts / blocked:stuck-merge-conflicts (G.4d)
  | "D.12";  // gate-answer (NEW)
```

G.6 (filing gate) and G.7 (scope-drained) are not tied to a dispatch class — they fire from the § Add-issue path and the scope-drain check. Both use their own dispatch-class labels in the D.12 event's `transitionClass` field (`"filing-gate"` / `"scope-drained"`).

D.5 (green merge) and D.9 (address-pr-feedback family) do NOT open gates and do not appear in the mapping table.

### `GateOpenParams`

Passed to `cockpit_gate_open(...)`. The exact field set is authored by the epic; the plugin populates all fields at open time. Names below match `cockpit-remote-gates-plan.md § Wire contract — GateOpen`:

```typescript
interface GateOpenParams {
  gateId: GateId;                   // hash(issueRef, dispatchClass, generation)
  generation: GateGeneration;       // 1 on first open; +1 per revised-draft re-open
  issueRef: string;                 // owner/repo#N — the issue the gate resolves for (G.6/G.7 use the tracking ref)
  issueTitle: string;               // fetched via cockpit_context
  issueUrl: string;                 // computed from issueRef
  branch?: string;                  // present when a branch is bound (post-scope-add or per-issue branch)
  transitionClass: string;          // e.g., "waiting-for:clarification", "phase-complete"
  gate: {
    title: string;                  // the AskUserQuestion title verbatim (per current gate contracts)
    body: string;                   // the drafted presentation block (same body the local flow shows)
    options: GateOption[];          // per-gate option list (see contracts/ui-gate-mapping.md)
    freeTextAffordance: FreeTextAffordance; // whether/how the inbox presents a free-text field
  };
  epicRef?: string;                 // present in epic mode (invocationForm=epic)
  trackingRef?: string;             // present in epic-less mode (invocationForm=tracking-*)
  openedAt: string;                 // ISO-8601 UTC
}
```

### `GateOption`

```typescript
interface GateOption {
  optionId: string;                 // stable across the wire; matches the mapping-table row's option key
  label: string;                    // the operator-facing button label (verbatim from current AskUserQuestion options)
  recommended?: boolean;            // true for the option marked "(Recommended)" in local mode
  description?: string;             // optional expanded description per AskUserQuestion.description
}
```

### `FreeTextAffordance`

```typescript
type FreeTextAffordance =
  | { kind: "none" }                              // no free-text field shown (default)
  | { kind: "optional"; placeholder: string }     // free-text field shown, submission valid without it
  | { kind: "required-if"; ifOptionId: string; placeholder: string }; // required only when a specific option is selected
```

- G.7 uses `{ kind: "required-if", ifOptionId: "add-more-work", placeholder: "..." }` per Q4=A.
- G.2 (review verdict) uses `{ kind: "optional", placeholder: "reviewer comment (optional)" }` matching the local drafter's comment-body affordance.
- Most other gates use `{ kind: "none" }` — options-only.
- Exact per-gate affordance pinned in `contracts/ui-gate-mapping.md`.

### `GateOpenResult`

```typescript
type GateOpenResult =
  | { ok: true; gateId: GateId; inboxUrl: string }
  | { ok: false; error: string; retryable: boolean };
```

`inboxUrl` is included in the "one pointer line" print per FR-005:
```
gate open: <title> → answer in the generacy.ai inbox (<inboxUrl>)
```

`ok: false` triggers the US4 / FR-011 per-gate local fallback (see `contracts/ui-mode-fallback.md`).

### `GateAnswerEvent`

Consumed as a typed event on the doorbell NDJSON line and as a batch item from `cockpit_await_events`. Field names match `cockpit-remote-gates-plan.md § Wire contract — GateAnswer`:

```typescript
interface GateAnswerEvent {
  kind: "gate-answer";              // discriminator; distinguishes from label-transition events
  gateId: GateId;
  generation: GateGeneration;       // MUST match the currently-open record's generation
  issueRef: string;
  transitionClass: string;          // matches GateOpenParams.transitionClass
  answer: {
    optionId: string;               // one of the gate's GateOption.optionId values
    freeText?: string;              // present when the gate had a free-text affordance and the operator filled it
  };
  answeredAt: string;               // ISO-8601 UTC
  answeredBy?: string;              // operator identity (opaque handle from the inbox)
}
```

**Generation-mismatch rule**: a `gate-answer` whose `generation` does not match the currently-open record's generation is stale (belongs to a superseded prior generation). D.12 acks it with `superseded` without applying.

### `GateAckParams`

```typescript
interface GateAckParams {
  gateId: GateId;
  outcome: "applied" | "superseded" | "failed";
  detail?: string;                  // present for failed (error description); optional for superseded (reason)
}
```

Called by D.12 after resolving the answer. On `applied`, the downstream action has already succeeded (or produced its own retry / ledger line per the mapping table). On `failed`, `detail` names the failure (e.g., `"cockpit_queue returned: <description>"`). On `superseded`, `detail` optionally names the reason (e.g., `"live state moved past waiting-for:clarification"`).

### `GateRecord`

In-memory, plugin-side. Added to `openGates` on successful `cockpit_gate_open`; removed on ack.

```typescript
interface GateRecord {
  gateId: GateId;
  generation: GateGeneration;
  issueRef: string;
  transitionClass: string;
  dispatchClass: DispatchClass;     // for supersession live-state check
  openedAt: string;
  inboxUrl: string;
  originalDraft: GateDraft;         // the drafted body + options, retained for revised-draft comparisons
}

interface GateDraft {
  title: string;
  body: string;
  options: GateOption[];
  freeTextAffordance: FreeTextAffordance;
}
```

### `OpenGatesMap`

```typescript
type OpenGatesMap = Map<GateId, GateRecord>;
```

Addition to the § In-memory loop state block in auto.md (alongside `monitorHandle`, `cursor`, `muteSet`, `activeGeneration`). Persists across the wake-driven loop's turns for the run's lifetime; not persisted to disk (a session restart re-derives the set from the startup sweep per Q2=B).

## Validation rules

### V1 — `--gates` flag values

Exactly one of `ui | local | auto`. Any other value → usage error, reason `gates-value-invalid`, exit non-zero, matching the § step-1 ambiguity-table exit pattern at auto.md line 41.

### V2 — Presence check for `--gates=ui`

At pre-flight, after arg parse, before ledger directory creation: verify `cockpit_gate_open` is bound in the session's MCP tool binding. If absent, print the verbatim error string (per contracts/gates-flag-parse.md § Pre-flight absence) and exit non-zero. No ledger directory created. See R3.

### V3 — Generation match

A `gate-answer` event's `generation` MUST match the currently-open `GateRecord.generation` for the corresponding `gateId`. Mismatch → ack `superseded` (per R9 / Q5=B mapping to the `superseded` outcome).

### V4 — Live-state supersession

Before applying a `gate-answer`, re-check the underlying trigger label / state (via the enriched doorbell line or `cockpit_status` fallback). If the trigger has been resolved out-of-band, ack `superseded` and skip the downstream action. See R9.

### V5 — Free-text affordance for `Add more work`

When `answer.optionId === "add-more-work"` for a G.7 gate, `answer.freeText` MUST be present and non-empty. If absent, treat as a validation failure (ack `failed` with `detail: "add-more-work requires freeText prose per Q4=A"` — this should not happen because the inbox enforces the `required-if` affordance, but the plugin validates defensively). See R6 / Q4=A.

## Relationships

```
                        pre-flight
   --gates=<v>  ──►  V1  ──►  V2 (if ui/auto→ui)  ──►  ResolvedGateMode
                                        │
                                        ▼
                            step-3 startup sweep
                                        │
                                        ▼ (per persistent trigger state, per Q2=B)
                            cockpit_gate_open ────────► GateRecord in OpenGatesMap
                                        │                     │
                            success│                     │
                                        ▼                     │
                            print "one pointer line"           │
                                        │                     │
                                        ▼                     │
                                    (main loop)                 │
                                        │                     │
                                        ▼                     │
                             GateAnswerEvent ────────────────► lookup gateId in OpenGatesMap
                                                                     │
                                                                     ▼
                                                          V3 generation match?
                                                                     │
                                                    NO ─►  cockpit_gate_ack(superseded)
                                                                     │
                                                          V4 live-state still triggers?
                                                                     │
                                                    NO ─►  cockpit_gate_ack(superseded)
                                                                     │
                                                          route optionId (+freeText) to downstream
                                                                     │
                                                                     ▼
                                                          cockpit_gate_ack(applied | failed)
                                                                     │
                                                                     ▼
                                                          write ONE ledger line
                                                          (source: ui-gate suffix, Q5=B)
                                                                     │
                                                                     ▼
                                                          delete GateRecord from OpenGatesMap
```

**Revised-draft re-open path** (edit-directive from `Make changes`):
```
GateAnswerEvent{ optionId: "make-changes", freeText: <edit directive> }
    ▼
apply edit directive (per current § edit-directive handling)
    ▼
generation += 1; re-open with the revised draft
    ▼
cockpit_gate_open(GateOpenParams{ generation: g+1, gate: <revised draft>, ... })
    ▼
new GateRecord in OpenGatesMap; original GateRecord removed
    ▼
prior generation's answer (if it races back) matches V3 mismatch → ack superseded
```
