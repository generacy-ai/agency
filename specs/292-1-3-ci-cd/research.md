# Research: CI/CD for Agency Repo

## Key Technical Decisions

### TD-1: `workflow_run` Pattern for Both Publish Workflows

**Decision**: Use `workflow_run` trigger (gated on CI success) for both preview and stable publish workflows.

**Context**: The preview workflow already uses `workflow_run` to trigger only after CI passes. The stable release workflow currently triggers directly on `push to main`, relying on branch protection alone.

**Rationale**: Publishing a broken `@latest` package is significantly worse than a broken `@preview`. Branch protection can be bypassed by admins. The `workflow_run` pattern provides defense-in-depth at minimal complexity cost.

**Implementation**:
```yaml
# release.yml - BEFORE
on:
  push:
    branches: [main]

# release.yml - AFTER
on:
  workflow_run:
    workflows: [CI]
    types: [completed]
    branches: [main]
```

The job must also add a conditional check:
```yaml
if: >-
  github.event.workflow_run.conclusion == 'success' &&
  github.event.workflow_run.event == 'push'
```

**Trade-off**: Adds a small delay (workflow_run trigger latency ~1-5s) but provides meaningful safety for the `@latest` npm tag.

---

### TD-2: Latency Dependency Verification

**Decision**: Verify `@generacy-ai/latency` is available on npm before publishing. Preview uses soft failure (warn and skip); stable uses hard failure (block).

**Context**: `@generacy-ai/agency` depends on `@generacy-ai/latency@^0.1.0`. If agency packages are published but latency is not available on npm, consumers will get unresolvable dependency errors at install time.

**Implementation approach**: Use `npm view` to check package availability:

```bash
# For preview (soft failure)
if ! npm view @generacy-ai/latency@preview version 2>/dev/null; then
  echo "::warning::@generacy-ai/latency@preview not found on npm. Skipping preview publish."
  echo "skip_publish=true" >> "$GITHUB_OUTPUT"
fi

# For stable (hard failure)
if ! npm view @generacy-ai/latency@latest version 2>/dev/null; then
  echo "::error::@generacy-ai/latency@latest not found on npm. Cannot publish stable release."
  exit 1
fi
```

**Note**: For preview, checking `@preview` tag is more specific than checking the base package. During bootstrapping, the `@preview` tag may not exist yet, so this correctly skips. For stable, checking `@latest` ensures the stable dependency chain is complete.

---

### TD-3: Changesets with `--provenance` Flag

**Decision**: Add `--provenance` to the stable release publish command.

**Context**: npm provenance links published packages to the specific GitHub Actions workflow run that produced them. This provides supply chain verification. Preview already uses `--provenance`. The stable workflow omits it.

**Implementation**: One-line change in `release.yml`:
```yaml
# BEFORE
publish: pnpm changeset publish
# AFTER
publish: pnpm changeset publish --provenance
```

**Requirements**: `id-token: write` permission (already set in `release.yml`).

---

### TD-4: Custom Changeset Bot vs Official Action

**Decision**: Keep the custom shell script with `::warning::` annotation. Update spec to match.

**Context**: `changesets/bot@v1` is not a GitHub Action — it's a separate GitHub App requiring org-level installation. The custom script is a pragmatic fallback that's already implemented.

**Visibility**: The `::warning::` annotation appears in the PR's Checks tab and in the workflow run log. It's less visible than a PR comment but sufficient for the initial setup.

---

### TD-5: Branch Protection Configuration

**Decision**: Document explicit branch protection settings for both `main` and `develop`.

**`main` branch protection**:
- Require PR before merging
- Required status check: `CI Summary` (exact name from `ci-summary` job in `ci.yml`)
- Dismiss stale reviews on new pushes
- Require at least 1 review approval
- Enforce for administrators: recommended (prevents admin bypass that could publish broken packages)

**`develop` branch protection** (lighter):
- Require status check: `CI Summary`
- Do NOT require PR reviews (keeps iteration fast)
- Do NOT enforce for administrators

---

### TD-6: Node Version Consistency

**Decision**: Use Node 22 across all workflows, including `changeset-bot.yml`.

**Current state**: `changeset-bot.yml` uses Node 20; all others use Node 22.

**Rationale**: No technical reason for the inconsistency. Node 22 is the current LTS. Aligning prevents confusion.

---

## Changesets Workflow Mechanics

### How `changesets/action@v1` Works

1. On push to `main`, the action checks for pending changeset files in `.changeset/`
2. If changesets exist: creates a "Version Packages" PR that applies version bumps and changelogs
3. When the Version Packages PR is merged: changesets are consumed, versions are bumped, and the publish command runs
4. The `publish` command (`pnpm changeset publish`) publishes only packages with new versions

### How Preview Snapshots Work

1. `pnpm changeset version --snapshot preview` applies temporary version bumps (e.g., `0.1.0-preview-20260226T120000`)
2. `pnpm changeset publish --tag preview` publishes with the `preview` dist-tag
3. Changes are NOT committed — the snapshot versions are ephemeral
4. Consumers install via `npm install @generacy-ai/agency@preview`

### Workspace Protocol Resolution

During publish, pnpm resolves `workspace:*` to actual version ranges:
- `workspace:*` → `^0.1.0` (for minor version 0.1.0)
- This happens automatically; no manual intervention needed

---

## npm Provenance

npm provenance (RFC 0049) uses Sigstore to cryptographically link a published package to its source repository and build workflow. Requirements:
- GitHub Actions environment (provides OIDC token)
- `id-token: write` permission in workflow
- `--provenance` flag on `npm publish` / `pnpm publish`
- Package must be published from a public repository

The agency repo is public, so provenance works out of the box.

---

## Concurrency Control

Both publish workflows use `concurrency` with NO `cancel-in-progress`:
```yaml
concurrency:
  group: publish-preview-${{ github.ref }}
  # No cancel-in-progress — queue to avoid aborting mid-publish
```

This ensures that if two pushes happen in quick succession, the second publish waits for the first to complete rather than cancelling it mid-publish (which could leave packages in a partially-published state).

CI uses `cancel-in-progress: true` because there's no harm in cancelling a superseded CI run.
