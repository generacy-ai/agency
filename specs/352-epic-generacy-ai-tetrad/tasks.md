# Tasks: /cockpit:status command

**Input**: Design documents from `/specs/352-epic-generacy-ai-tetrad/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, contracts/slash-command.schema.md, contracts/cli-invocation.md, quickstart.md
**Status**: Complete

## Format: `[ID] [P?] [Story] Description`
- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to

## Phase 1: Setup & Reference Verification

- [ ] T001 Confirm scaffold from #350 is intact — `ls packages/claude-plugin-cockpit/` shows `.claude-plugin/`, `commands/`, `README.md`; `ls packages/claude-plugin-cockpit/commands/` shows only `.gitkeep`. Stop and re-verify #350 if either layout differs (quickstart §1).
- [ ] T002 [P] Re-read `packages/claude-plugin-agency-spec-kit/commands/specify.md` to capture the exact frontmatter shape (`description`, `arguments[]` entries with `name`/`description`/`required`) and body conventions (`# <Title>`, `## User Input` block exposing `$ARGUMENTS`, `## Instructions` numbered list, `## Examples`). This is the reference shape for `status.md` per research D1 / contracts/slash-command.schema.md.
- [ ] T003 [P] Re-read this branch's `specs/352-epic-generacy-ai-tetrad/spec.md` `**Epic**:` line to lock the literal grammar (`**Epic**: <owner>/<repo>#<N>`) used by the no-arg resolver per research D4 / data-model E3.
- [ ] T004 [P] Re-read `packages/claude-plugin-cockpit/.claude-plugin/plugin.json` to confirm the `cockpit` namespace registration and that no `commands` field constrains discovery beyond the `commands/*.md` glob.

## Phase 2: Authoring `status.md`

<!-- All tasks in this phase edit the same file (packages/claude-plugin-cockpit/commands/status.md). NONE are parallelizable. Order is the order sections appear in the file. -->

- [ ] T005 [US1] Create `packages/claude-plugin-cockpit/commands/status.md` with YAML frontmatter: `description: "Report the current status of an epic and its children"` and a single `arguments` entry `{ name: epic, description: "Epic reference (owner/repo#N, #N, or URL). Omit to resolve from the current branch.", required: false }`. Frontmatter shape per contracts/slash-command.schema.md "Required shape".
- [ ] T006 [US1] Append the `# Status Command` H1, a one-paragraph intro describing the verb, and the `## User Input` section containing a fenced `text` block with `$ARGUMENTS` — matching sibling-command convention per contracts/slash-command.schema.md.
- [ ] T007 [US1] In `## Instructions`, write step 1 — **Argument handling**: instruct the model to pass `$ARGUMENTS` to the CLI verbatim; bare `#N` MUST NOT be reinterpreted (FR-004, research D5). If `$ARGUMENTS` is empty, hand off to the no-arg resolution chain in step 2.
- [ ] T008 [US2] In `## Instructions`, write step 2 — **No-arg epic resolution**: instruct the model to (a) read `specs/<current-branch>/spec.md` and extract the value after `**Epic**:` matching `<owner>/<repo>#<N>`; (b) on failure, list `.generacy/epics/` and use the single entry if exactly one exists; (c) on failure, print the usage hint listing the three accepted shapes (`owner/repo#N`, `#N`, URL) and exit success — never silently no-op (FR-005, research D4, data-model E3/E4/E5).
- [ ] T009 [US1] In `## Instructions`, write step 3 — **CLI invocation**: pre-flight `command -v generacy >/dev/null 2>&1`; on success run `generacy cockpit status <epic-ref>` via Bash from the repository root, capturing stdout, stderr, and exit code separately. No flags (no `--json`) — FR-002, FR-008, research D3, contracts/cli-invocation.md.
- [ ] T010 [US1] In `## Instructions`, write step 4 — **Output rendering**: on exit 0, emit a one-line header `**Status:** <epic-ref>` then a triple-backtick fenced code block containing stdout verbatim. MUST NOT reflow, reformat, or re-decorate per-child rows (FR-003, research D2, data-model E6).
- [ ] T011 [US1] In `## Instructions`, write step 5 — **Error handling**: classify failures per contracts/cli-invocation.md error table — `MISSING_BINARY` (pre-flight fails → install hint naming `npm install -g @generacy-ai/cli`); `AUTH_FAILURE` (stderr matches `/auth|unauthorized|401|gh auth/i` → `gh auth login` hint); `UNKNOWN_EPIC` (stderr matches `/not found|unknown epic|no such/i` → tailored hint naming the failed ref); `OTHER` (any other non-zero exit → "CLI failed with exit code N" line followed by raw stderr in a fenced code block). All four arms MUST print something — never silently no-op (FR-006, research D6, data-model E7).
- [ ] T012 [US1] Append `## Examples` with at least one explicit-arg example (`/cockpit:status generacy-ai/tetrad-development#85`) and one no-arg example (`/cockpit:status` from this branch), each followed by a brief description of expected output. End the file with a trailing newline (data-model E1 validation rules).

## Phase 3: Validate

- [ ] T013 [US1] Parse the frontmatter to confirm valid YAML: `node -e "const fs=require('fs');const src=fs.readFileSync('packages/claude-plugin-cockpit/commands/status.md','utf8');const fm=src.split('---')[1];if(!fm)throw new Error('No frontmatter');require('js-yaml').load(fm);console.log('ok')"` — or equivalent. Must print `ok` (plan Phase 2 step 3; quickstart §3).
- [ ] T014 [US1] Confirm layout integrity: `ls packages/claude-plugin-cockpit/commands/` shows exactly `.gitkeep` and `status.md` — no stray files (plan Phase 2 step 4; quickstart §4–5).
- [ ] T015 [US1] Diff the frontmatter and section structure of `packages/claude-plugin-cockpit/commands/status.md` against `packages/claude-plugin-agency-spec-kit/commands/specify.md` — confirm key parity (`description`, `arguments` shape, `## User Input`, `## Instructions`, `## Examples`). Any unexplained divergence is a bug (plan Phase 2 step 5; research D1).
- [ ] T016 [US1] Self-audit against contracts/slash-command.schema.md "Prohibited contents" — grep the file and confirm NONE of: `--json`, instructions to parse/group/re-render per-child structure, instructions to reinterpret bare `#N`, any silent-no-op error arm, or `commands:`/`requires:` frontmatter keys. Any hit is a defect to fix.
- [ ] T017 [US1, US2] (Deferred — requires G1.1 / generacy#787 installed and `gh auth` configured) End-to-end smoke per quickstart §6: install the cockpit plugin in Claude Code; run `/cockpit:status generacy-ai/tetrad-development#85` (expect fenced dashboard for the 19 children — SC-002); run `/cockpit:status` with no args from this branch (expect same dashboard via spec.md resolution — SC-003); run `/cockpit:status bogus/repo#9999` (expect tailored UNKNOWN_EPIC message, not a stack trace — SC-004); uninstall CLI and rerun (expect MISSING_BINARY install hint — SC-004).

## Phase 4: Polish

- [ ] T018 Re-read `status.md` end-to-end as a reviewer would, checking that the instruction body reads naturally to a model invoking the verb (no contradictions between steps 1–5; example invocations align with the resolution chain in steps 1–2).
- [ ] T019 Stage and commit ONLY `packages/claude-plugin-cockpit/commands/status.md` with message `feat(cockpit): add /cockpit:status command (#352)`. The commit MUST touch no other files (epic-isolation invariant; quickstart §7). Verify with `git diff --stat HEAD~1 HEAD` post-commit.

## Dependencies & Execution Order

**Phase order is strict**: Phase 1 (Setup) → Phase 2 (Authoring) → Phase 3 (Validate) → Phase 4 (Polish).

**Within Phase 1**: T001 must run first (gates everything). T002, T003, T004 are read-only `[P]` reads of different files and can run concurrently after T001.

**Within Phase 2**: T005 → T006 → T007 → T008 → T009 → T010 → T011 → T012 are strictly sequential — every task edits the same file (`packages/claude-plugin-cockpit/commands/status.md`) in the order sections appear. NONE are `[P]`-eligible.

**Within Phase 3**: T013, T014, T015, T016 are read-only validations of the now-written `status.md` and can run in any order (treat them as a checklist, not a sequence). T017 is deferred: it depends on external prerequisites (G1.1 CLI installed, plugin installed via marketplace) that are NOT gated by this issue's merge — track it as a follow-up if those prerequisites are unmet at merge time.

**Within Phase 4**: T018 → T019 sequential. T019 must not run until T013–T016 pass (and T017 if external prerequisites are met).

**Parallel opportunities**:
- T002 / T003 / T004 (Phase 1 reference reads)
- T013 / T014 / T015 / T016 (Phase 3 validations)

**Critical path**: T001 → (T002/T003/T004) → T005 → T006 → T007 → T008 → T009 → T010 → T011 → T012 → T013–T016 → T018 → T019. T017 is parallel-deferred (external dependency).

## Story coverage

- **US1** (explicit-argument dashboard rendering): T005, T006, T007, T009, T010, T011, T012, T013, T014, T015, T016, T017
- **US2** (no-arg resolution from branch context): T008, T017
- Setup / polish (no story tag): T001, T002, T003, T004, T018, T019
