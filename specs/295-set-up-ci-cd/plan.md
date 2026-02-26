# Implementation Plan: CI/CD and npm Publishing

**Branch**: `295-set-up-ci-cd` | **Date**: 2026-02-26

## Summary

Set up automated CI, preview publishing, and stable release workflows for the `@generacy-ai` scoped packages in the agency monorepo. This involves creating three GitHub Actions workflows (CI, preview publish, stable release), configuring changesets for version management, updating package metadata for npm publishing, and performing a one-time branch sync of `main` to `develop`.

## Technical Context

- **Runtime**: Node.js >=20, TypeScript 5.7, ES2022 modules
- **Package Manager**: pnpm 9.15.4 with workspaces
- **Build System**: Turbo (parallel task runner), already configured
- **Test Framework**: Vitest 3.2
- **Linting**: ESLint 9 with typescript-eslint
- **Version Management**: @changesets/cli 2.28 (already installed)
- **Registry**: npm public registry, `@generacy-ai` scope

### Publishable Packages (7)

| Package | Type | Notes |
|---------|------|-------|
| `@generacy-ai/agency` | Core MCP server | Has `link:` dep on latency → change to `^0.1.0` |
| `@generacy-ai/agency-plugin-docker` | Plugin | Peer dep on agency |
| `@generacy-ai/agency-plugin-firebase` | Plugin | Peer dep on agency |
| `@generacy-ai/agency-plugin-git` | Plugin | Peer dep on agency |
| `@generacy-ai/agency-plugin-humancy` | Plugin | Peer dep on agency |
| `@generacy-ai/agency-plugin-npm` | Plugin | Peer dep on agency |
| `@generacy-ai/agency-plugin-spec-kit` | Plugin | Peer dep on agency |

### Excluded from Publishing

| Package | Reason |
|---------|--------|
| `@generacy-ai/agency-extension` | Published via VSCE, separate versioning lifecycle |
| `claude-plugin-agency-spec-kit` | Not an npm package (no package.json, docs only) |

## Architecture Overview

```
PR opened/updated → CI workflow (lint + typecheck + test + build in parallel → summary gate)
                                                                              ↓
                                                               Branch protection check

develop push → CI workflow + Preview publish workflow
               (if .changeset/*.md files exist → snapshot publish with @preview tag)

main push → CI workflow + Release workflow
            (changesets/action creates "Version Packages" PR or publishes @latest)
```

### Concurrency Strategy (from Q5)
- **CI**: `cancel-in-progress: true` — new push supersedes old run
- **Publish**: No `cancel-in-progress` — queue to avoid aborting mid-publish

## Implementation Phases

### Phase 1: Package Configuration Updates

**Goal**: Prepare all packages for npm publishing.

#### 1.1 Update `@generacy-ai/agency` dependency
**File**: `packages/agency/package.json`

Change the local link dependency to a real npm version specifier:
```diff
- "@generacy-ai/latency": "link:/workspaces/latency/packages/latency",
+ "@generacy-ai/latency": "^0.1.0",
```

#### 1.2 Add `publishConfig` to all 7 publishable packages
**Files**: `packages/{agency,agency-plugin-*}/package.json` (7 files)

Add to each:
```json
"publishConfig": {
  "access": "public"
}
```

#### 1.3 Update changesets configuration
**File**: `.changeset/config.json`

```json
{
  "$schema": "https://unpkg.com/@changesets/config@3.1.1/schema.json",
  "changelog": "@changesets/cli/changelog",
  "commit": false,
  "fixed": [],
  "linked": [],
  "access": "public",
  "baseBranch": "develop",
  "updateInternalDependencies": "patch",
  "ignore": [
    "@generacy-ai/agency-extension",
    "claude-plugin-agency-spec-kit"
  ]
}
```

Changes:
- `baseBranch`: `"main"` → `"develop"` (develop is the primary branch)
- `ignore`: Add extension (VSCE pipeline, Q2) and claude-plugin (not an npm package)

### Phase 2: CI Workflow

**Goal**: Automated lint, typecheck, test, and build on PRs and pushes to `develop`/`main`.

**File**: `.github/workflows/ci.yml`

```yaml
name: CI

on:
  pull_request:
    branches: [develop, main]
  push:
    branches: [develop, main]

concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true

jobs:
  lint:
    name: Lint
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm lint

  typecheck:
    name: Typecheck
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm typecheck

  test:
    name: Test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm test

  build:
    name: Build
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm build

  ci-summary:
    name: CI Summary
    runs-on: ubuntu-latest
    needs: [lint, typecheck, test, build]
    if: always()
    steps:
      - run: |
          if [ "${{ needs.lint.result }}" != "success" ] || \
             [ "${{ needs.typecheck.result }}" != "success" ] || \
             [ "${{ needs.test.result }}" != "success" ] || \
             [ "${{ needs.build.result }}" != "success" ]; then
            echo "One or more CI jobs failed"
            exit 1
          fi
          echo "All CI jobs passed"
```

**Key decisions (from Q10)**:
- Parallel jobs for speed and granular failure reporting
- Summary gate job (`ci-summary`) as single branch protection check name
- `if: always()` ensures the gate runs even when upstream jobs fail
- pnpm/action-setup@v4 auto-detects `packageManager` from `package.json`

### Phase 3: Changeset Bot

**Goal**: Non-blocking PR comments when changesets are missing (from Q7).

**File**: `.github/workflows/changeset-bot.yml`

```yaml
name: Changeset Bot

on:
  pull_request:
    types: [opened, synchronize]
    branches: [develop]

jobs:
  changeset-check:
    name: Changeset Check
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: changesets/bot@v1
```

This posts an informational comment on PRs about whether a changeset was included. Non-blocking — docs/CI-only PRs don't need changesets.

### Phase 4: Preview Publish Workflow

**Goal**: Publish snapshot versions with `@preview` dist-tag on push to `develop`.

**File**: `.github/workflows/publish-preview.yml`

```yaml
name: Publish Preview

on:
  push:
    branches: [develop]

concurrency:
  group: publish-preview-${{ github.ref }}
  # No cancel-in-progress — queue to avoid aborting mid-publish

permissions:
  contents: read
  id-token: write  # Required for npm provenance

jobs:
  preview:
    name: Preview Publish
    runs-on: ubuntu-latest
    # Only run when changeset files are present
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm
          registry-url: https://registry.npmjs.org

      - run: pnpm install --frozen-lockfile
      - run: pnpm build

      # Check if any changeset files exist
      - name: Check for changesets
        id: changesets
        run: |
          CHANGESET_FILES=$(find .changeset -name '*.md' ! -name 'README.md' | head -1)
          if [ -n "$CHANGESET_FILES" ]; then
            echo "has_changesets=true" >> "$GITHUB_OUTPUT"
          else
            echo "has_changesets=false" >> "$GITHUB_OUTPUT"
          fi

      # Verify latency dependencies are available on npm
      - name: Verify dependencies
        if: steps.changesets.outputs.has_changesets == 'true'
        run: |
          echo "Checking @generacy-ai/latency availability on npm..."
          if ! npm view @generacy-ai/latency version 2>/dev/null; then
            echo "::warning::@generacy-ai/latency not yet published on npm. Skipping preview publish."
            echo "DEPS_AVAILABLE=false" >> "$GITHUB_ENV"
          else
            echo "DEPS_AVAILABLE=true" >> "$GITHUB_ENV"
          fi

      - name: Publish preview snapshots
        if: steps.changesets.outputs.has_changesets == 'true' && env.DEPS_AVAILABLE == 'true'
        run: |
          pnpm changeset version --snapshot preview
          pnpm changeset publish --tag preview --provenance
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

**Key decisions**:
- Snapshot format: `0.1.0-preview.{timestamp}` (changesets default with `--snapshot preview`)
- Only publishes when `.changeset/*.md` files exist (avoids noise from docs-only changes)
- Dependency verification: warns and skips if latency not yet on npm (from task 7)
- Provenance enabled with `--provenance` flag (from Q6)
- No `cancel-in-progress` on concurrency group (from Q5)

### Phase 5: Stable Release Workflow

**Goal**: Use changesets/action to create "Version Packages" PR and publish stable releases.

**File**: `.github/workflows/release.yml`

```yaml
name: Release

on:
  push:
    branches: [main]

concurrency:
  group: publish-release-${{ github.ref }}
  # No cancel-in-progress — queue to avoid aborting mid-publish

permissions:
  contents: write
  pull-requests: write
  id-token: write  # Required for npm provenance

jobs:
  release:
    name: Release
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm
          registry-url: https://registry.npmjs.org

      - run: pnpm install --frozen-lockfile
      - run: pnpm build

      # Verify latency dependencies are available on npm
      - name: Verify dependencies
        run: |
          echo "Checking @generacy-ai/latency availability on npm..."
          if ! npm view @generacy-ai/latency version 2>/dev/null; then
            echo "::error::@generacy-ai/latency not published on npm. Cannot release."
            exit 1
          fi

      - name: Create Release PR or Publish
        uses: changesets/action@v1
        with:
          publish: pnpm changeset publish --provenance
          title: "chore: version packages"
          commit: "chore: version packages"
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
```

**How changesets/action works**:
1. If pending changeset files exist → creates/updates a "Version Packages" PR that bumps versions and updates changelogs
2. If no changeset files exist (i.e., the Version Packages PR was just merged) → runs `pnpm changeset publish --provenance` to publish to npm
3. Idempotent: re-running skips already-published versions (from Q8)

**Key decisions**:
- Dependency verification is a hard error here (unlike preview which warns) — stable releases must not proceed without latency
- `contents: write` for changesets to create the version PR
- `pull-requests: write` for changesets to manage the PR

### Phase 6: Branch Sync and Protection

**Goal**: Sync `main` to `develop` and configure branch protection.

#### 6.1 Force-push develop to main (one-time operation)

This is a manual operation, not part of the workflows. Execute after all workflow files are merged to `develop`:

```bash
git push origin develop:main --force
```

**Rationale (from Q9)**: `main` is 111 commits behind `develop` with no valuable main-only history. Force-push is the clean one-time reset.

#### 6.2 Branch protection rules for `main`

Configure via GitHub UI or `gh` CLI after the sync:

- **Require pull request before merging**: Yes
- **Required status checks**: `CI Summary` (the gate job from Phase 2)
- **Require branches to be up to date before merging**: Yes
- **Restrict who can push**: Core team only

**Note**: Branch protection should be configured *after* the force-push sync.

### Phase 7: Initial Changeset

**Goal**: Create the first changeset that will bump all packages from `0.0.0` to `0.1.0`.

**File**: `.changeset/initial-release.md`

```markdown
---
"@generacy-ai/agency": minor
"@generacy-ai/agency-plugin-docker": minor
"@generacy-ai/agency-plugin-firebase": minor
"@generacy-ai/agency-plugin-git": minor
"@generacy-ai/agency-plugin-humancy": minor
"@generacy-ai/agency-plugin-npm": minor
"@generacy-ai/agency-plugin-spec-kit": minor
---

Initial release of agency packages
```

**Rationale (from Q4)**: Minor bump from `0.0.0` → `0.1.0` signals "usable but API may change" and aligns with latency at `0.1.0`.

## File Change Summary

| File | Action | Phase |
|------|--------|-------|
| `packages/agency/package.json` | Edit: latency dep `link:` → `^0.1.0`, add `publishConfig` | 1 |
| `packages/agency-plugin-docker/package.json` | Edit: add `publishConfig` | 1 |
| `packages/agency-plugin-firebase/package.json` | Edit: add `publishConfig` | 1 |
| `packages/agency-plugin-git/package.json` | Edit: add `publishConfig` | 1 |
| `packages/agency-plugin-humancy/package.json` | Edit: add `publishConfig` | 1 |
| `packages/agency-plugin-npm/package.json` | Edit: add `publishConfig` | 1 |
| `packages/agency-plugin-spec-kit/package.json` | Edit: add `publishConfig` | 1 |
| `.changeset/config.json` | Edit: baseBranch, ignore list | 1 |
| `.github/workflows/ci.yml` | Create | 2 |
| `.github/workflows/changeset-bot.yml` | Create | 3 |
| `.github/workflows/publish-preview.yml` | Create | 4 |
| `.github/workflows/release.yml` | Create | 5 |
| `.changeset/initial-release.md` | Create | 7 |

**Total**: 9 edits + 4 new files = 13 file operations

## Key Technical Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| CI job structure | Parallel jobs + summary gate (Q10) | Speed, granular feedback, single branch protection check |
| Versioning strategy | Independent (Q3) | Plugins may evolve at different rates; `updateInternalDependencies: "patch"` keeps peer deps in sync |
| Initial version | `0.1.0` via minor bump (Q4) | Pre-stable signal, aligned with latency |
| Concurrency | Cancel CI, queue publish (Q5) | Avoid wasting CI resources; protect publish integrity |
| Provenance | Enabled (Q6) | One-line addition, repo is public, supply-chain security |
| Changeset bot | Non-blocking comment (Q7) | Low friction, handles docs-only PRs gracefully |
| Failure recovery | Changesets built-in idempotency (Q8) | Re-run skips already-published; no custom retry needed |
| Main sync | Force-push (Q9) | Clean reset, no valuable main-only history |
| Extension exclusion | Changesets ignore list (Q2) | VSCE has separate versioning lifecycle |
| Latency dependency | `^0.1.0` (Q1) | Cross-repo dep, standard caret range |

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Latency packages not yet on npm | Dependency verification step in both publish workflows; preview warns, release blocks |
| NPM_TOKEN not configured | Workflows will fail with clear auth error; document requirement in PR description |
| Partial publish failure | Changesets' built-in idempotency — re-run skips already-published packages |
| Race condition on concurrent publishes | Concurrency groups with queue (not cancel) for publish workflows |
| Missing changesets in PRs | Non-blocking changeset bot comments on PRs |
| Extension accidentally published to npm | Added to changesets ignore list; no `publishConfig` on extension package |
| `workspace:*` peer deps not resolved | pnpm automatically converts `workspace:*` to actual version at publish time |

## Prerequisites

Before merging this PR:
1. **NPM_TOKEN**: Must be configured as a GitHub Actions secret at the org or repo level (granular token scoped to `@generacy-ai` packages recommended)
2. **Latency CI/CD**: Latency packages should ideally be published first, but the verification step allows this to proceed independently

## Verification Checklist

After implementation:
- [ ] `pnpm install --frozen-lockfile` succeeds (lockfile is consistent)
- [ ] `pnpm lint` passes
- [ ] `pnpm typecheck` passes
- [ ] `pnpm test` passes
- [ ] `pnpm build` succeeds
- [ ] All 7 publishable packages have `publishConfig.access: "public"`
- [ ] `.changeset/config.json` has `baseBranch: "develop"` and correct ignore list
- [ ] Workflow YAML files are valid (can verify with `actionlint` if available)
- [ ] No `link:` dependencies remain in any package.json
