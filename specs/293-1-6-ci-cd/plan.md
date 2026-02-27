# Implementation Plan: CI/CD for Agency VS Code Extension

**Branch**: `293-1-6-ci-cd` | **Date**: 2026-02-27 | **Spec**: [spec.md](./spec.md) | **Clarifications**: [clarifications.md](./clarifications.md)

## Summary

Add CI/CD pipelines for building, packaging, and publishing the Agency VS Code extension to the VS Code Marketplace. Two release streams: preview (pre-release on `develop` merge) and stable (standard release on `main` merge). Integrate extension versioning with the existing changesets workflow while keeping extension publishing separate from npm publishing.

## Technical Context

- **Language**: YAML (GitHub Actions workflows), JSON (package configs)
- **Tools**: `@vscode/vsce` (^2.24.0) for packaging/publishing, `changesets` for versioning
- **Publisher**: `generacy-ai` (provisioned via generacy#244)
- **Extension ID**: `generacy-ai.agency`
- **Build**: esbuild (sub-second builds)
- **Node**: 22, pnpm workspaces

## Architecture Overview

```
develop push ──► ci.yml ──► [lint, typecheck, test, build] ──► publish-extension (pre-release)
                                                                │ skip if version already published
                                                                │ skip if VSCE_PAT missing

main push ──► ci.yml ──► release.yml ──► changesets/action ──► publish extension (stable)
                                          │                     │ only if changesets published
                                          ▼                     │ skip if VSCE_PAT missing
                                     npm publish
```

**Key design decisions** (from clarifications):
1. Extension preview publishing stays in `ci.yml` (Q3, Q7)
2. Stable publishing added to `release.yml` via changesets `published` output (Q4)
3. Skip publish gracefully if `VSCE_PAT` is missing (Q6)
4. Skip publish if version already exists on Marketplace (Q2)
5. Accept redundant builds for simplicity (Q9)
6. Extension removed from changesets ignore, marked `private: true` (Q1)
7. Keep `"preview": true` in package.json (Q5)

## Implementation Phases

### Phase 1: Changesets Integration

**Goal**: Enable changesets to manage extension versioning without attempting npm publish.

#### 1.1 Remove extension from changesets ignore list

**File**: `.changeset/config.json`

Change the `ignore` array from:
```json
"ignore": [
  "@generacy-ai/agency-extension",
  "claude-plugin-agency-spec-kit"
]
```
To:
```json
"ignore": [
  "claude-plugin-agency-spec-kit"
]
```

#### 1.2 Mark extension as private

**File**: `packages/agency-extension/package.json`

Add `"private": true` to prevent `changeset publish` from attempting an npm publish. This is the standard changesets pattern for packages that use non-npm distribution (like VS Code Marketplace).

Add after the `"license"` field:
```json
"private": true,
```

**Why this works**: Changesets checks `private` before publishing to npm. When `private: true`, changesets still bumps the version in `package.json` but skips the `npm publish` step. The `vsce publish` command reads the version from `package.json` directly.

---

### Phase 2: Preview Publishing (ci.yml)

**Goal**: Enhance the existing `publish-extension` job with version-exists check and graceful PAT handling.

#### 2.1 Add version-exists check and VSCE_PAT guard

**File**: `.github/workflows/ci.yml`

Replace the current `publish-extension` job (lines 67-83) with:

```yaml
  publish-extension:
    name: Publish Extension (Preview)
    runs-on: ubuntu-latest
    needs: [lint, typecheck, test, build]
    if: github.ref == 'refs/heads/develop' && github.event_name == 'push'
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm

      - name: Check VSCE_PAT
        id: pat
        run: |
          if [ -z "${{ secrets.VSCE_PAT }}" ]; then
            echo "has_pat=false" >> "$GITHUB_OUTPUT"
            echo "::warning::VSCE_PAT secret is not configured. Skipping extension publish."
          else
            echo "has_pat=true" >> "$GITHUB_OUTPUT"
          fi

      - name: Check if version already published
        if: steps.pat.outputs.has_pat == 'true'
        id: version
        run: |
          CURRENT_VERSION=$(node -p "require('./packages/agency-extension/package.json').version")
          echo "current=$CURRENT_VERSION"
          # Check if this version already exists on the Marketplace
          if npx @vscode/vsce show generacy-ai.agency --json 2>/dev/null | node -e "
            const data = JSON.parse(require('fs').readFileSync('/dev/stdin', 'utf8'));
            const versions = data.versions?.map(v => v.version) || [];
            process.exit(versions.includes('$CURRENT_VERSION') ? 0 : 1);
          " 2>/dev/null; then
            echo "exists=true" >> "$GITHUB_OUTPUT"
            echo "Version $CURRENT_VERSION already published. Skipping."
          else
            echo "exists=false" >> "$GITHUB_OUTPUT"
            echo "Version $CURRENT_VERSION not found on Marketplace. Will publish."
          fi

      - run: pnpm install --frozen-lockfile
        if: steps.pat.outputs.has_pat == 'true' && steps.version.outputs.exists != 'true'

      - run: pnpm build
        if: steps.pat.outputs.has_pat == 'true' && steps.version.outputs.exists != 'true'

      - name: Publish extension (pre-release)
        if: steps.pat.outputs.has_pat == 'true' && steps.version.outputs.exists != 'true'
        run: pnpm --filter @generacy-ai/agency-extension publish --pre-release
        env:
          VSCE_PAT: ${{ secrets.VSCE_PAT }}
```

**Key behaviors**:
- Skips entirely with a warning if `VSCE_PAT` is not configured (Q6)
- Checks Marketplace for existing version before publishing (Q2)
- Skips `pnpm install` and `pnpm build` when publish will be skipped (saves ~30s)
- Remains non-blocking — `ci-summary` does not depend on this job (Q3)
- Uses `--pre-release` flag for VS Code pre-release channel

**Note on version check**: The `vsce show` command queries the Marketplace API. If the extension has never been published (first run), the command will fail and the script falls through to `exists=false`, which is the correct behavior — it will proceed to publish. If network issues prevent the check, the worst case is attempting to re-publish an existing version, which `vsce` handles with a clear error (and the job is non-blocking).

**Alternative version check approach**: If `vsce show` proves unreliable in CI, a simpler alternative is to use the VS Code Marketplace REST API directly:
```bash
STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
  "https://marketplace.visualstudio.com/_apis/public/gallery/publishers/generacy-ai/vsextensions/agency/$CURRENT_VERSION/vspackage")
```
A 200 means the version exists; a 404 means it doesn't. This may be more reliable than parsing `vsce show` JSON output. The implementation should test both approaches and use whichever is more robust.

---

### Phase 3: Stable Publishing (release.yml)

**Goal**: Add extension publishing to the release workflow, triggered only when changesets actually publishes packages.

#### 3.1 Add extension publish step to release.yml

**File**: `.github/workflows/release.yml`

Add an `id` to the changesets action step, then add a conditional extension publish step after it:

```yaml
      - name: Create Release PR or Publish
        id: changesets
        uses: changesets/action@v1
        with:
          publish: pnpm changeset publish --provenance
          title: "chore: version packages"
          commit: "chore: version packages"
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          NPM_TOKEN: ${{ secrets.NPM_TOKEN }}

      - name: Publish extension to Marketplace
        if: steps.changesets.outputs.published == 'true' && env.VSCE_PAT != ''
        run: pnpm --filter @generacy-ai/agency-extension exec vsce publish --no-dependencies
        env:
          VSCE_PAT: ${{ secrets.VSCE_PAT }}
```

**Key behaviors**:
- Only runs when `changesets/action` actually publishes (not when it creates a version PR) (Q4)
- Skips gracefully if `VSCE_PAT` is not configured (Q6)
- Uses `vsce publish --no-dependencies` (same as the package.json `publish` script)
- No `--pre-release` flag — this is the stable release channel
- The `pnpm build` step earlier in the job already built the extension
- `vscode:prepublish` will run `pnpm build` again during `vsce publish` (accepted redundancy per Q9)

**Why `exec vsce publish` instead of the npm script**: Using `pnpm --filter ... exec vsce publish --no-dependencies` is equivalent to the `publish` script in package.json. Either form works. Using `exec` makes the flags explicit in the workflow file.

---

### Phase 4: VSIX Artifact Upload

**Goal**: Make built VSIX packages available as CI artifacts for manual testing, even when Marketplace publish is skipped.

#### 4.1 Add VSIX artifact to publish-extension job

**File**: `.github/workflows/ci.yml`

Add after the build step (before or alongside the publish step):

```yaml
      - name: Package VSIX
        if: steps.pat.outputs.has_pat == 'true' || steps.version.outputs.exists == 'true'
        run: pnpm --filter @generacy-ai/agency-extension package
        # Runs even when publish is skipped, so the artifact is always available

      - name: Upload VSIX artifact
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: agency-extension-vsix
          path: packages/agency-extension/*.vsix
          if-no-files-found: ignore
          retention-days: 30
```

**Rationale**: Per Q2, not every `develop` push will publish to the Marketplace (only when version changes). Uploading the VSIX as a CI artifact ensures developers can always download and test the latest build, even if the Marketplace version hasn't changed.

**Note**: The `if-no-files-found: ignore` prevents the step from failing when the VSIX wasn't built (e.g., when the PAT check skips early). The `if: always()` ensures the artifact upload runs even if previous steps fail, catching partial builds.

On reflection, the artifact upload adds nice-to-have functionality but also complexity to the job. Given the spec's emphasis on simplicity (Q9), this step is **optional** and can be deferred. The core requirement is Marketplace publishing, not artifact management.

---

### Phase 5: Documentation Update

**Goal**: Correct the rollback documentation per Q8.

#### 5.1 Update PUBLISHING.md

**File**: `packages/agency-extension/PUBLISHING.md`

Add or update a "Recovery" section documenting that VS Code Marketplace does not support unpublishing individual versions. Recovery from a bad publish means publishing a newer fixed version (hotfix).

---

## Files Changed (Summary)

| File | Change | Phase |
|------|--------|-------|
| `.changeset/config.json` | Remove `@generacy-ai/agency-extension` from `ignore` | 1 |
| `packages/agency-extension/package.json` | Add `"private": true` | 1 |
| `.github/workflows/ci.yml` | Enhance `publish-extension` job with PAT guard + version check | 2 |
| `.github/workflows/release.yml` | Add `id: changesets` + conditional extension publish step | 3 |
| `.github/workflows/ci.yml` | (Optional) Add VSIX artifact upload | 4 |
| `packages/agency-extension/PUBLISHING.md` | Document hotfix recovery procedure | 5 |

## Key Technical Decisions

| Decision | Choice | Rationale | Clarification |
|----------|--------|-----------|---------------|
| Version management | Changesets (remove from ignore, mark private) | Consistent with monorepo pattern; `private: true` prevents npm publish | Q1 |
| Duplicate publish prevention | Skip if version exists on Marketplace | Aligns with npm preview pattern; avoids version conflicts | Q2 |
| Preview publish location | Stays in `ci.yml` | Simpler; publish failures are non-blocking anyway | Q3, Q7 |
| Stable publish trigger | `changesets/action` `published` output | Cleanly distinguishes version PR from actual publish | Q4 |
| `preview` badge | Keep `true` | Extension is genuinely early-stage | Q5 |
| Missing PAT handling | Skip with warning | Decouples workflow merge from secret provisioning | Q6 |
| Rollback strategy | Document hotfix procedure | Marketplace doesn't support version unpublish | Q8 |
| Build redundancy | Accept it | esbuild is fast; independent jobs are simpler and more reliable | Q9 |

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| `VSCE_PAT` not provisioned yet (generacy#244 dependency) | Graceful skip with warning; workflow works once secret is added |
| Marketplace API unavailable during version check | Falls through to publish attempt; `vsce` gives clear error; job is non-blocking |
| `cancel-in-progress` aborts mid-publish | Next CI run will re-publish; version-exists check prevents duplicate publishes |
| First publish with version `0.0.0` | Changesets will bump to `0.0.1` (or higher) on first changeset inclusion; `0.0.0` publish is acceptable as initial placeholder |
| Extension not yet on Marketplace | `vsce show` will fail → treated as "version not exists" → proceeds to publish |
| `private: true` breaks other tooling | Only affects npm publish (which we want to prevent); `vsce` ignores the field; pnpm workspace resolution unaffected |

## Testing Strategy

1. **Local validation**: Run `pnpm --filter @generacy-ai/agency-extension package` to verify VSIX builds correctly
2. **CI dry run**: Push to `develop` branch; verify:
   - `publish-extension` job runs and skips with PAT warning (before secret is provisioned)
   - `ci-summary` job passes regardless of publish-extension outcome
3. **Version check validation**: After first successful publish, push again without version bump; verify job skips with "already published" message
4. **Stable release validation**: Create a changeset, merge version PR to `main`; verify extension publish step runs conditionally
5. **Changesets integration**: Create a changeset that includes the extension; verify version bump propagates to `packages/agency-extension/package.json`

## Dependencies

- **generacy#244** (Register VS Code Marketplace publisher): Required for `VSCE_PAT` secret. Workflow can be merged and tested without it.
- **agency#294** (Agency VS Code extension MVP): The extension already has a buildable package.json with `vsce` configuration. Publishing works regardless of feature completeness.

## Out of Scope

- Rollback automation (recovery = publish a hotfix)
- Manual approval gates for stable releases
- VSIX signing
- Multi-target platform-specific builds
- Marketplace analytics or badges
