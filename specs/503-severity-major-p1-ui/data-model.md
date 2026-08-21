# Data Model: UI-mode remediation-limit gate

This feature changes existing wire type definitions; it introduces no new persisted entities. All edits live in `packages/claude-plugin-cockpit/lib/gate-wire-types.ts` and are documentation/contract edits in `commands/auto.md`.

## Entity: `GateType` (wire) — MODIFY

The discriminated union the plugin passes on `cockpit_gate_status` / `cockpit_gate_open`.

**Location**: `gate-wire-types.ts:105-113`

**Change**: Add the `remediation-limit` member (FR-001).

Before:
```ts
export type GateType =
  | "clarification"
  | "artifact-review"
  | "implementation-review"
  | "manual-validation"
  | "escalation"
  | "phase-queue"
  | "filing"
  | "scope-drained";
```

After:
```ts
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
```

**Validation rule**: Must remain aligned with the generacy MCP `GateTypeSchema` enum. The enum admits `remediation-limit` only once generacy-ai/generacy#1163 lands (FR-005); until then, gate verbs reject the value at the MCP boundary, and that boundary is sequenced by the `MIN_GENERACY_VERSION=0.2.0` pre-flight probe.

## Entity: generation discriminator comment block — MODIFY

**Location**: `gate-wire-types.ts:115-133` (the `GateGeneration` doc block enumerating the per-gateType discriminator).

**Change**: Add a `remediation-limit` line (FR-002).

```
  - remediation-limit    : PR head SHA (durable). The remediation counter is a
                           DATA GAP the parent loop does not yet compute, so the
                           discriminator is derived from PR head SHA only today;
                           the remaining-findings-hash form is NOT used. Non-
                           idempotent re-ask across restart/takeover is an
                           accepted follow-up shared with the other gapped
                           gateTypes.
```

**Note**: The generation-drift set at `gate-wire-types.ts:319` already lists `remediation-limit` in `{clarification, artifact-review, implementation-review, manual-validation, remediation-limit}` — no change required there.

## Entity: `DispatchClass` (wire) — MODIFY

The parallel union in the same file that types `GateRecord.dispatchClass`.

**Location**: `gate-wire-types.ts:142-152`

**Change**: Add the `"D.13"` member with its mapping comment (FR-007).

```ts
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
```

**Validation rule**: `auto.md:1043`'s adoption path constructs a `GateRecord` with `dispatchClass: 'D.13'`; that literal must type-check against `GateRecord.dispatchClass: DispatchClass` (`:318`).

## Relationship: `GateRecord` (unchanged, consumer)

**Location**: `gate-wire-types.ts:311-333`

`GateRecord` is not edited, but it is the consumer that forces both union edits:
- `GateRecord.gateType: GateType` — consumes the FR-001 addition.
- `GateRecord.dispatchClass?: DispatchClass` — consumes the FR-007 addition (`:318`).

## Playbook contract (documentation) changes — `auto.md`

These are not code types but pinned contract text (drift-audited by `playbook-verification.test.ts`):

| Anchor | Current | Change | FR |
|--------|---------|--------|----|
| `auto.md:333` | "transition class is one of D.1–D.9" | include D.13 in the base synthetic-event sweep | FR-003 |
| `auto.md:1012` clause (d) | "does not match a Trigger in any § Dispatch row (D.1–D.9c or D.11)" | extend enumeration so `remediation-limit` matches D.13, not D.10 | FR-004 |
| `auto.md:1555` | `PR head SHA + remediation counter (or remediation counter + remaining-findings hash)` | drop the rejected parenthetical | FR-008 |
| `auto.md:1561` | DATA GAPS list | reconcile the `remediation-limit` entry with the Q1/Q5 decision | FR-008 |

## Test pins — `playbook-verification.test.ts`

| Row | Location | Re-pin |
|-----|----------|--------|
| 500-5 | `:5990` | Re-verify D.13 / G.9 prose stays intact after the auto.md edits. | 
| 500-7 | `:6035` | Move the discriminator-row assertion from the loose `remediation-limit` row match to pin the reconciled discriminator string (parenthetical dropped). |
| 500-9 | `:6069` | Re-verify the D.13 recognised-row-vs-D.10 invariant after the clause-(d) edit. |
