# Data Model: Thread run-scoped `runId` from `/cockpit:auto` into gate open/ack calls

Reference types for `runId`, `runIdEnabled`, and the extended input shapes of `cockpit_gate_open` / `cockpit_gate_ack` / `cockpit_gate_status` / `cockpit_gate_list`. Wire schemas for the four gate verbs are owned upstream by Phase B ([generacy-ai/generacy#1067](https://github.com/generacy-ai/generacy/issues/1067) commit `82077f1a`); the shapes reproduced here are what the playbook prose references. Deviations must be proposed on #1067, not patched here.

## Overview

Four surfaces (in addition to the existing #449 + #457 surfaces):

1. **Pre-flight `runId` derivation** — the plugin derives `runId` at pre-flight from the ledger filename stem (per FR-001, R1/R2). Exactly one derivation site per run.
2. **Pre-flight capability probe extension** — the plugin extends today's `cockpit_gate_list({issueRef, gateType: <omitted>})` capability probe with a `runId` field (per FR-012, R6). Sets `runIdEnabled` for the whole session on the outcome.
3. **Write-side `runId` threading** — every `cockpit_gate_open` / `cockpit_gate_ack` / pre-draft `cockpit_gate_status` call in the run carries `runId` under `runIdEnabled === true` (per FR-004, FR-005, FR-009, R3).
4. **Read-side `runId` prohibition** — every functional `cockpit_gate_list` call in the run MUST NOT carry `runId` (per FR-011, R4). The pre-flight capability probe is the sole exception.

## Types

### `RunId` — the run-scoped identifier

```typescript
type RunId = string;   // full ledger filename stem verbatim: `<tracking-ref-slug>-<timestamp>`
                       //   e.g. 'epic-1053-20260729-143012'
                       // MUST NOT contain the `:` character (V1).
                       // MUST be identical to the ledger filename stem (without the `.ledger` suffix).
                       // Colon-free by construction under today's derivation
                       //   (slug is `/` → `-` with `#` stripped; timestamp is `YYYYMMDD-HHMMSS`).
```

**Provenance**: Derived exactly once at pre-flight (§ step 1, immediately after the ledger filename is computed at `auto.md:209`), by the parent loop. Every downstream consumer receives the value as an explicit literal — no consumer re-derives (V2).

**Not to be sourced from** (per FR-006 / R10): `INSTANCE_NONCE`, `process.env.HOSTNAME`, `process.pid`, a random UUID at first use, or any other per-process / per-MCP-connection value. The cockpit MCP server is long-lived; per-process values are stable across runs — the opposite of what's needed.

### `RunIdEnabled` — the session-scoped capability flag

```typescript
type RunIdEnabled = boolean;
```

Decided ONCE at pre-flight after the extended capability probe (per FR-012 / R6). Storage lives on the § In-memory loop state additions (UI mode) block.

Semantics:

| Condition | `runIdEnabled` |
|---|---|
| `--gates=local` (any resolution path) | `false` (probe does not fire; the field is never used) |
| `--gates=ui` (explicit) OR `--gates=auto` resolved to `ui` — probe returns `{status: 'ok', …}` | `true` |
| `--gates=ui` (explicit) OR `--gates=auto` resolved to `ui` — probe returns `{status: 'error', class: 'invalid-args', …}` | `false` (graceful degradation; startup warning fires) |
| `--gates=ui` (explicit) — probe returns any other error class | (session hard-fails per today's probe-failed rule; `runIdEnabled` is not set; the run does not continue) |
| `--gates=auto` resolved to `ui` — probe returns any other error class | (session resolves to `local` per today's probe-failed short-circuit; `runIdEnabled := false`) |
| Form 3 TENTATIVE UI window — probe returns any error class | (session hard-fails per today's `probe-failed-after-remote-gate-consumed` rule; `runIdEnabled` is not set; the run does not continue) |

**MUST NOT flip mid-run** (per FR-012). The enforcement site is the playbook prose stating this once at the derivation site and every downstream reference site re-stating "read the pre-flight-decided value verbatim". No mid-run re-check fires. If a mid-run gate verb returns `invalid-args` on `runId`, the plugin does NOT downgrade — that would produce a mixed-identity run per R6.

### `GateOpenParams` (extended) — input to `cockpit_gate_open`

Per generacy `mcp/gates/schemas.ts § CockpitGateOpenInputSchema` — Phase B commit `82077f1a` added the optional `runId` field alongside every field established by #449 and #457:

```typescript
interface GateOpenParams {
  // ... every field from the pre-#469 schema (issueRef, gateType, generation, title, body, options, transitionClass, dispatchClass, clusterId, askedAt, replyTo)
  runId?: RunId;  // NEW (Phase B). Optional on the wire. Passed by the plugin under `runIdEnabled === true`; OMITTED under `runIdEnabled === false`.
                  // Cloud (Phase A) stores runId as a doc field on organizations/{orgId}/cockpitGates/{gateId}
                  // and surfaces it as a first-class field on `cockpit_gate_list` rows per generacy-cloud#892.
}
```

**Threading rule**: every `cockpit_gate_open` in the run carries `runId` under `runIdEnabled === true` (enumerated in `contracts/runid-threading.md`).

### `GateAckParams` (extended) — input to `cockpit_gate_ack`

Per generacy `mcp/gates/schemas.ts § CockpitGateAckInputSchema` — Phase B commit `82077f1a` added the optional `runId` field:

```typescript
interface GateAckParams {
  gateId: GateId;
  outcome: 'applied' | 'superseded' | 'failed';   // per GateOutcomeSchema
  detail?: string;
  runId?: RunId;  // NEW (Phase B). Optional on the wire. Passed by the plugin under `runIdEnabled === true`; OMITTED under `runIdEnabled === false`.
                  // MUST match the runId the corresponding cockpit_gate_open used, so the ack targets the same gate identity.
}
```

**Threading rule**: every `cockpit_gate_ack` in the run carries `runId` under `runIdEnabled === true` (enumerated in `contracts/runid-threading.md`).

### `GateStatusQuery` (extended) — input to `cockpit_gate_status`

Per generacy `mcp/gates/query-schemas.ts § CockpitGateStatusInputSchema` — Phase B commit `82077f1a` added the optional `runId` field:

```typescript
interface GateStatusQuery {
  issueRef: string;               // owner/repo#N
  gateType: GateType;             // one of the 8 frozen enum values
  generation: string;             // durable content-derived discriminator
  runId?: RunId;                  // NEW (Phase B). Optional on the wire. Passed by the plugin under `runIdEnabled === true`; OMITTED under `runIdEnabled === false`.
                                  // MUST match the runId the corresponding cockpit_gate_open used, so the pre-draft check finds the run's own gate.
}
```

**Threading rule**: every pre-draft `cockpit_gate_status` in the six Step 0 blocks (D.1, D.2, D.3, D.4, D.7, D.11) carries `runId` under `runIdEnabled === true` (enumerated in `contracts/runid-threading.md`).

### `GateListQuery` (extended, but `runId` FORBIDDEN on functional calls) — input to `cockpit_gate_list`

Per generacy `mcp/gates/query-schemas.ts § CockpitGateListInputSchema` — Phase B commit `82077f1a` added the optional `runId` field FOR SURFACE PARITY ONLY:

```typescript
interface GateListQuery {
  issueRef: string;               // owner/repo#N
  gateType: GateType;             // one of the 8 frozen enum values (or omitted for the sweep-mode capability probe)
  runId?: RunId;                  // Optional on the wire (Phase B).
                                  // PROHIBITED on functional calls (FR-011 / R4).
                                  // Phase B's handler drops the field before the cloud call.
                                  // The cloud contract refines `runId requires generation`; the sweep probe has no `generation` and would 400 if `runId` reached the endpoint.
                                  // SOLE EXCEPTION: the pre-flight capability probe (per FR-012 / R6), which passes `runId` deliberately to test the schema at the tool boundary.
                                  // The probe is safe precisely because Phase B's handler drops the field locally.
}
```

**Threading rule**:

- Pre-flight capability probe: `runId` IS passed (per FR-012).
- Every other call — the pre-draft check's `absent`-branch drift-detection call (in D.1/D.2/D.3/D.4 — not D.7/D.11 because the drift branch is disabled there), and any future functional list call: `runId` MUST NOT be passed (per FR-011).

### `GateQueryProbeOutcome` — plugin-side branching after the capability probe

Not a wire type; a plugin-side type describing the outcomes of the extended pre-flight `cockpit_gate_list({issueRef, gateType: <omitted>, runId})` call.

```typescript
type GateQueryProbeOutcome =
  | { kind: 'ok';                    runIdEnabled: true }                       // schema accepts runId; #1067+ cluster
  | { kind: 'graceful-degrade';      runIdEnabled: false; warning: string }     // invalid-args on runId; pre-#1067 cluster; startup warning fires
  | { kind: 'hard-fail-ui';          reason: 'query-unreachable' | 'internal' | 'transport' | 'unknown-class'; class: string; detail: string }
                                                                                // any other error class under explicit --gates=ui — session exits non-zero
  | { kind: 'downgrade-to-local';    reason: 'query-unreachable' | 'internal' | 'transport' | 'unknown-class'; class: string; detail: string }
                                                                                // any other error class under --gates=auto (items 1–2 both YES, item 3 fails)
  | { kind: 'hard-fail-tentative-ui'; reason: 'query-unreachable' | 'internal' | 'transport' | 'unknown-class'; class: string; detail: string };
                                                                                // any other error class under Form 3 TENTATIVE UI window
```

The plugin does not persist this type; it is a control-flow tag consumed immediately after the probe and then discarded. The `runIdEnabled` value on the `'ok'` and `'graceful-degrade'` variants is stored on the loop state; the other variants terminate the run or downgrade to `local` per today's probe rules.

**On `graceful-degrade`**: the startup warning is logged verbatim (per `contracts/runid-probe.md § Graceful-degradation warning`). The run continues in UI mode with `runIdEnabled === false`, i.e. today's 3-input identity — generacy#1053 stays unfixed for this session, and the warning says so.

### Loop-state additions

The `LoopState` block (`auto.md § In-memory loop state additions (UI mode)`) gains two fields:

```typescript
interface LoopState {
  // ... every field from the pre-#469 loop state (openGates, firstGateOpenFailureNoted, answeredGateSweepCounter, monitorHandle, cursor, dispatchedIssues, etc.)
  runId: RunId | null;             // NEW. Set at pre-flight (§ step 1). null under --gates=local.
                                   //   Retained on the loop state under `runIdEnabled === false` because the value is also the ledger stem
                                   //   (used for the ledger filename); the `runIdEnabled` gate is what suppresses `runId` on the wire.
  runIdEnabled: RunIdEnabled;      // NEW. Set at pre-flight (§ step 1 § Pre-flight probe (UI mode)). Defaults to false under --gates=local.
                                   //   MUST NOT be reassigned after the pre-flight probe returns.
}
```

Under `--gates=local` both fields are declared for symmetry; `runId` is `null` and `runIdEnabled` is `false`. The block already carries `local`-unused fields (e.g. `openGates`), so the pattern is not new.

### Subagent dispatch prompt template

Subagents that MAY issue a gate verb receive `runId` as an EXPLICIT LITERAL in the dispatch prompt. The parent writes the literal at dispatch time; the subagent quotes it verbatim on every gate verb it issues. The dispatch-prompt template gains one line:

Under `runIdEnabled === true`:

```
runId: "<runId-literal>"
```

Under `runIdEnabled === false`: the `runId:` line is OMITTED from the prompt (matching the wire shape — the field is not passed).

**Subagents MUST NOT** re-derive `runId` from the ledger filename or any other source (per FR-014 / R8). The parent is the sole authority; the subagent quotes.

## Validation rules

### V1 — `runId` MUST NOT contain the `:` character

The pre-flight derivation MUST assert `runId.indexOf(':') === -1` before storing the value on loop state. Under today's derivation this is a no-op (the ledger stem is colon-free by construction), but the assertion is pinned in the prose so a future change to the ledger filename format cannot silently introduce one. If a colon is ever observed, the assertion aborts pre-flight with a diagnostic naming the offending value.

**Anchor**: FR-013 / R9.

### V2 — `runId` MUST be derived exactly once, at pre-flight, at the same point the ledger filename is computed

Every downstream consumer (parent loop, subagent dispatches, gate verbs) receives the pre-computed value as an explicit literal. No consumer re-derives it, even by the same rule. The single derivation site is `auto.md § step 1`, immediately after the ledger filename computation.

**Anchor**: FR-014 / R8. Enforcement: code review + optional static assertion in `lib/runid.ts` (a single `deriveRunId(trackingRefSlug, timestamp)` export whose only caller is `commands/auto.md`'s pre-flight prose).

### V3 — Every UI-mode `cockpit_gate_open`, `cockpit_gate_ack`, and pre-draft `cockpit_gate_status` in the run carries the run's `runId` under `runIdEnabled === true`

Enumerated dispatch paths (per FR-016 / R8):

- Startup sweep's `cockpit_gate_open` calls (§ step 3, every extended trigger state at `auto.md:274`).
- Every drafting D.n row's live-path `cockpit_gate_open` (D.1, D.2, D.3, D.4, D.6 G.4a, D.7 G.4b, D.8 G.5, D.10 G.4c, D.11 G.4d).
- The UI-mode fallback branch's `cockpit_gate_open`.
- Pre-draft `cockpit_gate_status` in the six Step 0 blocks (D.1, D.2, D.3, D.4, D.7, D.11).
- Generation-drift `cockpit_gate_ack(staleGateId, outcome: 'superseded', detail: 'generation drift …')` in D.1/D.2/D.3/D.4 (drift-branch-enabled rows only).
- § step 3 / § step 4 sub-step 0 answered-gate escape-hatch `cockpit_gate_ack(gateId, outcome: 'superseded', detail: 'answered-not-consumed — presumed stuck at cloud delivered/applied')`.
- § D.12 gate-answer step 5 `cockpit_gate_ack(gateId, outcome: 'applied' | …)` on operator answer.
- § D.12 gate-answer step 1 no-record `cockpit_gate_ack(gateId, outcome: 'superseded', detail: 'no record')`.
- § D.12 gate-answer step 3 live-state supersession `cockpit_gate_ack(gateId, outcome: 'superseded', detail: 'live-state supersession')`.

**Anchor**: FR-004, FR-005, FR-009, FR-016 / R3, R8, R11.

### V4 — Every functional `cockpit_gate_list` call in the run MUST NOT carry `runId`

Enumerated:

- Pre-draft check's `absent`-branch `cockpit_gate_list({issueRef, gateType})` drift-detection call in D.1/D.2/D.3/D.4 (not called in D.7/D.11 because the drift branch is disabled per the escalation guard).
- Any future functional list call in the sweep-adopt follow-up (Batch 2 Q6 / R7).

**Sole exception**: the pre-flight capability probe (§ step 1 § Pre-flight probe (UI mode)), which passes `runId` deliberately. This is safe because Phase B's handler drops the field before the cloud call.

**Anchor**: FR-011 / R4.

### V5 — `runIdEnabled` MUST NOT flip mid-run

Set once at pre-flight (§ step 1 § Pre-flight probe (UI mode)) and read verbatim by every downstream consumer. A mid-run flip would produce a mixed-identity run (per R6): the startup sweep opens gates before any Step-0 check runs, so reverting the read side after opens would orphan sweep-opened 4-segment gates for the rest of the session.

**Anchor**: FR-012 / R6. Enforcement: playbook prose states the invariant once at the probe site and every downstream reference site re-states "read the pre-flight-decided value verbatim". No mid-run re-check fires.

### V6 — Under `runIdEnabled === false`, the plugin OMITS the `runId` field entirely from wire payloads

The field is not passed as `null`, `undefined`, or an empty string — it is OMITTED. Under `.strict()` schemas on the wire, omitting is the safe way to be a no-op against a pre-#1067 cluster that does not know the field.

**Anchor**: FR-012 / R6.

### V7 — Under `--gates=local`, no `runId` field appears anywhere on the wire; `runIdEnabled === false`

The local byte-path never issues `cockpit_gate_open` / `cockpit_gate_ack` / `cockpit_gate_status` / `cockpit_gate_list`, so V7 is enforced by V3/V4 + the § Dispatch step 0 rule (Step 0 is skipped entirely under `local`).

**Anchor**: FR-007, SC-005 / US4.

## Relationships

```
                                § step 1 pre-flight
                                        │
                                        ▼
                            compute ledger filename stem [V1: colon-free]
                                        │
                                        ▼
                            runId := <tracking-ref-slug>-<timestamp> [V2: exactly once]
                                        │
                                        ▼
                            store runId on LoopState
                                        │
                                        ▼
                            (only under --gates=ui or --gates=auto → ui)
                                        │
                                        ▼
                        Pre-flight capability probe (§ step 1 § Pre-flight probe (UI mode)):
                        cockpit_gate_list({issueRef, gateType: <omitted>, runId}) [V4 exception]
                                        │
                                ┌───────┼───────┬──────────────┬─────────────┐
                                │       │       │              │             │
                                ▼       ▼       ▼              ▼             ▼
                             ok    invalid-args  query-unreachable / internal /
                                                 transport / unknown class
                                                              │
                                                    ┌─────────┼──────────┐
                                                    │         │          │
                                                    ▼         ▼          ▼
                                            (auto: 1+2 YES) (explicit ui) (Form 3 TENT UI)
                                             downgrade to    hard-fail    hard-fail
                                             local           the run      probe-failed-after-
                                                                          remote-gate-consumed
                                │       │
                                ▼       ▼
                        runIdEnabled runIdEnabled
                          := true      := false + log warning
                                │       │
                                └───┬───┘
                                    │
                                    ▼
                            LoopState.runIdEnabled fixed for the entire session [V5]
                                    │
                                    ▼
                            downstream sites read verbatim:
                                    │
                        ┌───────────┼────────────┬──────────────────┬─────────┐
                        │           │            │                  │         │
                        ▼           ▼            ▼                  ▼         ▼
                 startup sweep  D.1–D.4 Step 0  D.7/D.11 Step 0  drift ack   D.12 ack
                 cockpit_gate_ cockpit_gate_    cockpit_gate_    (D.1–D.4)   (steps 1, 3, 5)
                 open + escape status +         status +         cockpit_    cockpit_gate_
                 hatch ack     absent-branch    absent-branch    gate_ack    ack
                               list (NO runId)  list (NO runId,  (superseded (superseded / applied)
                                                drift branch    )
                                                DISABLED)
                        │
                        ▼
                    live-path
                    cockpit_gate_open
                    (D.1–D.4, D.6, D.7, D.8, D.10, D.11)

                    (V3: all runId-bearing under runIdEnabled === true; OMIT under runIdEnabled === false — V6)
                    (V4: no functional cockpit_gate_list carries runId; probe is the sole exception)
                    (V7: --gates=local never reaches this diagram; runIdEnabled defaults to false)
```

**Subagent branch** (per FR-015 / R8):

```
                    parent dispatches subagent for a drafting D.n row
                                    │
                                    ▼
                    dispatch-prompt template includes:
                        runId: "<runId-literal>"    (under runIdEnabled === true)
                        (line omitted under runIdEnabled === false)
                                    │
                                    ▼
                    subagent issues cockpit_gate_open (or other gate verb)
                                    │
                                    ▼
                    subagent passes the runId literal verbatim
                    on the outbound MCP call payload
                                    │
                                    ▼
                    (subagent MUST NOT re-derive from ledger filename or any other source — V2)
```

## Reference implementation notes

The reference module `packages/claude-plugin-cockpit/lib/runid.ts` (optional; not load-bearing) exposes:

```typescript
export function deriveRunId(
  trackingRefSlug: string,       // '/' → '-', '#' stripped
  timestamp: string,             // 'YYYYMMDD-HHMMSS' captured at pre-flight
): RunId;                        // enforces the colon-free invariant (V1) via a runtime assertion

export function assertRunIdColonFree(runId: RunId): void;  // throws with a diagnostic naming the offending value

export function serializeGateOpenParams(
  base: GateOpenParams,
  runId: RunId | null,
  runIdEnabled: boolean,
): GateOpenParamsWithMaybeRunId;   // omits the field entirely when runIdEnabled === false (V6)

export function serializeGateAckParams(
  base: GateAckParams,
  runId: RunId | null,
  runIdEnabled: boolean,
): GateAckParamsWithMaybeRunId;    // same omit rule as serializeGateOpenParams

export function serializeGateStatusQuery(
  base: GateStatusQuery,
  runId: RunId | null,
  runIdEnabled: boolean,
): GateStatusQueryWithMaybeRunId;  // same omit rule

export function classifyProbeOutcome(
  probeResult: { status: 'ok'; data: unknown } | { status: 'error'; class: string; detail: string },
  gatesMode: 'ui-explicit' | 'auto-resolved-ui' | 'form3-tentative-ui',
): GateQueryProbeOutcome;          // maps the probe return to the outcome enum
```

The functions above are the reference implementations of prose contracts in `contracts/runid-derivation.md`, `contracts/runid-threading.md`, and `contracts/runid-probe.md`. Playbook prose in `commands/auto.md` remains the source of truth per plan.md § Constitution Check. The library exists so fixture-verified machine checks can pin the shape of the branches the prose describes, and so a future author can grep the function names to confirm playbook↔library alignment.

## Fields NOT in scope

- **`runId` on gate verbs BEYOND `cockpit_gate_open`, `cockpit_gate_ack`, pre-draft `cockpit_gate_status`, and the pre-flight capability probe** — no `runId` on any other cockpit verb (`cockpit_status`, `cockpit_context`, `cockpit_queue`, `cockpit_advance`, `cockpit_resume`, `cockpit_merge`, `cockpit_await_events`, or any future gate-adjacent verb). Per spec § Out of Scope.
- **`runId` on functional `cockpit_gate_list` calls** — forbidden by V4 / FR-011 / R4.
- **Backfill of existing terminal gates with a `runId`** — existing gates remain as-is; the new field applies to new opens only (per spec § Out of Scope).
- **Session-resume semantics for `/cockpit:auto`** — out of scope; a re-invocation is definitionally a new run (per Batch 2 Q6 / R7 / spec § Assumptions).
- **Adopting pre-existing non-terminal gates for a tracking ref into `openGates` on session startup** — the sweep-adopt follow-up (Batch 2 Q6 / R7); filed separately.
- **Sourcing `runId` from a per-process or per-MCP-connection value** — rejected by FR-006 / R10.
- **Mid-run reversion from `runId` threading to 3-input identity** — rejected by FR-012 / R6.
