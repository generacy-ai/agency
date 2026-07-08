# Implementation Plan: Interpolate the issue ref into every watch-playbook suggestion so it is a one-keystroke handoff

**Feature**: Rewrite the suggestion-emission rule in `packages/claude-plugin-cockpit/commands/watch.md` so that every non-error transition line's ` · suggested: …` segment carries the complete `/cockpit:<verb> <ref> [flags]` invocation — with the qualified `owner/repo#N` ref interpolated verbatim from the transition line and the whole invocation wrapped in a single-backtick inline code span for copy-paste executability. The verb mapping table's "Suggested next command" column is updated in the same edit to match the runtime format using a `<ref>` placeholder.
**Branch**: `386-found-during-cockpit-v1`
**Status**: Complete
**Spec**: [spec.md](spec.md) · **Clarifications**: [clarifications.md](clarifications.md)

## Summary

Found during the cockpit v1 integration smoke test ([generacy-ai/tetrad-development#88](https://github.com/generacy-ai/tetrad-development/issues/88), finding #23) — the first fully-working watch session revealed a UX gap: the playbook's per-transition suggestion strings omit the issue ref. Transitions render as `<transition-line> · suggested: /cockpit:review --gate implementation-review`, which forces the operator to mentally re-assemble the actual invocation from the verb and a separately displayed ref before typing it. The suggestion exists to be a one-keystroke handoff; without the ref it is not executable.

**Fix**: `packages/claude-plugin-cockpit/commands/watch.md` is edited so that (a) step 2's emission rule interpolates the transition line's ref (in its qualified `owner/repo#N` form) into every non-error suggestion, producing the complete invocation (`/cockpit:merge owner/repo#2`, `/cockpit:review owner/repo#3 --gate implementation-review`, etc.); (b) the whole suggestion is wrapped in a single-backtick inline code span so the chat surface renders it as a copyable unit (the strongest copy affordance available in a Markdown playbook — there is no true click-to-copy in `/cockpit:*` command output); and (c) the verb mapping table's "Suggested next command" column is updated so the invocation shape it shows (`/cockpit:review <ref> --gate implementation-review`) matches the runtime format the playbook is required to emit. The refless-non-error and error-row cases both omit the ` · suggested: …` segment (spec FR-006, FR-007).

**Zero code changes**. One Markdown file edited, three sections touched (step 2 prose, the mapping-table cell content across seven rows, and — new — a short "Suggestion format" line that anchors the emit rule for future readers). The `<!-- BEGIN error-conv -->` / `<!-- END error-conv -->` block established by [#378](https://github.com/generacy-ai/agency/issues/378) is preserved byte-for-byte; the byte-identical invariant across cockpit command files is not disturbed.

**Playbook does not resolve scope, does not compare cwd/origin, does not detect repos** (clarifications Q2/Q3): the playbook interpolates the transition line's own ref verbatim. The NDJSON transition-line schema emitted by `generacy cockpit watch` guarantees a ref on every actionable transition, and every actionable transition is child-scoped (the line's repo+number IS the subject; there is no epic-level rollup PR in this design), so the playbook needs no scope awareness. The qualified `owner/repo#N` form is executable in every session cwd per [generacy#822](https://github.com/generacy-ai/generacy/issues/822) / [#850](https://github.com/generacy-ai/generacy/issues/850), so the suggestion works regardless of where the operator's shell is rooted.

**Ownership**: `packages/claude-plugin-cockpit/commands/watch.md` only. No CLI edits, no changes to `generacy cockpit watch`'s output format, no changes to sibling `commands/*.md`. Retroactively adjusting suggestion-line formatting in `status.md`, `queue.md`, or other cockpit commands is out of scope §6 — those are separate playbooks with different output contracts.

## Technical Context

**Language/Version**: Markdown (CommonMark) — Claude Code prompt commands are Markdown files consumed by the harness at command-invocation time. No JavaScript, TypeScript, or shell scripts change.

**Primary Dependencies**: None. This feature ships no runtime code.
- The `generacy` CLI (`@generacy-ai/generacy`) is invoked by `watch.md`'s step 2 (`generacy cockpit watch $ARGUMENTS`), unchanged from the current file; this feature does not modify that invocation.
- No new `gh` invocations, no new tool calls, no new sub-commands. The playbook still consumes CLI stdout line by line and emits one notification per line — the only change is the shape of the notification.
- The qualified-ref executability guarantee that lets FR-003 skip cwd/origin comparison is a property of the `generacy` CLI's argument parser ([generacy#822](https://github.com/generacy-ai/generacy/issues/822) / [#850](https://github.com/generacy-ai/generacy/issues/850)); this feature does not depend on any new CLI behavior.

**Storage**: None. The suggestion is text emitted to the session's chat surface.

**Testing**:
- **Local (deterministic)** — greps from repo root:
  1. `grep -n "· suggested: \`/cockpit:" packages/claude-plugin-cockpit/commands/watch.md` MUST report ≥ 1 hit — the emit-rule example inside step 2 (or the "Suggestion format" line) demonstrates the backtick-wrapped `/cockpit:<verb> <ref>` shape. FR-001, FR-002.
  2. `grep -c "<ref>" packages/claude-plugin-cockpit/commands/watch.md` MUST report ≥ 7 — every row of the seven-row verb mapping table (six `waiting-for:*` gates plus `completed:validate`/`/cockpit:merge`) uses the `<ref>` placeholder in its "Suggested next command" cell. FR-004.
  3. `grep -c "owner/repo#N" packages/claude-plugin-cockpit/commands/watch.md` MUST report ≥ 1 — the emit rule (step 2 prose and/or the "Suggestion format" line) names the qualified form explicitly so the reader knows the expected shape. FR-003.
  4. `grep -n "· suggested: /cockpit:" packages/claude-plugin-cockpit/commands/watch.md` MUST report **0** hits — no non-backticked suggestion example remains anywhere in the file (guards against a partial edit that updated some rows but left a bare-verb example behind). FR-002, FR-005.
  5. `grep -c "/cockpit:review --gate" packages/claude-plugin-cockpit/commands/watch.md` MUST report **0** hits — the pre-fix bare-verb shape (`/cockpit:review --gate spec-review`) does not remain anywhere. The rewritten table uses `/cockpit:review <ref> --gate spec-review` (etc.), so the bare form should be entirely absent. FR-004.
  6. `diff <(sed -n '/<!-- BEGIN error-conv -->/,/<!-- END error-conv -->/p' packages/claude-plugin-cockpit/commands/watch.md) <(sed -n '/<!-- BEGIN error-conv -->/,/<!-- END error-conv -->/p' packages/claude-plugin-cockpit/commands/review.md)` MUST return empty output — the byte-identical MISSING_BINARY / AUTH_FAILURE / OTHER block established in [#378](https://github.com/generacy-ai/agency/issues/378) is preserved. This feature MUST NOT touch that block.
  7. `git diff --stat --name-only develop...HEAD -- packages/claude-plugin-cockpit/` MUST show `packages/claude-plugin-cockpit/commands/watch.md` on a single line — only one file changed under the plugin package.
- **Manual smoke test (US1, SC-001)** — replay the tetrad-development#88 finding #23 scenario:
  1. Against an epic with an active watcher and at least one queued child, run `/cockpit:watch <epic-ref>` from a Claude Code session with the plugin installed. As the CLI emits transition lines, verify that every non-error transition emits a ` · suggested: \`<full-invocation>\`` segment where `<full-invocation>` starts with `/cockpit:` and includes an `owner/repo#N` ref.
  2. Copy one of the emitted suggestions verbatim (as-rendered, code-span content only) and paste it into the same Claude Code session's prompt. The CLI MUST accept the invocation and dispatch it without editing — no manual re-assembly, no ref lookup.
- **Manual smoke test (SC-002)** — chat-surface render verification:
  1. In the same smoke session, observe each ` · suggested: …` segment in the chat surface. Each MUST render as an inline monospace code span (the visual affordance backticks provide in the Claude Code UI). No non-code-span suggestion should appear.
- **Manual smoke test (SC-003)** — qualified-ref confirmation:
  1. Scan the smoke session's emitted suggestions. Every emitted suggestion MUST show the qualified `owner/repo#N` form. If any bare-number (`N`) form is emitted, the fix is incomplete (or the CLI's transition-line schema regressed — file that separately, but the plugin should still not attempt to re-qualify).
- **Manual smoke test (SC-004)** — refless / error-row omission:
  1. In the smoke session, if the CLI emits a "watcher started" banner or any non-error line that carries no ref, verify no ` · suggested: …` segment is rendered on that line.
  2. Simulate an error-state row (or wait for one to arrive) and verify no ` · suggested: …` segment is rendered on that line either. Behavior for error rows is unchanged from today; the check confirms the fix does not accidentally start emitting suggestions for them.
- **Error-handling parity spot-check (implicit FR from #378 invariant)** — force `AUTH_FAILURE` by running `/cockpit:watch <epic-ref>` with `GH_TOKEN=""`. The emitted text MUST match `packages/claude-plugin-cockpit/README.md § Error Handling` verbatim. This confirms both (a) the error-conv block is untouched by this feature, and (b) suggestion-emission changes do not leak into the error-handling path.
- **No unit tests to add**: prompt commands are not code; correctness is prompt-level and is verified by grep + manual replay.

**Target Platform**: The `@generacy-ai/claude-plugin-cockpit` npm package (shipped from `packages/claude-plugin-cockpit/`) and its consumers (Claude Code sessions). The package's `files` array already includes `commands/`, so the corrected `watch.md` ships in the next preview publish automatically — no workflow or `package.json` edits needed.

**Project Type**: Documentation-only fix inside a publishable pnpm workspace package (Claude Code prompt-command plugin).

**Performance Goals**: N/A. The playbook still consumes one CLI stdout line and emits one notification per line — no new work, no new sub-invocations, no new HTTP calls. The added text (the ref, the backticks, the `<ref>` placeholder in the mapping table) is bounded in size.

**Constraints**:
- **Qualified `owner/repo#N` form uniformly, no bare-number branch** (FR-003, clarification Q2): the playbook does NOT compare the transition's repo against `git config --get remote.origin.url`, does NOT branch on cwd/origin match, does NOT strip `owner/repo` down to bare `N` under any condition. The CLI accepts qualified refs universally per [generacy#822](https://github.com/generacy-ai/generacy/issues/822) / [#850](https://github.com/generacy-ai/generacy/issues/850), so the qualified suggestion is executable everywhere. The bare-number optimization would save keystrokes on paste (length is free when copying) but require repo-detection logic in the playbook — a bad trade for copy-paste executability, which is this issue's entire point.
- **Interpolate the ref the transition line itself names, verbatim** (FR-003, clarification Q3): the playbook does no scope resolution (child vs. epic). Every actionable transition is child-scoped by the NDJSON schema — the line's repo+number IS the subject — so verbatim interpolation is correct by construction. Any future epic-level rollup transition would be a schema change to the CLI, not a plugin concern; the emit rule stays the same.
- **Single-backtick inline code span is the copy affordance** (FR-002, spec Assumptions §2): every suggestion MUST be wrapped in one pair of single backticks. Triple-backtick fenced blocks are wrong (they wrap the whole line, not just the invocation) and would break the ` · suggested: `…`` line shape. There is no true click-to-copy in the playbook's chat surface, so backticks are the strongest available affordance; other formats (bold, italics, block quotes) do not signal copyability.
- **Rule applies to any presentation of a suggestion** (FR-005, spec Assumptions §4): the streamed per-transition line is the primary emission surface, but any improvised summary or table the playbook may render must also carry the complete executable invocation. The playbook does not (and per Out of Scope §3, should not) render its own initial-state table — the "initial-state table" observed in the smoke-test session was an ad-hoc presentation of the initial transition lines, not a playbook artifact. The FR-005 constraint is a forward-looking safety net for future improvisation.
- **Error-state rows continue to omit `· suggested: …`** (FR-006): unchanged behavior — preserve today's contract. The error-conv block downstream classifies non-zero CLI exits into MISSING_BINARY / AUTH_FAILURE / OTHER; the emit rule change is limited to the transition-line branch.
- **Refless non-error lines also omit `· suggested: …`** (FR-007, clarification Q5): defensive fallback for lines like `watcher started` banners or format anomalies. The NDJSON schema guarantees refs on actionable transition lines, so a refless non-error line is already a schema anomaly that degrades most gracefully in silence. A verb-only suggestion is exactly the non-executable output this issue exists to eliminate — emitting one on a refless line would reintroduce the bug in miniature.
- **Verb mapping table's "Suggested next command" column matches runtime format** (FR-004, clarification Q4): every "Suggested next command" cell shows the interpolated shape using `<ref>` as the placeholder (not `<epic-ref>`, not `<child-ref>`, not bare `N`). One placeholder, one meaning: the transition line's own qualified ref. The doc-runtime consistency prevents a maintainer from reading the table and drawing an incorrect conclusion about the emit format.
- **Error-conv block unchanged** (spec Out of Scope, [#378](https://github.com/generacy-ai/agency/issues/378) invariant): the byte-identical MISSING_BINARY / AUTH_FAILURE / OTHER block between `<!-- BEGIN error-conv -->` and `<!-- END error-conv -->` is preserved verbatim. `diff` between `watch.md`'s error-conv block and the sibling commands' error-conv block post-fix MUST remain empty. This constraint interlocks with #378's byte-identical drift check.
- **No table-rendering machinery added** (spec Out of Scope §3, clarification Q1): the playbook does not gain the ability to render an initial-state table (or any other table) of its own. The spec's original US2 was based on an incorrect premise — the "initial-state table" observed in the smoke-test session was one Claude session's ad-hoc presentation of the initial transition lines, not a playbook artifact. FR-005 generalizes the emit rule to cover any future improvisation, but the plan does NOT introduce table-rendering code.
- **No sibling-command edits** (Out of Scope §6): `/cockpit:status`, `/cockpit:queue`, and other cockpit commands are not part of this change even if analogous ref-interpolation gaps might apply to them. Each requires its own spec + issue.

**Scale/Scope**: One file edited: `packages/claude-plugin-cockpit/commands/watch.md`. No files added, no files removed, no other packages touched, no other `commands/*.md` edited. `git diff --stat` on the resulting commit MUST show exactly one file modified, under `packages/claude-plugin-cockpit/commands/`. The file is small (~33 lines pre-fix); the diff is proportionally small (step 2 prose reflow, seven mapping-table cells updated, ~1 new anchor line for the "Suggestion format" convention).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

No `.specify/memory/constitution.md` exists in this repository, so there is no project-specific constitution to check against. General repo hygiene gates that this change honors implicitly:

- **Scope discipline**: The change owns only `packages/claude-plugin-cockpit/commands/watch.md`. `git diff --stat` on the resulting commit MUST show exactly one file modified. No CLI edits, no other command file edits, no README edit (the plugin README's Error Handling section is byte-identical with the error-conv block and remains untouched).
- **Root-cause fix, not bandaid**: The defect is that the playbook's emit rule renders a bare verb without the ref. The direct fix is to rewrite the emit rule so the ref is always interpolated. The plan does not add a compensating helper, a formatting post-processor, or a "click here to copy" hack — the emit rule itself is what changes. The table cells are updated in the same edit so the doc and the runtime output are consistent by construction.
- **Preserve load-bearing conventions**:
  - **[#378](https://github.com/generacy-ai/agency/issues/378) byte-identical error-conv invariant**: the `<!-- BEGIN error-conv -->` … `<!-- END error-conv -->` block in `watch.md` is not touched. `diff` between the block in `watch.md` and the sibling commands' blocks post-fix MUST remain empty.
  - **Inline-verbatim convention** ([#380](https://github.com/generacy-ai/agency/issues/380) plan §Structure Decision, [#382](https://github.com/generacy-ai/agency/issues/382) plan §Structure Decision, [#384](https://github.com/generacy-ai/agency/issues/384) plan §Constitution Check): no shared "suggestion emit helper" or partial include is introduced. The emit rule lives verbatim inside `watch.md`; the seven mapping-table cells are spelled out. Analogous to the previous fixes: prompt commands do not import; they inline.
  - **Playbook contract**: the playbook consumes CLI stdout line by line and emits one notification per line. That contract is preserved verbatim; only the shape of the notification changes. No streaming buffering, no multi-line batching, no line-look-ahead is introduced.
- **One-issue-per-repo boundary**: The change lives entirely in `generacy-ai/agency`. No CLI edits (the ref-qualification and CLI-side ref-resolution rules live in [generacy#822](https://github.com/generacy-ai/generacy/issues/822) / [#850](https://github.com/generacy-ai/generacy/issues/850)); no changes to the `generacy cockpit watch` transition-line schema; no changes to `PrFeedbackMonitorService` or orchestrator behavior. Retroactive suggestion-format fixes in sibling cockpit commands live in their own future issues per Out of Scope §6.
- **Emit-schema coupling**: FR-003 relies on the CLI transition-line schema always naming a qualified `owner/repo#N` ref on every actionable transition. Spec Assumptions §3 states this explicitly; the plan honors it by trusting the ref verbatim and by falling back safely (`omit · suggested: …`) if the ref is missing (FR-007). Any future schema change that emits bare `N` refs would require re-visiting FR-003 in a follow-up spec — the plan does NOT proactively strip `owner/repo#` from any observed ref.

**Result**: PASS. No violations. Complexity Tracking table below is intentionally empty.

## Project Structure

### Documentation (this feature)

```text
specs/386-found-during-cockpit-v1/
├── spec.md                            # Feature specification (read-only for /plan)
├── clarifications.md                  # Q1–Q5 answers (read-only for /plan)
├── plan.md                            # This file
├── research.md                        # Phase 0 — qualified-ref uniformity, verbatim interpolation,
│                                      #           backtick copy affordance, refless/error omission,
│                                      #           table-doc parity, no-table-machinery scope
├── quickstart.md                      # Phase 1 — the three-section rewrite walkthrough + verification
├── contracts/
│   └── watch-command.contract.md      # Exact byte-level strings the rewritten watch.md must contain
├── checklists/                        # (empty; no /checklist run for this feature)
└── conversation-log.jsonl
```

No `data-model.md` — this feature introduces no runtime entities, types, or state. The only "data" is (a) prompt copy in one Markdown file, captured section-by-section in `contracts/watch-command.contract.md`, and (b) the transition-line NDJSON schema emitted by `generacy cockpit watch`, whose shape is defined by the CLI ([generacy#822](https://github.com/generacy-ai/generacy/issues/822) / [#850](https://github.com/generacy-ai/generacy/issues/850)). The plugin consumes the CLI output opaquely and interpolates the ref field verbatim — no parsing beyond identifying the ref substring on the line.

### Source Code (repository root)

```text
packages/claude-plugin-cockpit/
└── commands/
    └── watch.md   # EDIT: step 2 — rewrite the emit rule so every non-error transition line's
                   #                ` · suggested: …` segment carries the complete `/cockpit:<verb> <ref> [flags]`
                   #                invocation, wrapped in a single-backtick inline code span; the ref is the
                   #                qualified `owner/repo#N` interpolated verbatim from the transition line
                   #                (contract §3);
                   #        verb mapping table — every "Suggested next command" cell (seven rows) shows the
                   #                interpolated shape using `<ref>` as the placeholder, matching the runtime
                   #                emit format (contract §4);
                   #        (optional) "Suggestion format" one-line anchor immediately after the mapping table,
                   #                naming the emit shape and the qualified-ref requirement so future readers
                   #                see the intent in one place (contract §5).
                   #        MISSING_BINARY / AUTH_FAILURE / OTHER (`<!-- BEGIN error-conv -->` … block) UNCHANGED.
                   #        Frontmatter, `# Watch Command` header, step 1, step 3, step 4 — UNCHANGED.
```

**Structure Decision**: The cockpit plugin is a Claude Code prompt-command package (Markdown-only, no `src/`, no build step). Prompt commands under `commands/` are the shipped surface. Editing `watch.md` in place preserves the plugin's inline-verbatim convention (see [#378](https://github.com/generacy-ai/agency/issues/378) plan Decision 1, [#380](https://github.com/generacy-ai/agency/issues/380) plan §Structure Decision, [#382](https://github.com/generacy-ai/agency/issues/382) plan §Structure Decision, and [#384](https://github.com/generacy-ai/agency/issues/384) plan §Structure Decision) and keeps the change reviewable as a one-file diff.

## Phase 0: Research

See [research.md](research.md). Summary of decisions:

- **Why qualified `owner/repo#N` uniformly, not a bare-number branch on cwd/origin match (clarification Q2)**: the CLI accepts qualified refs universally per [generacy#822](https://github.com/generacy-ai/generacy/issues/822) / [#850](https://github.com/generacy-ai/generacy/issues/850). Copy-paste length is free; the bare-number optimization saves keystrokes on typing, but this issue's entire point is copy-paste executability. The bare-number path would require the playbook to compare the transition line's repo against `git config --get remote.origin.url`, adding cwd/origin detection logic in Markdown — the exact kind of English-state-machine meta-work the plugin family avoids.
- **Why interpolate the transition line's own ref verbatim, no scope resolution (clarification Q3)**: every actionable transition emitted by `generacy cockpit watch` is child-scoped — the line's repo+number IS the subject. There is no epic-level rollup PR in this design, so `/cockpit:merge` on a `completed:validate` transition is a merge of the CHILD that just finished validate. Verbatim interpolation is correct by construction; a scope-aware branch (child vs. epic) would either duplicate the CLI's knowledge or fall out of sync with it.
- **Why single-backtick inline code spans, not fenced blocks or bold text (spec FR-002, Assumptions §2)**: single backticks render as a monospace code span in Claude Code's chat surface — the strongest copy affordance available in a playbook that emits Markdown. Triple-backtick fenced blocks are wrong (they wrap the whole line, breaking the ` · suggested: `…`` inline shape). Bold/italic/blockquote do not signal copyability. Backticks compose cleanly with the surrounding transition-line prose.
- **Why refless non-error lines omit the suggestion segment (clarification Q5)**: a verb-only suggestion is exactly the non-executable output this issue exists to eliminate — emitting one on a refless line would reintroduce the bug in miniature. The NDJSON schema guarantees refs on actionable transition lines, so a refless line is a schema anomaly that degrades most gracefully in silence. No warn, no log; the mirror of the error-row behavior keeps the emit rule uniform.
- **Why update the mapping table doc in the same edit as the runtime emit rule (spec FR-004, clarification Q4)**: the mapping table is the reader's mental model of what the playbook does. If the table shows `/cockpit:review --gate spec-review` while the runtime emits `/cockpit:review owner/repo#3 --gate spec-review`, a maintainer reading the table will hold the wrong model — and might "correct" the runtime to match the (stale) doc in a future PR. Updating them together makes drift structurally harder. The `<ref>` placeholder (Q4 option A) is chosen for concision and consistency with the single-meaning FR-003/Q3 answer.
- **Why the playbook does NOT gain an initial-state table (spec Out of Scope §3, clarification Q1)**: the "initial-state table" observed in the smoke-test session was one Claude session's ad-hoc presentation of the initial transition lines, not a playbook artifact. Producing such a table would require the playbook to call the CLI for initial state, format a table, and emit it before streaming — machinery the file does not have and the issue does not need. FR-005 generalizes the emit rule to cover any future improvisation without mandating that the playbook produce the table.

## Phase 1: Design & Contracts

**Prerequisites**: research.md complete.

Artifacts produced in this phase:

- **[contracts/watch-command.contract.md](contracts/watch-command.contract.md)** — the exact strings the rewritten `watch.md` must contain in the sections this feature touches: step 2's emit rule (§3), the seven mapping-table cells with `<ref>`-parameterized invocations (§4), and the new "Suggestion format" anchor line (§5). Sections not touched by this feature (frontmatter, H1 body, step 1, step 3, step 4, `<!-- BEGIN error-conv -->` block) are listed as byte-preserved with the specific verification greps.
- **[quickstart.md](quickstart.md)** — a copy-paste-ready walkthrough for a maintainer to apply the three edits and verify them before opening a PR. Written as a section-by-section replace-with checklist because the fix is prescriptive.

No `data-model.md` — see Project Structure §Documentation.

## Complexity Tracking

*Fill ONLY if Constitution Check has violations that must be justified.*

*Empty — Constitution Check passed with no violations.*

---

*Generated by /plan for issue [generacy-ai/agency#386](https://github.com/generacy-ai/agency/issues/386)*
