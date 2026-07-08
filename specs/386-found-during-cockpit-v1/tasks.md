# Tasks: Interpolate the issue ref into every watch-playbook suggestion

**Input**: Design documents from `/specs/386-found-during-cockpit-v1/`
**Prerequisites**: plan.md (required), spec.md (required), clarifications.md, research.md, contracts/watch-command.contract.md, quickstart.md
**Status**: Complete

## Format: `[ID] [P?] [Story] Description`
- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (all substantive edits map to US1 — the one-keystroke handoff)

## Scope reminder

One file edited: `packages/claude-plugin-cockpit/commands/watch.md`. Four discrete edits in bottom-up order (per quickstart §Apply the fix, to minimize line-number churn between edits). Then a batch of deterministic greps + a diff check + a scope check, followed by manual smoke tests. Zero code changes.

## Phase 1: Setup

- [X] T001 Confirm working state: on branch `386-found-during-cockpit-v1`, `git status` clean; open `packages/claude-plugin-cockpit/commands/watch.md` and `specs/386-found-during-cockpit-v1/contracts/watch-command.contract.md` side by side for the edits.

## Phase 2: Core Implementation

All four edits touch the same file; they MUST run sequentially in the order below (bottom-up per quickstart §Apply the fix). None are parallelizable.

- [X] T002 [US1] **Edit 1 — Insert "Suggestion format" anchor line** immediately after the mapping table's last row (`| any \`error\` / \`failed\` state | (no suggestion) |`) and before the `<!-- BEGIN error-conv -->` marker, separated by blank lines on both sides. Content is the verbatim block from `contracts/watch-command.contract.md §5`. File: `packages/claude-plugin-cockpit/commands/watch.md`.
- [X] T003 [US1] **Edit 2 — Rewrite all seven "Suggested next command" cells** in the verb mapping table to insert `<ref>` between the verb and any `--gate` flag, per `contracts/watch-command.contract.md §4`. Rows to update: `waiting-for:clarification` → `` `/cockpit:clarify <ref>` ``; the five `waiting-for:*-review` rows → `` `/cockpit:review <ref> --gate <gate>` ``; `completed:validate` → `` `/cockpit:merge <ref>` ``. Leave the error row unchanged. File: `packages/claude-plugin-cockpit/commands/watch.md`.
- [X] T004 [US1] **Edit 3 — Rewrite step 2's emit rule** to (a) interpolate the transition line's own ref verbatim in qualified `owner/repo#N` form, (b) wrap the invocation in a single-backtick inline code span, (c) include both examples (`` `/cockpit:merge owner/repo#2` `` and `` `/cockpit:review owner/repo#3 --gate implementation-review` ``), (d) omit ` · suggested: …` for both error rows and any non-error row with no ref, and (e) append the "Do NOT compare / strip / resolve scope" clause. Content is the verbatim block from `contracts/watch-command.contract.md §3`. File: `packages/claude-plugin-cockpit/commands/watch.md`.
- [X] T005 [US1] **Edit 4 — Update H1 top prose** under `# Watch Command`: replace "suggesting the next `/cockpit:*` verb" with "with the complete next-command invocation (verb + ref)" and append the rationale clause "so the suggestion can be copy-pasted straight into the prompt without editing." Content is the verbatim replacement from `contracts/watch-command.contract.md §2`. File: `packages/claude-plugin-cockpit/commands/watch.md`.

## Phase 3: Deterministic Verification

All greps and the diff run against the edited `watch.md` from repo root. These can be executed together in one batch (they are independent read-only checks); mark `[P]` accordingly.

- [X] T006 [P] [US1] **Regression grep — bare-verb form fully gone**: `grep -c '\`/cockpit:review --gate' packages/claude-plugin-cockpit/commands/watch.md` MUST report `0`. (Guards FR-004.)
- [X] T007 [P] [US1] **Placeholder coverage grep**: `grep -c '<ref>' packages/claude-plugin-cockpit/commands/watch.md` MUST report ≥ `7` (one per non-error mapping-table row plus additional occurrences in step 2 prose and §5 anchor). (Guards FR-004.)
- [X] T008 [P] [US1] **Emit-rule normative-phrase greps**: `grep -c "verbatim as the CLI emits it" watch.md` MUST report `1`; `grep -c "single-backtick inline code span" watch.md` MUST report `1`; `grep -c "Do NOT compare the transition's repo" watch.md` MUST report `1`; `grep -c "non-error row that carries no ref" watch.md` MUST report `1`. (Guards FR-002, FR-003, FR-007, and the "Do NOT" lockout.) File: `packages/claude-plugin-cockpit/commands/watch.md`.
- [X] T009 [P] [US1] **Worked-example greps** (step 2 both examples present verbatim): `grep -c '· suggested: \`/cockpit:merge owner/repo#2\`' watch.md` MUST report ≥ `1`; `grep -c '· suggested: \`/cockpit:review owner/repo#3 --gate implementation-review\`' watch.md` MUST report ≥ `1`. (Guards FR-001, FR-002.) File: `packages/claude-plugin-cockpit/commands/watch.md`.
- [X] T010 [P] [US1] **Anchor-line greps**: `grep -c '^\*\*Suggestion format\*\*:' watch.md` MUST report `1`; `grep -c "the emit rule and the table share one format" watch.md` MUST report `1`. (Guards FR-005 anchor.) File: `packages/claude-plugin-cockpit/commands/watch.md`.
- [X] T011 [P] [US1] **Error-conv byte-identical diff (#378 invariant)**: `diff <(sed -n '/<!-- BEGIN error-conv -->/,/<!-- END error-conv -->/p' packages/claude-plugin-cockpit/commands/watch.md) <(sed -n '/<!-- BEGIN error-conv -->/,/<!-- END error-conv -->/p' packages/claude-plugin-cockpit/commands/review.md)` MUST produce empty output. Non-empty output means the fix accidentally touched the error-conv block.
- [X] T012 [P] [US1] **Scope guard**: `git diff --stat --name-only develop...HEAD -- packages/claude-plugin-cockpit/` MUST list exactly `packages/claude-plugin-cockpit/commands/watch.md` on a single line — no sibling command files, no README edits, no CLI edits.

## Phase 4: Manual smoke tests

Requires a Claude Code session with the plugin installed (locally linked from this checkout or from a preview publish), the `generacy` CLI on `$PATH`, `gh` authenticated, and an active epic with a running watcher. The tetrad-development#88 finding #23 baseline used `christrudelpw/sniplink`.

- [ ] T013 [US1] **Smoke test A — copy-paste executability** (SC-001, SC-002, SC-003): run `/cockpit:watch <epic-ref>` in a Claude Code session; wait for a non-error transition line; verify the ` · suggested: …` segment is a single-backtick inline code span containing `/cockpit:<verb> <ref> [flags]` with a qualified `owner/repo#N` ref; select the code-span text, paste it verbatim into the same session's prompt, and confirm the CLI dispatches it without editing.
- [ ] T014 [US1] **Smoke test B — refless / error-row omission** (SC-004): in the same watch session, verify no ` · suggested: …` segment renders on (a) refless non-error lines such as `watcher started` banners and (b) error-state rows (`error` / `failed` markers or a failed `waiting-for:*` gate). If neither case naturally arises, rely on greps T008 and T012 which enforce the emit-rule clauses at the source.
- [ ] T015 [P] [US1] **Optional — AUTH_FAILURE parity spot-check**: run `/cockpit:watch <epic-ref>` with `GH_TOKEN=""`. Confirm the emitted text matches `packages/claude-plugin-cockpit/README.md § Error Handling` verbatim, which confirms (a) the error-conv block is untouched and (b) the suggestion-emission changes did not leak into the error-handling path.

## Phase 5: Ship

- [X] T016 [US1] **Commit**: single commit on `386-found-during-cockpit-v1` with `packages/claude-plugin-cockpit/commands/watch.md` as the only file changed. Commit message names the fix (interpolate qualified `owner/repo#N` ref into every non-error suggestion; wrap in single-backtick code span; update mapping table with `<ref>` placeholder; add "Suggestion format" anchor line) and references `#386`.
- [ ] T017 [US1] **Open PR** targeting `develop`. PR body summarizes the four edits and links `#386`, `#378` (error-conv invariant), `generacy#822`/`#850` (qualified-ref executability). Include the Phase 3 grep + diff results as the local verification block.

## Dependencies & Execution Order

- **Phase 1 → Phase 2 → Phase 3 → Phase 4 → Phase 5** are strictly sequential.
- Within **Phase 2** (edits 1–4), each edit is on the same file and MUST run sequentially in the T002 → T005 order (bottom-up per quickstart §Apply the fix to minimize line-number churn).
- Within **Phase 3**, all deterministic checks (T006–T012) are independent read-only greps/diffs and can run in parallel `[P]`.
- Within **Phase 4**, T013 and T014 both consume the same live watch session and are best run in one manual session (sequentially); T015 (AUTH_FAILURE) is independent and marked `[P]`.
- **Phase 5** cannot start until every Phase 3 check passes and Phase 4 smoke tests have been observed at least once.

## Parallel opportunities identified

- **Phase 3** — 7 checks (T006–T012) can be batched as parallel bash invocations from a single verification pass; failure of any one halts the phase and returns to Phase 2 for reconciliation against `contracts/watch-command.contract.md`.
- **Phase 4** — T015 is `[P]` (separate CLI invocation, no shared session state with T013/T014).

## Story mapping

- **US1** (the primary user story — one-keystroke handoff from watch suggestion to executable invocation) is the only substantive story in `spec.md`. Every T002–T017 task maps to US1 either as the fix itself (Phase 2), its correctness gate (Phases 3, 4), or its ship path (Phase 5).

---

*Generated by /tasks for issue [generacy-ai/agency#386](https://github.com/generacy-ai/agency/issues/386)*
