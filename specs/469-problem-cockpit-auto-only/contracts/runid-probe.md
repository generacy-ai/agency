# Contract: pre-flight capability probe extension

Contract for the pre-flight capability probe that decides `runIdEnabled` for the session. Sole authority is `packages/claude-plugin-cockpit/commands/auto.md § step 1 § Pre-flight probe (UI mode)`.

## Scope

The probe today (pre-#469) issues exactly one read-only `cockpit_gate_list({ issueRef: <identity-ref>, gateType: <omitted> })` call at pre-flight and classifies any `{status: 'error'}` return as failure (per `auto.md:82` and following, `auto.md:89`). This ticket EXTENDS the call to include `runId`, and adds one outcome branch that distinguishes `invalid-args` from the other error classes.

**Nothing else about the probe changes**. Same call site, same ordering constraints (post-header-write, post-identity-ref, post-tool-binding), same "at most one probe row per run" invariant, same ledger row shapes for pass and fail, same operator-facing failure line for the hard-fail path.

## Extended call shape

```typescript
cockpit_gate_list({
  issueRef: <identity-ref>,
  gateType: <omitted>,
  runId: <runId>,               // NEW — pre-flight-derived per `contracts/runid-derivation.md`
})
```

The probe is the SOLE `cockpit_gate_list` call in the run that carries `runId` (per FR-011 / `contracts/runid-threading.md § Read-side (cockpit_gate_list)`). It is safe because Phase B's handler drops `runId` before the cloud call. The cloud endpoint that would 400 on `runId` without `generation` never receives the field.

## Outcome branches

The probe result maps to one of five outcomes:

### 1. `ok` — probe passes

**Trigger**: `{status: 'ok', data: {gates: […], truncated?: …}}` — the `.strict()` schema accepted `runId` (cluster is #1067 or later), and the underlying `cockpit_gate_list` call succeeded.

**Action**:

- `runIdEnabled := true`.
- Continue exactly as today's probe-passes behaviour: write the pass ledger row (per `auto.md § Ledger Pre-flight probe row shapes`), let `--gates` resolution finalize.

**Anchor**: FR-012 / R6.

### 2. `graceful-degrade` — pre-#1067 cluster

**Trigger**: `{status: 'error', class: 'invalid-args', detail: …}` — the `.strict()` schema rejected `runId` (cluster is pre-#1067).

**Action**:

- `runIdEnabled := false` for the entire session.
- Log the startup warning verbatim (see § Graceful-degradation warning below).
- Continue the run under today's 3-input identity — generacy#1053 stays unfixed for this session, and the warning says so.
- Write the pass ledger row (the probe outcome is technically "the surface exists and rejects the field for a knowable reason", not a probe failure). **Correction to the pre-#469 rule**: today's probe would write the fail row on any error; under this ticket, the `invalid-args` branch writes the pass row and logs the startup warning to distinguish "capability absent" from "surface broken".

**Startup warning (verbatim, load-bearing)**:

```
runId threading disabled for this session — cluster's cockpit MCP server does not accept runId on cockpit_gate_list (pre-generacy#1067). Run continues under today's 3-input gate identity; generacy#1053 (re-run terminal gates) will not be fixed for this session. Upgrade the cluster's generacy build to ≥ commit 82077f1a to enable runId threading.
```

**Rationale for pass-not-fail on `invalid-args`**: `invalid-args` on a `.strict()` schema is definitionally a "known-unknown" — the tool server told us it does not recognize the field. The surface WORKS; the capability is ABSENT. The probe's job is to distinguish these; today's rule (any error → fail) was written before this distinction existed. Every OTHER error class describes a broken surface, not a capability gap; downgrading `runIdEnabled` on those would silently mask a real bug.

**Anchor**: FR-012 / R6.

### 3. `hard-fail-ui` — explicit `--gates=ui`, non-`invalid-args` error

**Trigger**: `{status: 'error', class: 'query-unreachable' | 'internal' | 'transport' | <unknown>, detail: …}` under explicit `--gates=ui`.

**Action**: Retain today's behaviour verbatim.

- `runIdEnabled` is NOT set (the run does not continue in UI mode).
- Write the fail ledger row: `<identity-ref> · preflight · gate-query-probe · error: <class> — <detail> · source: ui-gate-probe` (per `auto.md § Ledger Pre-flight probe row shapes`).
- Print the operator-facing line (per `auto.md § Pre-flight probe (UI mode) → Fail path`).
- Exit non-zero.

**Rationale**: Every error class other than `invalid-args` describes a broken surface, not a capability gap. Downgrading `runIdEnabled` on those would silently mask a real bug. See R6 (routing rationale).

**Anchor**: FR-012 / R6.

### 4. `downgrade-to-local` — `--gates=auto` (items 1–2 both YES), non-`invalid-args` error

**Trigger**: `{status: 'error', class: 'query-unreachable' | 'internal' | 'transport' | <unknown>, detail: …}` under `--gates=auto` with items 1 and 2 (tool binding + cluster cloud-activation) both passing.

**Action**: Retain today's behaviour verbatim.

- `runIdEnabled := false` (matches the `local` byte-path).
- Write the fail ledger row (same shape as § 3 above).
- Emit `Auto run starting · gates: local (source: --gates=auto → probe-failed)`.
- Continue the run under `local` byte-path — no gate verbs fire, so `runIdEnabled` is moot.

**Anchor**: FR-012 / R6.

### 5. `hard-fail-tentative-ui` — Form 3 TENTATIVE UI window, non-`invalid-args` error

**Trigger**: `{status: 'error', class: 'query-unreachable' | 'internal' | 'transport' | <unknown>, detail: …}` under Form 3's TENTATIVE UI window (a remote UI gate has already been consumed via G.6 opening remotely).

**Action**: Retain today's behaviour verbatim.

- `runIdEnabled` is NOT set (the run does not continue).
- Write the fail ledger row with the augmented outcome shape: `<identity-ref> · preflight · gate-query-probe · error: <class> — <detail> (aborted: probe-failed-after-remote-gate-consumed) · source: ui-gate-probe` (per `auto.md § Ledger Pre-flight probe row shapes → Fail (Form-3 TENTATIVE UI window exception)`).
- Print the operator-facing line.
- Exit non-zero.

**Anchor**: FR-012 / R6; `auto.md § Pre-flight probe (UI mode) → Fail path clause 4`.

## Decide-once, whole-session invariant

`runIdEnabled` is set at the probe site and MUST NOT flip mid-run.

**Enforcement**:

- The probe fires at most ONCE per run (per FR-010, unchanged from today).
- Every downstream reference site reads `runIdEnabled` verbatim.
- No mid-run re-check fires.
- If a mid-run gate verb returns `invalid-args` on `runId`, the plugin does NOT downgrade — that would produce a mixed-identity run per R6.

**Rationale for forbidding mid-run flip**: The startup sweep opens gates via `cockpit_gate_open` before any Step-0 check runs. By the time any mid-run `invalid-args` could arrive, sweep-opened 4-segment gates already exist. Reverting the read side after opens would orphan exactly those gates for the rest of the session. B (mid-run revert) is the one option that can leave a run in a state neither identity scheme describes.

**Anchor**: FR-012 / R6.

## Cross-schema inference

The probe tests `CockpitGateListInputSchema`, but the dependency in FR-009 is `CockpitGateStatusInputSchema`. Both live in `mcp/gates/query-schemas.ts` and both gained `runId` in the same commit `82077f1a`, so no deployment can split them. The plugin infers status-schema support from the probe outcome on list-schema.

Similarly, `CockpitGateOpenInputSchema` and `CockpitGateAckInputSchema` live in `mcp/gates/schemas.ts` and gained `runId` in the same Phase B commit. A cluster whose list schema accepts `runId` also accepts `runId` on open, ack, and status — the inference is 1:1 by construction. If a future deployment splits the four schemas, the probe assumption breaks and the spec's Assumptions section must be revisited.

**Anchor**: FR-012 Notes column; R6.

## `--gates=auto` short-circuit paths — probe does not fire

Per `auto.md:60` today's short-circuit rule: the probe fires ONLY when items 1 AND 2 of the `--gates=auto` three-part check both pass. Under short-circuit (item 1 or item 2 = NO), the run resolves to `local` with NO probe call and NO probe ledger row.

This ticket does NOT change the short-circuit rule. Under short-circuit:

- `runIdEnabled := false` (matches the `local` byte-path).
- No probe fires; no `runId` on any wire.

**Anchor**: `auto.md:60` (unchanged); FR-007 / R11.

## `--gates=local` — probe does not fire

Under `--gates=local`, the probe never fires (per `auto.md § step 1` gate resolution and the § step 3 conditional tool-presence check). `runIdEnabled := false` unconditionally; `runId` is `null` on loop state (see `data-model.md § Loop-state additions`).

**Anchor**: FR-007 / SC-005 / US4.

## Test assertions

Playbook-verification tests under `describe("469 runId threading")`:

- **469-4**: § step 1 § Pre-flight probe (UI mode) declares the extended probe call shape `cockpit_gate_list({issueRef, gateType: <omitted>, runId})`.
- **469-5**: § step 1 § Pre-flight probe (UI mode) declares the `invalid-args` graceful-degradation branch with the verbatim startup warning.
- **469-6**: § step 1 § Pre-flight probe (UI mode) declares `runIdEnabled` is decided ONCE at this site and MUST NOT flip mid-run.

## Reference implementation

Optional `lib/runid.ts § classifyProbeOutcome` maps the probe return to the outcome enum defined in `data-model.md § GateQueryProbeOutcome`. Playbook prose is the source of truth.
