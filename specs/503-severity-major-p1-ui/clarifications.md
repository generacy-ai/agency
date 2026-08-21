# Clarifications

## Batch 2026-08-21

### Q1: Generation discriminator formula
**Context**: FR-002 and the Summary offer two candidate formulas for the `remediation-limit` generation discriminator — "PR head SHA + remediation counter" OR "remediation counter + remaining-findings hash". The Assumptions section leans toward the first. Which inputs feed the discriminator determines whether derived `gateId`s stay stable across restart/takeover, so this must be pinned before wiring the union and the discriminator comment block.
**Question**: Which generation-discriminator formula should `remediation-limit` use?
**Options**:
- A: PR head SHA + remediation counter (durable-state-derived, matches Assumptions)
- B: Remediation counter + remaining-findings hash
- C: Other (specify)

**Answer**: *Pending*

### Q2: Cross-repo merge coordination
**Context**: The plugin `GateType` union change (FR-001) is plugin-side only, but gate verbs still reject `remediation-limit` at the MCP boundary until generacy-ai/generacy#1163 lands the `GateTypeSchema` enum change (FR-005, edge case). Whether this PR can merge before #1163 affects sequencing and whether the SC-001/SC-002 e2e acceptance tests can go green in CI.
**Question**: Can this plugin PR merge independently ahead of generacy#1163, or must both schema sides land together before this PR merges?
**Options**:
- A: Merge this plugin PR independently; dogfood is gated separately on #1163
- B: Block this PR until #1163 merges first
- C: Land both together in a coordinated merge

**Answer**: *Pending*

### Q3: Startup sweep scope for D.13
**Context**: FR-003 scopes the D.13 sweep fix to the "UI-mode extended trigger set" (auto.md :355-356), but the Summary and Edge Cases state the two dispatch gaps must be closed for local mode too, and local mode's startup sweep uses the base D.1–D.9 set (auto.md :349). Where D.13 is added determines whether a parked `waiting-for:remediation-limit` issue recovers at restart in local mode as well as UI mode.
**Question**: Should D.13 be added to the base startup-sweep trigger set (so parked issues recover in both local and UI mode), or only to the UI-mode extended trigger set?
**Options**:
- A: Base sweep set — both local and UI mode recover parked issues at restart
- B: UI-mode extended set only

**Answer**: *Pending*

### Q4: Source of remaining-findings for the gate body
**Context**: US1 and SC-002 expect the D.13 gate to carry "the remaining findings", but the engine-side remediate-loop cap logic that raises the gate is Out of Scope (generacy-owned). It is unclear whether the plugin's draft-then-open flow must fetch/compose the remaining findings itself, or whether they are already carried by the engine/gate payload the plugin adopts.
**Question**: In UI mode, does the plugin's D.13 draft-then-open flow populate the remaining-findings body itself, or does it pass through findings already provided by the engine/gate payload?
**Options**:
- A: Plugin fetches/composes remaining findings from issue/PR state
- B: Plugin passes through findings already provided by the engine (e.g., via `cockpit_gate_status`)
- C: Other (specify)

**Answer**: *Pending*
