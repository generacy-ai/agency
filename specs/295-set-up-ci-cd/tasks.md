# Tasks: CI/CD and npm Publishing

**Input**: Design documents from feature directory
**Prerequisites**: plan.md (required), spec.md (required)
**Status**: Ready

## Format: `[ID] [P?] [Story] Description`
- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to

---

## Phase 1: Package Configuration Updates

Prepare all packages for npm publishing by updating metadata, dependencies, and changesets config.

### T001 Update `@generacy-ai/agency` latency dependency and add publishConfig
**File**: `packages/agency/package.json`
- Change `"@generacy-ai/latency": "link:/workspaces/latency/packages/latency"` to `"@generacy-ai/latency": "^0.1.0"`
- Add `"publishConfig": { "access": "public" }` to the package

### T002 [P] Add publishConfig to `@generacy-ai/agency-plugin-docker`
**File**: `packages/agency-plugin-docker/package.json`
- Add `"publishConfig": { "access": "public" }`

### T003 [P] Add publishConfig to `@generacy-ai/agency-plugin-firebase`
**File**: `packages/agency-plugin-firebase/package.json`
- Add `"publishConfig": { "access": "public" }`

### T004 [P] Add publishConfig to `@generacy-ai/agency-plugin-git`
**File**: `packages/agency-plugin-git/package.json`
- Add `"publishConfig": { "access": "public" }`

### T005 [P] Add publishConfig to `@generacy-ai/agency-plugin-humancy`
**File**: `packages/agency-plugin-humancy/package.json`
- Add `"publishConfig": { "access": "public" }`

### T006 [P] Add publishConfig to `@generacy-ai/agency-plugin-npm`
**File**: `packages/agency-plugin-npm/package.json`
- Add `"publishConfig": { "access": "public" }`

### T007 [P] Add publishConfig to `@generacy-ai/agency-plugin-spec-kit`
**File**: `packages/agency-plugin-spec-kit/package.json`
- Add `"publishConfig": { "access": "public" }`

### T008 [P] Update changesets configuration
**File**: `.changeset/config.json`
- Change `baseBranch` from `"main"` to `"develop"`
- Add `ignore` array with `["@generacy-ai/agency-extension", "claude-plugin-agency-spec-kit"]`

---

## Phase 2: CI Workflow

Create the main CI workflow that runs on PRs and pushes to `develop`/`main`.

### T009 Create CI workflow
**File**: `.github/workflows/ci.yml`
- Create `.github/workflows/` directory
- Define workflow triggers: `pull_request` to `[develop, main]` and `push` to `[develop, main]`
- Add concurrency group `ci-${{ github.ref }}` with `cancel-in-progress: true`
- Create 4 parallel jobs: `lint`, `typecheck`, `test`, `build`
  - Each job: checkout → pnpm/action-setup@v4 → setup-node@v4 (node 20, cache pnpm) → `pnpm install --frozen-lockfile` → run task
- Create `ci-summary` gate job with `needs: [lint, typecheck, test, build]` and `if: always()`
  - Check all upstream job results, exit 1 if any failed
  - This single job name (`CI Summary`) is the branch protection check target

---

## Phase 3: Changeset Bot Workflow

Non-blocking PR comments about missing changesets.

### T010 Create changeset bot workflow
**File**: `.github/workflows/changeset-bot.yml`
- Trigger on `pull_request` types `[opened, synchronize]` to `develop`
- Single job using `changesets/bot@v1` action
- Checkout with `fetch-depth: 0` for full git history

---

## Phase 4: Preview Publish Workflow

Publish snapshot versions with `@preview` dist-tag on push to `develop`.

### T011 Create preview publish workflow
**File**: `.github/workflows/publish-preview.yml`
- Trigger on `push` to `[develop]`
- Concurrency group `publish-preview-${{ github.ref }}` (no `cancel-in-progress` — queue to avoid aborting mid-publish)
- Set permissions: `contents: read`, `id-token: write` (for npm provenance)
- Steps:
  - Checkout with `fetch-depth: 0`
  - Setup pnpm + node 20 with `registry-url: https://registry.npmjs.org`
  - `pnpm install --frozen-lockfile` and `pnpm build`
  - Check for changeset `.md` files (excluding README.md), set `has_changesets` output
  - Verify `@generacy-ai/latency` is available on npm (warn and skip if not — soft failure)
  - If changesets present and deps available: `pnpm changeset version --snapshot preview` then `pnpm changeset publish --tag preview --provenance`
  - Environment: `NODE_AUTH_TOKEN` from `secrets.NPM_TOKEN`, `GITHUB_TOKEN`

---

## Phase 5: Stable Release Workflow

Use changesets/action to manage version PRs and stable npm publishes on `main`.

### T012 Create stable release workflow
**File**: `.github/workflows/release.yml`
- Trigger on `push` to `[main]`
- Concurrency group `publish-release-${{ github.ref }}` (no `cancel-in-progress`)
- Set permissions: `contents: write`, `pull-requests: write`, `id-token: write`
- Steps:
  - Checkout with `fetch-depth: 0`
  - Setup pnpm + node 20 with `registry-url: https://registry.npmjs.org`
  - `pnpm install --frozen-lockfile` and `pnpm build`
  - Verify `@generacy-ai/latency` is available on npm (hard error — `exit 1` if not found)
  - Use `changesets/action@v1` with `publish: pnpm changeset publish --provenance`
  - Set `title` and `commit` to `"chore: version packages"`
  - Environment: `GITHUB_TOKEN`, `NODE_AUTH_TOKEN` from `secrets.NPM_TOKEN`

---

## Phase 6: Initial Changeset

Create the first changeset to bump all packages from `0.0.0` to `0.1.0`.

### T013 Create initial release changeset
**File**: `.changeset/initial-release.md`
- Add YAML frontmatter listing all 7 publishable packages with `minor` bump type:
  - `@generacy-ai/agency`
  - `@generacy-ai/agency-plugin-docker`
  - `@generacy-ai/agency-plugin-firebase`
  - `@generacy-ai/agency-plugin-git`
  - `@generacy-ai/agency-plugin-humancy`
  - `@generacy-ai/agency-plugin-npm`
  - `@generacy-ai/agency-plugin-spec-kit`
- Description: "Initial release of agency packages"

---

## Phase 7: Verification

Validate all changes work correctly before merging.

### T014 Verify lockfile consistency
**Command**: `pnpm install --frozen-lockfile`
- Ensure lockfile is still valid after dependency changes (latency `link:` → `^0.1.0`)
- If frozen-lockfile fails, run `pnpm install` to update lockfile and commit the change

### T015 [P] Run lint
**Command**: `pnpm lint`
- Ensure all packages pass linting after changes

### T016 [P] Run typecheck
**Command**: `pnpm typecheck`
- Ensure all packages pass type checking after changes

### T017 [P] Run tests
**Command**: `pnpm test`
- Ensure all tests pass after changes

### T018 [P] Run build
**Command**: `pnpm build`
- Ensure all packages build successfully after changes

### T019 Verify publishConfig presence
**Command**: Manual or scripted check
- Confirm all 7 publishable packages have `"publishConfig": { "access": "public" }`
- Confirm `@generacy-ai/agency-extension` does NOT have `publishConfig`
- Confirm no `link:` dependencies remain in any package.json

### T020 Validate workflow YAML syntax
**Files**:
- `.github/workflows/ci.yml`
- `.github/workflows/changeset-bot.yml`
- `.github/workflows/publish-preview.yml`
- `.github/workflows/release.yml`
- Validate YAML syntax (use `actionlint` if available, or manual review)

---

## Phase 8: Branch Sync and Protection (Post-Merge Manual Steps)

These are manual operations performed after the PR is merged to `develop`.

### T021 Force-push develop to main
**Command**: `git push origin develop:main --force`
- One-time operation to sync `main` (111 commits behind) with `develop`
- Must be done AFTER all workflow files are merged to `develop`
- Must be done BEFORE configuring branch protection

### T022 Configure branch protection on main
**Tool**: GitHub UI or `gh` CLI
- Require pull request before merging
- Required status checks: `CI Summary` (the gate job from Phase 2)
- Require branches to be up to date before merging
- Restrict who can push: core team only
- Must be done AFTER T021 (branch sync)

### T023 Verify NPM_TOKEN secret is configured
**Tool**: GitHub UI or `gh` CLI
- Confirm `NPM_TOKEN` is set as a GitHub Actions secret (org or repo level)
- Should be a granular token scoped to `@generacy-ai` packages
- Required for both preview and stable publish workflows

---

## Dependencies & Execution Order

**Phase dependencies (sequential)**:
- Phase 1 (package config) has no prerequisites — start here
- Phases 2-6 (workflows + changeset) depend on Phase 1 for context but touch different files — can start in parallel with Phase 1
- Phase 7 (verification) depends on all of Phases 1-6 being complete
- Phase 8 (branch sync + protection) is post-merge and depends on the PR being merged to `develop`

**Parallel opportunities within phases**:
- **Phase 1**: T001-T008 all touch different files and can run in parallel
- **Phase 2-6**: T009-T013 all create different files and can run in parallel
- **Phase 7**: T015-T018 (lint, typecheck, test, build) can run in parallel after T014 (lockfile check)

**Critical path**:
T001 (latency dep) → T014 (lockfile verify) → T015-T018 (CI checks in parallel) → T019-T020 (final validation) → Merge PR → T021 (branch sync) → T022 (branch protection) → T023 (NPM_TOKEN verify)

**Independent parallel tracks**:
- Track A: T001-T008 (all package.json + changeset config edits)
- Track B: T009-T013 (all workflow files + initial changeset)
- Both tracks merge at T014 (verification)
