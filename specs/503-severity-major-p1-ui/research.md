# Research: UI-mode remediation-limit gate

All open decisions were resolved in the clarification batches (2026-08-21). This document records the technology/design decisions with their rationale and the alternatives considered, so the implementation can proceed without re-litigating them.

## D1: Generation discriminator formula (clarified Q1)

**Decision**: `remediation-limit`'s generation discriminator is **PR head SHA + remediation counter** (durable-state-derived), matching the `auto.md` discriminator table and the Assumptions section.

**Rationale**: `gate-wire-types.ts` requires every discriminator to be derivable from durable state so the derived `gateId` is stable across restart/takeover (`:115-133`). PR head SHA is durable GitHub state, consistent with the sibling `implementation-review` / `manual-validation` gateTypes.

**Alternatives considered**:
- *Remediation counter + remaining-findings hash* — rejected. The remaining-findings hash is a listed DATA GAP and not durable; the findings-hash form was only ever a parenthetical in the discriminator table.

## D2: Restart-stability vs. the remediation-counter DATA GAP (clarified Q5)

**Decision**: Accept the gap for now — derive the discriminator from **PR head SHA only** (remediation counter omitted), and document the non-idempotent re-ask across restart/takeover as a follow-up, exactly like the other gapped gateTypes (`auto.md:1561`).

**Rationale**: `auto.md:1561` already frames the remediation counter among inputs "the parent loop does not yet compute". PR head SHA is restart-stable, so the SHA half of the formula holds today; the counter half joins the existing shared DATA-GAP follow-up. This keeps `remediation-limit` consistent with its SHA-based siblings.

**Alternatives considered**:
- *Close the gap in this PR* (parse the counter client-side from the engine gate body) — rejected. It would still not achieve full idempotency (PR head SHA is itself a listed gap for some paths), and it expands scope with a partial, inconsistent fix.

## D3: Cross-repo merge coordination (clarified Q2)

**Decision**: Merge this plugin PR **independently** ahead of generacy-ai/generacy#1163. Dogfood is gated separately on #1163.

**Rationale**: The union + D.13/D.10 rows are plugin-side artifacts. All remediation-limit runtime behavior is already gated on the engine via the `MIN_GENERACY_VERSION=0.2.0` pre-flight probe (`auto.md:226,244`), which blocks a new `auto` against an old engine before any loop runs. #1163's enum landing unblocks live gate-verb acceptance — which the probe already sequences.

**Alternatives considered**:
- *Block this PR until #1163 merges* / *coordinated joint merge* — rejected. The pre-flight probe makes the strict ordering unnecessary; either would stall a ready plugin change on a separate repo's schedule.

## D4: Startup-sweep scope for D.13 (clarified Q3)

**Decision**: Add D.13 to the **base** startup-sweep trigger set (`auto.md:333`, the D.1–D.9 enumeration), not the UI-mode extended set only.

**Rationale**: The base synthetic-event dispatch enumerates D.1–D.9 and runs **mode-agnostically**. D.10's trigger fires on any state not one of D.1–D.9c or D.11, so a parked `waiting-for:remediation-limit` falls through to D.10 in **both** local and UI mode unless D.13 joins the base enumeration. D.13's "MUST never fall through to D.10" invariant must hold in local mode too.

**Alternatives considered**:
- *UI-mode extended set only* — rejected. Would leave local-mode parked issues misrouted to D.10 across a restart.

## D5: Source of the gate's remaining findings (clarified Q4)

**Decision**: The plugin's D.13 draft-then-open flow **fetches/composes the remaining findings from issue/PR state** — parsed from the engine-written gate body on the linked issue (`auto.md:1032,1575`), rendered client-side exactly as the sibling #504 pins ("latest linked-issue comment starting with `## Remediation limit reached`").

**Rationale**: `cockpit_gate_status` returns only `{gateId, status}` — it carries no findings — so pass-through from the status verb is structurally impossible. G.9 already sources findings from the engine gate body.

**Alternatives considered**:
- *Pass through findings from `cockpit_gate_status`* — rejected as structurally impossible (no findings in the return shape).

## D6: auto.md prose reconciliation scope (clarified Q6)

**Decision**: In scope — edit `auto.md:1555` (drop the rejected parenthetical) and `:1561` (DATA GAPS list) plus the plugin comment block, in one PR, and re-pin any affected `playbook-verification` rows accordingly.

**Rationale**: FR-002 mandates documenting the discriminator as "PR head SHA + remediation counter" with the findings-hash form "not used", but `:1555` still carries the rejected parenthetical — leaving the playbook self-contradictory. FR-006 already requires re-pinning playbook rows that pin auto.md content, so auto.md is necessarily in the file set. Plugin-side-only would leave the source-of-truth table contradicting the pinned Q1 decision and the plugin comment block FR-001 says must stay in sync.

## D7: `DispatchClass` union — add `"D.13"` (clarified Q7)

**Decision**: In scope — add `"D.13"  // waiting-for:remediation-limit (G.9) → gateType "remediation-limit"` to the `DispatchClass` union (`gate-wire-types.ts:142-152`) and its mapping comment.

**Rationale**: `GateRecord.dispatchClass` is typed as `DispatchClass` (`:318`), and `auto.md:1043`'s adoption path constructs a `GateRecord` with `dispatchClass: 'D.13'` (mandatory; D.12 steps 3–4 route on it), so the literal cannot type-check until `D.13` joins the union. `D.13` also opens a real gate (G.9), unlike the ledger-only classes the union deliberately omits.

**Alternatives considered**:
- *Out of scope — no change needed* — rejected. Its reasoning fails against line 318's explicit typing and the FR-001 directive to keep the parallel comment block in sync.

## Codebase grounding (verified at current HEAD)

The spec's line references were written against `develop 1455ce5`; line numbers have since shifted. Verified anchors at current HEAD:

- `GateType` union: `packages/claude-plugin-cockpit/lib/gate-wire-types.ts:105-113` (8 members, no `remediation-limit`).
- Discriminator comment block: `gate-wire-types.ts:115-133`.
- `DispatchClass` union: `gate-wire-types.ts:142-152` (no `D.13`).
- `GateRecord.dispatchClass: DispatchClass`: `gate-wire-types.ts:318`.
- Generation-drift set already includes `remediation-limit`: `auto.md:319`.
- Base synthetic-event sweep ("transition class is one of D.1–D.9"): `auto.md:333`.
- D.10 clause (d): `auto.md:1012`.
- D.13 dispatch row + "MUST be recognized" invariant: `auto.md:1028-1054`.
- Discriminator table row (with rejected parenthetical): `auto.md:1555`.
- DATA GAPS list: `auto.md:1561`.
- G.9 gate contract: `auto.md:1504-1575`.
- Playbook pins: `tests/playbook-verification.test.ts` rows 500-5 (`:5990`), 500-7 (`:6035`), 500-9 (`:6069`).
