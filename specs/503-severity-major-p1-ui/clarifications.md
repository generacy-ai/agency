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
