# Clarifications

## Batch 2026-08-21

### Q1: Generation discriminator formula
**Context**: FR-002 and the Summary offer two candidate formulas for the `remediation-limit` generation discriminator — "PR head SHA + remediation counter" OR "remediation counter + remaining-findings hash". The Assumptions section leans toward the first. Which inputs feed the discriminator determines whether derived `gateId`s stay stable across restart/takeover, so this must be pinned before wiring the union and the discriminator comment block.
**Question**: Which generation-discriminator formula should `remediation-limit` use?
**Options**:
- A: PR head SHA + remediation counter (durable-state-derived, matches Assumptions)
- B: Remediation counter + remaining-findings hash
- C: Other (specify)

**Answer**: A — PR head SHA + remediation counter (durable-state-derived, matches Assumptions). The Generation-discriminator table (auto.md:1555) lists remediation-limit as "PR head SHA + remediation counter" with the findings-hash form only parenthetical; gate-wire-types.ts requires discriminators derivable from durable state so the derived gateId is stable across restart/takeover. PR head SHA is durable GitHub state (matching implementation-review/manual-validation); the remaining-findings hash is a listed data gap.

### Q2: Cross-repo merge coordination
**Context**: The plugin `GateType` union change (FR-001) is plugin-side only, but gate verbs still reject `remediation-limit` at the MCP boundary until generacy-ai/generacy#1163 lands the `GateTypeSchema` enum change (FR-005, edge case). Whether this PR can merge before #1163 affects sequencing and whether the SC-001/SC-002 e2e acceptance tests can go green in CI.
**Question**: Can this plugin PR merge independently ahead of generacy#1163, or must both schema sides land together before this PR merges?
**Options**:
- A: Merge this plugin PR independently; dogfood is gated separately on #1163
- B: Block this PR until #1163 merges first
- C: Land both together in a coordinated merge

**Answer**: A — Merge this plugin PR independently; dogfood is gated separately on #1163. The plugin already gates all remediation-limit runtime behavior on the engine via the MIN_GENERACY_VERSION=0.2.0 pre-flight probe (auto.md:226,244), which blocks new-auto against an old engine before any loop; the union + D.13/D.10 rows are plugin-side artifacts, and #1163's enum landing unblocks live gate-verb acceptance, which the probe already sequences.

### Q3: Startup sweep scope for D.13
**Context**: FR-003 scopes the D.13 sweep fix to the "UI-mode extended trigger set" (auto.md :355-356), but the Summary and Edge Cases state the two dispatch gaps must be closed for local mode too, and local mode's startup sweep uses the base D.1–D.9 set (auto.md :349). Where D.13 is added determines whether a parked `waiting-for:remediation-limit` issue recovers at restart in local mode as well as UI mode.
**Question**: Should D.13 be added to the base startup-sweep trigger set (so parked issues recover in both local and UI mode), or only to the UI-mode extended trigger set?
**Options**:
- A: Base sweep set — both local and UI mode recover parked issues at restart
- B: UI-mode extended set only

**Answer**: A — Base sweep set; both local and UI mode recover parked issues at restart. The base synthetic-event dispatch enumerates only D.1–D.9 and runs mode-agnostically (auto.md:349); D.10's trigger fires on any state not one of D.1–D.9 or D.11 (:1014), so a parked waiting-for:remediation-limit falls through to D.10 in both modes unless D.13 joins the base enumeration. D.13 mandates the label never falls through to D.10 (:1032), which must hold in local mode too.

### Q4: Source of remaining-findings for the gate body
**Context**: US1 and SC-002 expect the D.13 gate to carry "the remaining findings", but the engine-side remediate-loop cap logic that raises the gate is Out of Scope (generacy-owned). It is unclear whether the plugin's draft-then-open flow must fetch/compose the remaining findings itself, or whether they are already carried by the engine/gate payload the plugin adopts.
**Question**: In UI mode, does the plugin's D.13 draft-then-open flow populate the remaining-findings body itself, or does it pass through findings already provided by the engine/gate payload?
**Options**:
- A: Plugin fetches/composes remaining findings from issue/PR state
- B: Plugin passes through findings already provided by the engine (e.g., via `cockpit_gate_status`)
- C: Other (specify)

**Answer**: A — Plugin fetches/composes remaining findings from issue/PR state. D.13/G.9 source findings from the engine's gate body written onto the issue ("parsed from the gate body", auto.md:1032,1575), read and rendered client-side exactly as sibling #504 pins ("latest linked-issue comment starting with ## Remediation limit reached"). Option B is structurally impossible since cockpit_gate_status returns only {gateId, status} with no findings.

## Batch 2026-08-21 (2)

### Q5: Discriminator restart-stability vs. the remediation-counter DATA GAP
**Context**: Q1 pinned the discriminator *formula* to "PR head SHA + remediation counter", and both FR-002 and the Assumptions section claim this makes the derived `gateId` "stable across restart/takeover". But auto.md:1561 explicitly lists the `remediation-limit` **remediation counter** among inputs "the parent loop does not yet compute", flagged as a DATA GAP, and states that for such gateTypes "re-asks across restart/takeover are **not** idempotent". So the counter half of the chosen formula is not actually available client-side today. This must be pinned before wiring the discriminator, because it determines whether the gateId is restart-stable now or only aspirationally.
**Question**: How should this spec handle the acknowledged remediation-counter DATA GAP when deriving the `remediation-limit` discriminator?
**Options**:
- A: Accept the gap for now — derive from **PR head SHA only** (counter omitted), and document non-idempotent re-ask across restart as a follow-up, exactly like the other gapped gateTypes (auto.md:1561). Restart-stability of the SHA half still holds.
- B: Close the gap in this PR — compute the remediation counter client-side (e.g., parse it from the engine gate body, alongside the findings per Q4) so the full "PR head SHA + counter" formula is derivable and idempotent.
- C: Other (specify)

**Answer**: *Pending*

### Q6: Scope — editing the auto.md discriminator table (:1555) and DATA GAPS list (:1561)
**Context**: FR-002 requires the discriminator to be documented as "PR head SHA + remediation counter" with "the remaining-findings-hash form is not used". The Assumptions section says auto.md "already contains ... the `remediation-limit` discriminator-table entry" and that the work is "closing the wire-type, sweep, and enumeration gaps, not authoring D.13 from scratch." But auto.md:1555 still reads "PR head SHA + remediation counter **(or remediation counter + remaining-findings hash)**" — the rejected alternative Q1 said to drop. Whether this PR edits the auto.md prose (:1555 row and the :1561 DATA GAPS list) or only the plugin comment block determines the file set and which playbook-verification pins move.
**Question**: Is bringing auto.md into line with Q1 (dropping the rejected parenthetical at :1555, and updating the :1561 DATA GAPS list if Q5=B) in scope for this PR, or is only the plugin-side `gate-wire-types.ts` discriminator comment block updated while auto.md is left as-is?
**Options**:
- A: In scope — edit auto.md:1555 (and :1561 as Q5 dictates) plus the plugin comment block, in one PR; re-pin any affected playbook rows accordingly.
- B: Plugin-side only — update `gate-wire-types.ts`; treat auto.md prose reconciliation as a separate change.
- C: Other (specify)

**Answer**: *Pending*

### Q7: DispatchClass union — add "D.13"?
**Context**: FR-001 mandates adding `remediation-limit` to the wire `GateType` union (gate-wire-types.ts:105-113). But the parallel `DispatchClass` union in the same file (:142-152) also omits `"D.13"`, even though auto.md:1043 constructs an adoption `GateRecord` with `dispatchClass: 'D.13'`. If `GateRecord.dispatchClass` is typed as `DispatchClass`, that literal won't type-check until `"D.13"` is added. The spec's FR table is silent on this second union.
**Question**: Must `"D.13"` also be added to the `DispatchClass` union (and its mapping comment) as part of this PR, or is that out of scope / already covered elsewhere?
**Options**:
- A: In scope — add `"D.13" // waiting-for:remediation-limit (G.9) → gateType "remediation-limit"` to the `DispatchClass` union so adoption `GateRecord`s type-check.
- B: Out of scope — the `DispatchClass` union is not consumed where a `'D.13'` literal must type-check, so no change is needed (please confirm the reasoning).
- C: Other (specify)

**Answer**: *Pending*
