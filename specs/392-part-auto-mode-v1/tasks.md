# Tasks: Cockpit auto mode (v1.5, A-S9) — `/cockpit:auto <epic-ref>`

**Input**: Design documents from `/specs/392-part-auto-mode-v1/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, contracts/dispatch-table.md, contracts/gate-contract.md, contracts/ledger-line.md, contracts/subagent-boundaries.md, quickstart.md
**Status**: Complete

## Format: `[ID] [P?] [Story] Description`
- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to. There is one dominant story — US1 = drive an epic to `epic-complete` via transport automation with judgment gates preserved (spec § Acceptance) — so most impl tasks carry `[US1]`. Verification and PR-body tasks are cross-cutting and unmarked.

## Phase 1: Setup / Baseline

- [ ] T001 Confirm branch state: `git status` clean on `392-part-auto-mode-v1`; `packages/claude-plugin-cockpit/commands/{clarify,merge,queue,review,status,watch}.md` and `packages/claude-plugin-cockpit/README.md` byte-identical to `origin/develop` (invariant §5 + FI-2 baseline). Confirm target file `packages/claude-plugin-cockpit/commands/auto.md` does NOT yet exist (this task creates it). Establish the pre-edit greppable baseline: `grep -c "no cross-slash-command invocation" packages/claude-plugin-cockpit/README.md` returns exactly 1 (unchanged since #390's amendment — RI-2). (data-model.md § FI-1..FI-3, § RI-2)

## Phase 2: Create `auto.md` skeleton — frontmatter, overview, User Input, Instructions

- [ ] T002 [US1] Create `packages/claude-plugin-cockpit/commands/auto.md` with the S6-convention header block: `---` YAML frontmatter with `description:` (one-line: "Drive an epic to epic-complete — auto-transport over cockpit watch events with fused human gates") and `arguments:` (positional `epic-ref`, required, no flags in v1); then `# Auto Command`; then a one-paragraph overview stating the loop shape (pre-flight → spawn watch → per event: re-check → dispatch → ledger → exit on epic-complete) and the two hard boundaries (never merge on red; every gate prompts). Anchor for later grep: `# Auto Command`. (data-model.md § Part 1 file structure, PI-1, PI-2)

- [ ] T003 [US1] Add `## User Input` section to `auto.md` following the S6 convention: a fenced block containing `$ARGUMENTS` verbatim (matches the six existing playbooks' argument-echo pattern). Immediately after, a `## Instructions` H2 introducing the numbered step list. (data-model.md § Part 1 file structure, PI-3)

- [ ] T004 [US1] In `auto.md` § Instructions, write the six numbered steps (structural — not the dispatch table itself, which is a separate H2 section referenced from step 4b): (1) Parse arguments + pre-flight (`generacy` on PATH, `gh` authenticated, cwd is writable git repo, `.generacy/cockpit/auto-runs/` created via `mkdir -p`); (2) Spawn `generacy cockpit watch <epic-ref>` in the background via Bash `run_in_background: true`; capture the process handle; (3) Startup sweep — call `cockpit status --json <epic-ref>` and treat every issue with an actionable transition class as a synthetic event, dispatching one by one; (4) Main loop — for each event line from the watcher: (a) re-check live state via `cockpit status --json`, (b) dispatch per § Dispatch table, (c) write one ledger line per § Ledger, (d) continue until `epic-complete`; (5) Watch re-arm — if the watcher process dies while the epic is incomplete, re-spawn it (startup sweep + live-state re-check make this idempotent); (6) Exit — on `epic-complete`, kill the watch process, print the run summary per § Ledger L.6, exit zero. Anchor for later grep: `Startup sweep` and `Watch re-arm`. (data-model.md § Part 1, PI-3; contract ledger-line.md § L.5, § L.6)

## Phase 3: Populate `## Dispatch` — nine rows verbatim

- [ ] T005 [US1] Add `## Dispatch` H2 section to `auto.md` with an opening paragraph naming the nine event classes and stating the "re-check live state on every event; streamed lines are advisory" rule (data-model.md § 2.1 trust boundary). Then a summary table (dispatch-table.md § summary form, verbatim) followed by detailed sub-sections D.1 through D.10. Anchor for later grep: `## Dispatch`. (contract dispatch-table.md § D.0; data-model.md PI-4)

- [ ] T006 [US1] Populate D.1 (`waiting-for:clarification`) in `auto.md` § Dispatch verbatim per contract dispatch-table.md § D.1: fetch context via `generacy cockpit context`, spawn clarification drafter subagent (SB.1), present fused batch gate (G.1 — `ceil(N/4)` `AskUserQuestion` calls in the same response, `Approve draft (Recommended)` / `Skip this question`, "Other" free-text as edit path), assemble comment body via `--body-file` (never `-b`/`--body`), advance gate only when every question received an approved/edited answer. Include the ledger-line template and failure modes. Verbatim event string: `waiting-for:clarification`. (dispatch-table.md § D.1; gate-contract.md § G.1; subagent-boundaries.md § SB.1)

- [ ] T007 [US1] Populate D.2 (`waiting-for:<artifact>-review`) verbatim per contract dispatch-table.md § D.2: resolve target artifact from the transition class, spawn review-verdict analyzer subagent (SB.2 — reuses #390's contract verbatim), present fused verdict gate (G.2 — `approve` / `request-changes` / `abort`), apply verdict (`approve` → `cockpit advance`; `request-changes` → COMMENT review with per-finding inline threads; `abort` → no-op). Include the retained `MUST NOT print raw JSON under any circumstance.` clause inline immediately before the findings-summary table rendering instruction. Verbatim event string: `waiting-for:<artifact>-review`. (dispatch-table.md § D.2; gate-contract.md § G.2; subagent-boundaries.md § SB.2; SBC.3)

- [ ] T008 [US1] Populate D.3 (`waiting-for:implementation-review`) verbatim per contract dispatch-table.md § D.3: resolve PR from `cockpit status --json`, spawn SB.2 with the PR ref as scope (subagent fetches its own diff via `gh pr diff`), present G.2, apply verdict. State that D.3 is structurally identical to D.2; the only difference is the scope (artifact file vs. PR reference). Verbatim event string: `waiting-for:implementation-review`. (dispatch-table.md § D.3; gate-contract.md § G.2)

- [ ] T009 [US1] Populate D.4 (`waiting-for:manual-validation`) verbatim per contract dispatch-table.md § D.4: spawn manual-validation summarizer subagent (SB.3) with issue-ref + PR-ref (subagent reads spec §Success Criteria + issue acceptance criteria + PR title/body), present manual-validation gate (G.3 — `manually validated` / `not yet`), apply verdict. Explicitly state that inline artifact reads in the parent are forbidden (Q4=B). Verbatim event string: `waiting-for:manual-validation`. (dispatch-table.md § D.4; gate-contract.md § G.3; subagent-boundaries.md § SB.3; AP-9 defense)

- [ ] T010 [US1] Populate D.5 (`completed:validate` + green → merge without gate) verbatim per contract dispatch-table.md § D.5: confirm state via `cockpit status --json`, call `generacy cockpit merge <pr-ref>` (squash, branch delete per CLI default), **no gate**. State explicitly: "The operator's judgment was recorded at `waiting-for:implementation-review` (D.3). `validate` + green checks is mechanical; no additional prompt." Include the invariant-coupling sentence: "Never merge on red — the branch exists here strictly on the `result: merged` outcome." Handle `blocked:*` sub-outcomes per `merge.md`'s existing decision tree. (dispatch-table.md § D.5; invariant §1)

- [ ] T011 [US1] Populate D.6 (`completed:validate` red / merge red → bounded fixer subagent) verbatim per contract dispatch-table.md § D.6: classify failing checks (infrastructure/runner failures abort without burning an attempt), spawn bounded fixer subagent (SB.4) with the outcome-scoping prompt verbatim ("make this specific red green; no refactors, no feature work, no scope expansion; if it needs design judgment, stop and return an explanation"), re-evaluate on `{fixed: true}` → loop back to D.5; on `{fixed: false}` → present escalation gate (G.4a — `Retry` / `Skip` / `Stop`). Include the "runs once autonomously per red event" invariant sentence and the fixer verdict schema `{fixed, summary, reason?}` verbatim. (dispatch-table.md § D.6; gate-contract.md § G.4a; subagent-boundaries.md § SB.4; Q1=D refined; AP-10, AP-11 defenses)

- [ ] T012 [US1] Populate D.7 (`agent:error` / `failed:*` → escalation gate Requeue path) verbatim per contract dispatch-table.md § D.7: fetch evidence via `gh issue view <issue-ref> --comments`, present escalation gate (G.4b — `Requeue (cockpit resume)` / `Skip (session-local mute)` / `Stop (exit auto)`), apply verdict. Include the degradation clause: "If `cockpit resume` is unavailable (G-S8 didn't ship the verb, per Assumption A2), Requeue degrades to Skip with an explicit ledger note." (dispatch-table.md § D.7; gate-contract.md § G.4b; Assumption A2)

- [ ] T013 [US1] Populate D.8 (`phase-complete` → phase-queue confirmation gate) verbatim per contract dispatch-table.md § D.8: compute next phase scope from `cockpit status --json`, present phase-queue gate (G.5 — `Queue P<next> (<N> issues) (Recommended)` / `Cancel`), on approval call `generacy cockpit queue <epic-ref> P<next> --yes`. State that the CLI's `--yes` flag is used because the gate is the confirmation. (dispatch-table.md § D.8; gate-contract.md § G.5)

- [ ] T014 [US1] Populate D.9 (`waiting-for:address-pr-feedback` → ledger only) verbatim per contract dispatch-table.md § D.9: no CLI verb, no subagent, no gate — write a ledger line noting "server-side-owned" and continue the loop. Include the one-sentence rationale (server-owned transition; plugin has no local action to add). (dispatch-table.md § D.9)

- [ ] T015 [US1] Populate D.10 (unrecognized / ambiguous state → escalation gate, Skip / Stop only) verbatim per contract dispatch-table.md § D.10: present escalation gate (G.4c — `Skip (session-local mute) (Recommended)` / `Stop (exit auto)`, **NEVER Retry**), apply verdict. State the "never guess" invariant sentence. (dispatch-table.md § D.10; gate-contract.md § G.4c; GC.4.3)

## Phase 4: Populate `## Gate contract` — four gate types

- [ ] T016 [US1] Add `## Gate contract` H2 section to `auto.md` per contract gate-contract.md § G.0: opening paragraph naming exactly four gate types (clarification batches, review/validation verdicts, phase-queue confirmations, red/error escalations) and stating verbatim "nothing else prompts; none of these auto-proceed." Follow with a summary table (gate-contract.md § summary form). Anchor for later grep: `## Gate contract` and `nothing else prompts; none of these auto-proceed`. (data-model.md PI-5; gate-contract.md § G.0)

- [ ] T017 [US1] Populate § Gate contract subsection G.1 (Clarification batch) verbatim per gate-contract.md § G.1: presentation block shape (numbered `### Q<n>` drafts with `_provenance:_` lines); gate invocation shape (`ceil(N/4)` `AskUserQuestion` calls in the same response; header `Q<n>` ≤ 12 chars; options exactly `Approve draft (Recommended)` / `Skip this question`; `multiSelect: false`; "Other" as edit path). Anchor for later grep: `ceil(N/4)`, `Approve draft (Recommended)`, `Skip this question`. (gate-contract.md § G.1; GC.1.1–GC.1.4)

- [ ] T018 [US1] Populate § Gate contract subsection G.2 (Review verdict) verbatim per gate-contract.md § G.2: presentation shape (findings-summary table + `Suggested decision:` line); options exactly `approve` / `request-changes` / `abort` in that order; retained `MUST NOT print raw JSON under any circumstance.` clause inline (this is the second occurrence — the first was inside D.2 / D.3 prose; SBC.3 requires exactly one canonical occurrence, so if placing it here would duplicate, keep it in D.2/D.3 and cross-reference from G.2). Anchor: `approve` / `request-changes` / `abort`. (gate-contract.md § G.2; GC.2.1–GC.2.5)

- [ ] T019 [US1] Populate § Gate contract subsection G.3 (Manual-validation confirm) verbatim per gate-contract.md § G.3: presentation shape (bulleted `Scenarios to test` + `Acceptance checks` lists from subagent's structured return); options exactly `manually validated` / `not yet`; header `Validated?` ≤ 12 chars. (gate-contract.md § G.3; GC.3.1–GC.3.3)

- [ ] T020 [US1] Populate § Gate contract subsection G.4 (Escalation — three subtypes) verbatim per gate-contract.md § G.4: presentation shapes for (a) validate-red/merge-red (fixer summary + reason + failing checks), (b) `agent:error`/`failed:*` (bot-authored alert evidence), (c) unrecognized state (observed state + streamed event); option sets per subtype verbatim per the table (a: `Retry` / `Skip` / `Stop`; b: `Requeue` / `Skip` / `Stop`; c: `Skip (Recommended)` / `Stop` — **NEVER Retry**). Include the four post-gate mechanism sentences: Retry re-runs fixer once; Requeue calls `cockpit resume`; Skip is session-local mute (labels untouched); Stop kills watch + prints summary + exits. (gate-contract.md § G.4; GC.4.1–GC.4.6; Q3=D)

- [ ] T021 [US1] Populate § Gate contract subsection G.5 (Phase-queue confirmation) verbatim per gate-contract.md § G.5: presentation shape (next-phase issue list numbered with titles); options exactly `Queue P<next> (<N> issues) (Recommended)` / `Cancel`; header `QueueP<next>` ≤ 12 chars. State that on `Queue`, the CLI verb is called with `--yes` (the gate itself is the confirmation). (gate-contract.md § G.5; GC.5.1–GC.5.3)

## Phase 5: Populate `## Ledger`

- [ ] T022 [US1] Add `## Ledger` H2 section to `auto.md` per contract ledger-line.md § L.1 through § L.6: state the format sentence verbatim (`<issue-ref> · <transition-class> · <action> · <outcome>`, using the middle-dot U+00B7); the mandatory-per-dispatch enforcement rule verbatim ("A dispatch without a ledger line is a protocol violation.") — this is #388 enforcement-style; the dual-write persistence rule verbatim (transcript print prefixed with `[ledger] ` + `echo … >> .generacy/cockpit/auto-runs/<epic-ref-slug>-<timestamp>.ledger`); the epic-ref-slug rule (`/` → `-`, `#` stripped); the timestamp format `YYYYMMDD-HHMMSS`; the startup-sweep + live-state re-check idempotency rule (L.5); the run-summary shape at exit (L.6). Include the action + outcome vocabulary table (L.2) so grep recipes on `<action>` / `<outcome>` strings are stable. Anchor for later grep: `issue · transition · action · outcome`, `dispatch without a ledger line is a protocol violation`, `.generacy/cockpit/auto-runs/`. (ledger-line.md § L.1–L.6, LC.1–LC.9; data-model.md PI-6)

## Phase 6: Populate `## Invariants`

- [ ] T023 [US1] Add `## Invariants` H2 section to `auto.md` containing exactly six invariants verbatim from spec § Invariants: (1) Never merge on red; (2) Cockpit comments marked (`<!-- generacy-cockpit:… -->` prefix); (3) Add-only advance (Skip in escalation gates is session-local mute, never label writes); (4) No cross-slash-command invocation (composition is CLI verb + subagent only); (5) Analysis in subagents whose contracts end with the subagent — #390 pattern; (6) Autonomy *policy* (per-gate auto-approve, "full auto") explicitly out of scope. Each numbered as a distinct bullet. Anchor for later grep: `Never merge on red`, `no cross-slash-command invocation`, `analysis in subagents`, `autonomy .*out of scope`. (data-model.md PI-7; spec § Invariants)

## Phase 7: Populate `## Examples`

- [ ] T024 [US1] Add `## Examples` H2 section to `auto.md` with at least four examples, one per major dispatch/gate class (per data-model.md PI-8): Example 1 — end-to-end run on a synthetic 2-phase epic driving to `epic-complete` (shows startup sweep, one clarification batch gate, one implementation-review verdict, one merge, one phase-queue gate, one final `epic-complete` exit summary); Example 2 — clarification batch gate with N=6 open questions (shows the `ceil(N/4) = 2` fanout in one response, three approvals, two skips, one "Other" edit); Example 3 — validate-red with fixer subagent that returns `{fixed: false, reason: "…"}` followed by the G.4a escalation gate with Retry selected; Example 4 — `agent:error` with G.4b escalation gate and Requeue selected calling `cockpit resume`. Each example shows the ledger line(s) written. (data-model.md PI-8)

## Phase 8: Populate error-conv block

- [ ] T025 [US1] Add the fenced `<!-- BEGIN error-conv --> ... <!-- END error-conv -->` error-handling block to `auto.md`, byte-identical to the equivalent block in the six S6 playbooks (canonical source is `packages/claude-plugin-cockpit/README.md` § Error Handling; the block cites it inline). Preserve the error classes (`MISSING_BINARY`, `AUTH`, `NOT_FOUND`, `RATE_LIMIT`, `NETWORK`, `OTHER`) and the "print the exact class + message; no retry loops" rule verbatim. (data-model.md PI-9)

## Phase 9: README table row (parallel with playbook body)

- [ ] T026 [P] [US1] Amend `packages/claude-plugin-cockpit/README.md` § Available Commands table: add exactly one new row for `/cockpit:auto`, positioned at the bottom of the table (after the `/cockpit:merge` row). Row content per contract data-model.md § Part 3 target: `| `/cockpit:auto` | Drive an epic to `epic-complete` — watch transitions, dispatch through CLI verbs + subagents, gate on judgment surfaces. Never merges on red; every gate prompts (no auto-approve). |`. No other change to the README — the overview paragraph (line 7, amended by #390) MUST be byte-identical (`grep -c "no cross-slash-command invocation" README.md` still returns exactly 1). (data-model.md § Part 3, RI-1, RI-2; FI-1)

## Phase 10: Verification — static

- [ ] T027 [P] Run the static-verification grep suite from `quickstart.md` § "Verification — static checks" against `packages/claude-plugin-cockpit/commands/auto.md` and `packages/claude-plugin-cockpit/README.md`. Expected exit conditions: (a) `test -f auto.md` succeeds; (b) all nine dispatch event strings present verbatim (`waiting-for:clarification`, `waiting-for:<artifact>-review`, `waiting-for:implementation-review`, `waiting-for:manual-validation`, `completed:validate`, `agent:error`, `failed:`, `phase-complete`, `waiting-for:address-pr-feedback`); (c) all six invariant phrases present; (d) ledger format sentence + mandatory-per-dispatch rule sentence present; (e) `.generacy/cockpit/auto-runs/` path present; (f) subagent invocation directives present for all four hops (clarification drafter, review analyzer, manual-validation summarizer, bounded fixer); (g) `subagent_type: "general-purpose"` appears ≥ 4 times (or once with reference to all four); (h) fixer verdict schema `{fixed, summary, reason?}` present verbatim; (i) `ceil(N/4)` present; (j) `Approve draft (Recommended)` and `Skip this question` each present ≥ 1; (k) `MUST NOT print raw JSON` clause present exactly once (SBC.3 canonical); (l) README table row for `/cockpit:auto` present; (m) `grep -c "no cross-slash-command invocation" README.md` = 1 (unchanged from #390). Fix any failing check by returning to the responsible task (T002–T026). (quickstart.md static-check section; data-model.md PI-4..PI-9, RI-1..RI-4)

- [ ] T028 [P] Verify sibling-file non-modification with `git diff origin/develop --`: (a) `packages/claude-plugin-cockpit/commands/{clarify,merge,queue,review,status,watch}.md` all show zero changes (invariant §5 + FI-2 defense); (b) `packages/claude-plugin-cockpit/README.md` shows only the one-row addition to § Available Commands — the overview paragraph, § Installation, § Distribution, § Error Handling, § Related, § License sections all byte-identical (RI-2, RI-3). Any diff output on these paths outside the sanctioned changes is a defect — restore from `origin/develop`. (data-model.md FI-2, RI-2, RI-3)

- [ ] T029 [P] Anti-pattern audit: `grep` `auto.md` for the SB.5 anti-patterns. Expected zero occurrences: (a) any `subagent_type` other than `"general-purpose"`; (b) any `/cockpit:*`, `/code-review`, or `/speckit:*` slash-command invocation inside the parent's execution path (matches inside a fenced subagent-prompt quotation, if any, should also be zero — the subagent prompts explicitly MUST NOT invoke a slash command per SB.0.6); (c) any `cockpit advance --skip` or equivalent state-forging call (invariant §3 defense); (d) any `gh pr merge` or direct-merge invocation (only merge primitive is `cockpit merge`); (e) any `AskUserQuestion` outside the four gate types documented in § Gate contract. If any occurrence is found, fix at the source (T002–T025). (subagent-boundaries.md § SB.5 AP-1..AP-12; invariants §1–§6; data-model.md § Part 6 validation rules)

## Phase 11: Verification — behavioral

- [ ] T030 Behavioral check per `quickstart.md` § "Verification — behavioral check (one end-to-end run)": prepare a synthetic 2-phase test epic (each phase with 1–2 child issues; ideally one child with open clarifications, one that will produce implementation-review findings, one with `waiting-for:manual-validation`, and one PR that passes validation on merge). In a fresh Claude Code session with the edited plugin loaded (`pnpm build` then reload plugin config or restart session), invoke `/cockpit:auto <test-epic-ref>`. Confirm: (a) startup-sweep summary lists actionable state; (b) every gate class fires as gate-contract.md specifies (single response with presentation + `AskUserQuestion` — no two-turn splits); (c) every dispatched event produces exactly one ledger line (transcript print + append to the `.ledger` file); (d) exit summary at `epic-complete` matches ledger-line.md § L.6 shape with the ledger file's absolute path; (e) grepping the `.ledger` file for the epic-ref shows every dispatched event. Any failure re-checks the corresponding static invariant and the responsible dispatch/gate section. (SC-002; spec § Acceptance; quickstart.md behavioral-check section; single passing end-to-end run is evidence, not proof — the true verifier is continued live smoke-test corpus usage after merge)

## Phase 12: PR body

- [ ] T031 [P] Draft PR body containing the sibling-non-modification assessment: confirm via `git diff origin/develop -- packages/claude-plugin-cockpit/commands/{clarify,merge,queue,review,status,watch}.md packages/claude-plugin-cockpit/README.md` (excluding the one sanctioned table-row addition) that no sibling file was modified. Include: (a) the one-line summary of the change (new `/cockpit:auto` playbook + one README row); (b) the six invariants transcribed as a checklist confirming each is present in `auto.md`; (c) an explicit note that no `cockpit run-log` CLI verb was requested (Q5=C — the `.ledger` file is the run log); (d) an explicit note that A2 (`cockpit resume`) is a G-S8 prerequisite tracked on generacy#885; (e) the behavioral-run evidence link (test epic + ledger file excerpt from T030). This is a PR-body artifact, not a repo file. (spec § Acceptance; plan.md § Verification Layering; Assumption A2)

## Dependencies & Execution Order

**Sequential within a single file** (all Phase 2–8 tasks touch the same `auto.md` file — sequential to avoid merge conflicts, but the file is being built up section by section so each task's edit is an append to a new region):

- T001 (baseline) → T002 (frontmatter + overview) → T003 (User Input) → T004 (Instructions steps) → T005 (Dispatch header + summary table) → T006–T015 (Dispatch D.1–D.10 subsections, each a distinct region) → T016 (Gate contract header + summary table) → T017–T021 (Gate G.1–G.5 subsections) → T022 (Ledger) → T023 (Invariants) → T024 (Examples) → T025 (error-conv block).

**Parallel opportunities**:

- **T026 [P]** (README table row) is a different file — can run in parallel with any of T002–T025.
- **T027 [P]**, **T028 [P]**, **T029 [P]** are read-only static verifications and can run in parallel with each other, after Phases 2–9 complete.
- **T031 [P]** (PR body draft) can run in parallel with the static checks — it inspects sibling files that Phases 2–9 do not touch.

**Behavioral check**:

- **T030** depends on all edits (T002–T026) being applied and static checks (T027–T029) passing. It requires a live Claude Code session and cannot be parallelized with the edits.

**Suggested execution order**:

1. T001 (baseline)
2. T002 → T003 → T004 (skeleton — same file, sequential)
3. T005 → T006 → T007 → T008 → T009 → T010 → T011 → T012 → T013 → T014 → T015 (Dispatch section — same file, sequential)
4. T016 → T017 → T018 → T019 → T020 → T021 (Gate contract section — same file, sequential)
5. T022 (Ledger) → T023 (Invariants) → T024 (Examples) → T025 (error-conv) (same file, sequential)
6. T026 [P] can be done at any point after T001 (different file)
7. T027, T028, T029, T031 in parallel (all read-only, all independent, after step 5 + T026 complete)
8. T030 (behavioral — requires all prior work applied)

## Notes

- One new file is created (`packages/claude-plugin-cockpit/commands/auto.md`) and one existing file is edited (`packages/claude-plugin-cockpit/README.md`, one table row added). No sibling playbook edits.
- No runtime code, no schema, no CLI wiring — this is a playbook addition (like #388 / #390).
- The one hard prerequisite tracked in Assumption A2 (`generacy cockpit resume <issue-ref>`) belongs to G-S8's scope, not this feature's — the playbook handles the missing-verb case by degrading Requeue to Skip with an explicit ledger note (see T012 / T020 mechanism sentences).
- SC-002 is measured against the persistent `.ledger` file (T022, T030 evidence): every dispatched event has exactly one ledger line, greppable in the file. Adherence is probabilistic — the design removes the class of drift by construction (thin parent loop, analysis in subagents, fused gates, mandatory ledger), but confirmation is empirical.
- After tasks complete, suggested next step: `/speckit:implement` to execute T001–T031 end-to-end, or manual application task-by-task.
