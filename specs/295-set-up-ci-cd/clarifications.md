# Clarification Questions

## Status: Pending

## Questions

### Q1: Latency Dependency Version Specifier
**Context**: The `@generacy-ai/agency` package currently has `"@generacy-ai/latency": "link:/workspaces/latency/packages/latency"`. This must be replaced with a real npm version specifier before publishing, but the spec doesn't specify what version range to use. The latency package is currently at version `0.1.0` in its local repo.
**Question**: What npm version specifier should replace the local `link:` dependency for `@generacy-ai/latency`?
**Options**:
- A) `"^0.1.0"` (caret range): Allows compatible updates (0.1.x). Standard for pre-1.0 packages where you trust minor patches.
- B) `"workspace:*"` (workspace protocol): Let pnpm resolve it. However, `@generacy-ai/latency` is in a *different* repo, not this workspace, so this won't work.
- C) `">=0.1.0"` (open range): Maximum flexibility but risks breaking changes.
- D) Leave as-is and block publishing until latency CI/CD is complete: Don't change the dependency yet; the publish workflow's verification step will prevent premature publishing.
**Answer**:

### Q2: Agency Extension Changesets Exclusion
**Context**: The spec says to exclude `@generacy-ai/agency-extension` from npm publishing (it uses VSCE), but doesn't explicitly say whether to add it to the changesets `ignore` list in `.changeset/config.json`. If it's not ignored, running `pnpm changeset` will offer it as a package to include in changesets, and `changesets version` will bump it and generate changelogs for it. The extension already has its own CHANGELOG.md.
**Question**: Should `@generacy-ai/agency-extension` be added to the changesets `ignore` list alongside `claude-plugin-agency-spec-kit`?
**Options**:
- A) Yes, add to ignore list: Completely exclude it from changesets versioning and changelog generation. VSCE publishing will manage its own version separately.
- B) No, keep it in changesets: Let changesets manage its version bumps and changelogs, but only exclude it from the `npm publish` step. This keeps its version in sync with the rest of the monorepo.
**Answer**:

### Q3: Workspace Peer Dependency Conversion at Publish
**Context**: All 6 plugin packages use `"@generacy-ai/agency": "workspace:*"` as a peer dependency. When pnpm publishes, it converts `workspace:*` to the actual current version (e.g., `"0.0.0"` or `"0.1.0"`). Since all packages start at `0.0.0` and will be bumped together, this should work — but the spec doesn't address whether the `linked` or `fixed` changesets config should be used to ensure all packages version together.
**Question**: Should all publishable packages be version-linked in changesets so they always share the same version number?
**Options**:
- A) Use `fixed` grouping: All packages always get the same version number. A change to any package bumps all of them. Simple but noisy.
- B) Use `linked` grouping: Packages can have different versions, but when one is bumped (e.g., major), all linked packages get the same bump level. More flexible.
- C) Independent versioning (current config): Each package versions independently based on its own changesets. Most granular but peers may drift out of sync.
**Answer**:

### Q4: Initial Package Version
**Context**: All packages are at `0.0.0`. The spec says "the first changeset will bump them to their initial release version" but doesn't specify what that version should be. A patch bump from `0.0.0` gives `0.0.1`, a minor bump gives `0.1.0`, and a major bump gives `1.0.0`. The choice signals stability expectations to consumers.
**Question**: What should the initial published version be for these packages?
**Options**:
- A) `0.1.0` (minor bump): Standard for initial pre-stable releases. Signals "usable but API may change." The first changeset should be a minor bump.
- B) `0.0.1` (patch bump): Most conservative. Signals "very early, expect breaking changes." Let natural changesets drive future bumps.
- C) `1.0.0` (major bump): Signals stability and commitment to semver. Only appropriate if the APIs are considered stable.
- D) Don't prescribe — leave to first changeset author: The spec shouldn't dictate this; whoever writes the first changeset decides the bump level.
**Answer**:

### Q5: CI Workflow Concurrency
**Context**: The spec doesn't address what happens when multiple pushes to `develop` or `main` happen in quick succession. Without concurrency controls, multiple publish workflows could race and cause conflicts (e.g., two preview publishes trying to publish overlapping snapshot versions).
**Question**: Should the workflows use GitHub Actions concurrency groups to cancel or queue overlapping runs?
**Options**:
- A) Cancel in-progress on new push (recommended): Use `concurrency: { group: "<workflow>-${{ github.ref }}", cancel-in-progress: true }` for CI; queue for publish workflows.
- B) Cancel in-progress for all workflows: Fastest feedback but could abort a publish mid-way.
- C) No concurrency controls: Let all runs complete independently. Simpler but wastes resources and risks race conditions on publish.
**Answer**:

### Q6: NPM_TOKEN Scope and Provenance
**Context**: The spec mentions using an `NPM_TOKEN` secret but doesn't specify whether this should be a granular token (scoped to `@generacy-ai` packages only) or a full-access token. It also doesn't mention npm provenance attestation, which is increasingly expected for public packages and provides supply-chain security.
**Question**: Should the publish workflows enable npm provenance attestation (`--provenance` flag)?
**Options**:
- A) Yes, enable provenance: Adds `--provenance` to publish commands. Requires the workflow to have `id-token: write` permission. Provides verifiable build provenance on npmjs.com.
- B) No, skip provenance for now: Keep it simple. Provenance can be added later as a follow-up enhancement.
**Answer**:

### Q7: Changeset Requirement Bot/Check
**Context**: The spec lists "Changeset not added to PR" as a risk (medium likelihood) and mentions "Consider adding a CI check or bot reminder (future enhancement)." However, implementing this is trivial — the `changesets/action` provides a `changeset-bot` and there's also `changesets/changelog-github` that can post status checks. Without it, PRs can be merged without changesets, resulting in no version bumps.
**Question**: Should the CI workflow include a changeset presence check (or bot) that warns when a PR has no changeset?
**Options**:
- A) Add a non-blocking warning: Use the changesets bot to comment on PRs missing changesets. Informational only — doesn't block merge. Some PRs (docs, CI changes) legitimately have no changeset.
- B) Add a required status check: Block PRs from merging unless they include a changeset or are explicitly labeled as "no-changeset-needed."
- C) Skip for now: Keep it as a future enhancement per the spec's suggestion. Rely on developer discipline.
**Answer**:

### Q8: Publish Failure Handling
**Context**: The spec says publishing should be idempotent (re-running skips already-published versions), but doesn't address partial publish failures. In a monorepo with 7 packages, if packages 1-3 publish successfully but package 4 fails (e.g., network error), the workflow needs a recovery strategy. Changesets' default behavior may or may not handle this gracefully.
**Question**: How should partial publish failures be handled?
**Options**:
- A) Rely on changesets' built-in idempotency: If a re-run is triggered, already-published packages are skipped and the failed ones are retried. This is the default behavior and usually sufficient.
- B) Add explicit retry logic: Wrap the publish step in a retry (e.g., 3 attempts with backoff) to handle transient network failures before failing the workflow.
- C) Publish packages individually with error isolation: Instead of `changesets publish`, publish each package in a loop so one failure doesn't block others. More complex but more resilient.
**Answer**:

### Q9: Main Branch Sync Strategy
**Context**: The spec says to "sync `main` to match `develop`" as a one-time operation (FR-014), but doesn't specify the method. If `main` has diverged from `develop` (or has different history), this could be a force-push or a merge. The approach matters for existing branch protection and contributor workflows.
**Question**: How should the one-time `main` branch sync be performed?
**Options**:
- A) Force-push develop to main: `git push origin develop:main --force`. Clean reset but destructive to any main-only history.
- B) Merge develop into main: Create a PR from develop to main. Preserves history but may have conflicts if they've diverged.
- C) Already in sync — verify only: Just confirm the branches are aligned and skip if they already match. Add a verification step rather than a sync action.
**Answer**:

### Q10: CI Check Name for Branch Protection
**Context**: Branch protection rules on `main` require specifying which status checks must pass. The spec says "require CI status checks" but doesn't specify the exact check names. The workflow name and job names in GitHub Actions determine the status check identifiers (e.g., `CI / build`, `CI / lint`). These must match exactly in branch protection settings.
**Question**: Should CI run as a single job (one status check) or multiple parallel jobs (separate checks for lint, typecheck, test, build)?
**Options**:
- A) Single job, sequential steps: One job runs all steps sequentially. Simple to configure in branch protection (one check name). Slower but all-or-nothing feedback.
- B) Multiple parallel jobs: Separate jobs for lint, typecheck, test, and build. Each reports independently. Faster (parallel execution) and more granular failure info, but more check names to configure in branch protection.
- C) Parallel jobs with a summary gate job: Run lint/typecheck/test/build in parallel, then a final "CI Summary" job that depends on all of them. Branch protection only needs to reference the summary job. Best of both worlds.
**Answer**:
