# Tasks: /cockpit:breakdown command

**Input**: Design documents from `/specs/357-epic-generacy-ai-tetrad/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, contracts/
**Status**: Complete

## Format: `[ID] [P?] [Story] Description`
- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (this issue is single-story scope: A4.2 / `breakdown`)

## Phase 1: Setup

- [X] T001 Verify the target directory `packages/claude-plugin-cockpit/commands/` exists and inspect sibling commands (`merge.md`, `clarify.md`, `status.md`, `watch.md`, `review.md`) to mirror their frontmatter convention and tone. Goal: confirm no plumbing changes are required (per plan: omit `commands` from `plugin.json`; loader auto-discovers `commands/*.md`). No files written in this task.

## Phase 2: Contracts verification (pre-author)

- [X] T002 [P] Cross-read `contracts/breakdown-doc-section.contract.md` and confirm the exact section grammar (markers verbatim, `##` section heading, `### P<n> — <title>` per phase, `- **<slug>** — <title>. <summary>` list shape) that the drafted proposal MUST conform to. Note any divergence from data-model.md E3 and update the contract if needed.
- [X] T003 [P] Cross-read `contracts/manifest-cli.contract.md` to confirm the assumed `generacy cockpit manifest init|sync <epic-ref>` invocation surface (argv, expected stderr signal for "manifest not initialized", exit codes). Note the `sync`-first-then-`init`-on-signal strategy from data-model.md E4 is captured in the contract.
- [X] T004 [P] Cross-read `contracts/slash-command.contract.md` to confirm the frontmatter shape (single required positional `epic`, no v1 flags) and the nine MUST invariants from §"Behavioral contract". Surface any contract drift back into research.md if found.

## Phase 3: Core implementation

- [X] T005 Create `packages/claude-plugin-cockpit/commands/breakdown.md` with the YAML frontmatter from `contracts/slash-command.contract.md` §"Frontmatter shape": `description`, `arguments[0]` = `{ name: epic, description: ..., required: true }`. No flags.
- [X] T006 In `packages/claude-plugin-cockpit/commands/breakdown.md`, author the **Argument resolution** section of the prompt body: instruct the assistant to resolve `<epic>` via the shared resolver (#788) to `{ epic_ref, doc_path, repo }`, stop with `Stopped: no epic doc found for <ref>` on zero matches, and stop with a usage-style error listing matches on multiple matches (per data-model.md E1 + E5).
- [X] T007 In `packages/claude-plugin-cockpit/commands/breakdown.md`, author the **Read + locate markers** section: read `doc_path`, find `<!-- cockpit:phase-decomposition:start -->` and `<!-- cockpit:phase-decomposition:end -->` verbatim. Branch into first-run (no markers) vs re-draft (both markers present). Stop with `Stopped: doc has unmatched / duplicate phase-decomposition markers — fix manually before re-running` on any other combination (per research.md P3 + contract Invariant #2).
- [X] T008 In `packages/claude-plugin-cockpit/commands/breakdown.md`, author the **Draft proposal** section: produce the in-chat proposal shape from data-model.md E2 (`phases[]` with sequential `P<n>` IDs starting at `P1`, title, one-sentence summary, per-phase `issues[]` list with `slug`, `title`, `summary`). Embed an explicit instruction that the draft MUST grammar-check against `contracts/breakdown-doc-section.contract.md` BEFORE presentation; on grammar failure, silently re-draft (research.md P5).
- [X] T009 In `packages/claude-plugin-cockpit/commands/breakdown.md`, author the **Approval loop** section: present the proposal verbatim (no smart reformatting per data-model.md E5), prompt `Approve, edit, or reject?`, and implement the three branches: `approve` → fall through; `edit` → accept free-form natural-language feedback, re-draft, re-present (resets affordance set to `approve / edit / reject` per research.md D3); `reject` → `Stopped: rejected — no doc change, no CLI call`, exit non-zero, NO doc change, NO CLI call (contract Invariant #1 + Forbidden #3).
- [X] T010 In `packages/claude-plugin-cockpit/commands/breakdown.md`, author the **Render + write** section: render the approved proposal into the doc-section shape from data-model.md E3 (markers + `## Phase decomposition` + per-phase `### P<n> — <title>` + summary + bulleted issues). If markers exist in `doc_path`, replace between them in place (Edit tool); otherwise append the section at literal EOF (per research.md D4, contract Invariant #3/#4). Emit `Wrote section (in-place replace)` or `Wrote section (appended at EOF)` accordingly. Renderer MUST be deterministic — no timestamps, no machine IDs (contract Forbidden #7).
- [X] T011 In `packages/claude-plugin-cockpit/commands/breakdown.md`, author the **Manifest CLI invocation** section: after the doc write completes, shell out to `generacy cockpit manifest sync <epic-ref>` via Bash; if stderr signals "manifest not initialized" (per `contracts/manifest-cli.contract.md`), retry once with `init`. Emit `Manifest: sync` or `Manifest: init` accordingly. On non-zero CLI exit, emit `Stopped: manifest CLI failed — <stderr first line>` and exit non-zero; MUST NOT roll back the doc write (research.md D1 idempotency note + contract Forbidden #6).
- [X] T012 In `packages/claude-plugin-cockpit/commands/breakdown.md`, author the **Status / done** section: emit `Done ✓` and exit 0 only on the success path; codify the full status-line table from data-model.md E5 as in-prompt guidance so the assistant emits one terse line per phase transition (no narration, no trailing summary per research.md D6).

## Phase 4: Validation

- [X] T013 Isolation check: confirm the only file added is `packages/claude-plugin-cockpit/commands/breakdown.md` and no other repo files (especially `plugin.json`, `marketplace.json`, `README.md`) were modified — plan §"Structure Decision" requires omission of `commands` from `plugin.json` so the loader's glob auto-discovers the new file.
- [X] T014 Markdown lint / shape check: re-read `breakdown.md` and confirm the frontmatter parses, the prompt body's drafted section template literally contains both stable markers (byte-for-byte) and the `### P<n> — <title>` heading shape from `contracts/breakdown-doc-section.contract.md`.
- [ ] T015 Manual smoke — first-run path (per plan §"Phase 2: Validate"): install the plugin in a Claude Code environment, run `/cockpit:breakdown <epic-ref>` against an epic doc with no existing markers, approve the first draft, verify (a) section appended at EOF, (b) `Manifest: init` emitted, (c) `Done ✓`, (d) exit 0.
- [ ] T016 Manual smoke — idempotent re-run: re-run `/cockpit:breakdown <epic-ref>` against the same epic with no proposal change, approve, verify (a) doc diff is empty (byte-identical render), (b) `Manifest: sync` exits cleanly, (c) `Done ✓`. (SC-002.)
- [ ] T017 Manual smoke — in-place replace: edit the proposal (one more phase), approve, verify the section is replaced in place between the existing markers and `Manifest: sync` is invoked.
- [ ] T018 Manual smoke — edit + reject paths: (a) type `edit` with `merge phases 2 and 3`, verify re-draft is presented and `approve/edit/reject` is offered again; (b) on a fresh draft, type `reject`, verify exit non-zero, NO doc change, NO CLI call.
- [ ] T019 Manual smoke — corrupt-doc guard: hand-edit the epic doc to leave a `start` marker without an `end` marker (and separately, duplicate `start` markers), re-run, verify both cases stop with the `fix manually before re-running` message and exit non-zero with no draft work performed.

## Dependencies & Execution Order

**Sequential**:
- T001 → T002/T003/T004 → T005 → T006 → T007 → T008 → T009 → T010 → T011 → T012 → T013 → T014 → T015 → T016 → T017 → T018 → T019

**Parallel opportunities**:
- T002, T003, T004 may run in parallel (independent contract reads on three separate files).
- T006–T012 all edit the same file (`breakdown.md`) and MUST run sequentially.
- T015–T019 are manual smoke scenarios against a deployed plugin; they may be run in any order once T013/T014 pass, but each consumes the state left by the previous (e.g., T016 depends on the section written by T015).

**Critical path**: T005 → T006 → … → T012 (single-file authoring) is the entire delivery; everything before is verification, everything after is validation. No new TypeScript, no automated tests — manual smoke is the validation gate per plan §"Testing".
