# Tasks: Thread run-scoped `runId` from `/cockpit:auto` into gate open/ack calls

**Input**: Design documents from `/specs/469-problem-cockpit-auto-only/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, quickstart.md, contracts/runid-derivation.md, contracts/runid-threading.md, contracts/runid-probe.md
**Status**: Complete

## Format: `[ID] [P?] [Story] Description`
- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1 = terminal-gate resurrection; US2 = within-run identity stability; US3 = across-run distinctness; US4 = local-mode invariance)

Phase-B (generacy#1067 commit `82077f1a`) and Phase-A (generacy-cloud#892) are prerequisites and MUST be deployed before this feature ships (FR-008). Nothing in tasks.md re-implements those upstream contracts; this ticket is caller wiring plus playbook prose plus test re-pinning.

## Phase 1: Reference module (optional; not load-bearing)

- [X] T001 [P] [US1/US2/US3] Add `packages/claude-plugin-cockpit/lib/runid.ts` — the reference-implementation module per `data-model.md § Reference implementation notes`.
  - Exports: `deriveRunId(trackingRefSlug, timestamp)`, `assertRunIdColonFree(runId)`, `serializeGateOpenParams(base, runId, runIdEnabled)`, `serializeGateAckParams(base, runId, runIdEnabled)`, `serializeGateStatusQuery(base, runId, runIdEnabled)`, `classifyProbeOutcome(probeResult, gatesMode)`.
  - `deriveRunId` MUST enforce the no-`:` invariant (V1 / FR-013) via a runtime assertion.
  - `serialize*` helpers MUST OMIT the `runId` field entirely under `runIdEnabled === false` (V6) — not `null`, not `undefined`.
  - Shape mirrors `packages/claude-plugin-cockpit/lib/gate-wire-types.ts` (types + short guard functions with unit-testable fixtures).
  - This module is a reference implementation of playbook prose, NOT the source of truth (playbook-first, code-second per `plan.md § Constitution Check`).

- [X] T002 [P] [US1/US2/US3] Add unit-test fixtures for `lib/runid.ts` under `packages/claude-plugin-cockpit/tests/` — cover: (a) `deriveRunId` happy path (full stem verbatim); (b) `assertRunIdColonFree` throws on a colon-bearing input; (c) `serialize*` OMIT the field under `runIdEnabled === false`; (d) `classifyProbeOutcome` maps `{status:'ok'}` → `runIdEnabled: true`, `{status:'error', class:'invalid-args'}` → `graceful-degrade`, every other class → the appropriate `hard-fail-*` / `downgrade-to-local` per `data-model.md § GateQueryProbeOutcome`.

## Phase 2: Playbook edits — `packages/claude-plugin-cockpit/commands/auto.md`

**File**: `packages/claude-plugin-cockpit/commands/auto.md` (surgical edits per `plan.md § Playbook edits`).

Tasks T010–T019 all edit the same file (auto.md). They are NOT parallel — every edit changes a different section but sequential ordering avoids merge friction inside a single file. Land T010 first (pre-flight derivation is the source; every downstream section reads its output).

- [X] T010 [US2] § step 1 (pre-flight) — insert the `runId := <tracking-ref-slug>-<timestamp>` derivation immediately after the ledger filename computation (currently `auto.md:209`). State the compute-once invariant verbatim (V2 / FR-014). State the no-`:` static invariant verbatim (V1 / FR-013). State that every downstream consumer receives the pre-computed value as an explicit literal — no consumer re-derives (FR-014 / R8). Contract: `contracts/runid-derivation.md`.

- [X] T011 [US1/US2] § step 1 § Pre-flight probe (UI mode) — extend the existing `cockpit_gate_list({ issueRef: <identity-ref>, gateType: <omitted> })` call at `auto.md:89` with `runId: <runId>`. Add the four-branch classification per `contracts/runid-probe.md § Classification`: `ok` → `runIdEnabled := true`; `invalid-args` → `runIdEnabled := false` + log the verbatim startup warning (per `plan.md § Pre-flight capability probe extension`) + continue in UI mode under today's 3-input identity; every other error class routes to today's probe-failed behaviour verbatim (`--gates=ui` hard-fails; `--gates=auto` downgrades to `local`; Form-3 TENTATIVE hard-fails). State that `runIdEnabled` is decided ONCE at this site and MUST NOT flip mid-run (V5 / FR-012).

- [X] T012 [US2/US4] § In-memory loop state additions (UI mode) — add `runId: RunId | null` (V1) and `runIdEnabled: RunIdEnabled` alongside the existing `openGates`, `firstGateOpenFailureNoted`, and `answeredGateSweepCounter`. Under `--gates=local` both fields are declared for symmetry (`runId: null`, `runIdEnabled: false`).

- [X] T013 [US1/US2] § step 3 startup sweep — update the `gateId idempotency` paragraph at `auto.md:283` per `plan.md § auto.md:283 prose update`. The paragraph MUST name FOUR inputs under `runIdEnabled === true`; three under `runIdEnabled === false`. Add a pointer to `specs/469-problem-cockpit-auto-only/spec.md § Assumptions` for the "re-invocation is a new run" behaviour change (FR-010). Every `cockpit_gate_open` call in the sweep-time extended trigger set (`auto.md:274`) MUST state verbatim that it passes `runId` under `runIdEnabled === true`. The `answeredGateSweepCounter` escape-hatch `cockpit_gate_ack(superseded)` at `auto.md:248` MUST state verbatim that it passes `runId` under `runIdEnabled === true`.

- [X] T014 [US2] § step 4 sub-step 0 — the per-wake answered-gate escape hatch's `cockpit_gate_ack(superseded)` at `auto.md:300` MUST state verbatim that it passes `runId` under `runIdEnabled === true`.

- [X] T015 [US1/US2] § Dispatch step 0 (D.1, D.2, D.3, D.4, D.7, D.11) — each of the six `cockpit_gate_status({issueRef, gateType, generation})` calls at `auto.md:567`, `:633`, `:679`, `:711`, D.7, D.11 gains a fourth field `runId: <runId>` under `runIdEnabled === true` (FR-009). The `absent`-branch `cockpit_gate_list({issueRef, gateType})` drift-detection call MUST NOT gain `runId` (FR-011 / R4). For D.1/D.2/D.3/D.4 (drift-branch-enabled rows), the generation-drift `cockpit_gate_ack(staleGateId, outcome:'superseded', detail:'generation drift …')` gains `runId` under `runIdEnabled === true`. D.7 and D.11 do NOT gain a drift-branch ack pin — the drift branch is DISABLED there per the escalation guard established by #457.

- [X] T016 [US2] § Dispatch (D.1 through D.11) — live-path `cockpit_gate_open` calls — every UI-mode `cockpit_gate_open` invocation in a drafting D.n row (D.1, D.2, D.3, D.4, D.6 G.4a, D.7 G.4b, D.8 G.5, D.10 G.4c, D.11 G.4d) MUST state verbatim that it passes `runId` under `runIdEnabled === true`. Subagents that issue `cockpit_gate_open` (or any other gate verb) MUST receive `runId` as an explicit literal in the dispatch prompt (FR-015). Add the one-line addition to the dispatch-prompt template per `data-model.md § Subagent dispatch prompt template`.

- [X] T017 [US2] § D.12 gate-answer — the step 5 `cockpit_gate_ack` (operator applies answer), the step 1 no-record `cockpit_gate_ack(superseded)`, and the step 3 live-state-supersession `cockpit_gate_ack(superseded)` MUST each state verbatim that they pass `runId` under `runIdEnabled === true`. The reset of `answeredGateSweepCounter` on D.12 delivery is unchanged.

- [X] T018 [US2] § UI-mode gate mapping + § Pre-draft check — shared rules — add a one-paragraph header note to § UI-mode gate mapping naming the compute-once + explicit-literal rule and pointing at § step 1's derivation. In § Pre-draft check — shared rules (`auto.md § Pre-draft check — shared rules`, around `:503`) add a bullet: "the pre-draft check's `gateId` uses four inputs when `runIdEnabled === true`; the fourth input is the pre-flight-derived `runId` and is threaded as an explicit literal, never re-derived (per FR-014)". Do NOT add a per-gateType `runId` column to the gate mapping table — `runId` is per-run, not per-gateType.

- [X] T019 [US4] Verify `--gates=local` byte-path invariance in the playbook prose — grep the file for `runId` occurrences under any `local` branch (should be zero). The pre-flight `runId` derivation is dead prose under `--gates=local` (documented as such at T010) but MUST NOT be referenced by any `local`-branch step. This is a read-only audit task; if any occurrence is found in a `local` branch, fix it in the same PR.

## Phase 3: Test additions — new `469 runId threading` pins

**File**: `packages/claude-plugin-cockpit/tests/playbook-verification.test.ts` (new `describe("469 runId threading", () => { ... })` block appended after the existing `457 …` block).

- [X] T030 [US2] Add the `describe("469 runId threading")` scaffold at the end of `packages/claude-plugin-cockpit/tests/playbook-verification.test.ts`. Assertions 469-1 through 469-29 are enumerated below. Every new assertion MUST use `extractSubheadingBlock(...)` or `extractInstructionsSteps(...)` per the existing pin conventions.

- [X] T031 [US2] Pins 469-1, 469-2, 469-3 — § step 1 (pre-flight): (a) declares `runId := <tracking-ref-slug>-<timestamp>` derivation immediately after ledger filename computation; (b) declares the compute-once invariant (single derivation site; no consumer re-derives — FR-014); (c) declares the no-`:` invariant on `runId` verbatim (FR-013).

- [X] T032 [US1/US2] Pins 469-4, 469-5, 469-6 — § step 1 § Pre-flight probe (UI mode): (a) declares the extended probe call shape `cockpit_gate_list({issueRef, gateType: <omitted>, runId})`; (b) declares the `invalid-args` graceful-degradation branch with the verbatim startup warning; (c) declares that `runIdEnabled` is decided ONCE at this site and MUST NOT flip mid-run (FR-012 / V5).

- [X] T033 [US2/US4] Pin 469-7 — § In-memory loop state additions declares `runId: string | null` and `runIdEnabled: boolean`.

- [X] T034 [US1/US2] Pins 469-8, 469-9, 469-10 — § step 3 startup sweep: (a) every `cockpit_gate_open` call passes `runId` under `runIdEnabled === true`; (b) § step 3 / § step 4 sub-step 0 answered-gate escape hatch's `cockpit_gate_ack(superseded)` passes `runId` under `runIdEnabled === true`; (c) § step 3 startup sweep `gateId idempotency` paragraph declares FOUR inputs under `runIdEnabled === true` (three under `runIdEnabled === false`).

- [X] T035 [US1/US2] Pins 469-11 through 469-16 — each of § Dispatch step 0 (D.1, D.2, D.3, D.4, D.7, D.11) declares the extended `cockpit_gate_status({issueRef, gateType, generation, runId})` call shape under `runIdEnabled === true`.

- [X] T036 [US1/US2] Pins 469-17 through 469-20 — each of § Dispatch step 0 (D.1, D.2, D.3, D.4) generation-drift branch declares the `cockpit_gate_ack(staleGateId, outcome:'superseded', …, runId)` call shape. D.7 and D.11 do NOT gain this pin (drift branch disabled per escalation guard).

- [X] T037 [US2] Pin 469-21 — § Dispatch step 0 `absent`-branch `cockpit_gate_list({issueRef, gateType})` drift-detection call MUST NOT carry `runId` (FR-011 / R4). The pin asserts the ABSENCE of `runId` on the functional list call.

- [X] T038 [US2] Pins 469-22, 469-23, 469-24 — § D.12 gate-answer: (a) step 5 `cockpit_gate_ack` (operator apply) declares `runId` threading; (b) step 1 `cockpit_gate_ack(superseded, 'no record')` declares `runId` threading; (c) step 3 `cockpit_gate_ack(superseded, 'live-state supersession')` declares `runId` threading.

- [X] T039 [US2] Pin 469-25 — enumerated live-path `cockpit_gate_open` `runId` threading across every drafting D.n (D.1, D.2, D.3, D.4, D.6 G.4a, D.7 G.4b, D.8 G.5, D.10 G.4c, D.11 G.4d). This is the enumerated-dispatch-path assertion required by FR-016 / Batch 2 Q7 — sampling one call site is INSUFFICIENT.

- [X] T040 [US2] Pin 469-26 — subagent dispatch prompts that spawn a subagent capable of issuing a gate verb declare that `runId` is passed as an EXPLICIT LITERAL in the prompt (FR-015). The pin includes a check that subagents MUST NOT re-derive `runId`.

- [X] T041 [US2] Pin 469-27 — `auto.md:283` prose update: the paragraph names FOUR inputs under `runIdEnabled === true` (FR-010). Includes the pointer to `specs/469-problem-cockpit-auto-only/spec.md § Assumptions` for the "re-invocation is a new run" behaviour change.

- [X] T042 [US2] Pin 469-28 — § Pre-draft check — shared rules names `runId` as the fourth input under `runIdEnabled === true`.

- [X] T043 [US4] Pin 469-29 — `--gates=local` byte-path invariance: zero `runId` occurrences appear in any `local`-branch pin. Grep-style pin against the `local` branches of the six Step 0 blocks confirms absence.

## Phase 4: Test re-pinning — existing pins that quote the pre-#469 contract

**File**: `packages/claude-plugin-cockpit/tests/playbook-verification.test.ts` (existing 457-*, 449-*, 388-*, 390-*, 422-*, 444-* pins that quote the old 3-input contract). Land these AFTER the auto.md edits (Phase 2) so the new heading/contract shape is known — the implementer cannot pin to text that has not been written yet.

- [X] T050 [US2] Re-pin the `457 …` block's § step 3 startup-sweep `gateId idempotency` assertions to the NEW 4-input-under-`runIdEnabled` contract. Existing assertions quote "the same three inputs, so sweep-derived and live-derived `gateId`s coalesce". Update to name FOUR inputs under `runIdEnabled === true` (three under `runIdEnabled === false`, matching the pre-#469 identity). Do NOT weaken or delete an assertion.

- [X] T051 [US2] Re-pin the `457 …` block's six § Dispatch step 0 assertions (D.1, D.2, D.3, D.4, D.7, D.11) that quote the 3-input `cockpit_gate_status({issueRef, gateType, generation})` call. Update to name the 4-input call under `runIdEnabled === true`. Do NOT weaken.

- [X] T052 [US2] Audit the `449 UI-mode gates` block for any assertion that quotes § D.12's `cockpit_gate_ack` call shape verbatim without `runId`; re-pin to the new shape under `runIdEnabled === true`. Similar audit for `388 …`, `390 …`, `422 …`, `444 …` blocks — any pin that quotes a gate verb's call shape without `runId` is a re-pin candidate. Do NOT weaken.

- [X] T053 [US2] Audit the `457 …` block's § Pre-draft check — shared rules pin (the paragraph naming "three inputs") and re-pin to the new "four inputs under `runIdEnabled === true`" prose.

## Phase 5: Verification

- [X] T090 [US1/US2/US3/US4] **Mandatory playbook-verification re-pin task.** Re-pin `packages/claude-plugin-cockpit/tests/playbook-verification.test.ts` for every heading and contract rule this edit changes.

  Files edited by this issue: `packages/claude-plugin-cockpit/commands/auto.md`.

  Pin sites that read the edited file(s) (every `readFileSync(AUTO_MD_PATH, "utf-8")` in the test file intersects the edited file; the sweep site pins every `commands/*.md` for invocation-vs-`--help` drift):

  - :317 initial auto.md dispatch/gate audit (readFileSync AUTO_MD_PATH)
  - :546 sweep site — pins EVERY `commands/*.md` playbook for invocation-vs-`--help` drift (readdirSync sweep — always in scope regardless of which playbook was edited)
  - :937 auditContract(AUTO_MD_PATH) — dispatch-contract audit
  - :1132 six-Step-0 header extractSubheadingBlock loop (D.1/D.2/D.3/D.4/D.7/D.11)
  - :1149 D.9d ledger-only pin (extractSubheadingBlock)
  - :1200–:1207 D.7 / D.11 escalation-guard pins (extractSubheadingBlock)
  - :1284 § step 3 startup-sweep pin (readFileSync AUTO_MD_PATH)
  - :1304 § D.12 gate-answer pin (readFileSync AUTO_MD_PATH)
  - :1548, :1587, :1601, :1627 § step 1 / § step 3 / § step 4 contract pins (extractInstructionsSteps)
  - :2392 § step 3 answered-gate escape-hatch pin (readFileSync AUTO_MD_PATH)
  - :2437–:2579 § step 1 / § Dispatch step 0 / § shared-rules pins (extractInstructionsSteps + extractSubheadingBlock)
  - :2774–:2933 § step 1 pre-flight probe / gate-query-probe pins (extractInstructionsSteps + contract file reads)
  - :2957–:3039 § step 1 / § step 3 / § step 4 gate-query-probe pins (readFileSync AUTO_MD_PATH)
  - :3057–:3111 § D.12 gate-answer step-shape pins (extractSubheadingBlock D.12)
  - :3124–:3167 § step 3 startup-sweep + § step 4 pins (extractInstructionsSteps)
  - :3215–:3345 § step 3 / § step 4 startup-sweep + escape-hatch pins (extractInstructionsSteps)
  - :3359–:3395 § step 3 + six-Step-0 header pins (extractInstructionsSteps + extractSubheadingBlock loop)
  - :3471–:3495 § Dispatch (D.n) live-path pins (extractSubheadingBlock)
  - :3522–:3583 § Pre-draft check — shared rules pin (extractSubheadingBlock) + six-Step-0 loop
  - :3601–:3679 § D.7 / § D.11 / § UI-mode gate mapping pins (extractSubheadingBlock)
  - :3708–:3723 § D.12 gate-answer + auto.md final pins
  - :4014–:4045 lib/ reference-module fixture cross-checks (readFileSync of `lib/gate-wire-types.ts`, `lib/gate-status-check.ts` — NOT auto.md but referenced from the same describe block; audit for `runId` alignment)
  - :4177–:4267 § step 1 pre-flight / ledger-filename derivation pins (extractInstructionsSteps + readFileSync AUTO_MD_PATH)
  - :4323–:4414 § step 1 pre-flight probe pins (readFileSync AUTO_MD_PATH)
  - :4456–:4530 § step 1 ledger + pre-flight-probe pins (extractInstructionsSteps + readFileSync AUTO_MD_PATH)

  Re-pinning means updating the assertion to the NEW contract established by the playbook edit (Phase 2 above): the pre-draft `cockpit_gate_status` call names FOUR inputs under `runIdEnabled === true`; the § step 3 sweep `gateId idempotency` paragraph names FOUR inputs under `runIdEnabled === true`; every UI-mode `cockpit_gate_open` / `cockpit_gate_ack` on the wire carries `runId` under `runIdEnabled === true`; § D.12's `cockpit_gate_ack` calls all carry `runId`; the pre-flight probe carries `runId` and classifies `invalid-args` as graceful-degradation; § In-memory loop state additions declares `runId` and `runIdEnabled`; § Pre-draft check — shared rules names `runId` as the fourth input; subagent dispatch prompts carry `runId` as an explicit literal; the `readdirSync(COMMANDS_DIR)` sweep at :546 continues to pin every playbook for invocation-vs-`--help` drift and MUST NOT break under the auto.md edits.

  **Do NOT weaken or delete an assertion to make the test pass** — the pin is a drift audit; weakening it deletes its value. If any pin site above turns out on inspection to be reading a section this edit does not touch, verify manually before shipping (fail open).

- [X] T091 [US1/US2/US3/US4] Run the full playbook-verification suite locally to confirm every pin resolves against the edited `auto.md`: `pnpm --filter @claude-plugin/cockpit test tests/playbook-verification.test.ts`. Zero failing assertions expected. A failing assertion means a re-pin was missed or the contract shape does not match the prose — investigate root cause; DO NOT weaken.

- [X] T092 [US1/US2/US3/US4] Run the reference-module unit tests (T002) to confirm the `lib/runid.ts` fixtures pass: `pnpm --filter @claude-plugin/cockpit test tests/runid.test.ts` (or whatever fixture path T002 lands on).

- [ ] T093 [US1] Manual smoke-check per `quickstart.md § Reproduce the terminal-gate resurrection (US1)`: on a Phase B cluster, re-run `/cockpit:auto <ref>` against an epic with a terminal-status gate; confirm a NEW inbox-visible gate opens on the first attempt (SC-001). Confirm the ledger has a `gate-query-probe · ok · source: ui-gate-probe` row (SC-008 negative case — on a Phase B cluster this succeeds).

- [ ] T094 [US4] Manual smoke-check per `quickstart.md § Local-mode invariance (US4)`: run `/cockpit:auto <ref> --gates=local`; grep the ledger and transcript for `runId` (SC-005: zero matches expected).

## Dependencies & Execution Order

**Phase ordering (sequential)**:

1. Phase 1 (T001, T002) — reference module + fixtures. MAY run in parallel with Phase 2 (different files), but Phase 2 is the source of truth and MUST land coherently regardless of Phase 1.
2. Phase 2 (T010–T019) — playbook edits to `auto.md`. **Sequential within phase** because every task edits the same file. T010 first (pre-flight derivation is the source; every downstream section reads its output). T011–T019 can be authored in any order but land under a single review of `auto.md`.
3. Phase 3 (T030–T043) — new `469 runId threading` pins. **Sequential within phase** because every task edits the same file (`playbook-verification.test.ts`). Land AFTER Phase 2 so the heading/contract shape being pinned is already in the file. T030 first (scaffold); T031–T043 in any order.
4. Phase 4 (T050–T053) — re-pin existing 457-*, 449-*, 388-*, 390-*, 422-*, 444-* assertions. **Sequential within phase** (same file). Land AFTER Phase 2 for the same reason as Phase 3. May run in parallel with Phase 3 in principle but sharing a file makes serial ordering safer.
5. Phase 5 (T090–T094) — verification. T090 is the mandatory re-pin task per repo `CLAUDE.md § Cockpit playbook pins`. T091 (playbook-verification run) MUST pass before merging. T093 / T094 are manual smoke-checks against a running cluster.

**Parallel opportunities**:

- T001 (`lib/runid.ts`) and T002 (fixtures) can be authored in parallel; they touch different files.
- Within Phase 2, individual tasks (T011, T012, T013, …) can be authored in parallel drafts but MUST be committed sequentially against `auto.md` to avoid merge friction.
- Phase 3 and Phase 4 both edit the same test file (`playbook-verification.test.ts`); prefer serial ordering (Phase 3 first, then Phase 4).

**Cross-file dependencies**:

- T010 (pre-flight derivation prose) blocks T031 (assertion pinning the derivation) — the assertion cannot pin text that does not exist.
- T013 (§ step 3 sweep + `auto.md:283` update) blocks T034 (assertion pinning FOUR inputs) and T041 (assertion pinning `auto.md:283` update).
- T015 (§ Dispatch step 0 four-input `cockpit_gate_status` calls) blocks T035 (assertion pinning the 4-input call shape).
- T016 (live-path `cockpit_gate_open` `runId` threading) blocks T039 (enumerated-dispatch-path assertion).
- T017 (§ D.12 `cockpit_gate_ack` `runId` threading) blocks T038 (D.12 assertions).
- T050–T053 (existing-pin re-pinning) MUST land in the SAME PR as the Phase 2 auto.md edits per repo `CLAUDE.md § Cockpit playbook pins` — do NOT weaken; re-pin to the NEW contract in the same PR.

**Landing order (external dependency)**:

- Phase A (generacy-cloud#892) MUST be deployed to production BEFORE Phase C ships (FR-008).
- Phase B (generacy#1067 commit `82077f1a` or later) MUST be deployed to the target cluster BEFORE Phase C ships (FR-008).
- If either upstream is not yet deployed, the pre-flight capability probe on a stale cluster will trip the `invalid-args` branch and the session will run under today's 3-input identity with the startup warning fired (SC-008). This is intentional graceful degradation and NOT a Phase C failure.

## Suggested next step

`/speckit:implement` — begin execution against the task list above. Land T010–T019 first (playbook edits), then T030–T043 and T050–T053 in the same PR, then run T090–T094 for verification.
