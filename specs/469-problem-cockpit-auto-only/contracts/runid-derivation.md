# Contract: `runId` derivation

Contract for the pre-flight `runId` derivation site in `/cockpit:auto`. Sole authority is `packages/claude-plugin-cockpit/commands/auto.md § step 1`.

## Site

**Location**: `auto.md § step 1`, IMMEDIATELY AFTER the ledger filename computation currently at `auto.md:209`.

**Timing**: The derivation runs at pre-flight, BEFORE any gate verb fires (including the pre-flight capability probe in `contracts/runid-probe.md`) and BEFORE the § step 3 startup sweep opens any gate.

**Ordering constraint**: The derivation must complete before ANY of the following: pre-flight capability probe (which reads the value); `runIdEnabled` decision; § step 3 startup sweep; § step 4 main loop. Under Form 3, the derivation also must complete before the TENTATIVE UI window's G.6 gate could open (G.6 is a `cockpit_gate_open` and must carry `runId` under `runIdEnabled === true`).

## Value shape

**On the wire**: The full ledger filename stem verbatim.

```
runId := <tracking-ref-slug>-<timestamp>
```

Where:

- `<tracking-ref-slug>` is the tracking reference with `/` replaced by `-` and `#` stripped — the same slug used in the ledger filename per `auto.md:209`.
- `<timestamp>` is `YYYYMMDD-HHMMSS` in the operator's local time captured at pre-flight — the same timestamp used in the ledger filename per `auto.md:209`.
- The `.ledger` filename suffix is NOT included in `runId`.

**Example**: For a run against `generacy-ai/generacy#1053` invoked at 2026-07-29 14:30:12 local:

- Ledger filename: `.generacy/cockpit/auto-runs/generacy-ai-generacy-1053-20260729-143012.ledger`
- `runId`: `generacy-ai-generacy-1053-20260729-143012`

**Anchor**: FR-001 / R2.

## Static invariants

### Invariant 1: `runId` MUST NOT contain the `:` character

`runId` is the trailing composite-key segment (`gateKey = ${issueRef}:${gateType}:${generation}[:${runId}]`), and `generation` may already contain colons (`spec-review:<sha>`, `sweep:needs-clarification:2`). A colon-bearing `runId` would make the tail ambiguous to anything parsing keys by position.

Under today's derivation, `runId` is colon-free by construction (slug is `/` → `-` with `#` stripped; timestamp is `YYYYMMDD-HHMMSS`). The invariant is pinned in the derivation prose so a future change to the ledger filename format cannot silently introduce one.

**Enforcement**: `runId.indexOf(':') === -1` MUST be asserted at the derivation site, either by playbook prose or by the optional `lib/runid.ts § assertRunIdColonFree` reference function. If a colon is ever observed, the assertion aborts pre-flight with a diagnostic naming the offending value.

**Anchor**: FR-013 / R9.

### Invariant 2: Compute-once

`runId` MUST be derived exactly once per run, at the pre-flight site named above. Every downstream consumer receives the pre-computed value as an EXPLICIT LITERAL — no consumer re-derives, even by the same rule.

Consumers include (non-exhaustive):

- The pre-flight capability probe (`contracts/runid-probe.md`).
- The parent loop's § step 3 startup sweep `cockpit_gate_open` calls.
- Every drafting D.n row's live-path `cockpit_gate_open`.
- Every pre-draft `cockpit_gate_status` in the six Step 0 blocks (D.1, D.2, D.3, D.4, D.7, D.11).
- Every `cockpit_gate_ack` (D.12 apply / D.12 supersede / drift-branch supersede / escape-hatch supersede).
- Every subagent dispatch prompt that spawns a gate-verb-issuing subagent (per `contracts/runid-threading.md § Subagent explicit-literal propagation`).

**Enforcement**: Playbook prose states "read the pre-flight-derived value verbatim" at every consumer site. Code review + the enumerated-dispatch-path test (per FR-016) catches new consumer sites that omit or re-derive.

**Rationale**: Two independent derivations that agree today can diverge under a future filename-format change or a stale-ledger race. Compute-once eliminates that class of failure by construction.

**Anchor**: FR-014 / R8.

### Invariant 3: `runId` MUST NOT be sourced from a per-process or per-MCP-connection value

Specifically NOT: `INSTANCE_NONCE` (rejected by generacy#1055), `process.env.HOSTNAME`, `process.pid`, a random UUID at first use, or any other per-process / per-MCP-connection value.

**Rationale**: The cockpit MCP server is long-lived in the orchestrator container (re-established design assumption from generacy#1055). Per-process values are STABLE across runs — the opposite of what's needed. Two auto runs invoked against the same cockpit MCP server would share the same per-process value, defeating the whole purpose of a run discriminator.

**Enforcement**: Playbook prose at the derivation site states the FR-006 rule verbatim. A future edit that "simplifies" the derivation to `process.env.INSTANCE_NONCE` (or similar) breaks the pin.

**Anchor**: FR-006 / R10.

## Reference implementation

Optional `lib/runid.ts` provides a fixture-testable derivation function:

```typescript
export function deriveRunId(
  trackingRefSlug: string,   // '/' → '-', '#' stripped
  timestamp: string,         // 'YYYYMMDD-HHMMSS' captured at pre-flight
): RunId {
  const runId = `${trackingRefSlug}-${timestamp}`;
  assertRunIdColonFree(runId);
  return runId;
}

export function assertRunIdColonFree(runId: RunId): void {
  if (runId.indexOf(':') !== -1) {
    throw new Error(`runId invariant violated: value contains ':': ${runId}`);
  }
}
```

Playbook prose in `commands/auto.md` remains the source of truth. The reference module exists so fixture-verified machine checks can pin the derivation shape.

## Test assertions

Playbook-verification tests under `describe("469 runId threading")`:

- **469-1**: § step 1 declares the derivation `runId := <tracking-ref-slug>-<timestamp>` immediately after ledger filename computation.
- **469-2**: § step 1 declares the compute-once invariant (FR-014 / R8).
- **469-3**: § step 1 declares the no-`:` invariant on `runId` verbatim (FR-013 / R9).

## Behaviour under `--gates=local`

Under `--gates=local`, the derivation site prose is DEAD PROSE — the derivation still runs (the ledger filename is computed under `local` too), but `runId` is not stored on loop state as a wire-side value (`runIdEnabled === false` unconditionally under `local`) and no gate verb reads it. The § In-memory loop state additions declares `runId: RunId | null` and the `local` branch sets it to `null` (see `data-model.md § Loop-state additions`).
