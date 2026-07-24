# Tasks: `cockpit:auto (--gates=ui)` — Reuse Existing Pending Gates in Startup Sweep

**Input**: Design documents from `/specs/457-part-cockpit-remote-gates/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, contracts/pre-draft-check.md, contracts/answered-escape-hatch.md, contracts/sweep-generation-fix.md, quickstart.md
**Status**: Complete

## Format: `[ID] [P?] [Story] Description`
- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to

## Phase 1: Prerequisites & Setup

- [X] T001 Verify upstream blocking dependency generacy-ai/generacy#1038 (read-only gate-status query MCP tools `cockpit_gate_status` and `cockpit_gate_list`) is merged and the cluster is deployed with it. If not, block the ticket — pre-flight will hard-fail per Q3=A precedent.
- [X] T002 [P] Verify prior work merged: #449 (`--gates=ui|local|auto` flag + D.12 gate-answer dispatch) and #450 (P4 dogfood report). Confirm current `packages/claude-plugin-cockpit/commands/auto.md` HEAD matches the line references cited in `spec.md § Root Cause` and `plan.md`. If line numbers have drifted (upstream edits landed), re-anchor each pin site before editing.
- [X] T003 [P] Read `contracts/pre-draft-check.md`, `contracts/answered-escape-hatch.md`, `contracts/sweep-generation-fix.md`, and `data-model.md` end-to-end. These are the source-of-truth prose fragments for every edit in Phase 2.

## Phase 2: Playbook prose edits — `packages/claude-plugin-cockpit/commands/auto.md`

**All Phase 2 tasks touch the same file (`auto.md`) — they are SEQUENTIAL, not parallel.**

- [X] T010 [US1,US2] Rewrite § step 3 startup sweep `gateId idempotency` paragraph (currently `auto.md:198`) per `contracts/sweep-generation-fix.md § Verbatim removal`. Remove the literal `generation=1` substring; replace with the content-derived generation function description referencing § UI-mode gate mapping / § Generation discriminator (UI mode). Cross-reference § Dispatch step 0 in D.1/D.2/D.3/D.4/D.7/D.11. Prerequisite for T011-T016 — without this, the pre-draft check `gateId` cannot coalesce.

- [X] T011 [US1,US2] Extend the § step 3 tool-presence check (`auto.md:176`) CONDITIONALLY: the seven baseline cockpit tools stay required in every mode; `cockpit_gate_status` and `cockpit_gate_list` are added only under `ResolvedGateMode === "ui"`, per `contracts/pre-draft-check.md § Tool-presence check`. Absence of a tool in the resolved mode's required set fires the existing `Print + exit` fail-loud path (matches Q3=A precedent). (Revised per #458 round-3 F3 — an unconditional nine-tool check hard-aborted `--gates=local` on pre-#1038 clusters.)

- [X] T012 [US1,US2] Add the answered-gate parked-forever escape-hatch block at the TOP of § step 3 startup sweep (BEFORE the synthetic-event dispatch) per `contracts/answered-escape-hatch.md § Verbatim escape-hatch block`. Include:
  - Verbatim heading `**Answered-gate parked-forever escape hatch (UI mode only).**` (pinned literally).
  - Per-sweep tick loop for `openGates` entries with `status: 'answered'`.
  - N=3 threshold pinned literally in the phrase `count >= 3`.
  - Ack call with exact detail string `'answered-not-consumed — presumed stuck at cloud delivered/applied'`.
  - Removal from `openGates` and counter deletion; re-derive on the same sweep.
  - Dead-prose statement under `ResolvedGateMode === "local"`.

- [X] T013 [US2] Extend § In-memory loop state additions (UI mode) at `auto.md:1420-1427` to declare `answeredGateSweepCounter: Map<GateId, number>` per `contracts/answered-escape-hatch.md § answeredGateSweepCounter state declaration`. Include the lifecycle description (initialized empty at run start; ticked at top of every sweep; reset by every D.12 handler; entries reaching `>= 3` trigger FR-009 supersede-and-re-derive path). Note the map is unused under `local`.

- [X] T014 [US1,US2] Insert `**Step 0 — pre-draft gate-status check (UI mode only).**` at the head of § Dispatch D.1 (before the current step 1 `Fetch context`, `auto.md:421`) per `contracts/pre-draft-check.md § Verbatim step-0 block`. Substitute `<gateType>` = `clarification`. Include the three-branch rule verbatim (`open` reuse, `answered` reuse-with-counter-tick, `absent` → list → drift-or-fresh). Include the generation-drift ack detail literal (`generation drift — content changed since original draft (was g<old>, now g<new>)`). Include the call-time-error pass-through rule per `contracts/pre-draft-check.md § Interaction with the § UI-mode fallback path`.

- [X] T015 [US1,US2] Insert `**Step 0 — pre-draft gate-status check (UI mode only).**` at the head of § Dispatch D.2 (before current step 1 `Resolve target artifact`, `auto.md:475`). Substitute `<gateType>` = `<artifact>-review`. Same three-branch rule verbatim as T014.

- [X] T016 [US1,US2] Insert `**Step 0 — pre-draft gate-status check (UI mode only).**` at the head of § Dispatch D.3 (before current step 1 `Resolve PR`, `auto.md:509`). Substitute `<gateType>` = `implementation-review`. Same three-branch rule verbatim as T014.

- [X] T017 [US1,US2] Insert `**Step 0 — pre-draft gate-status check (UI mode only).**` at the head of § Dispatch D.4 (before current step 1 `Spawn manual-validation summarizer`, `auto.md:528`). Substitute `<gateType>` = `manual-validation`. Same three-branch rule verbatim as T014.

- [X] T018 [US1,US2] Insert `**Step 0 — pre-draft gate-status check (UI mode only).**` at the head of § Dispatch D.7 (before current step 1 `Fetch evidence`, `auto.md:608`). Substitute `<gateType>` = `escalation`. Same three-branch rule verbatim as T014. Add to BOTH first-dispatch and repeat-dispatch paths.

- [X] T019 [US1,US2] Insert `**Step 0 — pre-draft gate-status check (UI mode only).**` at the head of § Dispatch D.11 as NEW step 0, ABOVE the existing step 1 (`Dedup check` — the in-memory `dispatched-issues` set at `auto.md:706`). Substitute `<gateType>` = `escalation`. Same three-branch rule verbatim as T014. **Retain the existing step 1 `dispatched-issues` in-memory dedup unchanged** — per FR-010 / Q5=A / `contracts/pre-draft-check.md § D.11 defense-in-depth`, the two checks are complementary (cross-session durable vs within-session in-memory / label-pair coalescing / Skip-as-mute semantics). Do NOT collapse them.

- [X] T020 [US1,US2] Add sweep-counter reset to § D.12 gate-answer step 6 per `contracts/answered-escape-hatch.md § D.12 counter reset`. Rename step 6 heading to `**Remove from openGates and reset sweep counter**` and add `answeredGateSweepCounter.delete(event.gateId)` alongside the existing `openGates.delete(event.gateId)`. Handle all three ack outcomes (`applied` / `superseded` / `failed`) and the revised-draft re-open case (delete the counter on the original `gateId` even if the record is retained flagged `superseded`).

## Phase 3: Reference implementation (optional, non-load-bearing)

- [X] T030 [P] [US1,US2] (Optional) Create `packages/claude-plugin-cockpit/lib/gate-status-check.ts` per `data-model.md § Reference implementation notes` with:
  - `classifyPreDraftCheck(statusResult, listResult, currentGeneration): PreDraftCheckOutcome`
  - `tickAnsweredSweepCounter(openGates, counter): void`
  - `selectEscapeHatchTargets(counter, threshold: 3): ReadonlyArray<GateId>`
  Follows the shape of `lib/gate-wire-types.ts`, `lib/clarification-batch-parser.ts`. Playbook prose remains source of truth per plan § Constitution Check; the module exists so unit tests can pin the branch shapes described in the prose.

## Phase 4: Playbook-verification test additions and re-pins — `packages/claude-plugin-cockpit/tests/playbook-verification.test.ts`

- [X] T040 [US3] Add a new `describe("457 sweep-time gate reuse", () => { ... })` block at the end of the file (after the `449 UI-mode gates` block at `:2832`, before the type-guard footer at `:3126`). Include assertions 457-1 through 457-13 per `plan.md § Test edits (playbook-verification.test.ts)` and the coverage sketches in each contract file:
  - **457-1**: § step 3 startup sweep tool-presence check states the CONDITIONAL rule (seven baseline tools always; `cockpit_gate_status` / `cockpit_gate_list` under `ui` only) and names all nine tools.
  - **457-2**: § step 3 startup sweep NO LONGER contains the literal substring `generation=1`; the new prose containing `hash(issueRef, gateType, generation)` is present.
  - **457-3**: § step 3 escape-hatch block heading `**Answered-gate parked-forever escape hatch (UI mode only).**` present verbatim + `count >= 3` literal + detail string `'answered-not-consumed — presumed stuck at cloud delivered/applied'` literal.
  - **457-4 through 457-9**: each of § Dispatch D.1, D.2, D.3, D.4, D.7, D.11 contains the `**Step 0 — pre-draft gate-status check (UI mode only).**` heading + the three-branch rule (same-gateId reuse / generation-drift supersede-and-redraft / absent-no-op) + the `on 'answered', record + tick sweep counter` clause + the drift-ack detail literal `generation drift — content changed since original draft (was g<old>, now g<new>)`.
  - **457-10**: § Dispatch D.11 contains BOTH step 0 (pre-draft check heading) AND step 1 (`Dedup check` — in-memory `dispatched-issues`) in that order — defense-in-depth pin.
  - **457-11**: § In-memory loop state additions declares `answeredGateSweepCounter: Map<GateId, number>` verbatim.
  - **457-12**: § D.12 step 6 heading is `**Remove from openGates and reset sweep counter**` and contains both `openGates.delete(event.gateId)` and `answeredGateSweepCounter.delete(event.gateId)`.
  - **457-13**: § UI-mode gate mapping generation-discriminator table (`auto.md:1354-1366`) is unchanged — drift audit ensures sweep and live paths continue to reference the SAME function.

- [X] T041 [US3] (SC-005 integration) Add an integration test that simulates a gate stuck at cloud `delivered`: seed `openGates` with a `status: 'answered'` entry; drive three sweep entries with no D.12 event; assert `cockpit_gate_ack` is called with `gateId`, `outcome: 'superseded'`, and the exact detail string `'answered-not-consumed — presumed stuck at cloud delivered/applied'`; assert the entry is removed from `openGates`; assert the counter is deleted. Use existing fixture patterns under `packages/claude-plugin-cockpit/tests/fixtures/` (naming convention `457-*`).

## Phase 5: Verification

- [X] T050 [US3] Re-pin `packages/claude-plugin-cockpit/tests/playbook-verification.test.ts`
  for every heading and contract rule this edit changes.
  Files edited by this issue: `packages/claude-plugin-cockpit/commands/auto.md`
  Pin sites that read the edited file(s):
    - :527: `398-1 (drift audit): every commands/*.md invocation matches its --help snapshot argument-kind token` (`readdirSync(COMMANDS_DIR)` sweep — pins every `commands/*.md` playbook for invocation-vs-`--help` drift; ANY edit to `auto.md` that changes invocation lines could break this)
    - :1121, :1131: `403-1 / 403-2` D.9 family + D.9d subheading pins (`extractSubheadingBlock`) — verify no incidental drift into edits nearby
    - :1182, :1188: `403-4` D.7 + D.11 subheading pins (`extractSubheadingBlock`) — INTERSECTS T018 (D.7 step 0) and T019 (D.11 step 0). Re-pin the "sole evidence-fetch" contract to account for the new step 0 sitting above step 1.
    - :2419-2420: `437-1` step 4 pin (`extractInstructionsSteps`) — no intersection but read for cross-check
    - :2450 (loop, headers at :2442-2448): `437-2` D.1/D.2/D.3/D.4/D.7 subheading pins (`extractSubheadingBlock`) — INTERSECTS T014-T018. Re-pin the "enriched line source-of-truth" contract to acknowledge step 0 sits above the enriched-line handling.
    - :2530 (loop, headers at :2525-2528): `437-5` D.5/D.6 pins — NO intersection.
    - :2560 (loop, headers at :2554-2557): `437-6` D.8/D.10/D.11 pins (`extractSubheadingBlock`) — INTERSECTS T019 (D.11). Re-pin the retain-the-re-check obligation to survive alongside the new step 0.
    - :2756, :2785, :2793, :2835, :2848, :2857, :2865, :2876, :2886: step 1 pins (`extractInstructionsSteps`) — NO intersection (edits are in step 3 and § Dispatch subsections, not step 1).
    - :2998, :3020: `449-13 / 449-14` D.12 subheading pins (`extractSubheadingBlock`) — INTERSECTS T020 (D.12 step 6 rename + counter-reset addition). Re-pin the D.12 step 6 assertions to the NEW heading `**Remove from openGates and reset sweep counter**` and the NEW rule that both `openGates.delete` and `answeredGateSweepCounter.delete` fire.
    - :3034, :3050: `449-15 / 449-16` UI-mode fallback subheading pins (`extractSubheadingBlock`) — verify pre-draft-check error-handling prose does not accidentally overlap fallback prose (per `contracts/pre-draft-check.md § Interaction with § UI-mode fallback path`, they are DISTINCT paths and the pre-draft check must not introduce a new `firstGateStatusFailureNoted` flag).
    - :3086, :3105: `449-18` and fresh-epic bootstrap pins (`extractInstructionsSteps` on step 3) — INTERSECTS T010 (sweep rewrite), T011 (nine-tool presence check), T012 (escape-hatch block at top of sweep). Re-pin the Q2=B extended trigger set assertion, gateId-idempotency phrase, tool count (now conditional: seven baseline, nine under `ui`), and confirm the escape-hatch block does not shadow the fresh-epic bootstrap clause.

  Re-pinning means updating the assertion to the NEW contract.
  Do NOT weaken or delete an assertion to make the test pass — the pin is a drift audit;
  weakening it deletes its value.

- [X] T051 Run `pnpm test --filter @generacy-ai/claude-plugin-cockpit` (or the repo's `pnpm test`) and verify:
  - All new `457 sweep-time gate reuse` assertions PASS.
  - The SC-005 integration test PASSES.
  - Every re-pinned assertion (per T050) PASSES with its NEW contract wording.
  - No previously-passing pin regresses (a red pin means either the edit drifted or the pin needs re-pinning — investigate before deleting the assertion).
  - The `398-1` `readdirSync(COMMANDS_DIR)` sweep passes for `auto.md` (invocation-vs-`--help` drift).

- [ ] T052 [US1,US2] Manual verification per `quickstart.md`:
  - **Scenario 1 (Restart safety, US1/US2)**: start `/cockpit:auto <epic-ref> --gates=ui` on an issue in `waiting-for:clarification`; wait for the gate to open in the inbox; stop the conversation; start a new one; verify the operator inbox shows EXACTLY ONE gate (not two); verify the new conversation's transcript prints the "one pointer line" to the existing `inboxUrl`; verify NO drafter subagent spawned for that issue.
  - **Scenario 2 (Generation drift, Q1=C)**: start a run with an open D.3 implementation-review gate; push a new commit to the PR to mutate head SHA; restart; verify the old gate is acked `superseded` with detail matching `generation drift — content changed since original draft (was g<old>, now g<new>)`; verify a NEW gate opens at the new head SHA.
  - **Scenario 3 (Answered-gate escape hatch, SC-005)**: simulate or induce a gate stuck at cloud `delivered` (or `applied`); verify that after N=3 sweeps with no D.12 event, the gate is acked `superseded` with detail `answered-not-consumed — presumed stuck at cloud delivered/applied` and the underlying label re-derives a fresh event on the same sweep.

## Dependencies & Execution Order

**Phase 1 → Phase 2 → Phase 4 → Phase 5** (sequential phases). Phase 3 (optional reference impl) can run anywhere after Phase 1.

**Within Phase 2 (all touch `auto.md`)**: T010 → T011 → T012 → T013 → T014 → T015 → T016 → T017 → T018 → T019 → T020. Strictly sequential — same file, and T010 is a hard prerequisite for T014-T019 (without the generation fix the pre-draft check is a no-op).

**Within Phase 4**: T040 must land after ALL Phase 2 edits (assertions pin the new prose). T041 depends only on T012+T013+T020 (escape-hatch prose + counter state + counter reset).

**Phase 5**: T050 (re-pin task) is CO-INCIDENT with T040 — both edit the same test file and must land in the same PR per repo CLAUDE.md § "Cockpit playbook pins". T051 verifies both. T052 requires a live cluster with generacy#1038 bound (T001 prerequisite).

**Parallel opportunities**:
- T002 [P] and T003 [P] (both read-only research, no file writes).
- T030 [P] (optional lib/ ref-impl; independent of `auto.md` edits).

**No task may be skipped**:
- T010 is a hard prerequisite — the fix is a no-op without it.
- T019 must retain the D.11 in-memory `dispatched-issues` check (defense-in-depth per FR-010 / Q5=A).
- T050 (re-pin task) is MANDATORY per repo CLAUDE.md § "Cockpit playbook pins" — every heading rename / contract rule edit in Phase 2 MUST re-pin the corresponding assertions in the SAME PR. Do NOT weaken or delete an assertion to make the test pass.

## Grouping Strategy for Issue Creation

Default: `epic-grouping:per-story`. Recommended splits if this feature is expanded to child issues:
- **US1 + US2** grouping: T010–T020 (all playbook edits) + T040 (test additions) + T050 (re-pin) + T051 (test run) + T052 scenarios 1–2.
- **US3** grouping: T040 (assertions 457-1..457-13) + T050 (re-pin).
- **SC-005 escape-hatch subgroup**: T012 + T013 + T020 + T041 + T052 scenario 3.

## Notes

- **Spec-authoritative six-row scope**: FR-001 pins EXACTLY D.1, D.2, D.3, D.4, D.7, D.11. Do NOT expand to D.8 (structurally applicable per `plan.md § Playbook edits` note but explicitly deferred).
- **No engine changes** — `cockpit_gate_status` and `cockpit_gate_list` are bound by the cluster (generacy#1038), not by this ticket. This is a playbook-prose-only edit plus test additions/re-pins.
- **`--gates=local` byte-path unchanged** — every existing local-mode test must pass without modification.
- **Never merge on red / every gate prompts** invariant is preserved — the pre-draft check moves WHERE the drafting decision is made (only when no gate exists), not WHETHER the operator is prompted.
