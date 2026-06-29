# Tasks: `/cockpit:queue` command (Epic Cockpit A4.4)

**Input**: Design documents from `/specs/359-epic-generacy-ai-tetrad/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, contracts/command.md
**Status**: Complete

## Format: `[ID] [P?] [Story] Description`
- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story / acceptance this task belongs to (single story: A4.4 — "Queues a phase after confirmation")

## Phase 1: Pre-flight & Dependency Verification

- [X] T001 Verify `AskUserQuestion` primitive is available in the target Claude Code environment (per plan.md Phase 0 §1; sibling `packages/claude-plugin-cockpit/commands/review.md` already uses it — confirm by reading the deferred-tools list)
- [ ] T002 [P] Verify `generacy` CLI is on `$PATH` for local manual validation (`command -v generacy`); not a blocker for shipping the file, but required for Phase 3 manual checks (plan.md Phase 0 §2)
- [X] T003 [P] Read the style-template sibling `packages/claude-plugin-cockpit/commands/status.md` end-to-end and capture the exact byte sequences for the `MISSING_BINARY` and `AUTH_FAILURE` lines (contracts/command.md § Error — `MissingBinary`, `AuthFailure` require byte-identical copies)
- [X] T004 [P] Read the confirm-gate sibling `packages/claude-plugin-cockpit/commands/review.md` (or `merge.md`) to confirm the `AskUserQuestion` invocation pattern used elsewhere in the cockpit plugin (plan.md Phase 0 §1; research D2)

## Phase 2: Author the verb file

- [X] T010 [A4.4] Create `packages/claude-plugin-cockpit/commands/queue.md` with YAML frontmatter: `description:` (one-line palette summary) and `arguments:` declaring a single required positional `phase: string` pointing the user at `generacy cockpit queue --help` for the phase enum (plan.md Phase 1 §1)
- [X] T011 [A4.4] In `packages/claude-plugin-cockpit/commands/queue.md`, implement the argument-handling block: read `$ARGUMENTS`, trim outer whitespace, tokenize on whitespace; if zero tokens OR ≥2 tokens emit literal `Usage: /cockpit:queue <phase>` and exit non-zero with no prompt; otherwise capture the single token as `<phase>` byte-for-byte (FR-002, FR-010, clarification Q3=A; data-model.md E1; contracts § Structural validation)
- [X] T012 [A4.4] In `packages/claude-plugin-cockpit/commands/queue.md`, implement the confirmation gate: invoke `AskUserQuestion` with `question` = literal string ``Run `generacy cockpit queue <phase>`?``, `header` = `Queue phase`, `multiSelect: false`, and exactly two options in order — `{label: "Confirm", description: "Run the CLI"}` then `{label: "Cancel", description: "Abort without queueing"}` (clarifications Q1=A, Q4=A; data-model.md E2, E3)
- [X] T013 [A4.4] In `packages/claude-plugin-cockpit/commands/queue.md`, implement the affirmative-test branch: only the literal return string `Confirm` proceeds; any other selection (`Cancel`, "Other", null, aborted prompt) emits `Cancelled: /cockpit:queue <phase>` on one line, no fenced block, exit non-zero, and MUST NOT invoke the CLI (data-model.md E2 affirmative table; contracts § Cancelled; research D9)
- [X] T014 [A4.4] In `packages/claude-plugin-cockpit/commands/queue.md`, implement the pre-flight + CLI invocation block (reached only after `Confirm`): run `command -v generacy >/dev/null 2>&1`; on non-zero branch to `MissingBinary` (T016) without invoking the CLI; on zero run `generacy cockpit queue <phase>` from the repository root via Bash, capturing stdout/stderr/exit code in separate variables, no flags (plan.md Phase 1 §4; research D7; data-model.md E4)
- [X] T015 [A4.4] In `packages/claude-plugin-cockpit/commands/queue.md`, implement the success rendering for CLI exit `0`: emit the literal header line `**Queued:** <phase>`, one blank line, then captured stdout inside a triple-backtick fenced code block — verbatim, no reflow / reformat / re-decoration (clarification Q2=A; data-model.md E5; contracts § Success)
- [X] T016 [A4.4] In `packages/claude-plugin-cockpit/commands/queue.md`, implement the three-class error rendering (first match wins, no silent no-op): (a) `MISSING_BINARY` — the byte-identical line from `/cockpit:status` captured in T003; (b) `AUTH_FAILURE` — CLI exit ≠ 0 AND stderr matches `/auth|unauthorized|401|gh auth/i` case-insensitive, emit the byte-identical line from `/cockpit:status` captured in T003; (c) `OTHER` — fallback, emit `CLI failed with exit code <N>.` on one line followed by captured stderr inside a triple-backtick fenced block (research D6, D8; data-model.md E6; contracts § Error sections)

## Phase 3: Manual validation

- [ ] T020 [A4.4] Install the plugin locally, then exercise the affirmative success path: `/cockpit:queue plan` (or any phase the CLI accepts) → select `Confirm` → verify the CLI ran AND the output was rendered under `**Queued:** plan` with the CLI's stdout in a fenced block AND exit code is zero (plan.md Phase 3 §1)
- [ ] T021 [P] [A4.4] Verify the confirmation prompt copy: when the prompt appears, the `question` field reads exactly ``Run `generacy cockpit queue plan`?`` byte-for-byte (plan.md Phase 3 §2; clarification Q4=A)
- [ ] T022 [P] [A4.4] Exercise the cancel path: `/cockpit:queue plan` → select `Cancel` → verify (a) the CLI was NOT invoked AND (b) the only output is the one-line `Cancelled: /cockpit:queue plan` AND (c) exit is non-zero (plan.md Phase 3 §3; clarification Q1=A)
- [ ] T023 [P] [A4.4] Exercise multi-arg rejection: `/cockpit:queue plan tasks` → verify literal `Usage: /cockpit:queue <phase>` is printed, exit is non-zero, and no `AskUserQuestion` prompt was shown (plan.md Phase 3 §4; clarification Q3=A)
- [ ] T024 [P] [A4.4] Exercise zero-arg rejection: `/cockpit:queue` (no args) → same `Usage:` line, same non-zero exit, no prompt (plan.md Phase 3 §5; FR-010)
- [ ] T025 [P] [A4.4] Exercise `MISSING_BINARY` path: temporarily move `generacy` off `$PATH` (e.g., `env -i bash` or rename in a throwaway shell), run `/cockpit:queue plan` → `Confirm` → verify the `MISSING_BINARY` text matches `/cockpit:status`'s line byte-for-byte (plan.md Phase 3 §6)
- [ ] T026 [P] [A4.4] Exercise the `OTHER` error class: `/cockpit:queue not-a-phase` → `Confirm` → verify a single `CLI failed with exit code <N>.` line followed by a fenced stderr block surfacing the CLI's own error (plan.md Phase 3 §7; research D6)
- [ ] T027 [A4.4] Cross-path output-discipline audit: across T020–T026, confirm each path emits exactly one terse line OR one fenced block (plus the one-line `**Queued:** <phase>` header on success) — no chatty narration, no double summaries (plan.md Phase 3 §8; SC-002)
- [ ] T028 [A4.4] Isolation check: `git diff --stat` against the branch base shows changes only to `packages/claude-plugin-cockpit/commands/queue.md` (and optionally a one-line README row touch-up — see T030); no other files modified (plan.md Phase 3 §9; spec.md § Summary "Owns (isolation)")

## Phase 4: Optional polish

- [X] T030 [P] [A4.4] (Optional) Flip the `/cockpit:queue` row in `packages/claude-plugin-cockpit/README.md` from any placeholder / "coming soon" state to a one-line live description matching the sibling rows' tone (plan.md Phase 2; can ship in a follow-up if deferred)

## Dependencies & Execution Order

**Sequential within Phase 2** (single file, ordered edits to the same `queue.md`):

```
T010 (frontmatter) → T011 (arg handling) → T012 (confirm gate) → T013 (affirmative test / cancel branch)
                                                              ↓
                                                              T014 (pre-flight + CLI call) → T015 (success rendering)
                                                                                          ↘ T016 (error rendering)
```

**Phase boundaries**:
- Phase 1 (pre-flight + reference reads) must complete before Phase 2 starts — T003 specifically gates T016 (it captures the byte sequences T016 must reproduce verbatim).
- Phase 2 must complete (T010–T016) before Phase 3 manual validation — there's nothing to test until `queue.md` exists.
- Phase 4 is independent and can run in parallel with Phase 3 (T030 touches a different file).

**Parallel opportunities**:
- Phase 1: T002, T003, T004 run in parallel after T001 confirms the host primitive exists. T001 is sequential because if `AskUserQuestion` is unavailable the entire approach (clarification Q1=A) is blocked.
- Phase 2: All T0XX edit the same file (`queue.md`) and MUST be sequential — no `[P]` markers in this phase.
- Phase 3: T021–T026 each exercise an independent input/output path and can run in any order or in parallel. T020 (the affirmative success path) is the load-bearing acceptance check and should run first. T027 (output-discipline audit) and T028 (isolation check) MUST wait for all earlier validation tasks to complete.
- Phase 4: T030 is `[P]` with respect to Phase 3 (separate file, no shared state).

## Notes

- This feature has a **single user story / acceptance criterion** (spec.md "Acceptance: Queues a phase after confirmation"); all implementation tasks are tagged `[A4.4]` rather than `[US1]` to match the issue's identifier in the parent epic plan (`docs/epic-cockpit-plan.md` P4 / A4.4 in `tetrad-development`).
- Per spec.md § Summary isolation declaration, the only file this issue may modify is `packages/claude-plugin-cockpit/commands/queue.md`. The optional T030 README touch-up is explicitly called out in plan.md Phase 2 as "cosmetic; if deferred, it can ship in a follow-up" and is the single permitted exception.
- No TDD task in Phase 2 — there is no test harness for plugin verb files in this repo (the spec's Testing field reads "Manual end-to-end after plugin install"). Phase 3 is the test plan; if a future PR adds a verb-file test harness, this tasks.md should be regenerated with TDD ordering.

---

*Generated by speckit*
