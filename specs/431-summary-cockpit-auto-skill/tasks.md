# Tasks: Retire the second poll loop in `/cockpit:auto`

**Input**: Design documents from `/specs/431-summary-cockpit-auto-skill/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, quickstart.md, clarifications.md
**Status**: Automated tasks complete (T001–T011). T012 blocked on manual smoke-check per SC-002 / SC-004.

## Format: `[ID] [P?] [Story] Description`
- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: All tasks are US1 (single-story bugfix — retire the second poll loop)

## Phase 1: Pre-flight probe (Pattern A)

- [X] T001 [US1] In `packages/claude-plugin-cockpit/commands/auto.md` step 1, insert the new `generacy cockpit doorbell --help` probe between the existing `command -v generacy` check and the `gh auth status` check. Order: `Monitor` present → `command -v generacy` → `generacy cockpit doorbell --help` → `gh auth status` → ledger directory. Probe shell equivalent: `generacy cockpit doorbell --help >/dev/null 2>&1`.

- [X] T002 [US1] In `packages/claude-plugin-cockpit/commands/auto.md` step 1, add the `engine-doorbell-missing` sentinel print message following the shape of `monitor-tool-missing` (`auto.md:37`). Exact message: `Engine doorbell surface not available. /cockpit:auto needs a generacy build that ships \`generacy cockpit doorbell\` (generacy#970). Upgrade the cluster's generacy build, or drive the epic manually with /cockpit:watch, /cockpit:status, and /cockpit:advance.` No ledger line (pre-flight refuses to touch the filesystem); exit non-zero. Explicitly rule out fallback to spawning `generacy cockpit watch`.

## Phase 2: Step-2 sensor swap (Pattern B)
<!-- Phase boundary: Complete Phase 1 before starting Phase 2 -->

- [X] T003 [US1] In `packages/claude-plugin-cockpit/commands/auto.md` step 2 (`auto.md:43`), replace `generacy cockpit watch <epic-ref>` with `generacy cockpit doorbell <epic-ref>` as the `Monitor.spawn(...)` verb. Keep the harness `Monitor` shape unchanged (sensor/actuator split preserved per Q1=A).

- [X] T004 [US1] In `packages/claude-plugin-cockpit/commands/auto.md`, cascade the sensor rename through every downstream prose reference in step 2, step 4, and § Invariants #7. Rewrite § Invariants #7's `cockpit watch` reference to say "doorbell" verbatim while preserving the unfiltered-stream contract wording ("doorbell content is a doorbell only; never parsed for content").

- [X] T005 [US1] In `packages/claude-plugin-cockpit/commands/auto.md § Examples`, rewrite Example 1's "Sensor arm-up" line from `step 2 spawns generacy cockpit watch christrudelpw/epic#42 under harness Monitor. Ledger: christrudelpw/epic#42 · watch-lifecycle · spawn · armed.` to `step 2 spawns generacy cockpit doorbell christrudelpw/epic#42 under harness Monitor (no ledger line — sensor arm-up is engine-owned).` Apply the same treatment to any other example line naming the retired `watch-lifecycle · spawn · armed` or `watch-lifecycle · watch-respawn · …` ledger row.

## Phase 3: Step-5 C5 retirement + ledger vocabulary retirement (Pattern C)
<!-- Phase boundary: Complete Phase 2 before starting Phase 3 -->

- [X] T006 [US1] In `packages/claude-plugin-cockpit/commands/auto.md`, delete the "Watch re-spawn (C5)" block at `auto.md:151–206` in full. Collapse step 5 back to "Cursor recovery" only (Branch A + Branch B, unchanged from #924). Rename the step-5 heading from "Cursor recovery + Watch re-spawn" back to "Cursor recovery". Remove the C5 bookend paragraph.

- [X] T007 [US1] In `packages/claude-plugin-cockpit/commands/auto.md § Ledger § Action + outcome vocabulary`, strike the three watch-lifecycle rows and the surrounding prose above the "Watch lifecycle" cluster:
    - `watch-lifecycle · spawn · armed` / `spawn failed: <description>`
    - `watch-lifecycle · watch-respawn · attempt=<n> backoff=<b>s exit=<code>` / `spawned` / `spawn failed: <description>`
    - The `<issue-ref> slot of the three rows above carries the <epic-ref>…` prose paragraph.
  Retain the heartbeat row (`heartbeat · schedule-wakeup · fired · …`) unchanged.

- [X] T008 [US1] In `packages/claude-plugin-cockpit/commands/auto.md § Ledger § What does NOT count`, revert the post-#420 bullet ("watch re-spawns DO ledger …") to the pre-#420 wording: "re-arms and doorbell arm-ups are not dispatches" (matching #420's pre-existing "re-arms are idempotent" language style).

- [X] T009 [US1] In `packages/claude-plugin-cockpit/commands/auto.md § Invariants`, add §8 (or update if already present) to restate the ledger-only cost contract verbatim: "A transition that dispatches to a ledger-only row (D.9, D.9a, D.9b, D.9c, D.9d) must add no tool calls beyond the ledger append and no prose." Keep the total count at nine numbered items (test 406-6). Do NOT add or remove any invariant beyond the wording update to §7 (from T004).

## Phase 4: Verification
<!-- Phase boundary: Complete Phase 3 before starting Phase 4 -->

- [X] T010 [US1] Re-pin `packages/claude-plugin-cockpit/tests/playbook-verification.test.ts`
    for every heading and contract rule this edit changes.
    Files edited by this issue: `packages/claude-plugin-cockpit/commands/auto.md`
    Pin sites that read the edited file(s):
      - :286: 396-3 drift audit — every GATE_VOCABULARY token has a Trigger match in auto.md § Dispatch (`extractDispatchSection` after `readFileSync(AUTO_MD_PATH)`)
      - :515: 398-1 invocation-vs-`--help` drift sweep (`readdirSync(COMMANDS_DIR)` — covers auto.md's new `generacy cockpit doorbell` invocations against the snapshot for the `doorbell` verb if generacy#970 ships one; otherwise the sweep sees no `doorbell` snapshot and skips per `parseInvocations` known-verbs filter)
      - :906: 402-1 AskUserQuestion contract audit — auto.md has the contract section + ≤4 bound + gate cross-refs (`auditContract(AUTO_MD_PATH)`)
      - :1101: 403-1 D.9 family subheadings state "no re-check, no status table, no prose recap" verbatim (`extractSubheadingBlock`)
      - :1118: 403-2 D.9d subheading with `phase:*` prefix-match (`extractSubheadingBlock`)
      - :1169: 403-4 D.7 and D.11 name `cockpit_context(issue=<issue-ref>)` as sole evidence-fetch tool (`extractSubheadingBlock`)
      - :1253: 403-6 § Invariants §8 cost-contract line (`extractInvariantsSection`)
      - :1273: 403-7 full epic status table anchor only in permitted surfaces (`extractH3Sections`)
      - :1489: 406-2 auto.md has zero `generacy cockpit <migrated-verb>` invocations (direct `readFileSync` — `doorbell` is not in `MIGRATED_VERBS`, so the pin continues to hold)
      - :1515: 406-3 post-#420 wake-driven loop shape — step 2 arms sensor under `Monitor`, step 4 drains with `maxWaitMs=1` (`extractInstructionsSteps`). **Update the assertion**: step 2's Monitor arm-up now spawns `generacy cockpit doorbell` (was `generacy cockpit watch`); the "Monitor" and "maxWaitMs=1" anchors survive verbatim.
      - :1538: 406-4 step 4/5 cursor is in-memory only, no on-disk cursor path (`extractInstructionsSteps`). Step 5 collapses to cursor-recovery-only after C5 retirement — the cursor-related anchors (`invalid-cursor`, `resetFrom`, `startup sweep`, `re-arm`) MUST all survive.
      - :1552: 406-5 step 3 startup sweep tool-presence check (`extractInstructionsSteps`) — unaffected by this PR but verify no collateral edits break it.
      - :1578: 406-6 § Invariants has exactly nine numbered items; §1–§8 opening substrings survive (`extractInvariantsSection`). **Update the assertion for §7**: after this PR, §7's "Stream consumption is unfiltered" opening still holds, but the body carries "doorbell" wording — verify the `expectations` array's §7 substring anchor still matches ("Stream consumption is unfiltered." remains the opening sentence).
      - :1794: 408-1 step 5 cursor-error class split (Branch A / Branch B, G.4(e) options, cursor-recovery ledger line shape) (`auditStep5` → `extractInstructionsSteps`). Cursor recovery survives the C5 retirement unchanged; verify structural anchors hold.
      - :1994: 410-1 D.7 first-vs-repeat sub-path split + G.4(b) sixth-element row (`auditD7` → `parseSections`) — D.7 is unaffected by this PR but verify no collateral edits break it.
    Re-pinning means updating the assertion to the NEW contract.
    Do NOT weaken or delete an assertion to make the test pass — the pin is a drift audit;
    weakening it deletes its value.

- [X] T011 [US1] Run `pnpm test packages/claude-plugin-cockpit/tests/playbook-verification.test.ts` and confirm all pins green. Expected: 406-3 needed the step-2 doorbell update from T010; every other pin is a defensive re-verify.

- [ ] T012 [US1] Manual smoke-check per SC-002 and SC-004 documented in `plan.md § Success Signals`:
    - **SC-002 (process inventory)**: launch `/cockpit:auto` against a fixture epic (or the local snappoll fixture ledger), run `ps -ef | grep 'generacy cockpit watch'` — expect zero rows for the auto session (a concurrent `/cockpit:watch` from a separate session doesn't count).
    - **SC-004 (epic-completion parity)**: on the snappoll fixture, verify the same gates cleared, same merges, same terminal state (`epic-complete`) as the pre-#431 baseline; capture the ledger diff.
    - **Pre-flight refusal smoke**: temporarily rename `generacy` on `$PATH` or unset the doorbell subcommand and confirm `/cockpit:auto` exits non-zero with the `engine-doorbell-missing` message and does NOT spawn `generacy cockpit watch`.
  Capture the SC-001 sanity number (pre-fix vs. post-fix GraphQL rate from generacy#970's `GhWrapper` instrumentation on a snappoll soak) in the PR body — non-merge-gating per Q5=D.

## Dependencies & Execution Order

**Phase boundaries** (sequential):
- Phase 1 (pre-flight probe) → Phase 2 (sensor swap) → Phase 3 (C5 retirement + vocabulary) → Phase 4 (verification)

Phases are sequential because each phase's edits mutate `auto.md` and reviewing the diff in staged phases makes the drift-audit re-pin (T010) easier to reason about. The pre-flight probe (Phase 1) lands first because it's the operator-visible fail-loud rail: if generacy#970 hasn't shipped, the skill refuses to run before any of Phase 2/3's edits become load-bearing.

**Task-level dependencies within phases**:
- T002 depends on T001 (sentinel wording sits inside the probe block).
- T004 depends on T003 (cascade rename requires the step-2 swap first).
- T005 depends on T003 (example line references the new verb).
- T006 → T007 → T008 → T009 are strictly ordered: retire the block, then retire the vocabulary that references it, then revert the "what does NOT count" bullet, then finalize § Invariants.
- T010 depends on Phase 1–3 being complete (the implementer must land the playbook edit before knowing what heading/contract shape to pin to — see the playbook-coupling rule).
- T011 depends on T010.
- T012 depends on T011 (smoke-check runs after tests are green).

**Parallel opportunities**:
- None within Phase 1 (T002 depends on T001).
- Within Phase 2, T004 and T005 could run in parallel after T003, but both edit `auto.md` — treat sequentially to avoid merge friction.
- Within Phase 3, all tasks touch overlapping regions of `auto.md`; treat sequentially.
- Phase 4's verification is inherently sequential.

## Files edited (summary)

- `packages/claude-plugin-cockpit/commands/auto.md` — sole playbook file changed (T001–T009).
- `packages/claude-plugin-cockpit/tests/playbook-verification.test.ts` — re-pinned per T010.

No other files are touched. `packages/claude-plugin-cockpit/commands/watch.md`, the MCP engine (`generacy` repo), the `generacy cockpit doorbell` CLI itself (generacy#970-owned), and `packages/claude-plugin-cockpit/README.md` are out of scope.
