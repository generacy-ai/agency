# Feature Specification: CI/CD for Agency Repo

**Branch**: `292-1-3-ci-cd` | **Date**: 2026-02-26 | **Status**: Complete

## Summary

Implement end-to-end CI/CD for the agency monorepo, covering PR validation, preview publishing on `develop`, and stable releases on `main`. The system uses GitHub Actions with pnpm workspaces, Turborepo for task orchestration, and Changesets for version management. Seven `@generacy-ai/` scoped packages are published to npm: the core `agency` package and six plugins (`docker`, `firebase`, `git`, `humancy`, `npm`, `spec-kit`). The VS Code extension (`agency-extension`) and documentation package (`claude-plugin-agency-spec-kit`) are excluded from npm publishing.

This spec documents the CI/CD system as implemented in issue #295 and ensures it satisfies the acceptance criteria defined in onboarding plan item 1.3.

### Dependency Chain

```
@generacy-ai/latency (published first, separate repo)
  → @generacy-ai/agency (this repo — depends on latency ^0.1.0)
    → @generacy-ai/generacy (published last, separate repo)
```

### Release Streams

| Stream | Trigger | Dist Tag | Latency Consumed | Behavior |
|--------|---------|----------|------------------|----------|
| **PR CI** | Pull request to `develop` or `main` | — | workspace resolution | Lint, typecheck, test, build — no publishing |
| **Preview publish** | Merge to `develop` | `@preview` | `@preview` (from npm) | Snapshot versions published if changesets present |
| **Stable publish** | Merge to `main` | `@latest` | `@latest` (from npm) | Changesets action creates version PR; merging it publishes |

## User Stories

### US1: PR Validation

**As a** contributor opening a pull request,
**I want** automated lint, typecheck, test, and build checks to run on my PR,
**So that** I get fast feedback on code quality before review.

**Acceptance Criteria**:
- [ ] CI triggers on all PRs targeting `develop` or `main`
- [ ] Lint, typecheck, test, and build run as parallel jobs
- [ ] A summary gate job (`CI Summary`) reports overall pass/fail for branch protection
- [ ] In-flight CI runs are cancelled when a new push arrives on the same branch
- [ ] CI uses `pnpm install --frozen-lockfile` to ensure reproducible installs

### US2: Preview Publishing

**As a** developer merging a feature to `develop`,
**I want** snapshot versions automatically published with a `@preview` dist tag,
**So that** downstream repos (generacy) can test against the latest agency changes without waiting for a stable release.

**Acceptance Criteria**:
- [ ] Preview publish triggers on merge to `develop` (after CI passes)
- [ ] Only publishes when `.changeset/*.md` files exist (skips docs-only changes)
- [ ] Snapshot versions follow the format `0.1.0-preview.{timestamp}`
- [ ] Verifies `@generacy-ai/latency` is available on npm before publishing (soft failure: warns and skips if unavailable)
- [ ] Publishes with `--provenance` for supply-chain security

### US3: Stable Release

**As a** maintainer releasing a new version,
**I want** merging to `main` to trigger a versioning PR that, when merged, publishes stable packages,
**So that** consumers can depend on semver-stable `@latest` releases.

**Acceptance Criteria**:
- [ ] On push to `main`, `changesets/action` either creates a "Version Packages" PR or publishes if versions are already bumped
- [ ] Merging the "Version Packages" PR publishes all changed packages with `@latest` dist tag
- [ ] All packages are published with `--provenance` and `--access public`
- [ ] `NPM_TOKEN` secret is used for authentication
- [ ] `GITHUB_TOKEN` is used for PR creation with `contents: write` and `pull-requests: write` permissions

### US4: Changeset Workflow

**As a** contributor,
**I want** a changeset bot to remind me to include changeset files in my PRs,
**So that** version bumps and changelogs are tracked consistently.

**Acceptance Criteria**:
- [ ] Changeset bot comments on PRs to `develop` indicating whether a changeset is present
- [ ] Bot comments are non-blocking (do not fail CI)
- [ ] Changeset config uses `baseBranch: "develop"` and `access: "public"`
- [ ] `agency-extension` and `claude-plugin-agency-spec-kit` are in the changesets ignore list

## Functional Requirements

| ID | Requirement | Priority | Notes |
|----|-------------|----------|-------|
| FR-001 | CI workflow runs lint, typecheck, test, build as parallel jobs on PRs and pushes to `develop`/`main` | P0 | `.github/workflows/ci.yml` |
| FR-002 | CI gate job (`ci-summary`) aggregates results for branch protection | P0 | Uses `if: always()` to run even if upstream jobs fail |
| FR-003 | CI concurrency cancels in-flight runs on same branch | P1 | `concurrency: ci-${{ github.ref }}` with `cancel-in-progress: true` |
| FR-004 | All CI jobs use Node 22 and pnpm with `--frozen-lockfile` | P0 | Reproducible builds |
| FR-005 | Preview publish workflow triggers on successful CI on `develop` branch | P0 | `.github/workflows/publish-preview.yml` |
| FR-006 | Preview publish only runs when changeset files (`.changeset/*.md`) exist | P1 | Avoids noisy no-op publishes on docs-only merges |
| FR-007 | Preview publish verifies `@generacy-ai/latency` availability on npm | P1 | Soft failure: warns and skips if unavailable |
| FR-008 | Stable release workflow uses `changesets/action@v1` on push to `main` | P0 | `.github/workflows/release.yml` |
| FR-009 | All npm publishes include `--provenance` flag | P1 | Supply-chain security via Sigstore |
| FR-010 | All 7 publishable packages have `publishConfig.access: "public"` | P0 | Required for scoped public packages |
| FR-011 | Changeset bot comments on PRs (non-blocking) | P2 | `.github/workflows/changeset-bot.yml` |
| FR-012 | Initial changeset bumps all packages from `0.0.0` to `0.1.0` (minor) | P0 | Aligns with latency at `0.1.0`, signals pre-stable API |
| FR-013 | Changesets config uses independent versioning with `updateInternalDependencies: "patch"` | P1 | Plugins may evolve at different rates |
| FR-014 | `main` branch requires PR with passing `CI Summary` status check | P0 | Branch protection rule |
| FR-015 | Publish concurrency is queued (not cancelled) to protect publish integrity | P1 | Prevents partial publishes from cancellation |

## Workflow Files

### CI (`ci.yml`)

```
Trigger: pull_request + push to develop/main
Jobs: lint, typecheck, test, build (parallel) → ci-summary (gate)
Concurrency: cancel-in-progress per branch
```

### Preview Publish (`publish-preview.yml`)

```
Trigger: workflow_run (ci.yml success on develop)
Steps: checkout → pnpm install → check changesets exist → verify latency on npm
       → snapshot version → publish with @preview tag
Concurrency: queued (no cancel)
```

### Stable Release (`release.yml`)

```
Trigger: push to main
Steps: checkout → pnpm install → build → changesets/action (version PR or publish)
Permissions: contents:write, pull-requests:write, id-token:write
```

### Changeset Bot (`changeset-bot.yml`)

```
Trigger: pull_request to develop
Steps: changesets/bot@v1 (informational comment)
```

## Publishable Packages

| Package | npm Name | Type |
|---------|----------|------|
| `packages/agency` | `@generacy-ai/agency` | Core MCP server |
| `packages/agency-plugin-docker` | `@generacy-ai/agency-plugin-docker` | Plugin |
| `packages/agency-plugin-firebase` | `@generacy-ai/agency-plugin-firebase` | Plugin |
| `packages/agency-plugin-git` | `@generacy-ai/agency-plugin-git` | Plugin |
| `packages/agency-plugin-humancy` | `@generacy-ai/agency-plugin-humancy` | Plugin |
| `packages/agency-plugin-npm` | `@generacy-ai/agency-plugin-npm` | Plugin |
| `packages/agency-plugin-spec-kit` | `@generacy-ai/agency-plugin-spec-kit` | Plugin |

**Excluded from npm publishing**:
- `@generacy-ai/agency-extension` — published via VSCE (separate lifecycle)
- `claude-plugin-agency-spec-kit` — documentation only, no `package.json`

## Success Criteria

| ID | Metric | Target | Measurement |
|----|--------|--------|-------------|
| SC-001 | CI runs on every PR | 100% of PRs to `develop`/`main` | GitHub Actions run history |
| SC-002 | CI feedback time | < 5 minutes for full pipeline | GitHub Actions job duration |
| SC-003 | Preview publish on develop merge | Publishes when changesets present, skips otherwise | npm registry check for `@preview` tagged versions |
| SC-004 | Stable publish on main merge | All changed packages published with `@latest` | npm registry check for `@latest` tagged versions |
| SC-005 | Zero failed publishes from cancellation | 0 partial publishes | GitHub Actions history for publish workflows |
| SC-006 | Provenance attestation | All published packages include provenance | `npm audit signatures` on published packages |
| SC-007 | Latency dependency gate | Preview skips gracefully; stable blocks if latency unavailable | Workflow logs |

## Assumptions

- `NPM_TOKEN` GitHub Actions secret is configured at the org or repo level with publish permissions for the `@generacy-ai` scope
- `@generacy-ai/latency` packages are published to npm (at least `@preview`) before agency can publish
- The `develop` branch is the primary development branch; `main` is the release branch
- Contributors include changeset files in PRs that modify publishable package behavior
- GitHub Actions runners have access to the npm registry (no firewall or proxy restrictions)
- The `@generacy-ai` npm scope is claimed and accessible with the configured token
- Branch protection on `main` is configured manually in GitHub repo settings (not via workflow)

## Out of Scope

- **VS Code extension publishing** — `agency-extension` uses VSCE with a separate publish lifecycle
- **Latency repo CI/CD** — handled in the latency repository's own CI/CD setup
- **Generacy repo CI/CD** — handled downstream; consumes agency packages
- **npm scope creation** — assumes `@generacy-ai` scope already exists on npm
- **GitHub environments or deployment protection rules** — using secrets directly, not environment-gated
- **Automated GitHub Releases** — changesets generates changelogs in `CHANGELOG.md` only
- **Canary or per-PR preview publishes** — only `develop` branch triggers preview publish
- **npm package size budgets or publish-time validations** — not enforced in workflows
- **Rollback automation** — npm unpublish/deprecation is a manual process if needed

## Implementation Status

This CI/CD system was implemented in PR #300 (branch `295-set-up-ci-cd`) and merged to `develop`. The following files were created:

- `.github/workflows/ci.yml`
- `.github/workflows/publish-preview.yml`
- `.github/workflows/release.yml`
- `.github/workflows/changeset-bot.yml`
- `.changeset/config.json`
- `.changeset/initial-release.md`

All publishable packages were updated with `publishConfig.access: "public"` and the `@generacy-ai/latency` dependency was set to `^0.1.0` (npm range, not `workspace:*`).

---

*Generated by speckit*
