# Tasks: publish `@generacy-ai/claude-plugin-cockpit`

**Input**: Design documents from `/specs/374-epic-generacy-ai-tetrad/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, contracts/, quickstart.md
**Status**: Complete

## Format: `[ID] [P?] [Story] Description`
- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1 = cluster install rail, US2 = changesets entry)

## Phase 1: Setup / Preflight

- [ ] T001 Confirm branch and clean tree — run `git rev-parse --abbrev-ref HEAD` (expect `374-epic-generacy-ai-tetrad`) and `git status` (expect clean) before starting.
- [ ] T002 [P] Confirm sibling precedent — read `packages/agency-plugin-spec-kit/package.json` to cross-check `author`, `license`, `repository`, and `publishConfig` fields will match verbatim (data-model.md Entity 1).
- [ ] T003 [P] Confirm command payload — `ls packages/claude-plugin-cockpit/commands/` must list exactly six files: `watch.md`, `status.md`, `queue.md`, `clarify.md`, `review.md`, `merge.md` (spec FR-007).
- [ ] T004 [P] Confirm plugin manifest — `packages/claude-plugin-cockpit/.claude-plugin/plugin.json` must exist and remain untouched by this feature (spec FR-006).

## Phase 2: Core Implementation (three file edits — independent, all [P])

- [ ] T010 [P] [US1] Add `packages/claude-plugin-cockpit/package.json` matching `contracts/package-json.contract.md` — required fields: `name: "@generacy-ai/claude-plugin-cockpit"`, `version: "0.0.0"`, `description` (per FR-008 amended), `keywords: ["claude-plugin","cockpit","generacy","tetrad","workflow"]`, `author: "Generacy AI"`, `license: "Apache-2.0"`, `repository: { type, url, directory }`, `files: ["commands", ".claude-plugin", "README.md"]`, `publishConfig: { access: "public" }`. MUST NOT include `private`, `type`, `main`, `module`, `types`, `exports`, `bin`, `scripts`, `dependencies`, `devDependencies`, `peerDependencies`, or any `agency` block (FR-010, FR-011). File ends with a newline.
- [ ] T011 [P] [US2] Add exactly one changeset file at `.changeset/publish-claude-plugin-cockpit.md` matching `contracts/changeset.contract.md` — frontmatter `"@generacy-ai/claude-plugin-cockpit": minor`, one-to-three-line body describing the addition. Filename slug MUST NOT be `README.md`.
- [ ] T012 [P] [US1] Edit `packages/claude-plugin-cockpit/README.md` — insert a new `## Distribution` H2 section between existing `## Installation` and `## Available Commands` sections, per `contracts/readme-distribution.contract.md`. Must (a) name the npm package `@generacy-ai/claude-plugin-cockpit`, (b) document the `preview` and `latest` dist-tags, (c) state cluster setup consumes it automatically with no `extraKnownMarketplaces` step, (d) explicitly retain the marketplace path for standalone users. No other sections or content changes.

## Phase 3: Local Verification (must all pass before opening a PR)

- [ ] T020 [US1] Validate JSON — run `node -e "JSON.parse(require('fs').readFileSync('packages/claude-plugin-cockpit/package.json'))"` and confirm zero output (valid JSON). Run the one-shot check from `contracts/package-json.contract.md`; expect `OK`.
- [ ] T021 [US2] Verify changeset shape — run the one-shot check from `contracts/changeset.contract.md`; expect `OK`. Confirm frontmatter package name matches T010 exactly.
- [ ] T022 [US1] Verify README section — run the one-shot check from `contracts/readme-distribution.contract.md`; expect `OK`. Confirm no pre-existing section was modified (`git diff packages/claude-plugin-cockpit/README.md` — additions only, no deletions).
- [ ] T023 [US1] Verify packed tarball contents — from `packages/claude-plugin-cockpit/` run `pnpm pack`, capture the tarball name, then `tar tzf <tarball> | grep -v '/$' | sort`. Output MUST be exactly the nine lines listed in quickstart Step 4 / `contracts/tarball.contract.md`. Delete the tarball afterward; do not commit it.
- [ ] T024 [US1] Verify diff scope (SC-004) — `git diff --name-only develop... | sort` must print exactly three lines: `.changeset/<slug>.md`, `packages/claude-plugin-cockpit/README.md`, `packages/claude-plugin-cockpit/package.json`. Any other file ⇒ revert before proceeding.
- [ ] T025 [US1] Sanity-check build skip — run `pnpm -r --if-present run build --filter @generacy-ai/claude-plugin-cockpit` and confirm it exits 0 with no work performed (package has no `scripts.build`, per FR-011 / research Decision 4).

## Phase 4: Merge & Post-Merge Verification

- [ ] T030 [US1] Commit, push, and open PR against `develop` per quickstart Step 6. Wait for `ci.yml` to pass.
- [ ] T031 [US1] Merge the PR to `develop`, then watch the `Publish Preview` workflow run (`gh run watch`) triggered by CI completion. Confirm it succeeds.
- [ ] T032 [US1] Verify npm publish (SC-002) — run `npm view @generacy-ai/claude-plugin-cockpit@preview version`. MUST return a version string of the form `0.1.0-preview-<snapshot>`. If it returns `E404` or empty, consult the troubleshooting matrix in `quickstart.md` Step 7.
- [ ] T033 [P] [US1] Optional smoke test — simulate a cluster consumer per quickstart's "Post-publish smoke test": `npm install @generacy-ai/claude-plugin-cockpit@preview` in an empty dir; confirm six `commands/*.md` files and `.claude-plugin/plugin.json` are present under `node_modules/@generacy-ai/claude-plugin-cockpit/`.

## Dependencies & Execution Order

**Phase order** (sequential):
- Phase 1 (setup / preflight) → Phase 2 (edits) → Phase 3 (local verification) → Phase 4 (merge + npm)

**Parallel opportunities**:
- T002, T003, T004 — read-only preflight checks; run concurrently.
- T010, T011, T012 — the three edits touch disjoint files (`package.json`, `.changeset/*.md`, `README.md`) with no data dependency between them.
- T020, T021, T022 — per-file contract checks; independent of each other. Run after the corresponding edit tasks in Phase 2.
- T023, T024, T025 — depend on all Phase 2 edits being complete. Once T010-T012 are done, T023/T024/T025 can run concurrently.
- T033 — depends on T032 (must be published first), but is independent of the merge workflow otherwise.

**Critical path**:
T001 → T010 → T023 → T024 → T030 → T031 → T032. Everything else is verification alongside this path.

**Contracts referenced**:
- `contracts/package-json.contract.md` — Entity 1 shape (T010, T020)
- `contracts/changeset.contract.md` — Entity 2 shape (T011, T021)
- `contracts/readme-distribution.contract.md` — Entity 3 shape (T012, T022)
- `contracts/tarball.contract.md` — Entity 4 shape (T023)
