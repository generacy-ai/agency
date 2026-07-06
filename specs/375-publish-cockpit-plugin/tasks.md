# Tasks: Publish claude-plugin-cockpit as @generacy-ai/claude-plugin-cockpit

**Input**: Design documents from `/specs/375-publish-cockpit-plugin/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, quickstart.md, contracts/package.json.schema.md
**Status**: Complete

## Format: `[ID] [P?] [Story] Description`
- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to

## Phase 1: Setup & Reconnaissance

- [ ] T001 Confirm current `packages/claude-plugin-cockpit/` layout: verify no `package.json` exists yet, the 6 command files are present (`commands/clarify.md`, `commands/merge.md`, `commands/queue.md`, `commands/review.md`, `commands/status.md`, `commands/watch.md`), `.claude-plugin/plugin.json` exists, and `README.md` exists.
- [ ] T002 [P] Read `packages/agency-plugin-spec-kit/package.json` for exact `repository`, `publishConfig`, `author`, `license` shape to mirror.
- [ ] T003 [P] Read `.changeset/config.json` to confirm `baseBranch: develop`, `access: public`, and the `ignore` list does not contain the new package name.
- [ ] T004 [P] Read `.github/workflows/publish-preview.yml` to confirm the workflow enumerates non-private workspace packages and consumes `.changeset/*.md` (no workflow edit needed — FR-006).

## Phase 2: Core Implementation

- [ ] T010 [US1] Create `packages/claude-plugin-cockpit/package.json` exactly per `contracts/package.json.schema.md`: `name: "@generacy-ai/claude-plugin-cockpit"`, `version: "0.0.0"`, `description`, `keywords`, `author: "Generacy AI"`, `license: "Apache-2.0"`, `repository { type, url, directory: "packages/claude-plugin-cockpit" }`, `files: ["commands", ".claude-plugin", "README.md"]`, `publishConfig: { "access": "public" }`. MUST omit `private`, `type`, `main`, `module`, `types`, `exports`, `bin`, `scripts`, `agency`, and all `*dependencies` fields.
- [ ] T011 [P] [US2] Create `.changeset/publish-cockpit-plugin.md` with frontmatter `"@generacy-ai/claude-plugin-cockpit": minor` and the one-line release note from `research.md` D-Pattern (Changeset entry for a new package). Confirm filename is not `README.md` and lives under `.changeset/`.
- [ ] T012 [US1] Update `packages/claude-plugin-cockpit/README.md`: replace the "Installation" section that currently references `extraKnownMarketplaces` with an npm-based install path (mirroring the sibling `agency-plugin-spec-kit` README pattern). Keep wording concise; SC-003 requires this.

## Phase 3: Verification

- [ ] T020 [US1] From `packages/claude-plugin-cockpit/`, run `pnpm pack --dry-run` and confirm the file list is exactly the 9 files from the contract: `package.json`, `README.md`, `.claude-plugin/plugin.json`, and all 6 `commands/*.md`. No `.turbo/`, no `docs/`, no `tests/`, no `dist/`, no `node_modules/`. This is the FR-007 / SC-001 gate.
- [ ] T021 [P] [US1] From `packages/claude-plugin-cockpit/`, run `pnpm pack` to produce the tarball, then `tar tzf generacy-ai-claude-plugin-cockpit-*.tgz | sort` and confirm the same 9 `package/*` entries. Delete the tarball after inspection.
- [ ] T022 [P] [US2] Run the workflow's discovery command from repo root: `find .changeset -name '*.md' ! -name 'README.md'` and confirm `.changeset/publish-cockpit-plugin.md` appears in the output.
- [ ] T023 [US1] From repo root, run `pnpm install --frozen-lockfile` then `pnpm build`. If turbo/pnpm errors that the cockpit package is missing a `build` script, add `"scripts": { "build": "true" }` to `packages/claude-plugin-cockpit/package.json` (Q3 escape hatch documented in `quickstart.md` Step 5 and `plan.md` risks table) and re-run. If it passes cleanly without a build script, do NOT add one.

## Phase 4: Deliver

- [ ] T030 [US1] Stage exactly the allowed files (FR-006): `packages/claude-plugin-cockpit/package.json`, `packages/claude-plugin-cockpit/README.md`, `.changeset/publish-cockpit-plugin.md`. Run `git status` and confirm no other files are modified (especially none under `packages/claude-plugin-cockpit/commands/` or `.claude-plugin/`, and no changes to `.github/workflows/publish-preview.yml` or `.changeset/config.json`).
- [ ] T031 [US1] Commit and push branch `375-publish-cockpit-plugin`, then open a PR against `develop` with a summary linking issue #374 and referencing the epic (`generacy-ai/tetrad-development#85`, Phase S6 / A-S2).
- [ ] T032 [US1, US2] Post-merge verification (documented on the PR, executed by the merge author after CI publishes): `npm view @generacy-ai/claude-plugin-cockpit dist-tags` shows a `preview` tag pointing at `0.1.0-preview-<snapshot>`. This closes SC-002.

## Dependencies & Execution Order

**Sequential spine**:
- Phase 1 (T001) before Phase 2 (needs to confirm current layout).
- T010 before T020/T021 (need `package.json` and `files` field to pack).
- T011 before T022 (need the changeset file to exist to be discoverable).
- T020/T021/T022/T023 all before T030 (verification gates deliver).
- T030 before T031 before T032.

**Parallel opportunities**:
- T002, T003, T004 can run in parallel (independent read-only lookups).
- T010, T011, T012 target different files and can be authored in parallel after Phase 1.
- T021 and T022 are independent verifications and can run in parallel with T020.

**Isolation reminder (FR-006)**:
- Allowed edits: `packages/claude-plugin-cockpit/package.json`, `packages/claude-plugin-cockpit/README.md`, `.changeset/publish-cockpit-plugin.md`.
- Forbidden: any file under `packages/claude-plugin-cockpit/commands/`, `packages/claude-plugin-cockpit/.claude-plugin/`, `.github/workflows/publish-preview.yml`, `.changeset/config.json`, and everything outside `packages/claude-plugin-cockpit/` except the one new changeset.
