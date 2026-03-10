# Implementation Plan: CI/CD for Agency Repo

**Branch**: `292-1-3-ci-cd` | **Date**: 2026-02-26

## Summary

The agency repo already has a working CI/CD pipeline from the initial setup (PR #300). This plan addresses the gaps identified during clarification review — 4 workflow file changes and 1 documentation addition. No new workflows are created; all changes modify existing files.

**Scope of changes**:
1. Add `workflow_run` CI gate to `release.yml` (safety)
2. Add `--provenance` flag to stable publish (supply chain)
3. Add latency dependency verification to both publish workflows (dependency chain)
4. Fix Node version in `changeset-bot.yml` (consistency)
5. Add branch protection setup checklist (documentation)

## Technical Context

- **Language**: YAML (GitHub Actions workflows)
- **Package Manager**: pnpm 9.15.4 with workspaces
- **Build System**: Turborepo 2.3.4
- **Versioning**: Changesets 2.28.1
- **Runtime**: Node 22
- **Critical dependency**: `@generacy-ai/latency@^0.1.0` (external npm package)

## Architecture Overview

```
PR opened → ci.yml (lint, typecheck, test, build → ci-summary)
                                                         │
         ┌───────────────────────────────────────────────┤
         │                                               │
    merge to develop                                merge to main
         │                                               │
    workflow_run                                     workflow_run
         │                                               │
    publish-preview.yml                             release.yml
    ├─ verify latency@preview (soft)                ├─ verify latency@latest (hard)
    ├─ changeset version --snapshot                 ├─ changesets/action@v1
    └─ publish --tag preview --provenance           └─ publish --provenance

    changeset-bot.yml (on PR) → warns if no changesets
```

## Implementation Phases

### Phase 1: Update `release.yml` — CI Gate and Provenance

**File**: `.github/workflows/release.yml`

**Changes**:
1. Change trigger from `push` to `workflow_run` (gated on CI success for `main`)
2. Add conditional check: only run if CI succeeded and event was a push
3. Add `--provenance` to the publish command

**Before** (current):
```yaml
on:
  push:
    branches: [main]

# ...
jobs:
  release:
    name: Release
    runs-on: ubuntu-latest
    steps:
      # ...
      - name: Create Release PR or Publish
        uses: changesets/action@v1
        with:
          publish: pnpm changeset publish
```

**After**:
```yaml
on:
  workflow_run:
    workflows: [CI]
    types: [completed]
    branches: [main]

# ...
jobs:
  release:
    name: Release
    runs-on: ubuntu-latest
    if: >-
      github.event.workflow_run.conclusion == 'success' &&
      github.event.workflow_run.event == 'push'
    steps:
      # ...
      - name: Create Release PR or Publish
        uses: changesets/action@v1
        with:
          publish: pnpm changeset publish --provenance
```

**Concurrency group** also needs updating since `github.ref` won't be available in the same way with `workflow_run`:
```yaml
concurrency:
  group: publish-release
```

---

### Phase 2: Add Latency Verification to `publish-preview.yml`

**File**: `.github/workflows/publish-preview.yml`

**Change**: Add a step after checkout that verifies `@generacy-ai/latency@preview` is available on npm. Soft failure — sets a flag to skip publish if unavailable.

**New step** (insert after the "Check for changesets" step):

```yaml
- name: Verify latency dependency
  if: steps.changesets.outputs.has_changesets == 'true'
  id: latency
  run: |
    if npm view @generacy-ai/latency@preview version 2>/dev/null; then
      echo "found=true" >> "$GITHUB_OUTPUT"
      echo "@generacy-ai/latency@preview is available on npm"
    else
      echo "found=false" >> "$GITHUB_OUTPUT"
      echo "::warning::@generacy-ai/latency@preview not found on npm — skipping preview publish"
    fi
```

**Update all subsequent steps** to also check `steps.latency.outputs.found == 'true'` in addition to the existing changesets check.

---

### Phase 3: Add Latency Verification to `release.yml`

**File**: `.github/workflows/release.yml`

**Change**: Add a step before the changesets action that verifies `@generacy-ai/latency@latest` is available. Hard failure — blocks the release.

**New step** (insert after "Install dependencies"):

```yaml
- name: Verify latency dependency
  run: |
    if ! npm view @generacy-ai/latency@latest version 2>/dev/null; then
      echo "::error::@generacy-ai/latency@latest not found on npm. Cannot publish — consumers would get unresolvable dependency."
      exit 1
    fi
    echo "@generacy-ai/latency@latest is available on npm"
```

---

### Phase 4: Fix `changeset-bot.yml` Node Version

**File**: `.github/workflows/changeset-bot.yml`

**Change**: Update `node-version: 20` to `node-version: 22`.

```yaml
# BEFORE
node-version: 20
# AFTER
node-version: 22
```

---

### Phase 5: Add Branch Protection Setup Checklist

**File**: `.github/BRANCH_PROTECTION.md`

**Content**: A one-time setup checklist documenting the required branch protection rules for `main` and `develop`. This is a documentation file, not enforced by code — the actual protection is configured in GitHub repo settings.

```markdown
# Branch Protection Setup Checklist

## `main` branch
- [ ] Require pull request before merging
  - [ ] Required approvals: 1
  - [ ] Dismiss stale pull request approvals on new pushes
- [ ] Require status checks to pass before merging
  - [ ] Required check: `CI Summary`
- [ ] Require branches to be up to date before merging
- [ ] Enforce for administrators (recommended)

## `develop` branch
- [ ] Require status checks to pass before merging
  - [ ] Required check: `CI Summary`
- [ ] Do NOT require pull request reviews
- [ ] Do NOT enforce for administrators
```

**Note**: The critical detail is the exact status check name `CI Summary` — this matches the `ci-summary` job name in `ci.yml`. Getting this wrong silently breaks protection.

---

## Files Changed

| File | Change Type | Phase |
|------|-------------|-------|
| `.github/workflows/release.yml` | Modify | 1, 3 |
| `.github/workflows/publish-preview.yml` | Modify | 2 |
| `.github/workflows/changeset-bot.yml` | Modify | 4 |
| `.github/BRANCH_PROTECTION.md` | Create | 5 |

## Key Technical Decisions

| ID | Decision | Rationale | Reference |
|----|----------|-----------|-----------|
| TD-1 | `workflow_run` gate on stable release | Defense-in-depth; admin bypass risk | Q7, [research.md](./research.md) |
| TD-2 | Latency verification: soft (preview) / hard (stable) | Prevent unresolvable dependencies for consumers | Q1, [research.md](./research.md) |
| TD-3 | Add `--provenance` to stable publish | Supply chain verification parity with preview | Q3, [research.md](./research.md) |
| TD-4 | Keep custom changeset bot script | Official bot is a GitHub App, not an Action | Q2, [research.md](./research.md) |
| TD-5 | Node 22 across all workflows | Consistency, no technical reason for Node 20 | Q4 |

## Risk Mitigation

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| `workflow_run` changes break release flow | Low | High | Test on `develop` first via preview workflow (already uses this pattern) |
| `npm view` fails due to network issues | Low | Medium | Preview: skip is acceptable. Stable: retry workflow manually |
| Changeset action incompatible with `--provenance` | Very Low | Medium | The flag passes through to `npm publish`; well-documented npm feature |
| Branch protection misconfigured | Medium | High | Explicit checklist with exact status check name |
| `@generacy-ai/latency` not yet published when CI/CD goes live | Known | Medium | Preview soft-fails gracefully; stable blocks correctly |

## Out of Scope

Per clarification answers:
- **Turborepo remote caching** (Q6) — defer to separate optimization issue
- **Automated retry/notifications for failed publishes** (Q8) — changesets idempotency handles partial failures
- **Official changeset-bot GitHub App** (Q2) — separate future enhancement

## Validation

After implementation, verify:
1. **CI workflow**: Push a PR and confirm all 4 jobs run + `CI Summary` passes
2. **Preview publish**: Merge to `develop` → CI passes → `publish-preview.yml` triggers → latency check runs → packages published with `@preview` tag
3. **Stable publish**: Merge to `main` → CI passes → `release.yml` triggers → latency check runs → changesets creates version PR or publishes
4. **Changeset bot**: Open a PR without changesets → `::warning::` annotation appears
5. **Branch protection**: Attempt direct push to `main` (should be blocked)

## Dependencies

- **External**: `@generacy-ai/latency` must be published to npm (generacy#242)
- **Secrets**: `NPM_TOKEN` must be configured in repo secrets (already done per initial setup)
- **Permissions**: `id-token: write` for provenance (already set in both publish workflows)
