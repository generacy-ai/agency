# Tasks: /cockpit:plan command — planning-doc scaffolder

**Input**: Design documents from `/specs/356-epic-generacy-ai-tetrad/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, contracts/planning-doc.contract.md, contracts/slash-command.contract.md, quickstart.md
**Status**: Complete

## Format: `[ID] [P?] [Story] Description`
- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1 = fresh scaffold; US2 = assist append)

The entire feature ships as a single new file: `packages/claude-plugin-cockpit/commands/plan.md`. Because all tasks below edit that one file, none are marked `[P]` — they must be authored in sequence within the same file. Setup tasks that read sibling files are `[P]`.

## Phase 1: Setup & verification

- [X] T001 [P] Confirm `packages/claude-plugin-cockpit/commands/` exists and contains sibling commands (`clarify.md`, `merge.md`, `review.md`, `status.md`, `watch.md`). Verify the loader auto-discovers `commands/*.md` (no edits required to `plugin.json` or `marketplace.json`). Per plan.md Phase 0.1.
- [X] T002 [P] Read `packages/claude-plugin-cockpit/commands/clarify.md` end-to-end as the primary pattern reference for `gh issue view` shelling, `AskUserQuestion` confirmation flow, and terse-status output discipline (research.md P1, P2).
- [X] T003 [P] Read `packages/claude-plugin-cockpit/commands/merge.md` end-to-end as the secondary pattern reference for frontmatter shape and terse-status output (research.md P1, D8).
- [X] T004 [P] Confirm `gh issue view <ref> --json title,body` returns `{ "title": ..., "body": ... }` shape against issue #356 in the current repo (plan.md Phase 0.2; data-model.md E2).
- [X] T005 [P] Confirm no existing slash command in this repo writes to `docs/epic-*.md`; namespace is disjoint from `/speckit:plan` which writes to `specs/<feature>/plan.md` (plan.md Phase 0.4).

## Phase 2: Author `plan.md` — frontmatter & argument handling

All tasks in this phase edit the same new file: `packages/claude-plugin-cockpit/commands/plan.md`.

- [X] T010 [US1] Create the file `packages/claude-plugin-cockpit/commands/plan.md` and write the YAML frontmatter exactly per `contracts/slash-command.contract.md` "Frontmatter shape": `description` field plus one positional argument `epic-ref` (required, no default). No flags.
- [X] T011 [US1] Author the argument-parsing prompt-body section: read `$ARGUMENTS`, trim, branch on (a) empty → print the Usage line from `data-model.md` E6 and exit 0 non-destructively; (b) bare positive integer `^\d+$` → accept; (c) qualified `^[^/\s]+/[^/\s#]+#\d+$` → accept; (d) anything else → `invalid epic-ref: <raw>` and exit non-zero. Per FR-002, FR-008, data-model.md E1.
- [X] T012 [US1] Author the `gh issue view` invocation: call `gh issue view <ref> --json title,body`. On non-zero exit, surface stderr verbatim then append `failed to resolve epic <ref>` and exit non-zero. Per FR-009, data-model.md E2, E6.

## Phase 3: Author `plan.md` — metadata extraction & slug derivation

- [X] T020 [US1] Author the metadata-extraction block: from the epic body, extract optional `slug:`, `Phase:`, `Tier:` lines using the case-insensitive line-anchored regexes from data-model.md E2 (tolerating `**Phase**:` bold-wrapped keys). First-occurrence wins. All three are optional.
- [X] T021 [US1] Author the slug-derivation block per data-model.md E3 normalization chain — step 1: use explicit `slug:` verbatim if present; step 2 (otherwise): strip `Epic:` / `Epic ` / `[…]` prefix → lowercase → non-alphanumerics → `-` → collapse runs → trim → cap at 60 chars truncating at last `-` boundary. Examples from data-model.md E3 (`Epic: Cockpit` → `cockpit`; long-title example).
- [X] T022 [US1] Author slug-validation guards: explicit `slug:` containing `/`, `\`, or whitespace → `slug contains invalid characters: <slug>` exit non-zero; normalization chain producing empty string → `could not derive slug from title: <title> — add a slug: line to the epic body` exit non-zero. Per data-model.md E3 validation rules and E6.
- [X] T023 [US1] Author the target-path computation: `<cwd>/docs/epic-<slug>-plan.md`. Ensure `<cwd>/docs/` exists, creating it if missing (per plan.md Phase 1 step 5).

## Phase 4: Author `plan.md` — US1 fresh-scaffold write path

- [X] T030 [US1] Author the file-existence branch: if `<target_path>` does not exist, proceed to write skeleton; if it exists, jump to US2 (Phase 5).
- [X] T031 [US1] Embed the canonical skeleton literally in the prompt body per `contracts/planning-doc.contract.md` "Canonical structure": H1 = `# <Epic Title>` (raw title verbatim), one blank line, metadata block, one blank line, then exactly eight H2 sections in the fixed order (`Context`, `Goals`, `Non-Goals`, `Phases`, `Ownership / Isolation`, `Sequencing & Dependencies`, `Risks`, `Open Questions`), each followed by its `<!-- TODO: <hint> -->` placeholder verbatim per the contract (research.md P5).
- [X] T032 [US1] Author the metadata-block rendering per contracts/planning-doc.contract.md "Metadata block" + research.md D7: format `**Epic**: <ref>  ·  **Phase**: <phase>  ·  **Tier**: <tier>`; partial rendering — omit absent key/value pairs; if no metadata is extractable at all, omit the block entirely (H1 directly followed by `## Context` with one blank line). Separator is two spaces + `·` + two spaces.
- [X] T033 [US1] Author the US1 success output: `wrote planning skeleton: <abs-path>` (absolute path per FR-007, data-model.md E6) and exit 0.

## Phase 5: Author `plan.md` — US2 assist-append path

- [X] T040 [US2] Author the existing-doc H2 parser per data-model.md E4 algorithm: read the file, track `in_code_block` to skip fenced lines, capture every `^##\s+(.+?)\s*$` heading, normalize each (lowercase, trim, drop trailing `:`).
- [X] T041 [US2] Author the section comparator per data-model.md E4: walk the canonical section list in order, for each canonical name compute the case-insensitive match against parsed headings OR against the alias table (`Goals ↔ Objectives`; `Non-Goals ↔ Out of Scope`, `Out-of-Scope`). Produce the missing-section list in canonical order. Embed the alias table inline as a flat array (research.md P4).
- [X] T042 [US2] Author the "already complete" branch: if missing list is empty → emit `planning doc already complete: <abs-path>` and exit 0.
- [X] T043 [US2] Author the `AskUserQuestion` prompt per data-model.md E5: `question` = `Append <N> missing section(s) to <abs-path>?\n\nMissing: <comma-separated canonical names>`; `header` = `Append?`; `multiSelect` = false; two options with the exact labels and descriptions from E5. Treat any `Other` free-text response as `Cancel`.
- [X] T044 [US2] Author the `Append` outcome: append a single `<!-- generacy-cockpit:appended -->` marker line after existing content (one blank line above the marker if file doesn't already end with one); then append each missing canonical section in canonical order as `## <Name>` + blank line + `<!-- TODO: <hint> -->` (same hints as US1 skeleton); one blank line between appended sections; single trailing newline. Per contracts/planning-doc.contract.md "US2 (append-only) rules". Emit `appended <N> section(s) to: <abs-path>` and exit 0.
- [X] T045 [US2] Author the `Cancel` outcome: emit `planning doc not modified: <abs-path>` and exit 0; file unchanged.
- [X] T046 [US2] Author the `AskUserQuestion`-unavailable fallback per data-model.md E5 validation rules: emit `missing sections: <comma-separated>; cannot prompt for append in non-interactive context — no changes made to <abs-path>` and exit 0 (preserves non-destructive invariant).

## Phase 6: Author `plan.md` — output discipline & negative invariants

- [X] T050 Add an explicit invariant block (or inline comments) in the command body documenting the human-led MUST NOTs per contracts/slash-command.contract.md "Forbidden behaviors": MUST NOT call `gh issue comment` / `gh pr *` / `generacy cockpit advance`; MUST NOT clone/fetch/write outside the cwd; MUST NOT silently rewrite an explicit `slug:`; MUST NOT use `AskUserQuestion` on the US1 path; MUST NOT background work after the write.
- [X] T051 Audit all status-line outputs against data-model.md E6 — confirm every emitted line matches the canonical examples verbatim (case, punctuation, spacing) and that all `<abs-path>` values are absolute (FR-007).

## Phase 7: Validate

- [X] T060 Skeleton-shape check: read `contracts/planning-doc.contract.md` and verify the section names and order embedded in `plan.md`'s prompt body match exactly — including the literal ` / ` in `Ownership / Isolation` and the ` & ` in `Sequencing & Dependencies` (plan.md Phase 2 step 4).
- [X] T061 Slug-rule check: verify `plan.md`'s prompt body encodes data-model.md E3 verbatim — explicit `slug:` precedence, prefix strip, lowercase, non-alphanumeric → `-`, collapse, trim, 60-char cap at last `-` boundary (plan.md Phase 2 step 5).
- [X] T062 Alias-table check: verify the embedded alias table covers at minimum `Goals ↔ Objectives` and `Non-Goals ↔ Out of Scope` (data-model.md E4, research.md D5).
- [X] T063 Isolation check: confirm the diff for this issue touches only `packages/claude-plugin-cockpit/commands/plan.md` and the files under `specs/356-epic-generacy-ai-tetrad/` — no edits to `plugin.json`, `marketplace.json`, `README.md`, or sibling commands (plan.md Phase 2 step 7, FR-001).
- [ ] T064 Manual smoke — US1 fresh write: install the cockpit plugin in a Claude Code env, run `/cockpit:plan 356`, expect `wrote planning skeleton: <abs-path>` and a file at `docs/epic-<slug>-plan.md` matching the contract (plan.md Phase 2 step 6).
- [ ] T065 Manual smoke — US2 already-complete: re-run `/cockpit:plan 356` immediately after T064 and expect `planning doc already complete: <abs-path>` with the file's mtime/hash unchanged (SC-002).
- [ ] T066 Manual smoke — US2 append flow: hand-delete one canonical section from the file, re-run `/cockpit:plan 356`, expect the `AskUserQuestion` prompt listing that section as missing; choose `Append` and verify the appended block lives beneath a single `<!-- generacy-cockpit:appended -->` marker with the existing content untouched above.
- [ ] T067 Manual smoke — US2 alias coverage: rename `## Goals` to `## Objectives` (and/or `## Non-Goals` to `## Out of Scope`), re-run, expect `planning doc already complete` (no re-append).
- [ ] T068 Manual smoke — argument errors: run with no argument (expect Usage + exit 0), with `not-a-number` (expect `invalid epic-ref: not-a-number` + non-zero exit), and with `owner/nope-doesnt-exist#999` (expect `gh`'s native not-found error verbatim + non-zero exit).
- [ ] T069 Manual smoke — slug errors: against an epic whose body contains `slug: bad/slug`, expect `slug contains invalid characters: bad/slug` + non-zero exit; against an epic whose title strips to empty (e.g. `[scope]` only), expect `could not derive slug from title: …` + non-zero exit.

## Dependencies & Execution Order

**Phase 1 (T001–T005)** can run fully in parallel — all read-only verification of sibling state. Complete this phase before Phase 2.

**Phases 2–6 (T010–T051)** all edit the same new file `packages/claude-plugin-cockpit/commands/plan.md`, so they MUST run sequentially in the listed order:
- Phase 2 (T010–T012) establishes the file and the argument/`gh` entry-points the later phases depend on.
- Phase 3 (T020–T023) depends on T012's `gh` invocation (metadata is parsed from `gh`'s body output).
- Phase 4 (T030–T033) depends on Phase 3 (slug → path → existence-check).
- Phase 5 (T040–T046) depends on T030's existence-branch entry but otherwise sits parallel to Phase 4 logically — still must be authored sequentially in-file after Phase 4.
- Phase 6 (T050–T051) is a final pass over the same file; depends on all preceding authoring.

**Phase 7 validation (T060–T069)**:
- T060–T063 are static checks that can run as soon as Phases 2–6 are complete. T060/T061/T062 can run in parallel; T063 is a git-status check.
- T064–T069 are manual smoke tests requiring a running Claude Code environment with the plugin installed. T064 is the prerequisite for T065–T067 (re-runs depend on the file existing). T068 and T069 are independent argument-error scenarios and can run in any order.

## Parallel opportunities
- Phase 1: all five tasks (T001–T005) — independent reads.
- Phase 7 static checks: T060, T061, T062 — independent reads of the authored file.
- Phase 7 smoke tests T068 and T069 are independent of T064–T067 (they don't require an existing planning doc).
