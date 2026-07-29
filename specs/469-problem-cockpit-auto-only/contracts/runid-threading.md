# Contract: `runId` threading through gate verbs

Contract for the write-side threading of `runId` into every gate verb `/cockpit:auto` issues. Sole authority is `packages/claude-plugin-cockpit/commands/auto.md`.

## Scope

Under `runIdEnabled === true`, every call to `cockpit_gate_open`, `cockpit_gate_ack`, and pre-draft `cockpit_gate_status` in the run carries the pre-flight-derived `runId` (per `contracts/runid-derivation.md`) as an OPTIONAL FIELD on the existing MCP call payload.

Under `runIdEnabled === false`, the `runId` field is OMITTED from every call payload — not passed as `null`, not passed as `undefined`, not passed as an empty string. Omission is the safe way to be a no-op against a `.strict()` schema on a pre-#1067 cluster (see `contracts/runid-probe.md`).

Under `--gates=local`, none of these calls fire (per `auto.md § step 1` gate resolution and the § step 3 conditional tool-presence check); the contract below is dead prose for the local byte-path.

## Read-side (`cockpit_gate_status`) — every pre-draft check carries `runId`

Every per-event pre-draft `cockpit_gate_status` call in the six Step 0 blocks (D.1, D.2, D.3, D.4, D.7, D.11) carries the run's `runId` under `runIdEnabled === true`.

**Call sites (enumerated)**:

- `auto.md:567` — D.1 § Step 0 sub-step 2 (`cockpit_gate_status({ issueRef, gateType: 'clarification', generation })`)
- `auto.md:633` — D.2 § Step 0 sub-step 2 (`cockpit_gate_status({ issueRef, gateType: 'artifact-review', generation })`)
- `auto.md:679` — D.3 § Step 0 sub-step 2 (`cockpit_gate_status({ issueRef, gateType: 'implementation-review', generation })`)
- `auto.md:711` — D.4 § Step 0 sub-step 2 (`cockpit_gate_status({ issueRef, gateType: 'manual-validation', generation })`)
- D.7 § Step 0 sub-step 2 (`cockpit_gate_status({ issueRef, gateType: 'escalation', generation })`) — call fires (same-`gateId` reuse check); drift branch DISABLED for `escalation`, so `absent`-branch skips the list call
- D.11 § Step 0 sub-step 2 (`cockpit_gate_status({ issueRef, gateType: 'escalation', generation })`) — same as D.7

**Call shape under `runIdEnabled === true`**:

```typescript
cockpit_gate_status({ issueRef, gateType, generation, runId })
```

**Call shape under `runIdEnabled === false`**:

```typescript
cockpit_gate_status({ issueRef, gateType, generation })
```

**Rationale**: Without `runId` on the read side, `cockpit_gate_open` derives a 4-segment `issueRef:gateType:generation:runId` key while pre-draft `cockpit_gate_status` derives a 3-segment `issueRef:gateType:generation` key. Every pre-draft check returns `absent`, the drafting subagent re-runs on every wake, duplicate inbox gates accumulate against a `gateId` the loop never tracks. Same regression as the runId-on-open-alone case, one layer down. See FR-009 / R3.

**Anchor**: FR-009 / R3.

## Read-side (`cockpit_gate_list`) — FORBIDDEN on functional calls

Every functional `cockpit_gate_list` call in the run MUST NOT carry `runId`. The pre-flight capability probe is the SOLE exception (see `contracts/runid-probe.md`).

**Call sites (enumerated) — all MUST omit `runId`**:

- D.1 § Step 0 sub-step 2 `absent`-branch drift-detection call (`cockpit_gate_list({ issueRef, gateType: 'clarification' })`).
- D.2 § Step 0 sub-step 2 `absent`-branch drift-detection call (`cockpit_gate_list({ issueRef, gateType: 'artifact-review' })`).
- D.3 § Step 0 sub-step 2 `absent`-branch drift-detection call (`cockpit_gate_list({ issueRef, gateType: 'implementation-review' })`).
- D.4 § Step 0 sub-step 2 `absent`-branch drift-detection call (`cockpit_gate_list({ issueRef, gateType: 'manual-validation' })`).

Note: D.7 and D.11 do NOT call `cockpit_gate_list` in the `absent` branch — the drift branch is DISABLED for `gateType: 'escalation'` per the escalation guard (`auto.md § Pre-draft check — shared rules → generation-drift branch guard`). No `runId`-related change to D.7/D.11 `absent` behaviour.

**Call shape (all functional list calls, all `runIdEnabled` states)**:

```typescript
cockpit_gate_list({ issueRef, gateType })
```

**Rationale**: The cloud contract refines `runId requires generation`. A functional list call has no `generation`, so forwarding `runId` would 400 on the cloud side. Phase B's handler drops `runId` before the cloud call as a defense-in-depth, but relying on that is fragile and the FR-011 rule forbids the field on functional calls outright. Reinforced by the Batch 2 Q6 sweep-adopt follow-up, which also uses runId-agnostic list calls — foreclosing runId filtering on list would foreclose that repair before it is built. See FR-011 / R4.

**Anchor**: FR-011 / R4.

## Write-side (`cockpit_gate_open`) — every call carries `runId`

Every `cockpit_gate_open` in the run carries `runId` under `runIdEnabled === true`.

**Call sites (enumerated)**:

- § step 3 startup sweep's `cockpit_gate_open` — every persistent gate-trigger state (per `auto.md:274` extended trigger set): every `waiting-for:*` label AND every persistent non-`waiting-for:*` trigger (`agent:error`, `failed:<subtype>`, `completed:validate` with red checks, `phase-complete`, `blocked:stuck-merge-conflicts`).
- § UI-mode fallback branch's `cockpit_gate_open` (per `auto.md § UI-mode fallback`).
- D.1 live-path `cockpit_gate_open` — after the drafting subagent returns (`clarification` gate).
- D.2 live-path `cockpit_gate_open` — after the review-verdict analyzer returns (`artifact-review` gate).
- D.3 live-path `cockpit_gate_open` — after the review-verdict analyzer returns (`implementation-review` gate).
- D.4 live-path `cockpit_gate_open` — after the manual-validation summarizer returns (`manual-validation` gate).
- D.6 live-path `cockpit_gate_open` — G.4a (`escalation` gate).
- D.7 live-path `cockpit_gate_open` — G.4b (`escalation` gate).
- D.8 live-path `cockpit_gate_open` — G.5 phase-complete (`phase-queue` gate).
- D.10 live-path `cockpit_gate_open` — G.4c (`escalation` gate).
- D.11 live-path `cockpit_gate_open` — G.4d (`escalation` gate).
- Form 3 G.6 filing gate `cockpit_gate_open` under `--gates=ui` TENTATIVE UI window (per `auto.md § Form 3` sequencing).

**Call shape under `runIdEnabled === true`**:

```typescript
cockpit_gate_open({
  issueRef, gateType, generation,
  title, body, options,
  transitionClass, dispatchClass,
  clusterId, askedAt, replyTo,
  runId,
})
```

**Call shape under `runIdEnabled === false`**: `runId` field omitted; rest unchanged.

**Anchor**: FR-004 / R11 (dispatch-path enumeration).

## Write-side (`cockpit_gate_ack`) — every call carries `runId`

Every `cockpit_gate_ack` in the run carries `runId` under `runIdEnabled === true`.

**Call sites (enumerated)**:

- § D.12 gate-answer step 5 (operator answer applied): `cockpit_gate_ack(gateId, outcome: 'applied' | …, runId)`.
- § D.12 gate-answer step 1 (no `openGates` record — drop path per `auto.md:762`): `cockpit_gate_ack(gateId, outcome: 'superseded', detail: 'no record', runId)`.
- § D.12 gate-answer step 3 (live-state supersession check per `auto.md § D.12`): `cockpit_gate_ack(gateId, outcome: 'superseded', detail: 'live-state supersession', runId)`.
- § step 3 answered-gate escape hatch (`auto.md:248`): `cockpit_gate_ack(gateId, outcome: 'superseded', detail: 'answered-not-consumed — presumed stuck at cloud delivered/applied', runId)`.
- § step 4 sub-step 0 per-wake escape hatch (`auto.md:300`): same as § step 3, per-wake tick site.
- D.1 § Step 0 generation-drift branch (`auto.md:572`): `cockpit_gate_ack(staleGateId, outcome: 'superseded', detail: 'generation drift — content changed since original draft (was g<old>, now g<new>)', runId)`.
- D.2 § Step 0 generation-drift branch (`auto.md:638`): same as D.1.
- D.3 § Step 0 generation-drift branch (`auto.md:684`): same as D.1.
- D.4 § Step 0 generation-drift branch (`auto.md:716`): same as D.1.

Note: D.7 and D.11 do NOT `ack` in the § Step 0 `absent` branch — the drift branch is DISABLED for `gateType: 'escalation'` per the escalation guard. No `runId`-related change to D.7/D.11 `absent` `ack` behaviour (there is no `ack` there to change).

**Call shape under `runIdEnabled === true`**:

```typescript
cockpit_gate_ack({ gateId, outcome, detail?, runId })
```

**Call shape under `runIdEnabled === false`**: `runId` field omitted; rest unchanged.

**Rationale**: `runId` on the ack payload is **accepted-and-ignored** — `cockpit_gate_ack` targets the existing `gateId` and performs NO key derivation (per generacy `mcp/gates/schemas.ts § GateAckInputSchema`; `GateOutcomeWireSchema` has no `runId` field, so the value is dropped before the wire and never reaches the cloud). We still pass `runId` under `runIdEnabled === true` for **envelope symmetry** with `cockpit_gate_open` — auto-loop callers can pass the same envelope shape to both verbs without tripping the tool's `.strict()`, and `runId` on the ack payload is safe by construction because the ack targets a `gateId` rather than deriving one. The asymmetry with `cockpit_gate_open` is deliberate: open **does** derive (`deriveGateKey` appends `:${runId}`); ack does not. This is what lets drift-branch acks in D.1/D.2/D.3/D.4 supersede a `staleGateId` discovered via a runId-agnostic `cockpit_gate_list` — the stale gate may have been opened by an earlier run whose `runId` differs from the current one, and the ack still lands. See FR-005 / R11 (dispatch-path enumeration).

**Anchor**: FR-005 / R11.

## Subagent explicit-literal propagation

Subagents that issue any gate verb receive `runId` as an EXPLICIT LITERAL in the dispatch prompt.

**Rule**: Under `runIdEnabled === true`, the parent writes ONE additional line into every subagent dispatch prompt that spawns a gate-verb-issuing subagent:

```
runId: "<runId-literal>"
```

The subagent quotes the literal verbatim on every gate verb it issues (`cockpit_gate_open`, `cockpit_gate_ack`, `cockpit_gate_status`).

**Under `runIdEnabled === false`**, the `runId:` line is OMITTED from the dispatch prompt entirely (matching the wire shape — no field on the payload).

**Subagents MUST NOT** re-derive `runId` from the ledger filename, the environment, a shared file, or any other source. The parent is the sole authority; the subagent quotes verbatim (per FR-014 / FR-015 / R8).

**Rationale**:

1. **`auto.md` already uses explicit-literal propagation for every other run-scoped value** passed to subagents (epic ref, gateId, cursor, prompts). Pattern A matches the file's existing conventions.
2. **B (subagent re-derives from ledger filename)** would require a one-file-per-directory invariant that does not hold — the directory `.generacy/cockpit/auto-runs/` accumulates one file per run. A subagent that opens the "wrong" file (a stale prior-run file, or a concurrent run's file) would derive the wrong `runId`.
3. **C (env var / shared file)** adds a global surface for a single value with a clean explicit-literal propagation path; imports new failure modes (subagent starts before env var is set / shared file exists).

**Enumerated subagents that MUST receive the literal**:

- D.1 clarification-drafter subagent (SB.1) — issues `cockpit_gate_open` on `clarification`.
- D.2 review-verdict analyzer subagent — issues `cockpit_gate_open` on `artifact-review`.
- D.3 review-verdict analyzer subagent — issues `cockpit_gate_open` on `implementation-review`.
- D.4 manual-validation summarizer subagent — issues `cockpit_gate_open` on `manual-validation`.
- D.7 diagnosis subagent — issues `cockpit_gate_open` on `escalation`.
- D.11 merge-conflicts diagnosis subagent — issues `cockpit_gate_open` on `escalation`.

Any other subagent that does NOT issue a gate verb (e.g. a plain research subagent) does NOT need `runId` in its prompt — the explicit-literal rule is scoped to gate-verb-issuing subagents.

**Anchor**: FR-015 / R8.

## `auto.md:283` prose update

The load-bearing paragraph at `auto.md:283` currently reads (verbatim):

> The pre-draft `cockpit_gate_status({issueRef, gateType, generation})` check (per § Dispatch step 0 in D.1 / D.2 / D.3 / D.4 / D.7 / D.11) **names the same three inputs**, so sweep-derived and live-derived `gateId`s coalesce when the underlying content has not changed.

Post-fix (updated in the same PR as the caller wiring):

> The pre-draft `cockpit_gate_status({issueRef, gateType, generation, runId})` check (per § Dispatch step 0 in D.1 / D.2 / D.3 / D.4 / D.7 / D.11) **names the same four inputs** (under `runIdEnabled === true`; three under `runIdEnabled === false`, matching the pre-#469 3-input identity), so sweep-derived and live-derived `gateId`s coalesce when the underlying content has not changed AND the run is the same. Two runs against the same tracking ref intentionally derive DIFFERENT `gateId`s — see § Assumptions in `specs/469-problem-cockpit-auto-only/spec.md` for the behaviour change and the sweep-adoption follow-up.

**Rationale**: This is the load-bearing contract for when two `gateId`s coalesce. Leaving stale "three inputs" prose while the code names four is worse than no prose — it will be trusted. See FR-010 / R5.

**Anchor**: FR-010 / R5.

## `§ Pre-draft check — shared rules` update

The § Pre-draft check — shared rules paragraph gains one bullet:

> **`runId` (fourth input under `runIdEnabled === true`)**: the pre-draft check's `gateId` uses four inputs when `runIdEnabled === true`; the fourth input is the pre-flight-derived `runId` (per `contracts/runid-derivation.md`) and is threaded as an explicit literal, never re-derived (per FR-014). Under `runIdEnabled === false` the field is omitted from the wire payload and the pre-#469 3-input identity applies.

**Anchor**: FR-010 / R5.

## Test assertions

Playbook-verification tests under `describe("469 runId threading")`:

- **469-8**: § step 3 startup sweep declares every `cockpit_gate_open` call passes `runId` under `runIdEnabled === true`.
- **469-9**: § step 3 / § step 4 sub-step 0 answered-gate escape hatch declares `cockpit_gate_ack(superseded)` passes `runId` under `runIdEnabled === true`.
- **469-10**: § step 3 `gateId idempotency` paragraph declares the FOUR inputs the `gateId` uses under `runIdEnabled === true`.
- **469-11 through 469-16**: each of D.1/D.2/D.3/D.4/D.7/D.11 § Step 0 sub-step 2 declares the extended `cockpit_gate_status({issueRef, gateType, generation, runId})` call shape.
- **469-17 through 469-20**: each of D.1/D.2/D.3/D.4 § Step 0 generation-drift branch declares the extended `cockpit_gate_ack(staleGateId, outcome: 'superseded', …, runId)` call shape. D.7 and D.11 NOT pinned (drift branch disabled per escalation guard).
- **469-21**: D.1/D.2/D.3/D.4 § Step 0 `absent`-branch `cockpit_gate_list({issueRef, gateType})` MUST NOT carry `runId` (assertion pins the absence).
- **469-22**: § D.12 step 5 `cockpit_gate_ack` (operator apply) declares `runId` threading.
- **469-23**: § D.12 step 1 no-record `cockpit_gate_ack(superseded, 'no record')` declares `runId` threading.
- **469-24**: § D.12 step 3 live-state-supersession `cockpit_gate_ack(superseded, 'live-state supersession')` declares `runId` threading.
- **469-25**: enumerated live-path `cockpit_gate_open` calls (D.1, D.2, D.3, D.4, D.6 G.4a, D.7 G.4b, D.8 G.5, D.10 G.4c, D.11 G.4d) each declare `runId` threading — the enumerated-dispatch-path assertion required by FR-016.
- **469-26**: subagent dispatch prompts (D.1, D.2, D.3, D.4, D.7, D.11) declare the explicit-literal `runId: "<runId-literal>"` rule.
- **469-27**: `auto.md:283` prose declares FOUR inputs under `runIdEnabled === true`.
- **469-28**: § Pre-draft check — shared rules names `runId` as the fourth input.
- **469-29**: `--gates=local` byte-path invariance — zero `runId` occurrences under local branches.
