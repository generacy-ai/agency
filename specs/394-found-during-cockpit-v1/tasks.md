# Tasks: Pin auto.md event-consumption to unfiltered reads, forbid content-based stream filters, and add a liveness cross-check to catch broken consumption paths

**Input**: Design documents from `/specs/394-found-during-cockpit-v1/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, quickstart.md, contracts/unfiltered-stream-consumption.md
**Status**: Complete

## Format: `[ID] [P?] [Story] Description`
- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1 = step 4 prose, US2 = sanctioned pattern, US3 = step 5 cross-check, US4 = regression suite)

---

## Phase 1: Setup

- [ ] T001 Verify Vitest is a dev-dependency of `@generacy-ai/claude-plugin-cockpit` (check `packages/claude-plugin-cockpit/package.json`); if absent, add `vitest` under `devDependencies` and ensure a `test` script (`vitest run`) exists. This is a prerequisite for T020/T021 to be runnable.
- [ ] T002 [P] Create the test directory scaffold: `packages/claude-plugin-cockpit/tests/` and `packages/claude-plugin-cockpit/tests/fixtures/` (empty directories; contents populated in later tasks).

## Phase 2: Test Fixtures (foundation for the behavioral suite)

- [ ] T010 [P] [US4] Author `packages/claude-plugin-cockpit/tests/fixtures/394-mixed-event-shapes.ndjson` per contract C.6 — include: (a) ≥1 legacy per-issue envelope with keys `ts`/`repo`/`kind`/`number`/`event`/`labels` and **no** `type` field; (b) ≥1 S8 synthetic aggregate carrying `type: "phase-complete"` or `type: "epic-complete"`; (c) ≥1 whitespace-only line (must NOT reach dispatch); (d) ≥1 malformed/truncated JSON line (MUST reach dispatch). Keep the file to 3–8 non-whitespace-only lines total.
- [ ] T011 [P] [US4] Author `packages/claude-plugin-cockpit/tests/fixtures/394-actionable-live-state.json` per contract C.7 — a `cockpit status --json` payload with ≥1 issue in a D.1–D.9 actionable transition class (e.g. `waiting-for:clarification`). Shape must match what step 4a actually calls.

## Phase 3: Reference Implementation (blocks the Vitest suite)

- [ ] T015 [US4] Create `packages/claude-plugin-cockpit/tests/reference-consumption.ts` per contract C.5 — export a `readStream(source, dispatch, counterRef, {timeoutMs=30_000})` function that (i) trims each line, (ii) dispatches every non-empty result including malformed JSON, (iii) resets the empty-read counter on any line consumed, (iv) increments the counter on a bounded-read return with no lines. MUST NOT contain any `line.startsWith('{')`, `JSON.parse(line)`, `line.includes('"type"')`, or any content predicate beyond trim-then-nonempty. Export a `livenessCrossCheck({counter, statusJson, processAlive, recovery})` function that invokes `recovery({mode: "startup-sweep"})` iff `counter === 4 && processAlive() && statusJson()` returns a payload with ≥1 D.1–D.9 issue.

## Phase 4: Vitest Suite (depends on T010, T011, T015)

- [ ] T020 [US4] Create `packages/claude-plugin-cockpit/tests/playbook-verification.test.ts` per contract C.4 — the suite file with Vitest imports; wire up the reference implementation from `./reference-consumption.ts`; use fake timers so the 30s bounded read does not introduce real wall-clock delay.
- [ ] T021 [US4] In `packages/claude-plugin-cockpit/tests/playbook-verification.test.ts`, implement **Test 1 (SC-002)**: load `394-mixed-event-shapes.ndjson`, run it through `readStream` with a mock dispatch; assert (a) every non-whitespace-only line reaches dispatch exactly once (including the malformed line), (b) both event shapes are represented in the dispatch calls (identify legacy vs aggregate by presence of `type`), (c) whitespace-only line does NOT reach dispatch.
- [ ] T022 [US4] In `packages/claude-plugin-cockpit/tests/playbook-verification.test.ts`, implement **Test 2 (SC-005)**: with an empty stream + fake alive-process handle + mock `cockpit status --json` returning `394-actionable-live-state.json`, advance fake timers through exactly N=4 bounded-read timeouts; assert the recovery function is called with `{mode: "startup-sweep"}` after the 4th empty read and NOT before.
- [ ] T023 [US4] Run `pnpm --filter @generacy-ai/claude-plugin-cockpit test` and confirm both tests pass. Address any assertion failures by fixing the reference implementation (T015) — NOT by adding a filter that would violate C.5.

## Phase 5: Playbook Edit — auto.md (the load-bearing change)

<!-- All Phase 5 tasks modify the SAME file (`packages/claude-plugin-cockpit/commands/auto.md`); they must run sequentially, no `[P]`. -->

- [ ] T030 [US1] In `packages/claude-plugin-cockpit/commands/auto.md` **step 4 (Main loop)**, amend the prose per contract C.1 to state, verbatim: (a) new lines from the background watch process output are read **unfiltered**; (b) "non-empty line" means trim whitespace, then non-empty — malformed/truncated JSON is consumed as an event, whitespace-only lines are dropped as line-framing hygiene; (c) "**Never construct field- or content-based filters over the stream**"; (d) the T-S4 anti-pattern `tail -n 0 -f <watch-output> | grep --line-buffered '"type"'` is named **exactly once** in a prohibition context; (e) if the harness stream-monitor primitive requires a match pattern, the sanctioned pattern is any non-empty line (regex `.+` / newline-delimited read), never a JSON field.
- [ ] T031 [US1] In the same step 4 prose paragraph, add the **schema-heterogeneity rationale** inline: enumerate the two event shapes (legacy per-issue envelope `{ts, repo, kind, number, event, labels}` with no `type`; S8 synthetic aggregates `phase-complete`/`epic-complete` with `type`) and state that filtering on `type` drops every real transition event.
- [ ] T032 [US1] In the same step 4 prose paragraph, add the **over/under-delivery asymmetry rationale** verbatim: over-delivery is harmless (step 4a re-check absorbs duplicates); under-delivery is silent loop death — this asymmetry is the entire justification for the no-filter rule.
- [ ] T033 [US1] In step 4 prose (before or between the (a)/(b)/(c)/(d) sub-steps), add the **30-second per-iteration bounded read** directive verbatim: each read from the background watch process output is bounded to 30 seconds.
- [ ] T034 [US1] Add a one-line issue-history footnote referencing the T-S4 evidence (17 NDJSON lines produced, 1 delivered) and cross-linking to #394; name #384/#388 as prior recurrences of the "instruction gap → improvisation" class this fix instances (per FR-010).
- [ ] T035 [US3] In `packages/claude-plugin-cockpit/commands/auto.md` **step 5 (Watch re-arm)**, retain the pre-394 first paragraph (process-death re-spawn + L.5 idempotency) **byte-identical**; add a new sub-step per contract C.2 with the heading **"Liveness cross-check"** stating verbatim: fires on the conjunction of (a) background watch process alive, (b) **N=4 consecutive empty reads** (~2 minutes silence), (c) `generacy cockpit status --json <epic-ref>` reports ≥1 issue in a D.1–D.9 transition class. Recovery is exactly: re-arm the reader + re-run step 3 (startup sweep). No new recovery machinery. Reference the L.5 idempotency rule. Include the "mechanism-gap defense-in-depth" framing verbatim.
- [ ] T036 [US3] In the step 5 cross-check sub-step, state verbatim that `cockpit status --json` runs **only at the threshold** (after N=4 empty reads), not on every empty read; and that the cross-check is **compound** (silence alone during long implement stretches does not fire it).
- [ ] T037 In the `## Invariants` section of `auto.md`, add invariant **§7** at the end of the numbered list per contract C.3, titled verbatim **"Stream consumption is unfiltered."** with body: "Every non-empty line from `cockpit watch` is an event; content-based filters over the stream are prohibited. If the harness requires a match pattern to arm a reader, it matches any non-empty line, never a JSON field."
- [ ] T038 Confirm the § Ledger section of `auto.md` is byte-identical or consistency-only per FR-006 / SC-009: run `git diff origin/develop -- packages/claude-plugin-cockpit/commands/auto.md` and verify any change inside the § Ledger scope is only a reference-consistency edit (e.g. wording to match the amended step 4). No new rows, no new outcome vocabulary, no new format sentence.

## Phase 6: Verification (static + behavioral + sibling-check)

- [ ] T040 [P] Run the static grep suite from `specs/394-found-during-cockpit-v1/quickstart.md` § "Verification — static checks" against `packages/claude-plugin-cockpit/commands/auto.md`; confirm C.1–C.11 all pass (unfiltered phrasing present; anti-pattern named exactly once in prohibition context; `.+` / newline-delimited-read pattern present; 30s directive present; legacy envelope named; `phase-complete`/`epic-complete` named; invariant §7 present verbatim; "Liveness cross-check" heading present; "N=4" present; recovery path stated; "mechanism-gap defense-in-depth" phrase present).
- [ ] T041 [P] Confirm sibling playbooks are byte-identical: run `git diff origin/develop -- packages/claude-plugin-cockpit/commands/{clarify,review,merge,queue,watch,status}.md` and verify the diff is empty (SC-008 / FR-008).
- [ ] T042 [P] Confirm historical spec directories are byte-identical: run `git diff origin/develop -- specs/372-epic-generacy-ai-tetrad specs/384-found-during-cockpit-v1 specs/388-found-during-cockpit-v1 specs/390-found-during-cockpit-v1` and verify empty.
- [ ] T043 [P] Confirm no third prompt-strengthening round (SC-007): `git diff origin/develop -- packages/claude-plugin-cockpit/commands/auto.md | grep -E "^\+.*\b(MUST|SHALL|MAY NOT)\b"` — every added MUST/SHALL/MAY NOT line must land in the step 4 recipe, invariant §7, or step 5 cross-check. No new checklists, no new terminal-outcome extensions.
- [ ] T044 Re-run `pnpm --filter @generacy-ai/claude-plugin-cockpit test` end-to-end to reconfirm both behavioral assertions still pass after the playbook edits (a defensive check — the tests exercise the reference implementation, not `auto.md`, but running once more locks in the pre-PR state).
- [ ] T045 Draft the PR body's one-line assessment (per FR-008 / SC-008) recording that sibling playbooks (`clarify.md`, `review.md`, `merge.md`, `queue.md`, `watch.md`, `status.md`) do not consume a stream in the same shape as `auto.md` today — result of a grep for `tail -f`, background `cockpit watch`, or equivalent stream-consumption patterns across siblings.

---

## Dependencies & Execution Order

**Phase order (sequential)**:
Phase 1 (Setup) → Phase 2 (Fixtures) + Phase 3 (Reference impl) can start in parallel → Phase 4 (Vitest suite) requires Phases 2 & 3 → Phase 5 (Playbook edit) is independent of the test surface and can begin anytime after Phase 1 → Phase 6 (Verification) requires Phases 4 & 5 complete.

**Concrete dependency graph**:
- T001 → T002
- T002 → T010, T011 (need `tests/fixtures/`)
- T002 → T015 (need `tests/`)
- T010, T011, T015 → T020
- T020 → T021, T022 (same file; run sequentially inside the suite file)
- T021, T022 → T023
- T001 → T030 → T031 → T032 → T033 → T034 → T035 → T036 → T037 → T038 (all edit the same file, `auto.md`; strict sequential order)
- T023 + T038 → T040, T041, T042, T043 (all parallel — different concerns, read-only)
- T040, T041, T042, T043 → T044 → T045

**Parallel opportunities**:
- T010 ∥ T011 ∥ T015 (three different new files, no shared deps).
- T040 ∥ T041 ∥ T042 ∥ T043 (four verification steps, all read-only, all independent).
- T023 (behavioral test run) and T030–T038 (playbook edits) can proceed in parallel: the tests exercise the reference implementation and the fixtures, NOT `auto.md`.

**Sequential constraints**:
- All Phase 5 tasks (T030–T038) edit the same file (`packages/claude-plugin-cockpit/commands/auto.md`) — no `[P]` markers, must run in order to avoid merge conflicts within a single working tree.
- T021 and T022 are sequential inside the same test file (T020 scaffolds it, T021 adds Test 1, T022 adds Test 2).

**Suggested next step**: `/speckit:implement` to begin execution.
