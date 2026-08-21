# Implementation Plan: UI-mode remediation-limit gate (wire type + D.13 dispatch reachability)

**Feature**: Wire `remediation-limit` into the cockpit plugin's gate types and close the two D.13 dispatch-reachability gaps so the remediation-limit gate reaches the operator inbox in UI mode and recovers across restart in both modes.
**Branch**: `503-severity-major-p1-ui`
**Status**: Complete

## Summary

The engine can raise a `waiting-for:remediation-limit` gate when its remediate loop exhausts its retry cap, and `auto.md` already carries the D.13 dispatch row, the G.9 gate contract, and a discriminator-table entry. But the gate is **dead on arrival in UI mode** and **unreachable after restart in both modes** because of three narrow gaps:

1. **Wire type gap (P1, dead-on-arrival)** — the plugin `GateType` union (`lib/gate-wire-types.ts:105-113`) omits `remediation-limit`, so every D.13 gate verb (`cockpit_gate_status` / `cockpit_gate_open`) fails the pre-draft taxonomy check and the event aborts before any gate is opened. The parallel `DispatchClass` union (`:142-152`) also omits `"D.13"`, so the auto.md adoption `GateRecord` (`dispatchClass: 'D.13'`) does not type-check against `GateRecord.dispatchClass: DispatchClass` (`:318`).
2. **Startup-sweep gap (P1, silent stall)** — the synthetic-event sweep enumerates only transition classes `D.1–D.9` (`auto.md:333`), so a parked `waiting-for:remediation-limit` issue is invisible across a restart until an unrelated event fires (the label never self-re-fires).
3. **D.10 contradiction (P1)** — D.10's trigger reads "any state token not matching D.1–D.9c or D.11" (`auto.md:1012` clause (d)); read literally, `remediation-limit` routes to unknown-state escalation, contradicting D.13's own "MUST be recognized" invariant (`auto.md:1030`).

This is a documentation-and-types change plus a re-pin of the affected drift-audit assertions. There is **no new runtime code path** — the D.13 loop logic already exists in `auto.md`; the work makes it well-typed and reachable. Live gate-verb acceptance at the MCP boundary is sequenced on generacy-ai/generacy#1163 (the `GateTypeSchema` enum), but this plugin PR may merge independently: all remediation-limit runtime behavior is already gated on the engine via the `MIN_GENERACY_VERSION=0.2.0` pre-flight probe (clarified Q2).

## Technical Context

| Item | Value |
|------|-------|
| Language | TypeScript 5.x |
| Runtime | Node.js 20+ |
| Package Manager | pnpm |
| Test Framework | Vitest |
| Primary artifact | `packages/claude-plugin-cockpit/commands/auto.md` (playbook prose) |
| Type artifact | `packages/claude-plugin-cockpit/lib/gate-wire-types.ts` (two union edits + comment block) |
| Drift audit | `packages/claude-plugin-cockpit/tests/playbook-verification.test.ts` (rows 500-5, 500-7, 500-9) |
| Cross-repo dep | generacy-ai/generacy#1163 (`GateTypeSchema` enum; delivered separately) |

### Key Dependencies

- No new package dependencies. This change edits existing union types, playbook prose, and test pins only.

### Existing Patterns

- `GateType` and `DispatchClass` are hand-maintained discriminated unions with a per-member comment block that MUST stay in sync (`lib/gate-wire-types.ts`).
- Generation discriminators are always **derivable from durable state** (GitHub / draft content), never a session-local counter, so the derived `gateId` is stable across restart/takeover (`gate-wire-types.ts:115-133`).
- `playbook-verification.test.ts` pins each `commands/*.md` playbook by **exact heading strings and contract rules** (per CLAUDE.md). When an edit breaks a pin, the contract is re-pinned to the NEW string in the same PR — never weakened.

## Project Structure

```
packages/claude-plugin-cockpit/
├── lib/
│   └── gate-wire-types.ts                 # MODIFY: add remediation-limit to GateType (:105-113),
│                                          #         add "D.13" to DispatchClass (:142-152),
│                                          #         add discriminator comment line (:115-133)
├── commands/
│   └── auto.md                            # MODIFY: base sweep D.1–D.9 → include D.13 (:333),
│                                          #         D.10 clause (d) enumeration (:1012),
│                                          #         discriminator table row (:1555),
│                                          #         DATA GAPS list (:1561)
└── tests/
    └── playbook-verification.test.ts      # MODIFY: re-pin rows 500-5, 500-7, 500-9
```

## Constitution Check

No `.specify/memory/constitution.md` exists in this repo; no project-level constitution gates apply. The binding project rule is the CLAUDE.md **Cockpit playbook pins** directive: any change that breaks a `playbook-verification` pin MUST re-pin the assertion to the new contract in the same PR (never weaken/delete). This plan honors that via FR-006 (re-pin 500-5/7/9).

## Approach

The change is small and mechanical, but every edit has an exact anchor. Grouped by file:

### `lib/gate-wire-types.ts`

- **FR-001** — add `| "remediation-limit"` to the `GateType` union (`:105-113`).
- **FR-002** — add the discriminator comment line to the block at `:115-133`, documenting the discriminator as **PR head SHA + remediation counter**, with the note that the remediation counter is a DATA GAP the parent loop does not yet compute, so the discriminator is **derived from PR head SHA only today** (counter omitted). The remaining-findings-hash form is explicitly not used. The `remediation-limit` member is already present in the generation-drift set at `:319` (`{clarification, artifact-review, implementation-review, manual-validation, remediation-limit}`) — no change needed there.
- **FR-007** — add `| "D.13"  // waiting-for:remediation-limit (G.9) → gateType "remediation-limit"` to the `DispatchClass` union (`:142-152`), so the auto.md:1043 adoption `GateRecord` (`dispatchClass: 'D.13'`) type-checks against `GateRecord.dispatchClass: DispatchClass` (`:318`).

### `commands/auto.md`

- **FR-003** — extend the base synthetic-event sweep at `:333` ("transition class is one of D.1–D.9") to include D.13. The base set runs mode-agnostically, so this recovers a parked `waiting-for:remediation-limit` issue in **both** local and UI mode (clarified Q3 = base set, not UI-only).
- **FR-004** — extend the D.10 unknown-state enumeration at `:1012` clause (d) so `waiting-for:remediation-limit` matches D.13 and does not fall through to unknown-state escalation.
- **FR-008** — drop the rejected parenthetical `(or remediation counter + remaining-findings hash)` from the discriminator-table row at `:1555`, and update the `:1561` DATA GAPS list to reflect the pinned Q1/Q5 decision (PR-head-SHA-derived today; remediation counter remains a shared DATA-GAP follow-up).

### `tests/playbook-verification.test.ts`

- **FR-006** — re-pin rows 500-5, 500-7, 500-9 to the reconciled auto.md contract. 500-7's discriminator-row assertion moves from the loose `/^\| \`remediation-limit\` \|/m` match to pin the new discriminator string (parenthetical dropped); 500-5 and 500-9 are re-verified against the D.13 / G.9 prose and stay green.

### Cross-repo (FR-005)

- generacy-ai/generacy#1163 lands the MCP `GateTypeSchema` enum member. It is a **coordination dependency, not a merge blocker** for this PR (clarified Q2): the `MIN_GENERACY_VERSION=0.2.0` pre-flight probe sequences live gate-verb acceptance on the engine. Dogfood remains gated on #1163.

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Editing auto.md shifts line numbers and breaks unrelated `playbook-verification` pins. | Run the full `playbook-verification.test.ts` suite; re-pin any incidentally-broken assertion to the new contract (never weaken), per CLAUDE.md. |
| Merging ahead of generacy#1163 leaves gate verbs rejecting `remediation-limit` at the MCP boundary. | Accepted and by design — the pre-flight `MIN_GENERACY_VERSION=0.2.0` probe blocks a new `auto` against an old engine; dogfood is gated on #1163 (Q2). |
| Discriminator implies restart-idempotency that the counter DATA GAP does not yet deliver. | Document PR-head-SHA-only derivation today; the SHA half is restart-stable, and the non-idempotent re-ask is an accepted shared follow-up (Q5). |

## Out of Scope

- Engine-side remediate-loop cap logic that raises the gate (generacy-owned).
- The MCP `GateTypeSchema` enum change itself (generacy-ai/generacy#1163).
- Any new gateType beyond `remediation-limit`.
- Closing the remediation-counter DATA GAP (accepted follow-up, Q5).

## Next Step

Run `/speckit:tasks` to generate the dependency-ordered task list from this plan.
