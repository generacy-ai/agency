# Tasks: Startup sweep adopts pre-existing non-terminal gates instead of duplicating them across runs

**Input**: Design documents from `/specs/471-problem-once-phase-c/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, contracts/ (adoption-sweep.md, adoption-drift.md, adoption-error-defer.md)
**Status**: Complete

## Format: `[ID] [P?] [Story] Description`
- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to
- **File paths** are absolute from repo root.

**Scope note**: The plugin is playbook prose interpreted by the model at slash-command time. There is no compile-time code path executing it, so the "implementation" is prose edits to `packages/claude-plugin-cockpit/commands/auto.md` and pin edits to `packages/claude-plugin-cockpit/tests/playbook-verification.test.ts`. Any TypeScript added under `lib/` is reference-only (per plan.md § Constitution Check "Playbook-first, code-second"); the plan defers the `lib/adoption.ts` decision to this tasks phase — see T017.

**FR/SC coverage note**: every FR-001..FR-014 and SC-001..SC-013 lands on at least one task below. FR-011 (load-bearing prose update discipline) is satisfied by the fact that Phase 2 IS the prose update; FR-012 (automated adoption test) is satisfied by pin 471-2 + 471-11 + the SC-003 wire-log assertion in T014.

---

## Phase 1: Setup (read-and-anchor — no edits)

- [X] T001 Read `packages/claude-plugin-cockpit/commands/auto.md § In-memory loop state additions (UI mode)` to anchor the current `GateRecord` prose (pre-#471 shape). Note the exact heading string and the current field list — required by T005 and by re-pin T018.
- [X] T002 [P] Read `auto.md § step 3` end-to-end (tool-presence check, § Answered-gate parked-forever escape hatch, § Synthetic-event dispatch, § gateId idempotency paragraph, § Deferred-to-loop behavior on sweep-time `cockpit_gate_open` failure paragraph) to anchor the adoption-pass insertion point (between escape hatch and synthetic-event dispatch, per contracts/adoption-sweep.md § Ordering) and the mirror-target paragraph for T008.
- [X] T003 [P] Read `auto.md § step 4 sub-step 0 § Answered-gate parked-forever escape hatch` to anchor the per-wake escape-hatch ack site — required by T010.
- [X] T004 [P] Read `auto.md § D.12 — gate-answer` (steps 1, 3, 5) to anchor the three ack sites — required by T011 / T012 / T013. Note the D.12 step 1 no-record ack MUST remain on the run-wide loop-state `runId` (no `openGates` entry to source from — see plan.md § Load-bearing prose changes closing note).
- [X] T005 [P] Read `auto.md § Pre-draft check — shared rules → generation-drift branch guard` to capture the verbatim drift-branch detail string. FR-013's adoption-drift ack MUST use that exact string (per contracts/adoption-drift.md § Action step 1) so the sweep-path and live-path stay symmetric under any future edit.

---

## Phase 2: Playbook prose edits — `auto.md`

**All edits land in `packages/claude-plugin-cockpit/commands/auto.md` in the SAME PR** (per plan.md § "Load-bearing prose changes to `auto.md`" + repo CLAUDE.md § "Cockpit playbook pins"). Serial by construction — all seven tasks touch the same file.

- [X] T006 [US2][US3] Extend § In-memory loop state additions (UI mode) — extend the `openGates` `GateRecord` documentation to declare `runId: string` as a MANDATORY per-entry field. State verbatim: (a) current-run entries carry the current-run `runId`; (b) adopted entries carry the row's originating `runId` from `cockpit_gate_list`; (c) every downstream `cockpit_gate_ack` for an `openGates` entry MUST read `openGates[gateId].runId`, NOT the run-wide loop-state `runId`. Per FR-003 / FR-004 / data-model.md § `GateRecord`. Satisfies pin 471-11 (T015).
- [X] T007 [US1][US3][US4][US5] Insert new block: § step 3 § Adoption pass (UI mode) — positioned IMMEDIATELY AFTER § Answered-gate parked-forever escape hatch and BEFORE § Synthetic-event dispatch (per contracts/adoption-sweep.md § Ordering step 3). The block MUST declare verbatim, in order:
  1. Call shape: `cockpit_gate_list({ issueRef: <ref>, gateType: <omitted> })` — `runId` field MUST NOT appear on the payload (FR-005).
  2. N+1 count rule: exactly one call per in-scope issue (tracking ref + every in-scope child); for an epic with N children, N+1 calls (FR-001 / SC-008).
  3. In-scope enumeration reuses the shared `cockpit_status(epic|issue=<ref>, json=true)` result the § Synthetic-event dispatch block already reads (per contracts/adoption-sweep.md § In-scope issue enumeration).
  4. Broad adoption rule (FR-009): every non-terminal row for every in-scope issue is adopted into `openGates`, including rows whose `(gateType, generation)` does NOT match a natural gate the current run would draft. `dispatchClass` derived from `(gateType, generation)` via the same mapping-table rule the current-run sweep uses (FR-008).
  5. Generation-drift branch (FR-013) — for a row whose `(issueRef, gateType)` matches with generation drift AND `gateType ∈ {clarification, artifact-review, implementation-review, manual-validation}`: ack `superseded` targeting the row's `runId` (originating), do NOT add to `openGates`, do NOT draft here (the synthetic-event pass below produces the fresh open). Precedence: FR-013 wins over FR-009 for its matching rows (per V3). Contract: contracts/adoption-drift.md.
  6. `escalation` carve-out (FR-013 / V4 / SC-011): `gateType: 'escalation'` DISABLES the drift branch; prior-run `escalation` rows take the broad-adopt branch at their stale generation, left non-terminal.
  7. Adopted-`answered` counter initialisation: `answeredGateSweepCounter[gateId] = 1` at adopt time (FR-010 / SC-012 / V6). Matches reuse-answered branch semantics established by #457.
  8. Adopted-`answered` structural limitation stated verbatim (per plan.md § step 3 § Adoption pass, step 4.iii): no MCP surface returns the operator's answer document; answer preserved only if D.12 redelivery fires; otherwise the escape hatch supersedes after 3 sweeps and either re-derives from current labels or re-asks the operator. Follow-up filed (FR-010 / spec § Follow-ups).
  9. Per-issue defer-on-error rule (FR-014 / V7): on `{status: 'error', class, detail}` for issue X, skip BOTH adoption AND drafting for X this pass; write a ledger row `startup · adoption-list-error · <issueRef> · <errorClass> · deferred-to-next-wake` (per contracts/adoption-error-defer.md § Action step 2); continue with other issues; do NOT abort the run.
  10. UI-mode-only guard (FR-006 / V9): entire block is dead prose under `ResolvedGateMode === "local"`.
  11. Ordering guarantees: runs after #469's pre-flight capability probe and after § step 3 tool-presence check and after the § Answered-gate parked-forever escape hatch tick; runs BEFORE the § Synthetic-event dispatch block and BEFORE any per-event D.n Step 0 pre-draft check.
  Satisfies pins 471-1 through 471-10 (T015 + T016).
- [X] T008 [US1] Extend the existing § step 3 § gateId idempotency paragraph (post-#469, at the sweep-time `cockpit_gate_open` block — the paragraph pinned by test 469-10 at `:4808`) to NAME adoption as the ordering primitive that prevents the sweep-time `cockpit_gate_open` from duplicating an adopted natural gate. Preserve every existing sentence verbatim; append the new sentence(s) at the paragraph's end. Per plan.md § Load-bearing prose changes item 3. Satisfies pin 471-12 (T016).
- [X] T009 [US5] Add companion paragraph immediately after § step 3 § Deferred-to-loop behavior on sweep-time `cockpit_gate_open` failure: § step 3 § Deferred-to-loop behavior on adoption-path `cockpit_gate_list` failure. Mirror the sibling paragraph's shape verbatim (label-persistence guarantee, next-natural-wake re-fire, ledger-row grep recipe). Per plan.md § Load-bearing prose changes item 4 + contracts/adoption-error-defer.md § Pattern reference. Satisfies pin 471-8 companion assertion (T015).
- [X] T010 [US2] Update § step 3 § Answered-gate parked-forever escape hatch → § Escape-hatch re-derivation ack site: the `cockpit_gate_ack(gateId, 'superseded', ...)` line MUST state verbatim that `runId` is read from `openGates[gateId].runId` (NOT the run-wide loop-state `runId`). Per plan.md § Load-bearing prose changes item 5. Satisfies pin 471-13 companion (T016). This re-writes the pin-target of `:4781` (469-9) — re-pin under T018.
- [X] T011 [US2] Update § step 4 sub-step 0 § Answered-gate parked-forever escape hatch (per-wake tick site) with the SAME rule as T010: `cockpit_gate_ack(superseded)` reads `runId` from `openGates[gateId].runId`. Per plan.md § Load-bearing prose changes item 5 (second site). Satisfies the second half of pin 471-13 (T016). Re-writes the pin-target of `:4781` (469-9, same test asserts BOTH sites) — re-pin under T018.
- [X] T012 [US2] Update § D.12 gate-answer step 5 (operator apply) `cockpit_gate_ack(applied)` to state verbatim that `runId` is read from `openGates[event.gateId].runId`. Per plan.md § Load-bearing prose changes item 6. Satisfies pin 471-14 (T016). Re-writes the pin-target of `:4895` (469-22) — re-pin under T018.
- [X] T013 [US2] Update § D.12 gate-answer step 3 (live-state supersession) `cockpit_gate_ack(superseded, 'live state moved past …')` to state verbatim that `runId` is read from `openGates[gateId].runId`. Per plan.md § Load-bearing prose changes item 7. Satisfies pin 471-15 (T016). Re-writes the pin-target of `:4942` (469-24) — re-pin under T018.
- [X] T014 [US2] Preserve § D.12 gate-answer step 1 no-record `cockpit_gate_ack(superseded, 'no matching open record …')` UNCHANGED — this ack fires when there is NO `openGates` entry to source from (the drop path), so it MUST continue to use the run-wide loop-state `runId` matching pre-#471 shape. Per plan.md § Load-bearing prose changes closing paragraph. Satisfies pin 471-16 (T016) as a preserve-shape pin. This site's existing pin `:4925` (469-23) survives WITHOUT re-pin — call it out explicitly in T018 as a NEGATIVE re-pin (asserts unchanged) to prevent accidental drift.

---

## Phase 3: Optional reference module — deferred decision (plan.md § R12)

- [X] T015 [OPTIONAL — decide at implementation] Decide whether to add `packages/claude-plugin-cockpit/lib/adoption.ts` as a reference-only guard module mirroring `packages/claude-plugin-cockpit/lib/runid.ts` shape (types + short guard functions with unit-testable fixtures per data-model.md § Fixtures). Non-load-bearing; the playbook is the source of truth. If added, the six fixtures in data-model.md § Fixtures (`same-gen-match`, `drift-match`, `non-matching`, `escalation-drift`, `escalation-same-gen`, `adopted-answered-counter`) MUST pin the classifier's `AdoptionClassification` branches (per data-model.md). Skip if the reference-shape adds no value — the prose pins in T016 are the load-bearing surface. Documented as OPTIONAL by plan.md § R12 + § Project Structure "OPTIONAL — reference guard functions".

---

## Phase 4: Test pins additions — `playbook-verification.test.ts`

**All edits land in `packages/claude-plugin-cockpit/tests/playbook-verification.test.ts` in the SAME PR as Phase 2.** Add a new `describe("471 startup-sweep adoption", () => { ... })` block at the end of the file (after the existing `describe("469 runId threading")` block ending near `:5148`).

- [X] T016 [US1][US3][US4][US5] Add pins 471-1 through 471-10 (adoption-pass structural pins) inside the new `describe("471 startup-sweep adoption")` block. Each pin uses `extractInstructionsSteps(autoMd).get(3)!` for step-3 body reads or `extractSubheadingBlock(autoMd, "<heading>")` for subheading reads:
  - 471-1: § step 3 declares § Adoption pass (UI mode) block positioned as (3) in the § Ordering above (assertion form: grep step 3 body for the § Adoption pass heading; assert its position is AFTER `§ Answered-gate parked-forever escape hatch` heading and BEFORE `§ Synthetic-event dispatch` heading).
  - 471-2: § Adoption pass declares the call shape `cockpit_gate_list({ issueRef: <ref>, gateType: <omitted> })` verbatim, with NO `runId` field on the payload — regex-assert the block contains the literal AND does NOT contain any `cockpit_gate_list.*runId` within the Adoption-pass block's span.
  - 471-3: § Adoption pass declares the N+1 count rule verbatim (tracking ref + every in-scope child; one call per in-scope issue).
  - 471-4: § Adoption pass declares the broad-adoption rule (FR-009) — every non-terminal row for an in-scope issue is adopted; rows whose `(gateType, generation)` do NOT match a natural gate are still adopted.
  - 471-5: § Adoption pass declares the FR-013 drift branch action (ack `superseded` targeting row's `runId` for the four drift-enabled gateTypes) verbatim.
  - 471-6: § Adoption pass declares the `escalation` carve-out verbatim (`gateType === 'escalation'` DISABLES the drift branch; row takes broad-adopt).
  - 471-7: § Adoption pass declares the adopted-`answered` counter initialisation: `answeredGateSweepCounter[gateId] = 1` at adopt time.
  - 471-8: § Adoption pass declares the FR-014 defer-not-draft rule verbatim, including the ledger row shape `startup · adoption-list-error · <issueRef> · <errorClass> · deferred-to-next-wake`, the "continue with other issues" rule, and the "do not abort" rule.
  - 471-9: § Adoption pass declares the FR-006 UI-mode-only guard verbatim.
  - 471-10: § Adoption pass declares the FR-005 no-`runId` invariant on the functional list call verbatim (a `MUST NOT carry runId` line).
  Reference: plan.md § Test edits pins 471-1..471-10; contracts/adoption-sweep.md § Test assertions.
- [X] T017 [US2] Add pins 471-11 through 471-16 (per-entry-`runId` shape + ack site sourcing) inside the same `describe("471 startup-sweep adoption")` block:
  - 471-11: § In-memory loop state additions declares `openGates` records carry a per-entry `runId` field; current-run entries carry current-run `runId`; adopted entries carry row's originating `runId`. Uses `extractSubheadingBlock(autoMd, "In-memory loop state additions (UI mode)")`.
  - 471-12: § step 3 § gateId idempotency paragraph names adoption as the ordering primitive that prevents sweep-time `cockpit_gate_open` from duplicating an adopted natural gate. Uses `extractInstructionsSteps(autoMd).get(3)!`.
  - 471-13: § step 3 AND § step 4 sub-step 0 escape-hatch `cockpit_gate_ack(superseded)` sites BOTH read `runId` from `openGates[gateId].runId` (not the run-wide loop-state `runId`). Uses `extractInstructionsSteps(autoMd).get(3)!` and `.get(4)!`.
  - 471-14: § D.12 gate-answer step 5's `cockpit_gate_ack` reads `runId` from `openGates[event.gateId].runId`. Uses `extractSubheadingBlock(autoMd, "D.12 — \`gate-answer\`")`.
  - 471-15: § D.12 gate-answer step 3's live-state supersession `cockpit_gate_ack` reads `runId` from `openGates[gateId].runId`. Same block extractor as 471-14.
  - 471-16: § D.12 gate-answer step 1 no-record ack CONTINUES to use the run-wide loop-state `runId` (drift-audit negative pin — asserts pre-#471 behaviour preserved on the drop path where no `openGates` entry exists). Same block extractor as 471-14.
  Reference: plan.md § Test edits pins 471-11..471-16; data-model.md § `GateRecord` (extended).
- [X] T018 Add pins 471-17 and 471-18 inside the same `describe("471 startup-sweep adoption")` block:
  - 471-17: The Follow-up (answer-document surface) is declared as out-of-scope prose in § Adoption pass — the adopted-`answered` limitation ("answer preserved only if D.12 redelivery fires; otherwise escape hatch re-asks after 3 sweeps") is stated verbatim rather than implied away.
  - 471-18: `--gates=local` byte-path invariance — the § step 3 `local` branch contains ZERO adoption-path `cockpit_gate_list` occurrences (grep-assert). Complements #469's `469-29` local-branch pin.
  Reference: plan.md § Test edits pins 471-17..471-18; contracts/adoption-sweep.md § Guard.

---

## Phase 5: Playbook coupling — re-pin existing pins (drift audit)

**This is the mandatory verification step per repo CLAUDE.md § "Cockpit playbook pins".** Every #457 / #469 pin that quotes the pre-#471 shape of the edited blocks MUST be re-pinned to the NEW contract in the SAME PR. Do NOT weaken; do NOT delete.

- [X] T019 Re-pin `packages/claude-plugin-cockpit/tests/playbook-verification.test.ts` for every heading and contract rule this edit changes.

  **Files edited by this issue**: `packages/claude-plugin-cockpit/commands/auto.md` (all Phase 2 edits are in this one file).

  **Pin sites that read the edited file(s)** — computed by grepping `playbook-verification.test.ts` for calls to `extractSubheadingBlock(...)`, `extractInstructionsSteps(...)`, `readFileSync(AUTO_MD_PATH)`, and `readdirSync(COMMANDS_DIR)`, then filtering to sites whose read intersects the § In-memory loop state additions block, the § step 3 body (sweep, escape hatch, gateId idempotency, Deferred-to-loop paragraphs), the § step 4 sub-step 0 body, or the § D.12 gate-answer block:

    - `:546`: test "398-1 (drift audit): every commands/*.md invocation matches its --help snapshot argument-kind token" (`readdirSync(COMMANDS_DIR)` sweep — pins EVERY `commands/*.md` playbook for invocation-vs-`--help` drift; always in scope for any auto.md edit).
    - `:3146`: test "449-18 § step-3 startup sweep declares the Q2=B extended trigger set" (`extractInstructionsSteps(autoMd).get(3)` — reads step 3, whose body grows by the § Adoption pass block).
    - `:3287`: test "457-2 § step 3 sweep NO LONGER contains the literal `generation=1`" (`extractInstructionsSteps(autoMd).get(3)` — reads step 3 body).
    - `:3318`: test "457-3 § step 3 escape-hatch block: verbatim heading + N=3 literal + exact ack detail string" (`extractInstructionsSteps(autoMd).get(3)` — reads step 3 escape hatch; T010 edits an ack site inside).
    - `:3339`: test "457-3a § step 3 escape hatch ACTIVELY re-derives" (`extractInstructionsSteps(autoMd).get(3)` — reads escape-hatch re-derivation block T010 edits).
    - `:3362`: test "457-3b § step 4 sub-step 0 escape-hatch tick" (`extractInstructionsSteps(autoMd).get(4)` — reads step 4 per-wake escape hatch T011 edits).
    - `:3378`: test "457-3c § step 3 states the counter semantics" (`extractInstructionsSteps(autoMd).get(3)` — reads step 3 body).
    - `:3671`: test "457-17 § In-memory loop state additions declares the openGates key" (`extractSubheadingBlock(autoMd, "In-memory loop state additions (UI mode)")` — reads the exact block T006 extends).
    - `:3705`: test "457-11 § In-memory loop state additions (UI mode) declares `answeredGateSweepCounter`" (same `extractSubheadingBlock` target as `:3671`; adjacent field on same block).
    - `:4737`: test "469-7 § In-memory loop state additions declares `runId: string | null` and `runIdEnabled: boolean`" (same `extractSubheadingBlock` target — T006 adds a per-entry `runId` sibling to the block-level `runId`; this pin's assertion needs re-pinning to reflect BOTH block-level and per-entry runId now co-exist).
    - `:4763`: test "469-8 § step 3 startup sweep declares every `cockpit_gate_open` call passes `runId`" (`extractInstructionsSteps(autoMd).get(3)` — reads step 3 body).
    - `:4781`: test "469-9 § step 3 answered-gate escape-hatch AND § step 4 sub-step 0 per-wake escape-hatch declare `cockpit_gate_ack(superseded)` passes `runId`" (`extractInstructionsSteps(autoMd).get(3)!` + `.get(4)!` — reads BOTH sites T010 + T011 edit; MUST re-pin the pinned literal to include the new `openGates[gateId].runId` sourcing rule).
    - `:4808`: test "469-10 § step 3 sweep `gateId idempotency` paragraph declares FOUR inputs" (`extractInstructionsSteps(autoMd).get(3)!` — reads the paragraph T008 extends).
    - `:4895`: test "469-22 § D.12 gate-answer step 5 (operator answer applied) `cockpit_gate_ack(applied)` declares `runId` threading" (`extractSubheadingBlock(autoMd, "D.12 — \`gate-answer\`")` — reads D.12 block; MUST re-pin to reflect the new `openGates[event.gateId].runId` sourcing rule from T012).
    - `:4925`: test "469-23 § D.12 gate-answer step 1 no-record `cockpit_gate_ack(superseded, 'no matching open record …')` declares `runId` threading" (same D.12 extractor — 471-16 asserts this site is UNCHANGED, so this pin needs a companion assertion or a `preserve` note; T014 is the corresponding no-op prose task).
    - `:4942`: test "469-24 § D.12 gate-answer step 3 live-state supersession `cockpit_gate_ack(superseded, 'live state moved past …')` declares `runId` threading" (same D.12 extractor — MUST re-pin to reflect the new `openGates[gateId].runId` sourcing rule from T013).
    - `:4954`: test "469-25 enumerated live-path `cockpit_gate_open` `runId` threading across every drafting D.n" (`readFileSync(AUTO_MD_PATH)` full-file — reads all D.n blocks; not directly impacted by T012/T013 but validates full-file consistency post-edit).
    - `:5050`: test "469-27 § step 3 sweep prose update names FOUR inputs" (`extractInstructionsSteps(autoMd).get(3)!` — reads step 3 body; potentially needs re-pin if the adoption block changes the exact "FOUR inputs" prose location).
    - `:5077`: test "469-28 § Pre-draft check — shared rules names `runId` as the fourth input" (`extractSubheadingBlock(autoMd, "Pre-draft check — shared rules")` — reads a block T005 anchors on; not directly edited but shares the drift-branch detail string T007's step 5 mirrors).
    - `:5112`: test "469-29 `--gates=local` byte-path invariance — zero `runId` field appearances under `local`-branch prose" (`readFileSync(AUTO_MD_PATH)` — asserts no `runId` under `local`; 471-18 adds the sibling assertion for `cockpit_gate_list` under `local`; the two pins compose).

  **Re-pinning means updating the assertion to the NEW contract established by this playbook edit.** Where the edit adds prose (adoption pass block, per-entry `runId` field, adoption-list-error deferred-to-loop paragraph, `openGates[gateId].runId` ack sourcing), extend the existing assertion to include the NEW literal alongside the OLD literal (where BOTH survive) or replace the OLD literal with the NEW one (where the OLD literal is gone).

  **Do NOT weaken or delete an assertion to make the test pass** — the pin is a drift audit; weakening it deletes its value. The rule applies to every `commands/*.md` playbook, not only `auto.md` (the `readdirSync(COMMANDS_DIR)` sweep at `:546` pins every playbook regardless of which one you edited).

---

## Phase 6: Verification

- [X] T020 Run `pnpm --filter @generacy-ai/claude-plugin-cockpit test packages/claude-plugin-cockpit/tests/playbook-verification.test.ts` — assert the full pin sweep passes green after T006–T014 (prose edits) + T016–T018 (new pins) + T019 (re-pins). Any failure MUST be resolved by re-pinning to the NEW contract, NEVER by weakening or deleting an assertion.
- [X] T021 [P] Static drift check: grep the adoption-pass block for the literal `cockpit_gate_list(...runId` (any regex form) — assert zero matches (per FR-005 / V8). Grep the `local`-branch of § step 3 for `cockpit_gate_list` — assert zero matches (per FR-006 / V9 / SC-005). These two greps guard the invariants that the pin suite cannot easily assert as absences.
- [X] T022 [P] Manual trace check against SC-001 → SC-013: read the finished § Adoption pass block against each success criterion in spec.md § Success Criteria; assert every SC maps onto a specific verbatim sentence in the prose. This is the human counterpart of pins 471-1..471-18 — pins catch regressions; the manual trace catches spec-drift the pins cannot see.

---

## Dependencies & Execution Order

**Phase order (sequential)**:
- Phase 1 (T001–T005) — anchor reads, no writes. All five tasks are parallelisable.
- Phase 2 (T006–T014) — all edits land in one file (`auto.md`); serial by construction (Edit tool cannot land two edits to the same file in parallel without conflict). Within the phase: T006 (In-memory loop state additions) is independent of T007–T014; T007 → (T008, T009) → (T010, T011, T012, T013, T014). T014 is a no-op preserve-shape assertion — it is the acknowledgement that T012 + T013's rule does NOT extend to D.12 step 1.
- Phase 3 (T015) — OPTIONAL; decide at implementation. Independent of Phase 2 and Phase 4.
- Phase 4 (T016–T018) — all edits land in one file (`playbook-verification.test.ts`); serial by construction. Depend on Phase 2 landing (the pins reference the prose the edits produce).
- Phase 5 (T019) — mandatory playbook coupling re-pin. Depends on Phase 2 landing (need the new prose in-place to re-pin against it) and MAY interleave with Phase 4 in the same commit (both edit the same test file).
- Phase 6 (T020–T022) — verification. Depends on Phase 2 + Phase 4 + Phase 5. T021 + T022 are parallelisable against T020.

**Recommended commit shape** — one PR, three commits:
1. Phase 2 prose edits (T006–T014) — all in `auto.md`.
2. Phase 4 + Phase 5 test edits (T016–T019) — all in `playbook-verification.test.ts`.
3. Phase 6 verification results (T020 output + T021/T022 grep outputs pasted into PR description).

If T015 is taken (reference module added), it lands as commit 4 between commits 2 and 3.

**Parallel opportunities**:
- Phase 1: T001, T002, T003, T004, T005 all in parallel — five independent anchor reads.
- Phase 2: none — all touch the same file.
- Phase 6: T021 and T022 in parallel — both are read-only greps against the finished playbook.

**FR/SC → Task coverage** (drift audit — every FR/SC lands on ≥1 task):

| FR/SC | Task(s) |
|-------|---------|
| FR-001 (N+1 calls) | T007 (item 2), T016 (pin 471-3) |
| FR-002 (adopt matching) | T007 (item 4 same-gen), T016 (pin 471-1) |
| FR-003 (originating runId on ack) | T006, T010, T011, T012, T013, T017 (pins 471-11, 471-13, 471-14, 471-15) |
| FR-004 (per-entry runId) | T006, T017 (pin 471-11) |
| FR-005 (no runId on list) | T007 (item 1), T016 (pin 471-10), T021 |
| FR-006 (UI-mode-only) | T007 (item 10), T016 (pin 471-9), T018 (pin 471-18), T021 |
| FR-007 (non-terminal only) | T007 (implicit via `cockpit_gate_list` shape) |
| FR-008 (record fields inc. dispatchClass) | T007 (item 4), T016 (pin 471-4) |
| FR-009 (broad adoption) | T007 (items 4, 6), T016 (pins 471-4, 471-6) |
| FR-010 (answered counter = 1 + limitation) | T007 (items 7, 8), T016 (pin 471-7), T018 (pin 471-17) |
| FR-011 (prose update discipline) | Phase 2 IS the prose update |
| FR-012 (automated adoption test) | T016 (pin 471-2), T017 (pin 471-11 via wire-log) |
| FR-013 (drift branch mirror) | T007 (items 5, 6), T016 (pins 471-5, 471-6) |
| FR-014 (per-issue defer) | T007 (item 9), T009, T016 (pin 471-8) |
| SC-001 (dedup) | T007 (items 4, 5), T016 (pin 471-1) |
| SC-002 (answer routes) | T007 (item 4 dispatchClass), T017 (pin 471-14) |
| SC-003 (ack originating runId) | T012, T013, T017 (pins 471-14, 471-15) |
| SC-004 (list runId-agnostic) | T007 (item 1), T016 (pin 471-10), T021 |
| SC-005 (--gates=local invariance) | T007 (item 10), T018 (pin 471-18), T021 |
| SC-006 (no duplicate opens) | T008, T017 (pin 471-12) |
| SC-007 (ack success) | T012, T013 (verified end-to-end at merge) |
| SC-008 (N+1 count) | T007 (item 2), T016 (pin 471-3) |
| SC-009 (broad adoption) | T007 (item 4), T016 (pin 471-4) |
| SC-010 (drift supersede) | T007 (item 5), T016 (pin 471-5) |
| SC-011 (escalation carve-out) | T007 (item 6), T016 (pin 471-6) |
| SC-012 (answered counter = 1) | T007 (item 7), T016 (pin 471-7) |
| SC-013 (per-issue defer) | T007 (item 9), T009, T016 (pin 471-8) |

---

*Generated by /speckit:tasks on 2026-07-29 for [generacy-ai/agency#471](https://github.com/generacy-ai/agency/issues/471).*
