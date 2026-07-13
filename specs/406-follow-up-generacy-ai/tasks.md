# Tasks: cockpit playbook migration to #917 MCP tools + `cockpit_await_events` loop

**Input**: Design documents from `/specs/406-follow-up-generacy-ai/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, contracts/, quickstart.md
**Status**: Complete

## Format: `[ID] [P?] [Story] Description`
- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which success criterion this task supports (SC1 = zero-Bash-CLI, SC3 = ≥2× dispatch-round reduction, SC4 = typed-ref errors, SC5 = tool-contract audit + startup-sweep)

## Phase 1: Pre-migration audit (measurement baseline)

- [X] T001 Run the pre-migration site-count audit: `grep -nE 'generacy cockpit (status|context|queue|advance|resume|merge)\b' packages/claude-plugin-cockpit/commands/{auto,clarify,review,merge,queue,status}.md` and capture a `playbook · verb · line-count-before` table for the PR body. Confirms the plan's Change #6 grep-driven scope matches actual state and gives the post-migration `= 0` audit its comparator.

## Phase 2: Test fixtures (TDD — assertions before edits)

- [X] T002 [P] [SC5] Create `packages/claude-plugin-cockpit/tests/fixtures/406-tool-schemas.json` — snapshot of the seven `cockpit_*` tool definitions per data-model.md § `ToolSchema` (name + `requiredParams` + `optionalParams` per the exact schema shape in the plan's table).
- [X] T003 [P] [SC4] Create `packages/claude-plugin-cockpit/tests/fixtures/406-malformed-ref-input.json` — malformed ref payload (bang-instead-of-hash form) per data-model.md § Fixtures.
- [X] T004 [P] [SC4] Create `packages/claude-plugin-cockpit/tests/fixtures/406-malformed-ref-expected-error.json` — expected typed-error shape (`code: "invalid-ref"`, `message`, `details.input/expectedShape/suggestedFix`) per data-model.md § Fixtures.

## Phase 3: Test suite extension

- [X] T005 [SC1,SC3,SC4,SC5] Extend `packages/claude-plugin-cockpit/tests/playbook-verification.test.ts` with a new `describe("406 — cockpit MCP tool migration + await-events loop", …)` block containing an inline `parseToolCalls(fileContent) → ToolCall[]` classifier and an inline `parseTypedError(input) → TypedError | ValidationError` parser (both per data-model.md § Types; inline matches the #396/#403 pattern — no new `lib/` module).
- [X] T006 [SC5] In the same `describe("406 —", …)` block, add assertion **406-1** (tool-contract audit) — load `406-tool-schemas.json`; scan the six migrated playbooks with `parseToolCalls`; assert every `ToolCall.tool ∈ CockpitToolName`, every `declaredParam ∈ required ∪ optional`, every `required` present; report `file:line` on mismatch. (Load-bearing FR-007 anchor.)
- [X] T007 [SC1] Add assertion **406-2** (no residual CLI verb) — grep `commands/{auto,clarify,review,merge,queue,status}.md` for `/generacy cockpit (status|context|queue|advance|resume|merge)\b/`; expect zero matches. Positive-inverse: `commands/watch.md` still matches `/generacy cockpit watch\b/`.
- [X] T008 [SC3] Add assertion **406-3** (`cockpit_await_events` loop) — `commands/auto.md` step 4 contains `cockpit_await_events` at least once; step 2 does NOT contain `run_in_background: true`; step 4 does NOT contain a `Monitor` tool-primitive reference.
- [X] T009 Add assertion **406-4** (in-memory cursor) — `commands/auto.md` step 4/5 matches `/cursor.*in.?memory only/i`; does NOT match `/\.cockpit\/cursor|state\/cursor|cursor\.json/`; contains the recovery-convergence sentence (invalid-cursor / resetFrom / expiry → startup sweep + re-arm cursor-less).
- [X] T010 [SC5] Add assertion **406-5** (startup sweep tool-presence check) — `commands/auto.md` step 3 names the seven `cockpit_*` tools in a presence check; contains the ledger-line constant `startup · cockpit-mcp-tools-missing · abort · see cluster-base#75` verbatim; contains the guidance constant `cockpit MCP tools not available — upgrade the cluster / verify registration; see cluster-base#75` verbatim; the fail-loud paragraph (±10 lines) contains no `AskUserQuestion` reference.
- [X] T011 Add assertion **406-6** (invariant §9) — `commands/auto.md` § Invariants section contains exactly nine numbered items (§1–§9); §9's opening substring is `` After the migration, `auto.md` invokes no `generacy cockpit <migrated-verb>` Bash form — `` verbatim; §1–§8's opening substrings match their pre-#406 state (defense-in-depth against renumbering).
- [X] T012 [SC4] Add assertion **406-7** (typed-ref error shape) — load `406-malformed-ref-input.json` and `406-malformed-ref-expected-error.json`; run `parseTypedError` over the expected-error JSON; assert `code`/`message`/`details` are preserved verbatim (no CLI-stderr re-wrapping).
- [X] T013 [P] In `playbook-verification.test.ts`, narrow the `398-1` known-verb list from the seven-verb set to `["watch"]` and add the test-file comment: "post-#406 the drift audit only covers the `watch` verb; the other six moved to the 406-1 tool-contract audit." (398-2's regression fixture on `398-drift-auto.md` is retained unchanged.)

## Phase 4: Verb-only playbook migrations (five simpler playbooks — parallelizable)
<!-- Phase boundary: Phase 3 test additions land first so the assertions can validate each migration as it commits. -->

- [X] T014 [P] [SC1] Migrate `packages/claude-plugin-cockpit/commands/clarify.md`: step 3 replace `generacy cockpit context <issue>` Bash invocation with `cockpit_context(issue=<issue-ref>)` MCP tool call; rewrite error branches ("no open clarifications" → `code: 'no-open-clarifications'` typed error; other non-zero exit → other typed error); step 7 replace `generacy cockpit advance --gate clarification <issue-ref>` with `cockpit_advance(issue=<issue-ref>, gate="clarification")`; generalize the § Error handling block's `MISSING_BINARY` clause from "the generacy CLI" to "a required CLI (`gh` for issue comment posting)". Verify 406-1 and 406-2 pass for this file.
- [X] T015 [P] [SC1] Migrate `packages/claude-plugin-cockpit/commands/review.md`: step 4 replace `generacy cockpit advance --gate <name>` with `cockpit_advance(issue, gate=<name>)`; generalize `MISSING_BINARY` clause to name `gh` (PR review posting). LEAVE UNCHANGED: `gh api …/pulls/.../reviews`, the sub-branch-A subagent's `gh pr diff` fetch, and the Terminal Outcome Check's negative-anchor list. Verify 406-1 and 406-2 pass for this file.
- [X] T016 [P] [SC1] Migrate `packages/claude-plugin-cockpit/commands/merge.md`: step 4 replace `generacy cockpit merge <issue>` + stdout JSON parse with `cockpit_merge(issue=<issue-ref>)` MCP call returning the same `{result, reason, pr, checks, details}` shape; step 5 decision tree routes on the tool return's fields (identical shape); step 7 update the fixer-subagent guard rail from "MUST NOT call `generacy cockpit merge`" to "MUST NOT call `cockpit_merge`"; step 8 loop-back-to-step-4 phrasing updated to "re-invoke the tool"; generalize `MISSING_BINARY` clause to name `gh`/`git`. Verify 406-1 and 406-2 pass for this file.
- [X] T017 [P] [SC1] Migrate `packages/claude-plugin-cockpit/commands/queue.md`: step 4 replace `generacy cockpit queue <epic-ref> <phase> --yes` with `cockpit_queue(epic=<epic-ref>, phase=<phase>)` (drop `--yes` — no interactive confirm at the tool boundary); step 5 replace "render captured CLI stdout" with "render the tool's return payload as an equivalent summary block"; retain the `MISSING_BINARY` clause defensively. Verify 406-1 and 406-2 pass for this file.
- [X] T018 [P] [SC1] Migrate `packages/claude-plugin-cockpit/commands/status.md`: step 3 replace `generacy cockpit status <epic-ref>` (stdout/stderr/exit capture) with `cockpit_status(epic=<epic-ref>)` MCP call; step 4 replace "print captured stdout verbatim" contract with "render the tool's return payload as the same dashboard layout the CLI used"; retain the `MISSING_BINARY` clause defensively. Verify 406-1 and 406-2 pass for this file.

## Phase 5: `auto.md` rewrite (sequential — same file)
<!-- Phase boundary: T014–T018 land first so `auto.md` is the last remaining CLI-holder; T005–T012 make each auto.md sub-edit assertable. -->

- [X] T019 [SC1] `commands/auto.md` migrate all six `generacy cockpit <verb>` sites in § Dispatch (D.1 context, D.2/D.3/D.4 advance, D.5 merge + result-shape preservation, D.6 status re-check at step 4a, D.7 context + `cockpit resume`, D.8 queue with `--yes` dropped, D.11 context + advance-merge-conflicts), § Ledger vocabulary examples (mechanism strings updated where they name Bash forms; logical-action strings unchanged), and § Examples (all four end-to-end examples rewritten in place). Do not touch step 2/3/4/5 event-loop yet — that is T020–T023. Verify 406-2 begins passing for `auto.md` after this task.
- [X] T020 [SC5] `commands/auto.md` step 3 (startup sweep): add tool-presence check at the top — verify the seven `cockpit_*` tools are present; on absence emit the load-bearing ledger line `startup · cockpit-mcp-tools-missing · abort · see cluster-base#75` verbatim, print the load-bearing guidance `cockpit MCP tools not available — upgrade the cluster / verify registration; see cluster-base#75` verbatim, and exit non-zero. NO `AskUserQuestion` in the fail path. Below the check, replace the sweep's `generacy cockpit status --json <epic-ref>` with `cockpit_status(epic, json=true)` and preserve the D.1–D.9 synthetic-event dispatch. Verify 406-5 passes.
- [X] T021 [SC3] `commands/auto.md` step 2 (spawn cockpit watch): retire the Bash `run_in_background: true` `generacy cockpit watch <epic-ref>` spawn; retire the process-handle capture. Body shrinks to a short prose block stating that the initial state is cursor-less and the event source is `cockpit_await_events` called per iteration in step 4. Retain the step-2 number for stability. Verify the `run_in_background: true` negative anchor in 406-3 passes.
- [X] T022 [SC3] `commands/auto.md` step 4 (main loop) rewrite: retire the 30-second bounded Monitor read + N=4 empty-read counter + unfiltered-line dispatch prose (~40 lines removed). Add the `cockpit_await_events(epic, cursor, maxWaitMs=55000, coalesceWindowMs=3000, maxBatchSize=256)` per-iteration call (~40 lines added); consume the returned batch in stream order; advance the in-memory cursor; loop. Preserve the D.9/D.9d ledger-only cost contract (§ Invariants #8). Preserve the "actionable event → re-check live state" behavior. Verify 406-3 (positive `cockpit_await_events` anchor + negative Monitor anchor) passes.
- [X] T023 `commands/auto.md` step 5 (watch re-arm + liveness cross-check) rewrite: retire the process-death re-arm branch and the compound-liveness cross-check (N=4 empty reads + actionable live state). Add cursor-recovery prose: `invalid-cursor` typed error (fail loud — caller bug) / `resetFrom` reset signal in batch / cursor expiry all trigger the startup sweep + re-arm cursor-less from connect-time position. Include the load-bearing sentence `the cursor is in-memory only` (or grep-equivalent matching `/cursor.*in.?memory only/i`). Do NOT emit any filesystem path containing `cursor` (asserted by 406-4's negative anchor). Verify 406-4 passes.
- [X] T024 `commands/auto.md` § Invariants: append §9 immediately after §8 (no renumbering of §1–§8). Opening substring verbatim: `` After the migration, `auto.md` invokes no `generacy cockpit <migrated-verb>` Bash form — `` followed by the rule body naming the six migrated verbs and stating that reintroduction is a drift regression. Verify 406-6 passes.

## Phase 6: Full verification
<!-- Phase boundary: All edits must land before running the full Vitest suite. -->

- [X] T025 Run the full quickstart.md § Static verification block (verb-migration completeness grep; `cockpit_await_events` presence; retired-spawn absence; in-memory-cursor positive + negative anchors; startup-sweep ledger line + guidance verbatim; §9 substring; `watch.md` untouched via `git diff origin/develop`; `lib/*.ts` untouched via `git diff`; `scripts/refresh-help-snapshots.sh` untouched via `git diff`). All greps must match their expected hit counts.
- [X] T026 Run `cd packages/claude-plugin-cockpit && pnpm test`. All existing describe blocks must still pass. The new `describe("406 — cockpit MCP tool migration + await-events loop", …)` block's seven assertions (406-1 through 406-7) must all pass. 398-1 with its narrowed `["watch"]` verb list must pass; 398-2 regression fixture must pass unchanged.
- [X] T027 Update the PR body with the pre/post site-count table from T001 (six playbooks × six verbs, `count-before → 0`) and a short SC-001/SC-003/SC-004/SC-005 verifier-status block referencing the passing 406-x assertions. Mark cluster-base#75 as the runtime unblocker for the operator smoke-test (quickstart.md § Operator smoke test).

## Dependencies & Execution Order

**Sequential phases** (each phase depends on the previous):

- **Phase 1 → Phase 2**: T001 establishes the migration scope table; fixtures (T002–T004) are built against it.
- **Phase 2 → Phase 3**: Fixtures must exist before the test file imports them.
- **Phase 3 → Phase 4**: The 406-x assertions must exist before playbook edits so each migration is validated as it lands (TDD-shaped). T005 (block scaffolding) blocks T006–T012.
- **Phase 4 → Phase 5**: The five simpler playbook migrations land first so `auto.md` remains the only file still holding CLI verbs — makes T019's completion the definitive SC-001 flip.
- **Phase 5 → Phase 6**: All edits must land before the full-suite verifier run.

**Parallel opportunities within phases**:

- **Phase 2 (fixtures)**: T002, T003, T004 are three independent JSON files — all `[P]`.
- **Phase 3 (test assertions)**: T005 must land first (scaffolds the describe block + inline parsers). T006–T012 all edit the same file but are separate assertion blocks; keep sequential to avoid merge friction. T013 (398-1 narrowing) touches a different describe block — `[P]` with T006–T012.
- **Phase 4 (verb-only playbook migrations)**: T014–T018 edit five different playbook files with no cross-file dependencies — all `[P]`.
- **Phase 5 (`auto.md` rewrite)**: T019–T024 all edit `commands/auto.md`. Keep sequential to avoid churn. T019 (verb-site migration) is safe to land first — the six-verb sites are scattered across § Dispatch / § Ledger / § Examples but don't overlap with steps 2/3/4/5. T020 → T021 → T022 → T023 → T024 track the step-order in the file (step 3 tool-presence check, step 2 spawn retirement, step 4 loop rewrite, step 5 cursor recovery, invariant §9 append).

**Explicit non-tasks** (recorded here to prevent scope creep):

- No edits to `commands/watch.md` — enforced by 406-2's positive-inverse assertion (watch.md must retain `generacy cockpit watch`) and quickstart.md's `git diff origin/develop -- watch.md` check.
- No edits to `lib/reference-consumption.ts`, `lib/gate-vocabulary.ts`, `lib/clarification-batch-parser.ts` — enforced by quickstart.md's `git diff` check.
- No edits to `scripts/refresh-help-snapshots.sh` — the script's grep-based CLI-verb discovery will naturally find only `watch` post-migration, which is the intended outcome.
- No new `lib/` module — the tool-call classifier and typed-error parser live inline in the `406 —` describe block (matches #396/#403 pattern).
- No plugin-version-bump gating, no in-playbook CLI-fallback branching, no on-disk cursor persistence — the plan's § Complexity Tracking records these as permanent design rejections.

## Suggested next step

`/speckit:implement` to begin execution.
