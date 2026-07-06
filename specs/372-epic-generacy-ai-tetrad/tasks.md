## Tasks: claude-plugin-cockpit six-command rewrite

**Input**: Design documents from `/specs/372-epic-generacy-ai-tetrad/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, quickstart.md, contracts/ (7 files)
**Status**: Complete
**Mode**: Epic (coarse-grained task groups)

## Format: `[ID] [P?] [Story] Description`
- **[P]**: Task group can run in parallel with other `[P]` groups in the same phase
- **[Story]**: Which user story this task group addresses

## Phase 1: Foundation (canonical sources + cleanup)

### TG-001 [US5] Task Group: Rewrite plugin README as canonical source-of-truth
**Scope**: 3–4 hours estimated
**Files**: `packages/claude-plugin-cockpit/README.md`
**Tests**: Static grep checks (SC-005 references, SC-006 stale copy)

- [X] Rewrite Overview paragraph — drop the stale "coming in #351–#360" copy; name the six commands (data-model.md §Entity 4).
- [X] Retain / normalize `## Installation` section — marketplace install via `extraKnownMarketplaces` JSON snippet (research.md Decision 8).
- [X] Rewrite `## Available Commands` — 6-row table (watch, status, queue, clarify, review, merge) with one-line descriptions matching each command's `---description` frontmatter.
- [X] Author `## Error Handling` — canonical prose form of the three-class convention (`MISSING_BINARY` / `AUTH_FAILURE` / `OTHER`) with the `npm install -g @generacy-ai/cli` and `gh auth login` one-liners (data-model.md §Entity 3, research.md Decision 5). This is the source-of-truth that every command file's inlined block cites.
- [X] Verify: `grep -F 'coming in #351' README.md` returns nothing (SC-006). `## Available Commands` table has exactly 6 data rows.

---

### TG-002 [P] Task Group: Delete obsolete command files
**Scope**: 30 min – 1 hour estimated (small but bundled with commit-hygiene checks)
**Files**: `packages/claude-plugin-cockpit/commands/plan.md`, `commands/breakdown.md`, `commands/file.md`, `commands/bug.md`
**Tests**: `ls packages/claude-plugin-cockpit/commands/*.md | wc -l` returns 6 after Phase 2

- [X] `git rm packages/claude-plugin-cockpit/commands/plan.md` (out of six-command set — /speckit:* responsibility).
- [X] `git rm packages/claude-plugin-cockpit/commands/breakdown.md`.
- [X] `git rm packages/claude-plugin-cockpit/commands/file.md` (nice-to-have, dropped).
- [X] `git rm packages/claude-plugin-cockpit/commands/bug.md` (nice-to-have, dropped; use `gh issue create` directly).
- [X] Verify no stray references to these verbs remain in the plugin (grep `/cockpit:plan`, `/cockpit:breakdown`, `/cockpit:file`, `/cockpit:bug` inside `packages/claude-plugin-cockpit/`).

---

## Phase 2: Command rewrites
<!-- Phase boundary: Complete Phase 1 (README canonical section) before starting — every command file inlines the byte-identical error convention derived from the README §Error Handling section. -->

### TG-003 [P] [US1] Task Group: Rewrite `watch.md`
**Scope**: 2–3 hours estimated
**Files**: `packages/claude-plugin-cockpit/commands/watch.md`
**Tests**: `wc -l watch.md` ≤ ~20 hard cap ~30 (SC-004); byte-identical error block (SC-005); no `specs/`, `PushNotification`, `autonomy-policy`, `transition.schema` refs (SC-002); contracts/watch.contract.md

- [X] Author YAML frontmatter — `description`, one positional `<epic-ref>` argument.
- [X] Draft body: run `generacy cockpit watch <epic-ref>` as a long-running Bash command; per stdout line print one notification with the suggested next `/cockpit:*` command using the static mapping table (research.md Decision 2, data-model.md §Entity 2).
- [X] Embed the ~5-row Markdown mapping table: `waiting-for:clarification` → `/cockpit:clarify` · `waiting-for:<gate>-review` → `/cockpit:review --gate <gate>` · `completed:validate` or all-green → `/cockpit:merge` · error states → no suggestion.
- [X] Inline the byte-identical error convention block (from TG-001 README canonical source) with the `<!-- Canonical source of truth: ... -->` comment.
- [X] Verify: no policy lookup, no dedupe/baseline handling, no `PushNotification`, no `seen` set (FR-007); on watcher exit reports and stops (FR-006).
- [X] Final line-count trim to hit the ~20-line target.

---

### TG-004 [P] [US2] Task Group: Rewrite `status.md` + `queue.md` (terse renders)
**Scope**: 3–4 hours estimated
**Files**: `packages/claude-plugin-cockpit/commands/status.md`, `packages/claude-plugin-cockpit/commands/queue.md`
**Tests**: byte-identical error block (SC-005); no `specs/` or `.generacy/epics/` chain (SC-002, FR-008); contracts/status.contract.md, contracts/queue.contract.md

- [X] `status.md`: author frontmatter with optional `<epic-ref>` argument; body renders `generacy cockpit status <args>` output.
- [X] `status.md`: with no argument, print the CLI's usage line and exit — NO `.generacy/epics/` resolution chain (research.md Decision 1; that directory no longer exists).
- [X] `queue.md`: author frontmatter with one positional `<phase>` argument; retain `AskUserQuestion` Confirm/Cancel gate as the mutating "go" trigger (FR-009).
- [X] `queue.md`: on `Confirm`, invoke `generacy cockpit queue <phase>` and render stdout; on `Cancel`, exit without side effects.
- [X] Inline the byte-identical error convention block into BOTH files (with the canonical-source comment). This is the byte-identical block established in TG-001.
- [X] Verify: neither command references `specs/**` contracts; both use only the `generacy` CLI (FR-005).

---

### TG-005 [P] [US3] Task Group: Rewrite `review.md` (gate handling + direct advance)
**Scope**: 3–4 hours estimated
**Files**: `packages/claude-plugin-cockpit/commands/review.md`
**Tests**: byte-identical error block (SC-005); no `/cockpit:advance` refs (SC-002); `/code-review` invocation only under `--gate impl` (FR-005 exception); contracts/review.contract.md

- [X] Author frontmatter with required `--gate <gate-name>` argument.
- [X] Body — `--gate impl` branch: invoke Claude Code's built-in `/code-review` slash command (single documented cross-slash-command exception, research.md Decision 3).
- [X] Body — other-gate branch: summarize the review artifact terse-style (FR-005; no cross-slash-command invocation for non-impl gates).
- [X] On approval, call `generacy cockpit advance --gate <g>` **directly via the Bash tool** (research.md Decision 7). Replace any lingering `/cockpit:advance` reference — the unshipped verb is deleted.
- [X] Inline the byte-identical error convention block with the canonical-source comment.
- [X] Verify: no `/cockpit:advance` reference remains anywhere in the file; `/code-review` invocation ONLY inside the `impl` branch.

---

### TG-006 [P] [US4] Task Group: Rewrite `clarify.md` (assist loop)
**Scope**: 4–6 hours estimated
**Files**: `packages/claude-plugin-cockpit/commands/clarify.md`
**Tests**: byte-identical error block (SC-005); no `specs/**` refs (SC-002); calls `generacy cockpit context` not `clarify-context` (FR-010); contracts/clarify.contract.md

- [X] Author frontmatter with optional `<epic-ref>` argument.
- [X] Body step 1: call `generacy cockpit context` (renamed successor to `clarify-context` — the old verb no longer exists) to gather grounded repo context.
- [X] Body step 2: for each open clarification question, draft a grounded answer using the fetched context.
- [X] Body step 3: per-question approval loop via `AskUserQuestion` (Approve / Edit / Skip); on Edit, re-draft; on Skip, mark as unanswered.
- [X] Body step 4: on approval of all answers, post a marked comment (e.g., `<!-- speckit-clarify -->`) to the target issue.
- [X] Body step 5: on successful post, call `generacy cockpit advance` via Bash to move the phase forward.
- [X] Inline the byte-identical error convention block with the canonical-source comment.
- [X] Verify: no `specs/**` (feature-branch) contract references; no `clarify-context` references (renamed); no `/cockpit:*` invocation.

---

### TG-007 [P] [US1] Task Group: Rewrite `merge.md` (bounded fixer subagent, never-red-merge)
**Scope**: 4–6 hours estimated
**Files**: `packages/claude-plugin-cockpit/commands/merge.md`
**Tests**: byte-identical error block (SC-005); invariant "never merges on red" (FR-011); `--max-fix-attempts` default 1; contracts/merge.contract.md

- [X] Author frontmatter with optional positional `<pr-ref>` and optional `--max-fix-attempts <N>` (default 1) argument.
- [X] Body step 1: resolve PR ref (from arg or current branch's open PR); print PR summary.
- [X] Body step 2: poll CI status; if green → merge and exit; if red → proceed to fixer flow only if `--max-fix-attempts > 0`.
- [X] Body step 3 (fixer flow): classify red checks — if any failure is infrastructure/runner class, abort with a clear message WITHOUT burning an attempt (research.md Decision 4). Only tests / lint / typecheck / build failures qualify for the fixer.
- [X] Body step 4 (fixer flow): spawn a bounded fixer subagent to attempt a fix, push, and re-check. One attempt = one invocation that pushes and triggers a re-check.
- [X] Body step 5: re-poll after fixer runs; on green merge; on still-red, decrement attempts and repeat; when attempts exhausted, abort with a summary of remaining red checks. Never merge on red (invariant).
- [X] Inline the byte-identical error convention block with the canonical-source comment.
- [X] Verify: no CLI flag or subagent path can produce a merge-on-red.

---

## Phase 3: Validation
<!-- Phase boundary: All command files must exist and be finalized before running the invariant checks. -->

### TG-008 Task Group: Verify success criteria + fresh-session smoke test
**Scope**: 2–3 hours estimated
**Files**: `packages/claude-plugin-cockpit/commands/*.md`, `packages/claude-plugin-cockpit/README.md`
**Tests**: All six success criteria (SC-001 through SC-006) + FR-004 fresh-session runnability (SC-003)

- [X] SC-001: `ls packages/claude-plugin-cockpit/commands/*.md | wc -l` returns exactly 6.
- [X] SC-002: `grep -rE 'specs/|/cockpit:advance|autonomy-policy|transition\.schema|PolicyEntry|PushNotification' packages/claude-plugin-cockpit/commands/*.md` returns nothing. Additionally verify `/code-review` appears ONLY in `review.md`.
- [X] SC-004: `wc -l packages/claude-plugin-cockpit/commands/watch.md` ≤ ~30 (target ~20).
- [X] SC-005: for each pair of command files, diff the inlined error-convention block (bracketed by `<!-- BEGIN error-conv -->` / `<!-- END error-conv -->` or equivalent sentinel) — expect zero differences across all six pairs.
- [X] SC-006: `grep -F 'coming in #351' packages/claude-plugin-cockpit/README.md` and `grep -F 'coming in #351–#360' README.md` both return nothing.
- [ ] SC-003 (manual smoke) [manual]: from a fresh Claude Code session with only the plugin + `gh auth` + `generacy` CLI installed, run each of the six commands per the quickstart golden path; each command must produce output (no silent failures) and exhibit the shared error-classification behavior when the CLI is deliberately missing or unauthenticated.
- [X] Cross-check: no `.md` file in `commands/` other than the six named files (no `_errors.md`, no leftover `plan.md` etc.).

---

## Dependencies & Execution Order

**Phase boundaries** (sequential):
- Phase 1 → Phase 2 → Phase 3 (must complete in order).

**Phase 1 internal ordering**:
- TG-001 (README canonical Error Handling section) MUST land before Phase 2 begins — every Phase 2 command file inlines a byte-identical block derived from it.
- TG-002 (deletions) has no data dependency on TG-001 and can run in parallel (`[P]`) with TG-001.

**Phase 2 parallelism** (all five task groups can run in parallel, `[P]`):
- TG-003, TG-004, TG-005, TG-006, TG-007 touch disjoint command files, share only the READ dependency on TG-001's canonical error block, and have no cross-task ordering.
- Suggested parallelization: five agents, one per task group. Each pastes the same byte-identical error block established in TG-001.

**Phase 3**:
- TG-008 requires all Phase 2 groups complete (validates outputs of all six command files + the README from TG-001).

**Suggested wall-clock**:
- Phase 1: ~4 hours (TG-001 dominates; TG-002 runs concurrently).
- Phase 2: ~4–6 hours wall-clock if run in parallel across five agents.
- Phase 3: ~2–3 hours.
- **Total**: ~10–13 hours wall-clock with parallelism; ~18–27 hours if serial.
