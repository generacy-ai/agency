# Tasks: CI/CD for Agency VS Code Extension

**Input**: Design documents from `specs/293-1-6-ci-cd/`
**Prerequisites**: plan.md (required), spec.md (required), clarifications.md (required)
**Status**: Ready

## Format: `[ID] [P?] [Story] Description`
- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to

---

## Phase 1: Changesets Integration

### T001 Remove extension from changesets ignore list
**File**: `.changeset/config.json`
- Remove `"@generacy-ai/agency-extension"` from the `ignore` array
- Keep `"claude-plugin-agency-spec-kit"` in the ignore list
- Verify JSON remains valid after edit

### T002 [P] Mark extension package as private
**File**: `packages/agency-extension/package.json`
- Add `"private": true` after the `"license"` field
- This prevents `changeset publish` from attempting npm publish
- `vsce` ignores this field; pnpm workspace resolution is unaffected
- Verify the extension still builds: `pnpm --filter @generacy-ai/agency-extension build`

---

## Phase 2: Preview Publishing (ci.yml)

### T003 Enhance publish-extension job with PAT guard and version check
**File**: `.github/workflows/ci.yml`
- Replace the existing `publish-extension` job (lines 67-83) with the enhanced version
- Add `VSCE_PAT` existence check step (id: `pat`) that outputs `has_pat` and emits a `::warning::` if missing
- Add version-exists check step (id: `version`) that queries Marketplace via `npx @vscode/vsce show` and outputs `exists`
- Gate `pnpm install`, `pnpm build`, and `vsce publish` steps on both `has_pat == 'true'` and `exists != 'true'`
- Update job name to `Publish Extension (Preview)` for clarity
- Keep `--pre-release` flag on the publish command
- Ensure `ci-summary` job does NOT depend on `publish-extension` (already the case)

---

## Phase 3: Stable Publishing (release.yml)

### T004 Add extension publish step to release workflow
**File**: `.github/workflows/release.yml`
- Add `id: changesets` to the existing "Create Release PR or Publish" step
- Add a new step "Publish extension to Marketplace" after the changesets action step
- Gate with `if: steps.changesets.outputs.published == 'true' && env.VSCE_PAT != ''`
- Run: `pnpm --filter @generacy-ai/agency-extension exec vsce publish --no-dependencies`
- Pass `VSCE_PAT: ${{ secrets.VSCE_PAT }}` as env
- No `--pre-release` flag (this is the stable channel)

---

## Phase 4: VSIX Artifact Upload (Optional)

### T005 Add VSIX artifact upload to CI
**File**: `.github/workflows/ci.yml`
- Add "Package VSIX" step that runs `pnpm --filter @generacy-ai/agency-extension package`
- Gate on: PAT exists OR version already published (so artifact is always available when the job runs)
- Add "Upload VSIX artifact" step using `actions/upload-artifact@v4`
- Set `if-no-files-found: ignore` and `retention-days: 30`
- Use `if: always()` to upload even on partial failures
- Upload path: `packages/agency-extension/*.vsix`
- Artifact name: `agency-extension-vsix`

---

## Phase 5: Documentation

### T006 [P] Create PUBLISHING.md with recovery procedure
**File**: `packages/agency-extension/PUBLISHING.md`
- Document the two release streams (preview via `develop`, stable via `main`)
- Document that VS Code Marketplace does NOT support unpublishing individual versions
- Document the recovery procedure: publish a newer fixed version (hotfix)
- Document the `VSCE_PAT` secret requirement and reference generacy#244
- Keep it concise — this is operational reference documentation

---

## Phase 6: Validation

### T007 Validate changesets integration locally
- Run `pnpm install` to verify pnpm workspace resolution is unaffected by `private: true`
- Run `pnpm --filter @generacy-ai/agency-extension build` to verify the extension builds
- Run `pnpm --filter @generacy-ai/agency-extension package` to verify VSIX packaging works

### T008 [P] Validate workflow YAML syntax
- Verify `ci.yml` is valid YAML (no syntax errors in the enhanced publish-extension job)
- Verify `release.yml` is valid YAML (no syntax errors in the added steps)
- Confirm step IDs, conditional expressions, and output references are syntactically correct

### T009 Validate CI behavior expectations
- Verify `ci-summary` does not list `publish-extension` in its `needs` array
- Confirm the publish-extension job `if` condition triggers only on `develop` push events
- Confirm the release job extension publish step triggers only when changesets publishes

---

## Dependencies & Execution Order

**Phase dependencies (sequential)**:
- Phase 1 must complete before Phase 2 (changesets integration establishes versioning before publishing workflows use it)
- Phase 2 and Phase 3 are independent of each other (different workflow files)
- Phase 4 depends on Phase 2 (adds steps to the same ci.yml job modified in Phase 2)
- Phase 5 is independent (documentation only)
- Phase 6 depends on Phases 1-4 (validates all implementation changes)

**Parallel opportunities within phases**:
- T001 and T002 can run in parallel (different files, no dependencies)
- T003 and T004 can run in parallel (different workflow files)
- T006 can run in parallel with any implementation task
- T007 and T008 can run in parallel (different validation concerns)

**Critical path**:
T001 → T003 → T005 → T007 → T009

**Estimated file changes**:
| File | Tasks |
|------|-------|
| `.changeset/config.json` | T001 |
| `packages/agency-extension/package.json` | T002 |
| `.github/workflows/ci.yml` | T003, T005 |
| `.github/workflows/release.yml` | T004 |
| `packages/agency-extension/PUBLISHING.md` | T006 (new file) |
