# Tasks: claude-plugin-cockpit scaffold + marketplace entry

**Input**: Design documents from `/specs/350-epic-generacy-ai-tetrad/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, contracts/, quickstart.md
**Status**: Complete

## Format: `[ID] [P?] [Story] Description`
- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1/US2/US3)

## Phase 1: Setup — Verify reference shape

- [X] T001 Read `packages/claude-plugin-agency-spec-kit/.claude-plugin/plugin.json` to confirm the author block shape, indentation (2 spaces), and trailing-newline convention to mirror in the cockpit manifest (D1, P3).
- [X] T002 [P] Read `packages/claude-plugin-agency-spec-kit/README.md` to confirm section order, heading style, and the "Available Commands" table format the cockpit README must mirror (FR-003, D6).
- [X] T003 [P] Read root `.claude-plugin/marketplace.json` to confirm the `plugins` array shape, key order of each plugin entry, and existing `agency-spec-kit` entry (must remain unchanged per P2 / cross-document invariants).
- [X] T004 [P] Confirm `.claude/settings.json` uses `generacy-ai/agency` as the marketplace identifier so the README install snippet matches (D3, Q4).

## Phase 2: Create the package files

- [X] T010 [US3] Create directory `packages/claude-plugin-cockpit/.claude-plugin/` and write `packages/claude-plugin-cockpit/.claude-plugin/plugin.json` with exactly `name: "cockpit"`, `description: "Developer-side workflow automation commands for speckit epics"`, and the generacy author block `{ "name": "Generacy AI", "email": "support@generacy.ai" }`. Omit `commands` and `requires` (FR-001, FR-005, E1).
- [X] T011 [P] [US3] Create directory `packages/claude-plugin-cockpit/commands/` and add an empty `packages/claude-plugin-cockpit/commands/.gitkeep` file. Do NOT add any `.md` file in this directory — the plugin loader globs `commands/*.md` (FR-002, E3, D2, Q3).
- [X] T012 [P] [US2] Create `packages/claude-plugin-cockpit/README.md` mirroring `packages/claude-plugin-agency-spec-kit/README.md` structure: H1 title, overview paragraph noting verbs land in Epic Cockpit issues #351–#360, Installation section instructing users to add `generacy-ai/agency` to `extraKnownMarketplaces` then install `cockpit`, and an "Available Commands" table listing `/cockpit:watch`, `:status`, `:clarify`, `:review`, `:merge` each annotated `(coming in #351–#360)` (FR-003, E4, D6, Q4, Q5).

## Phase 3: Register in marketplace

- [X] T020 [US1] Append a new object to the `plugins` array in `.claude-plugin/marketplace.json` with `name: "cockpit"`, `description` byte-for-byte equal to the value in `plugin.json`, the same generacy author block, `source: "./packages/claude-plugin-cockpit"`, and `category: "development"`. Preserve existing 2-space indentation, key order, and trailing newline; do NOT modify the existing `agency-spec-kit` entry (FR-004, E2, P2, Q2).

## Phase 4: Validate

- [X] T030 Confirm `packages/claude-plugin-cockpit/.claude-plugin/plugin.json` parses as valid JSON and contains no `commands` or `requires` keys (FR-005, SC-003).
- [X] T031 [P] Validate `.claude-plugin/marketplace.json` against the `$schema` URL `https://anthropic.com/claude-code/marketplace.schema.json` already referenced in the file (SC-003).
- [X] T032 [P] Cross-check that `E1.name == E2.name == "cockpit"` and `E1.description == E2.description` byte-for-byte across `packages/claude-plugin-cockpit/.claude-plugin/plugin.json` and the new entry in `.claude-plugin/marketplace.json` (cross-document invariants, FR-001 + FR-004).
- [X] T033 [P] Confirm `packages/claude-plugin-cockpit/commands/` contains only `.gitkeep` and zero `.md` files (FR-002, E3, D2).
- [X] T034 [P] Confirm directory layout of `packages/claude-plugin-cockpit/` matches `packages/claude-plugin-agency-spec-kit/` (manifest path, commands dir presence, README presence) — SC-004, FR-006.
- [X] T035 [P] Confirm the existing `agency-spec-kit` entry in `.claude-plugin/marketplace.json` is byte-identical to its pre-edit state (cross-document invariants).

## Dependencies & Execution Order

**Sequential gates**:
- Phase 1 (T001–T004) must complete before Phase 2 — the reference shape informs every file written in Phase 2.
- Phase 2 (T010–T012) must complete before Phase 3 — the marketplace entry reuses the exact `description` from `plugin.json` (T010 → T020).
- Phase 3 (T020) must complete before Phase 4 validation.

**Parallel opportunities**:
- Phase 1: T002, T003, T004 can run in parallel after T001 starts (all independent reads). T001 is listed first only because the plugin.json manifest is the most critical reference.
- Phase 2: T011 (.gitkeep) and T012 (README) can run in parallel with T010 (plugin.json) — they touch disjoint files. (T020 in Phase 3 depends on T010's `description` value.)
- Phase 4: T031, T032, T033, T034, T035 are read-only checks on already-written files and can all run in parallel after T030.

**Critical path**: T001 → T010 → T020 → T030 → (parallel validation fan-out).
