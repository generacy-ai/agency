# Tasks: Make `/cockpit:auto` conversational entry point discoverable

**Input**: Design documents from `/specs/445-summary-make-conversational/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, quickstart.md
**Status**: Complete

## Format: `[ID] [P?] [Story] Description`
- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to

## User Story

**US1**: As a developer collaborating with Claude, when the conversation surfaces filed issues in the workspace repo, Claude offers `/cockpit:auto <numbers>` as the next step so I can drive those issues to terminal without needing to know the invocation form or wrap them in an epic.

## Phase 1: Skill-surface descriptions

- [X] T001 [P] [US1] Edit the frontmatter `description:` field in `packages/claude-plugin-cockpit/commands/auto.md` so it advertises both the epic form and the issue-list form (e.g. "Drive one or more issues — an epic, a tracking-issue scope, or an ad-hoc issue list — to terminal via …"). Keep the rest of the frontmatter (name, argument-hint, allowed-tools, model, etc.) untouched. Acceptance: the description no longer implies an epic is required and explicitly mentions issue-list invocation.

- [X] T002 [P] [US1] Edit the plugin-level `description` in `packages/claude-plugin-cockpit/.claude-plugin/plugin.json` to mention issue-list invocation (e.g. "…for speckit epics or ad-hoc issue lists"). Do NOT introduce a `commands` array — the Claude Code plugin schema has no such slot (per research Q2). Acceptance: `description` mentions ad-hoc issue lists; no `commands` key added.

## Phase 2: `auto.md` — `## Offering auto` section

- [X] T003 [US1] Add a new `## Offering auto` H2 section to `packages/claude-plugin-cockpit/commands/auto.md`. Placement: **after** `## Add-issue flow (mid-run)` and **before** `## Gate contract`. Body MUST include, verbatim as prose invariants:
  - **When to offer** (R1): any 1+ issues successfully filed to the workspace's repo during the current session, regardless of who drafted the text.
  - **How to offer** — three hard rules:
    1. R2 — MUST include the concrete resolved issue-number list (e.g. `/cockpit:auto 223, 224`), never a placeholder.
    2. R3 — MUST be a suggestion the developer confirms; never auto-run.
    3. R4 — SHOULD fire at most once per batch of filed issues (no re-nagging).
  - **Suggested phrasing** (not prescribed): e.g. "Want me to run `/cockpit:auto 223, 224` to process these?" with room for session-level variation.
  - **What it is NOT**: not a gate, not an `AskUserQuestion`, not part of the auto loop — pre-invocation conversational surface only.

  Acceptance: `grep -n '^## Offering auto' packages/claude-plugin-cockpit/commands/auto.md` returns exactly one match; the four labeled subsections are present.

## Phase 3: README

- [X] T004 [US1] Add a new `## Quick start — from bug discovery to processed PRs` H2 to `packages/claude-plugin-cockpit/README.md`, placed after `## Available Commands`. Include three H3 subsections:
  - `### 1. Discover in conversation` — one-line example (bug reproduced during investigation).
  - `### 2. File the issues` — `gh issue create` example, and a note that a subsequent auto session can file via `--new "<title>"` + the G.6 gate.
  - `### 3. Kick off auto` — `/cockpit:auto 223, 224` example with the "no epic required" note.

- [X] T005 [US1] Under the new Quick start H2 in `packages/claude-plugin-cockpit/README.md`, add `### Growing scope mid-run` (H3) with:
  - Add-existing example: "also process #226" → `cockpit_scope_add` + `cockpit_queue` (no gate).
  - File-new example: "file an issue for the flaky test in module foo" → drafter subagent → G.6 filing gate → queue.
  - Pointer sentence: "See `commands/auto.md § Add-issue flow (mid-run)` for the parsing rules and gate behavior." (Do not re-document the mechanics; avoid drift with auto.md.)

- [X] T006 [US1] Under the new Quick start H2 in `packages/claude-plugin-cockpit/README.md`, add `### Running multiple conversations` (H3) stating: concurrent sessions with different issue sets are supported (each has its own tracking ref and ledger); execution interleaves through a single cluster worker per user — watch/dispatch loops run in parallel, actual issue processing runs one at a time. Frame this as "parallel observability, serialized execution".

- [X] T007 [US1] Add a `## Offer guidance — when should a session offer /cockpit:auto?` H2 to `packages/claude-plugin-cockpit/README.md`. Mirror the four labeled parts of `auto.md § Offering auto` (When to offer / How to offer / Suggested phrasing / What it is NOT). End the section with a pointer sentence: "Source of truth: `commands/auto.md § Offering auto`."

  Acceptance for T004–T007: `grep -n '^## Quick start\|^### Growing scope mid-run\|^### Running multiple conversations\|^## Offer guidance' packages/claude-plugin-cockpit/README.md` returns four matches.

## Phase 4: Verification

- [X] T008 [US1] Run `pnpm --filter claude-plugin-cockpit test` and note any failing pinning assertions in `tests/playbook-verification.test.ts`. Expected per research Q7: no pinning changes required because the edit adds a new H2 (not renaming any existing heading) and only touches frontmatter fields that are not currently pinned — but the suite is the arbiter.

- [X] T009 [US1] Re-pin `packages/claude-plugin-cockpit/tests/playbook-verification.test.ts` for every heading and contract rule this edit changes.
  Files edited by this issue: `packages/claude-plugin-cockpit/commands/auto.md`
  Pin sites that read the edited file:
    - :286: 396-3 drift audit — GATE_VOCABULARY tokens in auto.md § Dispatch (`readFileSync(AUTO_MD_PATH)`)
    - :515: 398-1 drift audit — every commands/*.md invocation matches its --help snapshot (`readdirSync(COMMANDS_DIR)` sweep — always covers every playbook)
    - :906: 402-1 structural drift audit — auto.md contract section, ≤4 bound, gate cross-references (`readFileSync` via `auditContract(AUTO_MD_PATH)`)
    - :1101 / :1109: 403-1 D.9 family subheadings pinned (`readFileSync(AUTO_MD_PATH)` + `extractSubheadingBlock`)
    - :1118 / :1119: 403-2 D.9d subheading pinned (`readFileSync(AUTO_MD_PATH)` + `extractSubheadingBlock`)
    - :1169 / :1170 / :1176: 403-4 D.7 and D.11 subheadings pinned (`readFileSync(AUTO_MD_PATH)` + `extractSubheadingBlock`)
    - :1253: 403-6 Invariants section (`readFileSync(AUTO_MD_PATH)`)
    - :1273: 403-7 full epic status table anchor (`readFileSync(AUTO_MD_PATH)`)
    - :1517 / :1518: 406-3 wake-driven loop shape — step 4 / step 2 (`readFileSync(AUTO_MD_PATH)` + `extractInstructionsSteps`)
    - :1556 / :1557: 406-4 in-memory cursor — steps 4/5 (`readFileSync(AUTO_MD_PATH)` + `extractInstructionsSteps`)
    - :1570 / :1571: 406-5 startup sweep tool-presence — step 3 (`readFileSync(AUTO_MD_PATH)` + `extractInstructionsSteps`)
    - :1596: 406-6 § Invariants exactly nine items (`readFileSync(AUTO_MD_PATH)`)
    - :1812: 408-1 § step 5 cursor-error class split (`readFileSync` via `auditStep5(AUTO_MD_PATH)`)
    - :2012: 410-1 D.7 repeat-failure dispatch structural audit (`readFileSync` via `auditD7(AUTO_MD_PATH)`)
    - :2361: 433-1 pre-flight doorbell probe form (`readFileSync(AUTO_MD_PATH)`)
    - :2406 / :2407: 437-1 step 4a enriched-line dispatch contract (`readFileSync(AUTO_MD_PATH)` + `extractInstructionsSteps`)
    - :2429 / :2438: 437-2 D.1–D.4 and D.7 dispatch narrations (`readFileSync(AUTO_MD_PATH)` + `extractSubheadingBlock` loop)
    - :2468: 437-3 § Invariants §7 anti-drop clause (`readFileSync(AUTO_MD_PATH)`)
    - :2498: 437-4 § Ledger `source: enriched-line` marker (`readFileSync(AUTO_MD_PATH)`)
    - :2512 / :2518: 437-5 D.5/D.6 fallback triggers (`readFileSync(AUTO_MD_PATH)` + `extractSubheadingBlock` loop)
    - :2541 / :2548: 437-6 D.8/D.10/D.11 retain-the-re-check (`readFileSync(AUTO_MD_PATH)` + `extractSubheadingBlock` loop)

  Re-pinning means updating the assertion to the NEW contract established by the playbook edit.
  Do NOT weaken or delete an assertion to make the test pass — the pin is a drift audit; weakening it deletes its value.
  Note: if T008 shows zero pinning failures (the expected outcome per research Q7), no code changes are needed here — verify manually that the added `## Offering auto` H2 and the frontmatter description change did not disturb any pinned heading/section/instruction step before shipping.

- [X] T010 [US1] Run `pnpm install && pnpm build` from the workspace root to confirm a clean build (no TypeScript errors, no lint failures, no broken package interactions).

## Dependencies & Execution Order

**Sequential**: Phase 1 → Phase 2 → Phase 3 → Phase 4.

**Parallel opportunities**:
- Within Phase 1: T001 and T002 touch different files and are marked `[P]`.
- T001 and T002 could also run in parallel with T003 (Phase 2) since T003 edits a different area of `auto.md` (a new H2 section, not the frontmatter) — but keeping the phase gate simplifies review.
- Within Phase 3: T004–T007 all edit `README.md` and are sequential (same file, additive but ordering matters for placement).
- Phase 4 is strictly sequential (test → re-pin → build) because T009 depends on T008's output.

**Blocking notes**:
- T009 (re-pin) is **mandatory** by CLAUDE.md's playbook-pin rule, even if T008 reports zero failures — in that case, T009 collapses to a manual verification of the pin sites listed above.
- All README tasks (T004–T007) should reference the `commands/auto.md § Offering auto` and `commands/auto.md § Add-issue flow (mid-run)` sections as source-of-truth to avoid doc drift.
