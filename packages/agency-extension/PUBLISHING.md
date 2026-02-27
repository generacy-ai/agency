# Publishing: Agency VS Code Extension

Extension ID: `generacy-ai.agency-extension`
Publisher: `generacy-ai`

## Release Streams

### Preview (pre-release)

- **Trigger**: Push to `develop` branch (after CI passes)
- **Workflow**: `.github/workflows/ci.yml` → `publish-extension` job
- **Command**: `vsce publish --pre-release --no-dependencies`
- **Behavior**:
  - Skips if `VSCE_PAT` secret is not configured
  - Skips if the current `package.json` version already exists on the Marketplace
  - VSIX artifact is uploaded to GitHub Actions regardless of publish outcome

### Stable

- **Trigger**: Push to `main` branch, after changesets publishes packages
- **Workflow**: `.github/workflows/release.yml` → "Publish extension to Marketplace" step
- **Command**: `vsce publish --no-dependencies`
- **Behavior**:
  - Runs only when `changesets/action` outputs `published == 'true'`
  - Skips if `VSCE_PAT` secret is not configured

## Versioning

Extension versioning is managed by [changesets](https://github.com/changesets/changesets). When making extension changes, include the extension in your changeset:

```bash
pnpm changeset
# Select agency-extension when prompted
```

Changesets bumps the version in `package.json`. The `private: true` field prevents changesets from attempting an npm publish — the extension is published to the VS Code Marketplace only.

## Secrets

| Secret | Purpose | Provisioned via |
|--------|---------|-----------------|
| `VSCE_PAT` | Personal Access Token for VS Code Marketplace publishing | [generacy#244](https://github.com/generacy-ai/generacy/issues/244) |

Both workflows skip gracefully with a warning if `VSCE_PAT` is not configured.

## Manual Publishing

```bash
# Package without publishing (for testing)
pnpm --filter agency-extension package

# Publish to Marketplace (requires VSCE_PAT env var)
VSCE_PAT=<your-token> pnpm --filter agency-extension publish
```

## Recovery Procedure

The VS Code Marketplace **does not support unpublishing individual versions**. Running `vsce unpublish` removes the entire extension from the Marketplace, not a single version.

If a bad version is published, the recovery procedure is:

1. **Fix the issue** on a branch and merge to the target branch (`develop` or `main`)
2. **Bump the version** via a changeset (even a patch bump is sufficient)
3. **Merge the changeset version PR** — the pipeline publishes the corrected version automatically

The bad version remains on the Marketplace but VS Code will prompt users to update to the newer fixed version. For pre-release publishes, the next push to `develop` with a version bump replaces the bad preview.
