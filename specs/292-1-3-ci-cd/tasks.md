# Tasks: CI/CD for Agency Repo

**Input**: Design documents from `specs/292-1-3-ci-cd/`
**Prerequisites**: plan.md (required), spec.md (required)
**Status**: Ready

## Format: `[ID] [P?] [Story] Description`
- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to

---

## Phase 1: Stable Release Safety & Provenance

### T001 Update `release.yml` trigger to `workflow_run` CI gate
**File**: `.github/workflows/release.yml`
- Change `on: push` trigger to `on: workflow_run` gated on the `CI` workflow completing on `main`
- Add `if` conditional on the `release` job: `github.event.workflow_run.conclusion == 'success' && github.event.workflow_run.event == 'push'`
- Update concurrency group from `publish-release-${{ github.ref }}` to static `publish-release` (since `github.ref` is unreliable under `workflow_run`)

### T002 Add `--provenance` flag to stable publish command
**File**: `.github/workflows/release.yml`
- Change `publish: pnpm changeset publish` to `publish: pnpm changeset publish --provenance`
- Note: `id-token: write` permission is already set (line 14)

---

## Phase 2: Latency Dependency Verification

### T003 [P] Add latency verification step to `publish-preview.yml` (soft gate)
**File**: `.github/workflows/publish-preview.yml`
- Insert a new step after "Check for changesets" (after line 40) with `id: latency`
- The step runs `npm view @generacy-ai/latency@preview version` and sets `found=true`/`found=false` output
- Conditional: only runs if `steps.changesets.outputs.has_changesets == 'true'`
- On failure: emit `::warning::` annotation and set `found=false` (soft failure — skip publish, don't fail workflow)
- Update all subsequent step conditions (lines 43, 49, 55, 59, 63, 67) to also require `steps.latency.outputs.found == 'true'`
- Updated condition pattern: `if: steps.changesets.outputs.has_changesets == 'true' && steps.latency.outputs.found == 'true'`

### T004 [P] Add latency verification step to `release.yml` (hard gate)
**File**: `.github/workflows/release.yml`
- Insert a new step after "Install dependencies" (`pnpm install`) and before "Build"
- The step runs `npm view @generacy-ai/latency@latest version`
- On failure: emit `::error::` annotation and `exit 1` (hard failure — blocks the release entirely)
- Rationale: stable consumers would get unresolvable dependencies if latency isn't published

---

## Phase 3: Node Version Consistency

### T005 [P] Fix Node version in `changeset-bot.yml`
**File**: `.github/workflows/changeset-bot.yml`
- Change `node-version: 20` (line 19) to `node-version: 22`
- Aligns with all other workflows (`ci.yml`, `release.yml`, `publish-preview.yml`) which use Node 22

---

## Phase 4: Documentation

### T006 [P] Create branch protection setup checklist
**File**: `.github/BRANCH_PROTECTION.md` (new file)
- Document required branch protection rules for `main` branch:
  - Require PR reviews (1 approval, dismiss stale approvals)
  - Require status check: `CI Summary` (exact name matching `ci-summary` job in `ci.yml`)
  - Require branches to be up to date
  - Enforce for administrators (recommended)
- Document required branch protection rules for `develop` branch:
  - Require status check: `CI Summary`
  - Do NOT require PR reviews
  - Do NOT enforce for administrators
- Critical detail: the status check name `CI Summary` must match exactly — this corresponds to the `ci-summary` job's `name:` field in `ci.yml` (line 68)

---

## Phase 5: Validation

### T007 Validate YAML syntax of all modified workflows
**Files**:
- `.github/workflows/release.yml`
- `.github/workflows/publish-preview.yml`
- `.github/workflows/changeset-bot.yml`
- Verify valid YAML syntax (no tabs, correct indentation)
- Verify all `uses:` action references are valid
- Verify all `${{ }}` expression syntax is correct
- Verify step `id` references match between steps (e.g., `steps.latency.outputs.found`)

### T008 Validate workflow trigger and condition logic
**Files**:
- `.github/workflows/release.yml`
- `.github/workflows/publish-preview.yml`
- Confirm `release.yml` `workflow_run` trigger references the correct workflow name `CI` (must match `name: CI` in `ci.yml` line 1)
- Confirm `publish-preview.yml` already uses `workflow_run` pattern correctly (use as reference for `release.yml` changes)
- Confirm conditional step chaining in `publish-preview.yml` correctly gates all publish-related steps behind both changeset and latency checks

### T009 Push branch and open PR for review
- Push `292-1-3-ci-cd` branch to remote
- Open PR against `develop` with summary of all changes
- Verify CI passes on the PR itself (the existing `ci.yml` should run)

---

## Dependencies & Execution Order

**Phase dependencies (sequential)**:
- Phase 1 (T001, T002) must complete before Phase 2 T004 (both modify `release.yml`)
- All implementation phases (1-4) must complete before Phase 5 (validation)

**Parallel opportunities within phases**:
- T001 and T002 modify the same file but different sections — execute sequentially
- T003, T004, T005, T006 are marked [P] — they modify different files and can run in parallel
  - However, T004 depends on T001/T002 completing first (same file: `release.yml`)
  - T003, T005, T006 are fully independent and can run in parallel with each other and with Phase 1
- T007 and T008 can run in parallel (both are read-only validation)

**Critical path**:
```
T001 → T002 → T004 → T007 → T008 → T009
         ↑ (same file)  ↑ (same file)

T003 ─────────────────→ T007 (independent, parallel with T001/T002)
T005 ─────────────────→ T007 (independent, parallel with T001/T002)
T006 ─────────────────→ T008 (independent, parallel with T001/T002)
```

**External blockers**:
- `@generacy-ai/latency` npm publishing (generacy#242) — does NOT block implementation of these workflows, only blocks runtime verification steps from succeeding in CI
