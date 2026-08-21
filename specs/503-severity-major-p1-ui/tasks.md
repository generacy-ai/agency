# Tasks: UI-mode remediation-limit gate (wire type + D.13 dispatch reachability)

**Input**: Design documents from `/specs/503-severity-major-p1-ui/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, quickstart.md
**Status**: Complete

## Format: `[ID] [P?] [Story] Description`
- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to

## Phase 1: Wire type edits — `lib/gate-wire-types.ts`
<!-- All three tasks touch the same file; run sequentially. -->

- [X] T001 [US1] Add `| "remediation-limit"` to the `GateType` union in `packages/claude-plugin-cockpit/lib/gate-wire-types.ts:105-113` (FR-001). Match the exact member spelling used by auto.md and generacy `GateTypeSchema`.
- [X] T002 [US1] Add the `remediation-limit` line to the generation-discriminator comment block in `packages/claude-plugin-cockpit/lib/gate-wire-types.ts:115-133` (FR-002). Document the discriminator as **PR head SHA (durable)** with the note that the remediation counter is a DATA GAP the parent loop does not yet compute (so it is derived from PR head SHA only today), the remaining-findings-hash form is NOT used, and the non-idempotent re-ask across restart/takeover is an accepted follow-up shared with the other gapped gateTypes. Do NOT edit the generation-drift set at `:319` — it already lists `remediation-limit`.
- [X] T003 [US1] Add `| "D.13"  // waiting-for:remediation-limit (G.9) → gateType "remediation-limit"` to the `DispatchClass` union in `packages/claude-plugin-cockpit/lib/gate-wire-types.ts:142-152` (FR-007), so the auto.md:1043 adoption `GateRecord` (`dispatchClass: 'D.13'`) type-checks against `GateRecord.dispatchClass: DispatchClass` (`:318`).

## Phase 2: Playbook prose edits — `commands/auto.md`
<!-- Phase boundary: Phase 2 is independent of Phase 1 (different file) and MAY run in parallel with it. All Phase 2 tasks touch the same file; run sequentially within the phase. -->

- [X] T004 [P] [US2] Extend the base synthetic-event sweep at `packages/claude-plugin-cockpit/commands/auto.md:333` ("transition class is one of D.1–D.9") to include D.13 (FR-003). The base set runs mode-agnostically, so this recovers a parked `waiting-for:remediation-limit` issue in both local and UI mode.
- [X] T005 [P] [US3] Extend the D.10 unknown-state enumeration at `packages/claude-plugin-cockpit/commands/auto.md:1012` clause (d) ("does not match a Trigger in any § Dispatch row (D.1–D.9c or D.11)") so `waiting-for:remediation-limit` matches D.13 and does not fall through to unknown-state escalation (FR-004).
- [X] T006 [P] [US1] Drop the rejected parenthetical `(or remediation counter + remaining-findings hash)` from the generation-discriminator-table row at `packages/claude-plugin-cockpit/commands/auto.md:1555`, and reconcile the `remediation-limit` entry in the DATA GAPS list at `packages/claude-plugin-cockpit/commands/auto.md:1561` with the pinned Q1/Q5 decision (PR-head-SHA-derived today; remediation counter remains a shared DATA-GAP follow-up) (FR-008). Keep this consistent with the T002 comment block.

## Phase 3: Verification
<!-- Phase boundary: Complete Phase 1 and Phase 2 before starting Phase 3. The re-pin task must land after the playbook edits so the new heading/contract shape is known. -->

- [X] T007 [US1] Re-pin `packages/claude-plugin-cockpit/tests/playbook-verification.test.ts`
  for every heading and contract rule this edit changes.
  Files edited by this issue: `packages/claude-plugin-cockpit/commands/auto.md`
  Pin sites that read the edited file(s):
    - :5990: 500-5 D.13 + G.9 prose present; resume/stop verbs (`extractSubheadingBlock` for `"D.13 — \`waiting-for:remediation-limit\`"` and `"G.9 — Remediation-limit gate"`)
    - :6035: 500-7 UI-mode gate-mapping table (G.8/G.9 rows) + generation-discriminator table has a `remediation-limit` row (`readFileSync(AUTO_MD_PATH)` direct table match — pin the reconciled discriminator string, parenthetical dropped)
    - :6069: 500-9 `waiting-for:remediation-limit` is a recognised dispatch row (D.13), never falls through to D.10 (`extractSubheadingBlock` for `"D.13 — \`waiting-for:remediation-limit\`"`)
    - :546: `readdirSync(COMMANDS_DIR)` sweep — pins every `commands/*.md` playbook for invocation-vs-`--help` drift (always covers auto.md)
  Re-pinning means updating the assertion to the NEW contract established by the auto.md edits (T004–T006): 500-7's discriminator-row assertion moves from the loose `/^\| \`remediation-limit\` \|/m` match to the reconciled discriminator string; 500-5 and 500-9 are re-verified against the D.13 / G.9 prose after the clause-(d) and sweep edits.
  Do NOT weaken or delete an assertion to make the test pass — the pin is a drift audit;
  weakening it deletes its value.
- [X] T008 [US1] Run the full `playbook-verification.test.ts` suite (`pnpm --filter @tetrad/claude-plugin-cockpit test playbook-verification` or repo-standard invocation) and re-pin any incidentally-broken assertion to its new contract (never weaken), per CLAUDE.md. Editing auto.md may shift line numbers and touch unrelated heading/step pins.
- [X] T009 [US1] Run `pnpm build` / typecheck for `packages/claude-plugin-cockpit` to confirm the two `gate-wire-types.ts` union edits (T001, T003) compile and the `GateRecord` consumers (`GateType` at `:318`, `DispatchClass` at `:318`) type-check.

## Phase 4: Cross-repo coordination (non-blocking)

- [ ] T010 [US1] Coordinate with generacy-ai/generacy#1163 (FR-005): confirm it lands the MCP `GateTypeSchema` enum member `remediation-limit`. This is a coordination dependency, NOT a merge blocker for this PR — the `MIN_GENERACY_VERSION=0.2.0` pre-flight probe (auto.md:226,244) sequences live gate-verb acceptance on the engine (clarified Q2). UI-mode dogfood (SC-005) remains gated on #1163.

## Dependencies & Execution Order

**Phase boundaries** (sequential):
- Phase 1 + Phase 2 → Phase 3 → (Phase 4 non-blocking coordination)

**Parallel opportunities**:
- Phase 1 (`gate-wire-types.ts`) and Phase 2 (`auto.md`) touch different files and have no data dependency — they may run in parallel. Within each phase, tasks touch the same file and run sequentially.
- T004, T005, T006 are marked `[P]` relative to Phase 1 (different file), but are sequential with each other (same file, `auto.md`).

**Hard ordering**:
- T007 (re-pin) MUST follow T004–T006 — the implementer must land the playbook edits before knowing the new heading/contract shape to pin to.
- T008 (full suite) follows T007. T009 (typecheck) depends only on Phase 1 (T001, T003).
- T010 is coordination only and does not block this PR's merge.

**Story coverage**:
- US1 (gate reaches inbox / wire type): T001, T002, T003, T006, T007, T008, T009, T010
- US2 (restart recovery via sweep): T004
- US3 (recognised state, not D.10): T005
