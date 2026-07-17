# Tasks: Monitor-driven wake-ups for `/cockpit:auto`

**Input**: Design documents from `/specs/420-summary-cockpit-auto-s/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, contracts/auto-loop-contract.md, quickstart.md
**Status**: Complete

## Format: `[ID] [P?] [Story] Description`
- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to

**Note**: Nearly all edits target the single file `packages/claude-plugin-cockpit/commands/auto.md`. Because these edits touch adjacent sections of the same prose playbook, they are ordered sequentially — no `[P]` markers within the core edit phase. Only the optional README polish task is truly parallel-safe.

## Phase 1: Orientation

- [X] T001 Re-read the current `packages/claude-plugin-cockpit/commands/auto.md` end-to-end, noting exact line ranges for: (a) the `description:` frontmatter, (b) step 1 pre-flight paragraph and `command -v generacy` check, (c) step 2 "No background watcher to spawn" paragraph, (d) step 4 main-loop iteration prose and the current `cockpit_await_events(maxWaitMs=55000)` call shape, (e) step 5 cursor-recovery block, (f) the `## Ledger § Action + outcome vocabulary` table, (g) the `## Ledger § What does NOT count` bullet list, (h) the `## Invariants` section (should stay unchanged), (i) `## Examples § Example 1`. Do NOT edit yet — this task produces a mental map for the sequential edits that follow.

## Phase 2: Core Playbook Edits (single file, sequential)

- [X] T002 [US4] **C1 — Pre-flight `Monitor` check.** Edit `packages/claude-plugin-cockpit/commands/auto.md`, step 1. Insert a new sub-step at the very top of step 1's pre-flight — before `command -v generacy` and before the ledger directory `mkdir -p` — directing the model to check whether the harness `Monitor` tool is bound in the current session. On absence: print the verbatim message from `data-model.md § Pre-flight error class` (`monitor-tool-missing` sentinel), do NOT create the ledger directory, do NOT write a ledger line, exit non-zero. On presence: fall through to the existing `command -v generacy` check. Do not distinguish "absent" from "present-but-broken" — spawn failure at step 2 routes to the C5 re-spawn branch. Maps to FR-006, SC-006, spec US4.

- [X] T003 [US1] **C2 — Step 2 sensor arm-up.** Edit `auto.md`, step 2. Replace the current "No background watcher to spawn" paragraph with prose that directs the model to spawn `generacy cockpit watch <ref>` under harness `Monitor` at loop start. Cover: (a) `<ref>` is the epic ref, or the tracking ref under `--tracking` / `--new` (matching the ledger header line's `Tracking ref:` field); (b) write ledger line `<ref> · watch-lifecycle · spawn · armed`; (c) on immediate spawn failure, write `<ref> · watch-lifecycle · spawn · spawn failed: <description>` and transition into the C5 re-spawn branch with `attempt=1 backoff=1s`. Explicitly state the NDJSON content is a doorbell only — never parsed. Maps to FR-001, FR-009, SC-004, spec US1/US3.

- [X] T004 [US1] [US3] **C3 — Wake-driven main-loop drain shape.** Edit `auto.md`, step 4. Change every `cockpit_await_events(...)` call in step 4's iteration prose from `maxWaitMs=55000` to `maxWaitMs=1` and add/confirm `coalesceWindowMs=3000` (leaving `maxBatchSize=256` untouched). Rewrite the surrounding iteration prose to describe the wake-driven model: the model responds to a Monitor-delivered wake **or** a `ScheduleWakeup` heartbeat fire by (i) draining events via the fast `cockpit_await_events` call above, (ii) advancing the in-memory cursor to `batch.nextCursor`, (iii) dispatching each event per the existing per-class table (step 4a–4d unchanged), then falling through to arm the next heartbeat (T005) and wait for the next wake. Preserve `initial: true` handling and D.10 semantics verbatim — cite them as unchanged. Do NOT add a client-side debounce; the MCP layer's `coalesceWindowMs` is the only coalescer. Maps to FR-002, FR-003, FR-007, SC-001, SC-002, spec US1/US3.

- [X] T005 [US1] [US2] **C4 — Heartbeat lifecycle.** Edit `auto.md`, step 4, adding a new paragraph after the C3 drain-shape prose. Direct the model to: after each drain, if no heartbeat is currently outstanding, arm `ScheduleWakeup(delaySeconds=300, prompt=<verbatim /cockpit:auto invocation with the same ref and flags>, reason="cockpit-auto heartbeat while Monitor silent")`; then wait for the next wake signal. On heartbeat fire: perform the C3 drain, write ledger line `<ref> · heartbeat · schedule-wakeup · fired · drain empty` (or `fired · drain complete (<M> events)` if the drain returned events), re-arm. On a Monitor-delivered wake, the outstanding heartbeat is superseded — no explicit cancellation is required (harness semantics allow it to fire harmlessly with zero events, which is safe). Document the in-memory bookkeeping field `heartbeatScheduledWakeupArmed` from `data-model.md § In-memory loop state`. Maps to FR-004, SC-005, spec US1/US2.

- [X] T006 [US2] **C5 — Watch-process re-spawn branch.** Edit `auto.md`, step 5. Add a new "Watch re-spawn" subsection adjacent to the existing cursor-recovery block. Direct the model: on a Monitor-reported exit of the watch subprocess, (i) print `[watch] Monitor reported exit · code=<c> · backoff=<b>s` to the transcript, (ii) write ledger `<ref> · watch-lifecycle · watch-respawn · attempt=<n> backoff=<b>s exit=<code>`, (iii) wait `<b>` seconds via `Bash sleep` when `<b> ≤ 60` and via `ScheduleWakeup(delaySeconds=<b>, ...)` when `<b> > 60`, (iv) retry `Monitor.spawn("generacy cockpit watch <ref>")`. On success: ledger `<ref> · watch-lifecycle · watch-respawn · attempt=<n> backoff=<b>s spawned` and continue the main loop. On failure: ledger `<ref> · watch-lifecycle · watch-respawn · attempt=<n> backoff=<b>s spawn failed: <description>`, double `<b>` (cap 300), retry indefinitely. Codify the backoff sequence `1s → 2s → 4s → 8s → 16s → 32s → 64s → 128s → 256s → 300s (hold)` and the reset rule: any Monitor-delivered wake that produces at least one dispatched event resets `attemptCounter` to 0 and `backoffSec` to 1. Document the in-memory fields `monitorHandle`, `watchRespawnBackoffSec`, `watchRespawnAttemptCounter` from `data-model.md § In-memory loop state`. Explicitly state: no hard retry cap; no fallback to long-poll. Maps to FR-005, SC-005, spec US2.

- [X] T007 [US1] [US2] **Ledger vocabulary additions.** Edit `auto.md`, `## Ledger § Action + outcome vocabulary` table. Add three new rows exactly as specified in `data-model.md § Ledger vocabulary additions`: (a) watch-lifecycle · spawn (arm-up), (b) watch-lifecycle · watch-respawn (re-spawn), (c) heartbeat · schedule-wakeup (heartbeat fire). Keep the `<issue-ref>` column note explaining that `<epic-ref>` (or tracking ref under `--tracking`/`--new`) is used for all three rows. Maps to FR-008 partial (docs updates).

- [X] T008 [US2] **Ledger "What does NOT count" bullet fix.** Edit `auto.md`, `## Ledger § What does NOT count` section. Remove the bullet that reads "watch re-arms (spawning `cockpit watch` again after it dies)" — re-spawn events DO ledger now per C5 / T006. This is the one norm-shift called out in `plan.md § Constitution Check`. Do not remove any other bullets. Maps to FR-008 partial.

## Phase 3: Docs / Metadata Cleanup

- [X] T009 [US3] **C6 — Frontmatter tagline + opening one-liner.** Edit `auto.md` line 2 `description:` frontmatter. Replace the current tagline (which contains "long-polling cockpit_await_events") with: `Drive an epic (or a tracking issue) to terminal by dispatching Monitor-delivered wake-ups through cockpit_await_events with fused human gates`. In the opening paragraph, replace the loop-shape one-liner `long-poll → dispatch → ledger → advance` with a wake-driven equivalent that names the Monitor sensor + heartbeat + drain shape (suggested: `Monitor wake (or heartbeat) → drain typed batch → dispatch → ledger → advance`). Maps to FR-008.

- [X] T010 [US1] [US3] **Optional: Example 1 walkthrough refresh.** Edit `auto.md`, `## Examples § Example 1` (the end-to-end epic run). Add one extra pair of ledger lines showing (a) the step-2 arm-up (`<epic-ref> · watch-lifecycle · spawn · armed`) and (b) one heartbeat fire during a quiet phase (`<epic-ref> · heartbeat · schedule-wakeup · fired · drain empty`). Do NOT rewrite any D.x dispatch outcomes — this is flavour, not semantics. Skip this task if it would balloon the example beyond one screen.

- [X] T011 [P] [US3] **Optional: README overview refresh.** (Skipped — README's `/cockpit:auto` entry does not name polling internals; unchanged wording "watch transitions" is accurate for both pre-#420 and post-#420 models.) Edit `packages/claude-plugin-cockpit/README.md` (if it names `/cockpit:auto`'s polling model in the § commands overview). Update the sentence to reflect the Monitor-wake + heartbeat model. Skip if the README doesn't mention the polling internals. This is the only Phase-3 task that touches a different file from `auto.md`, so it is safe to run in parallel with T010.

## Phase 4: Verification

- [X] T012 [US1] [US2] [US3] [US4] **Contract-map audit.** PASS — verified all C1–C7 map to prose in edited auto.md:
  - **C1** (Monitor pre-flight, FR-006 / SC-006): PASS — step 1 pre-flight paragraph at file lines ~26–34 prints verbatim `monitor-tool-missing` message, does NOT create ledger dir, exits non-zero, precedes `command -v generacy`.
  - **C2** (sensor arm-up, FR-001 / SC-004): PASS — step 2 spawns `Monitor.spawn("generacy cockpit watch <ref>")`; ledger `armed` / `spawn failed: <description>`; immediate spawn failure routes to C5 with `attempt=1 backoff=1s`.
  - **C3** (drain shape, FR-002/003/007 / SC-001/002): PASS — step 4 wake-driven iteration uses `maxWaitMs=1, coalesceWindowMs=3000`; per-event dispatch preserved; `initial: true` handling preserved; D.10 semantics preserved.
  - **C4** (heartbeat, FR-004 / SC-005): PASS — `ScheduleWakeup(delaySeconds=300, prompt=<verbatim>, reason=…)`; ledger `fired · drain empty` / `fired · drain complete (<M> events)`; supersession semantics documented.
  - **C5** (re-spawn, FR-005 / SC-005): PASS — Watch re-spawn subsection in step 5; backoff `1s → 2s → 4s → 8s → 16s → 32s → 64s → 128s → 256s → 300s (hold)`; ledger accounting per attempt; reset rule on watch-health.
  - **C6** (docs updates, FR-008): PASS — description tagline updated (line 2); opening one-liner updated (line 11); "What does NOT count" bullet removed; three new rows in Action + outcome vocabulary table.
  - **C7** (external contract, FR-009 / SC-004): PASS by construction — no change to NDJSON emission, no change to typed-batch shape, no change to label-writing behavior. Read the edited `packages/claude-plugin-cockpit/commands/auto.md` end-to-end and verify against `contracts/auto-loop-contract.md § Verification checklist`: each of C1–C7 has explicit prose in the file (or, for C7, is preserved by construction). For each contract point, confirm the matching FR and SC references still hold. Produce a short pass/fail note per contract point in the PR description.

- [X] T013 [US1] [US4] **Dry-run pre-flight verification.** PASS by reasoning through prose. `Monitor`-absent branch (auto.md lines 31–37): prints verbatim `monitor-tool-missing` message matching `data-model.md § Pre-flight error class`, exits non-zero, does NOT create the ledger directory, does NOT write a ledger line. `Monitor`-present branch (auto.md line 39): falls through to `command -v generacy` without side effects. Matches SC-006. Simulate the harness-`Monitor`-absent condition in a scratch Claude Code session (or by reasoning through the prose): confirm the C1 branch prints the exact `monitor-tool-missing` message from `data-model.md`, does NOT create the ledger directory, does NOT write a ledger line, and exits non-zero. Confirm the `Monitor`-present branch falls through to the existing `command -v generacy` check without side effects. Maps to SC-006.

- [ ] T014 [US1] [US3] [manual] **Snappoll fixture parity test.** Re-run `/cockpit:auto` against the snappoll fixture (or an equivalent small epic). Measure against SC-001 (zero-event polling turns ≥90% drop: 34 → ≤3), SC-002 (cache-read tokens on pure polling ≥90% drop: ~41.8M → ≤4M), SC-003 (wake latency ≤5s p95), SC-004 (epic-completion parity — same terminal state, same merges). Attach transcript excerpts and the ledger tail to the PR.

- [ ] T015 [US2] [manual] **Watch-death recovery test.** Mid-run, `pkill -f "generacy cockpit watch"` (or otherwise terminate the sensor) and measure time to next successful event dispatch. Confirm ≤5m30s (SC-005). Confirm the transcript shows `[watch] Monitor reported exit` lines and the ledger contains `watch-lifecycle · watch-respawn` rows. Confirm the backoff sequence walks `1 → 2 → 4 → …` until the watch comes back or hits the 300s ceiling.

## Dependencies & Execution Order

**Phase gates (sequential)**:
- Phase 1 → Phase 2 → Phase 3 → Phase 4. Do not start editing (Phase 2) until Phase 1's mental map is done; do not verify (Phase 4) until edits (Phases 2 + 3) are complete.

**Within Phase 2 (all edits to `auto.md`)**:
- T002 (step 1 pre-flight) → T003 (step 2 arm-up) → T004 (step 4 drain shape) → T005 (step 4 heartbeat, must follow T004 because it appends to the same paragraph block) → T006 (step 5 re-spawn) → T007 (ledger vocab table) → T008 (ledger "does NOT count" bullet).
- Rationale for strict order: all edits target the same file. Even though T007 and T008 hit a different section than T002–T006, running them last keeps the edit context small and prevents Edit-tool `old_string not unique` failures caused by mid-work partial updates.

**Within Phase 3**:
- T009 must run before T010 (T010 references the updated ledger vocab from T007 and the updated tagline sensibility from T009).
- T011 is `[P]` — different file (`README.md`), no data dependency. Can run in parallel with T010 or interleaved with Phase 4.

**Within Phase 4 (verification, low-risk parallel opportunities)**:
- T012 (contract audit) is a static read of the edited file — can run before any live tests.
- T013, T014, T015 involve live-harness runs. Run T013 first (cheapest — pre-flight is a startup check that aborts fast); T014 and T015 both require a real epic fixture and should run sequentially against the same fixture to avoid cross-contamination of ledger evidence.

**Cross-story coverage** (per spec):
- US1 (idle-cost savings): T003, T004, T005, T010, T014
- US2 (watch-death recovery): T005, T006, T007, T008, T015
- US3 (dispatch semantics preserved): T003, T004, T009, T010, T011, T012, T014
- US4 (missing-Monitor hard fail): T002, T012, T013

## Suggested Next Step

Run `/speckit:implement` to begin executing tasks T001 through T015 in the order above. Alternatively, run `/speckit:taskstoissues` to file GitHub sub-issues under #420 for tracking (default grouping is `per-story`; consider `per-phase` here since edits are tightly coupled inside a single file).
