# Tasks: Fix Release Workflow Peer-Dep Consistency Check

**Input**: Design documents from `/specs/415-summary-release-workflow-s/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, quickstart.md, contracts/
**Status**: Complete

## Format: `[ID] [P?] [Story] Description`
- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1, US2, US3)

**Sole file modified**: `.github/workflows/release.yml`

Because every implementation task edits the same file, no `[P]` markers appear on
Phase 2 tasks — they must be sequenced to avoid conflicting edits. Verification
tasks in Phase 3 are read-only and marked `[P]`.

---

## Phase 1: Baseline

- [X] T001 Read the current `Validate latest peer-dep consistency` step in `.github/workflows/release.yml` (lines ~59–118) and confirm three things: (a) the hardcoded `PACKAGES = [...]` list is present and omits `@generacy-ai/claude-plugin-cockpit`, (b) `steps.changesets.outputs.publishedPackages` is not yet consumed, (c) `--tag stable` remains the publish tag on the `pnpm changeset publish` step (~line 52). Capture the exact line numbers of the step boundaries — they anchor T010's rewrite.

- [X] T002 Confirm `semver` is resolvable in the step's inline Node via the workspace `pnpm install --frozen-lockfile` that runs earlier in the job (see `.github/workflows/release.yml` around line 36). No install step needs to be added; if it is not resolvable, stop and add `require('semver')` availability before proceeding with T010.

- [X] T003 Confirm `NPM_TOKEN` auth is written to `~/.npmrc` for the runner by the `changesets/action@v1` step (or the surrounding publish step at ~line 57). T020 reuses that auth surface for `npm dist-tag add`; if `.npmrc` is not present when the new step runs, T020's inline block must write it explicitly (matches pattern in `research.md` §P3).

---

## Phase 2: Implementation

<!-- All Phase 2 tasks edit `.github/workflows/release.yml`. Complete sequentially. -->

- [X] T010 [US1] **Rewrite** the existing step `Validate latest peer-dep consistency` in `.github/workflows/release.yml` to `Validate published tag family peer-dep consistency`. Concrete changes:
  - Remove the hardcoded `PACKAGES = [...]` list.
  - Add `env: PUBLISHED_PACKAGES: ${{ steps.changesets.outputs.publishedPackages }}` and `PUBLISH_TAG: stable` on the step (pattern in `research.md` §P1).
  - Rewrite the inline Node to parse `PUBLISHED_PACKAGES` (JSON array of `{name, version}`) and build the `FamilyMap` defined in `data-model.md`: (1) seed each published package at its new version (`source: "published"`) using `npm info <name>@<version> --json` for its `peerDependencies`; (2) one hop out — for each peer referenced by a published package that is not already in the map, `npm info <peer>@<PUBLISH_TAG> --json`, `source: "registry"`; skip peers missing on the registry (mirror existing null-tolerant behaviour at ~line 100).
  - Implement the `isConsistent` predicate exactly as `data-model.md` §Peer-dep validation predicate specifies: iterate published packages, iterate their `peerDependencies`, skip peers not in `FamilyMap` and ranges where `!semver.validRange(range)`, count a conflict when `!semver.satisfies(FamilyMap[peer].version, range)`, `process.exit(conflicts.length ? 1 : 0)`.
  - Keep the outer `if: steps.changesets.outputs.published == 'true'` gate. Preserve the "Peer dep conflict:" log line format so downstream troubleshooting docs in `quickstart.md` §Troubleshooting stay accurate.
  - Satisfies FR-001, FR-002, FR-006, FR-007; US1 acceptance criteria 1–3.

- [X] T011 [US2] **Add** a new step immediately after T010's step in `.github/workflows/release.yml`: `Advance @latest for stable publishes`.
  - Guard: `if: steps.changesets.outputs.published == 'true' && env.PUBLISH_TAG == 'stable'`.
  - `env:` block sets `NPM_TOKEN: ${{ secrets.NPM_TOKEN }}`, `PUBLISHED_PACKAGES: ${{ steps.changesets.outputs.publishedPackages }}`, `PUBLISH_TAG: stable`.
  - Body: if `~/.npmrc` is not already present with the auth token, write `//registry.npmjs.org/:_authToken=${NPM_TOKEN}` to it (see T003 finding). Then `JSON.parse(process.env.PUBLISHED_PACKAGES)` and for each `{name, version}` shell out `npm dist-tag add ${name}@${version} latest` via `child_process.execSync(..., { stdio: 'inherit' })`.
  - A failure of any single `npm dist-tag add` MUST fail the step (real auth/network/registry problem, not the drift being demoted).
  - Satisfies FR-004; US2 acceptance criteria 1 (advancement on stable) and 2 (preview never touches `@latest`).

- [X] T012 [US3] **Add** a new step immediately after T011's step in `.github/workflows/release.yml`: `Emit @latest drift advisory`.
  - Guard: `if: steps.changesets.outputs.published == 'true'` (advisory runs regardless of channel, but only when a publish occurred).
  - `env:` block sets `PUBLISHED_PACKAGES: ${{ steps.changesets.outputs.publishedPackages }}`.
  - Body: for each `{name}` in the parsed array, read `npm view <name>@latest version` and `npm view <name>@stable version` (tolerate missing tags as `null`). When they diverge (either missing, or unequal), print a single `::warning::Residual @latest drift: <name>@latest is <latest|missing> but @stable is <stable|missing>` line — one per divergence, matching the format in `research.md` §P4.
  - MUST NOT `exit 1` under any condition (FR-003 — non-failing advisory).
  - Runs after T011 so post-advancement `@latest` state is what gets reported.
  - Satisfies FR-003; US3 acceptance criterion.

---

## Phase 3: Verification

<!-- Phase boundary: Complete Phase 2 before starting Phase 3. -->

- [X] T020 [P] [US1] Run the offline negative-path rehearsal in `quickstart.md` §"Verifying the negative path" verbatim against a Node ≥ 18 REPL. Expected output: `FAILED (expected):` followed by exactly one `Conflict` entry naming `@generacy-ai/agency-plugin-spec-kit → @generacy-ai/agency` with `range=^0.1.0`, `actual=0.0.9`. Confirms `isConsistent`'s conflict-detection semantics used in T010 (FR-006).

- [X] T021 [P] [US1] Run the offline positive-path rehearsal: same script as T020 but change the `@generacy-ai/agency` version to `0.1.0`. Expected output: `PASSED` with `exit 0` and an empty conflicts array. Confirms `@latest` drift elsewhere (simulated by a `source: "registry"` entry at an older version, not a published package with a violated peer range) does not redden the job.

- [X] T022 [P] [US2] Lint the workflow change with `actionlint` (or `pnpm dlx actionlint` if it is not preinstalled) against `.github/workflows/release.yml`. Zero errors expected. Catches YAML/expression syntax regressions in the three edited step blocks before they hit CI.

- [ ] T023 [US1, US2, US3] Post-merge, on the next real stable publish, verify the acceptance criteria against the actual Actions run per `quickstart.md` §"Verifying on the next real stable publish":
  - The `Release` job is green.
  - `Validate published tag family peer-dep consistency` step logs show `@stable`-tagged manifests being fetched (not `@latest`).
  - `Advance @latest for stable publishes` step logs show one `npm dist-tag add` per entry in `publishedPackages`.
  - Run the `for pkg in …` shell block in `quickstart.md` §"Verifying on the next real stable publish" to confirm `@latest == @stable` for every family package published in the run.
  - Any `Emit @latest drift advisory` `::warning::` lines are for family members that were **not** published in this run (residual drift, expected — Out of Scope per spec).
  - Sequential: depends on merge + first stable publish landing.

---

## Dependencies & Execution Order

**Sequential edges** (same file — cannot parallelize):
- T001 → T010 (need the current line boundaries before rewriting the step).
- T002 → T010 (need `semver` availability confirmed before authoring the predicate against it).
- T003 → T011 (need to know whether the `.npmrc` write is redundant or required).
- T010 → T011 → T012 (all three edit the same file; sequencing avoids merge conflicts and lets the advisory in T012 observe post-advancement state from T011).

**Parallel opportunities** (Phase 3, read-only or offline):
- T020, T021, T022 can run in parallel — none touch shared files or state.
- T023 waits for merge + next stable publish; it cannot be parallelized with Phase 2 tasks but the three sub-checks inside it (log inspection, shell block, advisory review) can be executed together during the same run inspection.

**Story-to-task mapping**:
- US1 (green release signal): T001, T002, T010, T020, T021, T023
- US2 (non-accumulating `@latest` drift): T003, T011, T022, T023
- US3 (residual drift advisory): T012, T023

**Estimated size**: ~3 additive edits to one file, single reviewable PR. No new files, no new scripts (per plan.md D5).

---

*Generated by /speckit:tasks — 2026-07-14*
