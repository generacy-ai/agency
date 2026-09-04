# Tasks: D.12 foreign-run / out-of-scope gate-answer no-op guard

**Input**: Design documents from `/specs/519-symptom-when-gate-answer/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, contracts/d12-noop-guard.md
**Status**: Complete

## Format: `[ID] [P?] [Story] Description`
- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to

## Phase 1: Setup

- [ ] T001 [P] Add a changeset `.changeset/<name>.md` with a patch bump to
  `@generacy-ai/claude-plugin-cockpit` summarizing the D.12 no-op guard (FR-001..FR-007).

## Phase 2: Core Implementation (auto.md — playbook prose)

All Phase 2 tasks edit the SAME file
(`packages/claude-plugin-cockpit/commands/auto.md`) and MUST run sequentially — no
`[P]`. Land these before the verification pins so the pin strings target the final
prose.

- [ ] T002 [US1] Split D.12 step 1 into a lookup + three-way no-record branch in
  `packages/claude-plugin-cockpit/commands/auto.md` (D.12 step 1, ~auto.md:1098),
  per `contracts/d12-noop-guard.md` C1–C3 and data-model E2 (FR-001/FR-003/FR-006):
  record PRESENT (current-run or adopted) → steps 2–6 unchanged, guard never
  pre-empts the lookup; record ABSENT → classify. No-op branches issue NO
  `cockpit_gate_ack` (any outcome) and NO downstream dispatch. Preserve branch (d)
  ack text byte-for-byte (`superseded`, `"no matching open record — likely
  startup-race or duplicate delivery"`) and its run-wide loop-state `runId`
  threading prose — must NOT introduce `openGates[event.gateId].runId` /
  `openGates[gateId].runId` inside the no-record region (keeps 469-23 / 471-16 green).

- [ ] T003 [US1] Document the `gateKey` parse rules inside the D.12 step 1 branch
  (FR-002, research R2, data-model E1): issue ref = prefix before the FIRST `:`;
  runId segment = TRAILING colon-free segment matched against the runId shape
  `<tracking-ref-slug>-<timestamp>` — shape-based, NEVER positional (`generation`
  may contain colons). No runId segment → skip the runId comparison, apply only the
  in-scope check. RunId-mismatch evaluated BEFORE out-of-scope.

- [ ] T004 [US2] Add the two verbatim no-op ledger rows to the D.12 **Ledger line**
  paragraph (~auto.md:1129) in the four-column shape
  `<gateKey-issue-ref> · — · gate-answer · <outcome> · source: ui-gate` (FR-004,
  data-model E3, contract C4): `foreign-run delivery — not acked (owner run:
  <runId>)` and `out-of-scope delivery — not acked (issue: <issue-ref>)`. One row
  per delivery, replays NOT deduped.

- [ ] T005 [US2] Register both no-op outcome vocabularies in the enumeration sites so
  grep recipes stay stable (FR-004, data-model V-L3): the § Action + outcome
  vocabulary table (~auto.md:1734–1778) and the § Ledger Rule 2 UI-specific outcome
  list (~auto.md:1800). Both carry `source: ui-gate`.

- [ ] T006 [US1] Update the D.12 **Payload shape** section (~auto.md:1087) to document
  `gateKey` as the composite `<owner>/<repo>#<issue>:<gateType>:<generation>[:<runId>]`
  (FR-005, contract C5): note the trailing `runId` segment is absent under
  `runIdEnabled === false` and that detection is shape-based, not positional. Add the
  sentence (~auto.md:1094) that the no-op ledger `<issue-ref>` slot is the
  gateKey-parsed prefix (no record exists), distinct from other D.12 rows that read
  `openGates[gateId].issueRef`.

## Phase 3: Verification
<!-- Phase boundary: Complete Phase 2 before starting Phase 3 -->

- [ ] T007 [US3] Add a new `519-*` describe block to
  `packages/claude-plugin-cockpit/tests/playbook-verification.test.ts` pinning the new
  contract (FR-007, research R6, contract C1–C5): the two-way step-1 branch
  distinction; both verbatim vocabularies (`foreign-run delivery — not acked (owner
  run: <runId>)`, `out-of-scope delivery — not acked (issue: <issue-ref>)`); the
  evaluation order (foreign-run text appears before out-of-scope text within step 1);
  a negative pin that the no-op branch region contains no `cockpit_gate_ack`; the
  no-dedup rule; and the payload-shape `[:<runId>]` doc. Use
  `extractSubheadingBlock(autoMd, "D.12 — \`gate-answer\`")` for step-1 pins and
  whole-file / ledger-section reads for the vocabulary-table and Rule-2 pins.

- [ ] T008 [US3] Re-pin
  `packages/claude-plugin-cockpit/tests/playbook-verification.test.ts` for every
  heading and contract rule this edit changes.
  Files edited by this issue: `packages/claude-plugin-cockpit/commands/auto.md`
  Pin sites that read the edited file(s):
    - :546: sweep over every `commands/*.md` playbook for invocation-vs-`--help` drift (`readdirSync(COMMANDS_DIR)`)
    - :3057: `449-13` D.12 heading + steps 2–6 supersession/ack (`extractSubheadingBlock`)
    - :3081: `449-14` D.12 revised-draft re-open path (`extractSubheadingBlock`)
    - :3135: `449` § Ledger `source: ui-gate` / grep-recipe pins (`readFileSync` ledger section)
    - :3795: `457-12` D.12 step 6 heading + both delete calls (`extractSubheadingBlock`)
    - :4989: `469-22` D.12 step 5 `applied` runId threading (`extractSubheadingBlock`)
    - :5031: `469-23` D.12 step 1 no-record ack detail + runId-threading phrase (`extractSubheadingBlock`)
    - :5048: `469-24` D.12 step 3 live-state supersession runId threading (`extractSubheadingBlock`)
    - :5653: `471-14` D.12 step 5 reads `openGates[event.gateId].runId` (`extractSubheadingBlock`)
    - :5670: `471-15` D.12 step 3 reads `openGates[gateId].runId` (`extractSubheadingBlock`)
    - :5684/:5704: `471-16` D.12 step 1 no-record region negative pin `/Look up record[^]*?superseded \(no record\) · source: ui-gate/` — must still match and contain no `openGates[...].runId` (`extractSubheadingBlock` + region regex)
    - :6290: `engine-contract-3` D.12 interactions + ledger vocabulary enumeration (`readFileSync` whole file)
  Re-pinning means updating the assertion to the NEW contract established by the
  playbook edit (the step-1 split is designed to preserve 449-13/449-14/469-23/471-16
  — verify by running the suite; if any breaks, re-pin it to the new contract).
  Do NOT weaken or delete an assertion to make the test pass — the pin is a drift
  audit; weakening it deletes its value.

- [ ] T009 [US3] Run `pnpm test` in `packages/claude-plugin-cockpit` (`vitest run`).
  Confirm the new `519-*` pins pass and all preserved D.12 pins (449-13, 449-14,
  469-22, 469-23, 469-24, 471-14, 471-15, 471-16) stay green (SC-004).

## Dependencies & Execution Order

**Sequential chain**: T002 → T003 → T004 → T005 → T006 (all edit `auto.md`, same file)
→ T007 → T008 → T009.

**Parallel opportunities**:
- T001 (changeset, separate file) can run at any time, in parallel with Phase 2.

**Phase boundaries**:
- Phase 2 (auto.md prose) must fully land before Phase 3 verification — the pins
  target the final prose strings.
- T008 (re-pin) is mandatory because `spec.md` / `plan.md` name
  `packages/claude-plugin-cockpit/commands/auto.md`; it must land in the SAME PR as
  the playbook edit (CLAUDE.md pin contract).
- T009 is the terminal gate: no task is done until the suite is green.
