# Clarification Questions

## Status: Resolved

## Questions

### Q1: Changesets Ignore List Conflict
**Context**: The changeset config (`.changeset/config.json`) explicitly ignores `@generacy-ai/agency-extension`, meaning changesets will never bump its version. However, FR-005 states "Extension versioning uses changesets — `vsce publish` reads the version from `package.json` as bumped by changesets." The extension is currently at version `0.0.0`. These are contradictory — one of them must change.
**Question**: Should the extension be removed from the changesets `ignore` list so that changesets manages its version, or should extension versioning be handled independently (e.g., manual bumps, a separate script, or a dedicated versioning strategy)?
**Options**:
- A) Remove from ignore list: Remove `@generacy-ai/agency-extension` from the changesets ignore array so it participates in the normal changesets versioning workflow alongside other packages.
- B) Independent version management: Keep the extension in the ignore list and implement a separate versioning mechanism (e.g., bump version in a pre-publish step, use a calendar-based scheme, or require manual version bumps before release).
- C) Auto-increment on publish: Keep the extension ignored by changesets but add a CI step that auto-increments the patch version on each publish, decoupling extension versioning from the npm package release cycle.
**Answer**: A — Remove from ignore list. Remove `@generacy-ai/agency-extension` from the changesets ignore list so developers write changesets that include the extension when they make extension changes. Changesets bumps the version in `package.json`, and `vsce publish` reads it. To prevent `changeset publish` from attempting an npm publish of the extension, mark it with `"private": true` in `package.json` — changesets will still manage version bumps but skip npm publish.

### Q2: Preview Publish Version Conflict
**Context**: The VS Code Marketplace requires each publish to have a unique version number. The spec says "Pre-release publishes use the same version number but are flagged as pre-release on the Marketplace." However, `ci.yml` publishes on every push to `develop`, meaning multiple pushes at the same `package.json` version would attempt to re-publish the same version. If changesets only bumps versions during release, the preview publish will fail on repeated pushes with an "already exists" error.
**Question**: How should preview publishing handle version conflicts when multiple pushes to `develop` occur at the same `package.json` version?
**Options**:
- A) Publish only when version changes: Add a check to skip the extension publish if the Marketplace already has the current version, accepting that not every `develop` push will publish a new preview.
- B) Auto-increment patch for previews: Generate a unique version for each preview publish (e.g., append a timestamp or commit-count patch bump) so every push to `develop` publishes successfully.
- C) Rely on VS Code Marketplace idempotency: Assume that re-publishing the same version with `--pre-release` is a no-op or overwrites the existing pre-release, and let any errors be non-blocking.
**Answer**: A — Publish only when version changes. Skip the publish if the current version already exists on the Marketplace. This aligns with how `publish-preview.yml` handles npm — it only publishes when there are changesets. Preview extension builds are still available as CI artifacts for testing without Marketplace publishing. When changesets bumps the version, a new preview publishes automatically.

### Q3: CI Concurrency and Extension Publish Failure Semantics
**Context**: The `ci.yml` workflow uses `cancel-in-progress: true` at the workflow level. The spec says (US1 AC5) "A failed publish does not block the CI summary status check," and separately (FR-007) that "Preview publish uses concurrency group to prevent overlapping publishes." Currently, the `publish-extension` job is embedded in `ci.yml` which has `cancel-in-progress: true` — meaning a new push will cancel any in-progress publish. The `ci-summary` job does NOT list `publish-extension` in its `needs`, so publish failures already don't block it. But cancellation mid-publish could leave the Marketplace in a bad state.
**Question**: Should the extension publish step be moved to a separate workflow (like `publish-preview.yml`) with its own concurrency group that queues rather than cancels, or is the current approach of embedding it in `ci.yml` with cancel-in-progress acceptable?
**Options**:
- A) Keep in ci.yml (current): Accept that `cancel-in-progress` may abort a publish mid-flight. This is simpler and the spec says publish failures are non-blocking anyway.
- B) Move to separate workflow: Create a dedicated workflow triggered by CI completion (similar to `publish-preview.yml` for npm), with its own concurrency group that queues instead of cancelling. This protects against mid-publish cancellation.
- C) Add to existing publish-preview.yml: Extend the existing `publish-preview.yml` workflow to also publish the VS Code extension alongside npm preview snapshots, keeping all preview publishing in one place.
**Answer**: A — Keep in ci.yml. The spec explicitly says publish failures are non-blocking (US1 AC5). If `cancel-in-progress` aborts a publish, the next successful CI run will publish. Combined with Q2's answer (skip if version already published), a cancelled publish simply means "try again next push." Moving to a separate workflow adds complexity without meaningful benefit at this stage.

### Q4: Stable Release Publish Ordering
**Context**: The `release.yml` uses `changesets/action@v1` which creates a "Version Packages" PR and, when that PR merges, runs `pnpm changeset publish --provenance` to publish npm packages. The spec says to "Add a step after changesets publish to run `pnpm --filter @generacy-ai/agency-extension publish`." However, the changesets action handles both PR creation and publishing in a single step — there's no simple "after publish" hook. The extension publish must only run when changesets actually publishes (not when it creates the version PR).
**Question**: How should the stable extension publish be integrated with the changesets action in `release.yml`?
**Options**:
- A) Check changesets action output: Use the `published` output from `changesets/action@v1` to conditionally run the extension publish step only when packages were actually published (not when a version PR was created).
- B) Separate release workflow: Create a dedicated workflow that triggers on version tags or release events, decoupling extension publishing from the changesets action entirely.
- C) Post-publish script: Add extension publishing to a custom publish script that changesets calls, so it runs as part of the `pnpm changeset publish` command.
**Answer**: A — Check changesets action output. The `changesets/action@v1` exposes a `published` output. Add a conditional step: `if: steps.changesets.outputs.published == 'true'`, then run `pnpm --filter @generacy-ai/agency-extension exec vsce publish --no-dependencies` with `VSCE_PAT`. This cleanly distinguishes "version PR created" from "packages actually published" without requiring a separate workflow.

### Q5: Extension `preview` Flag in package.json
**Context**: The extension's `package.json` has `"preview": true`, which marks the extension as "Preview" on the Marketplace regardless of whether it's published with `--pre-release` or not. The `preview` field and the `--pre-release` flag serve different purposes: `preview` is a Marketplace listing badge, while `--pre-release` controls the VS Code update channel. For stable releases, having `"preview": true` may confuse users by showing a "Preview" badge on what should be a production-ready extension.
**Question**: Should the `"preview": true` flag be removed from `package.json` before stable publishing, or should it remain until the extension reaches a certain maturity milestone?
**Options**:
- A) Remove before first stable publish: Remove `"preview": true` as part of this CI/CD work so stable releases appear as production-ready on the Marketplace.
- B) Keep for now: Leave `"preview": true` in place since the extension is genuinely in early stages, and remove it in a future issue when the extension is considered mature.
- C) Toggle per-branch: Have the CI pipeline dynamically set/unset the preview flag based on which branch is publishing (preview=true for develop, preview=false for main).
**Answer**: B — Keep for now. The extension is genuinely in early stages (version 0.0.0, MVP not yet complete). The `"preview": true` badge accurately represents its maturity. Remove it in a future issue when the extension is considered production-ready — that's a separate maturity milestone, not a CI/CD concern.

### Q6: VSCE_PAT Provisioning and Validation
**Context**: FR-003 requires the `VSCE_PAT` secret to be configured, and the spec lists this as depending on generacy#244 (publisher registration). The spec does not describe what should happen if `VSCE_PAT` is not yet available when this feature is implemented, nor how to validate that the PAT has correct scopes before the first publish attempt.
**Question**: Should the workflow include a PAT validation step (e.g., `vsce verify-pat`) before attempting to publish, and how should the workflow behave if the secret is not yet configured?
**Options**:
- A) Skip gracefully if missing: Check if `VSCE_PAT` is set and skip the publish step with a warning if it's not configured, allowing the workflow to be merged before the secret is provisioned.
- B) Fail loudly if missing: Let the publish step fail if the PAT is missing or invalid, relying on the non-blocking nature of the publish job to avoid CI disruption.
- C) Validate before publish: Add a `vsce verify-pat` step before the publish step to provide a clear error message if the PAT is invalid or has insufficient scopes.
**Answer**: A — Skip gracefully if missing. This decouples the workflow from the PAT provisioning timeline (generacy#244). The workflow can be merged and tested before the secret is configured. Check if `VSCE_PAT` is set, skip with a clear warning if not. Once #244 is completed and the secret is provisioned, publishing starts working automatically with no further workflow changes.

### Q7: Publish-Preview.yml Extension Integration
**Context**: The existing `publish-preview.yml` handles npm preview snapshot publishing (via `pnpm changeset version --snapshot preview` and `pnpm changeset publish`). Since the extension is in the changesets ignore list, this workflow does not publish the extension. The `ci.yml` `publish-extension` job handles extension previews separately. This creates two different preview-publishing paths with different triggers (direct push vs. workflow_run), different concurrency strategies, and different conditions (ci.yml always publishes; publish-preview.yml only publishes when changesets exist).
**Question**: Should extension preview publishing align with the npm preview publishing approach in `publish-preview.yml`, or should it remain a separate concern in `ci.yml`?
**Options**:
- A) Keep separate (current): Extension previews stay in `ci.yml`, npm previews stay in `publish-preview.yml`. They serve different ecosystems and have different versioning needs.
- B) Consolidate in publish-preview.yml: Move extension preview publishing into `publish-preview.yml` alongside npm snapshots, gating it on CI completion rather than embedding it in the CI workflow itself.
**Answer**: A — Keep separate. Extension previews and npm previews serve different ecosystems with different versioning mechanisms. npm previews use changeset snapshot versions (`1.0.0-preview.N`), while extension previews use `--pre-release` with standard semver. Keeping them in their respective workflows (`ci.yml` for extension, `publish-preview.yml` for npm) is simpler and reflects the actual difference in publishing semantics.

### Q8: Rollback and Unpublish Procedure
**Context**: The spec lists "Rollback automation" as out of scope, stating "If a bad version is published, it will be unpublished manually via `vsce`." However, `vsce unpublish` removes the entire extension from the Marketplace (not just a single version). VS Code Marketplace does not support unpublishing individual versions — you can only deprecate a version by publishing a newer one.
**Question**: Given that individual version rollback is not possible on the VS Code Marketplace, should the spec document the actual recovery procedure (publish a hotfix version), and should the pipeline include any safeguards like a manual approval gate for stable releases?
**Options**:
- A) Document hotfix procedure only: Update the out-of-scope section to clarify that recovery means publishing a newer fixed version, not unpublishing. No workflow changes needed.
- B) Add manual approval gate: Add a GitHub Actions environment with required reviewers for stable extension publishes, so a human approves before publishing to the Marketplace.
- C) Add dry-run step: Add a `vsce package` dry-run step before publishing to catch packaging errors early, but keep the publish itself automated without manual gates.
**Answer**: A — Document hotfix procedure only. The spec's out-of-scope section incorrectly implies individual versions can be unpublished via `vsce`. Correct this to document the real recovery path: publish a newer fixed version. No workflow changes or manual approval gates are needed — the extension is early-stage, automated publishing keeps velocity high, and the `vsce package` step already catches packaging errors before upload.

### Q9: Duplicate Build in CI Pipeline
**Context**: The spec (US4 AC3) says "The publish step uses the same built artifacts (no redundant rebuilds if possible)." However, the current `publish-extension` job in `ci.yml` runs its own `pnpm install` and `pnpm build` (lines 79-80), duplicating the work done by the `build` job (lines 64-65). The `vscode:prepublish` script also runs `pnpm run build` again during `vsce publish`. This means the extension is built at least 3 times across a single CI run.
**Question**: Should the pipeline use GitHub Actions artifacts to share the build output between jobs, or is the redundant building acceptable given the simplicity tradeoff?
**Options**:
- A) Accept redundant builds: Keep the current approach where each job builds independently. It's simpler, more reliable, and the extension build is fast (esbuild).
- B) Share artifacts: Upload build artifacts from the `build` job and download them in `publish-extension` to avoid redundant builds. This adds complexity but is more efficient.
- C) Disable vscode:prepublish: Since the job already runs `pnpm build`, skip the `vscode:prepublish` by setting an environment variable or restructuring the publish script to avoid the double build within the publish job itself.
**Answer**: A — Accept redundant builds. The extension build uses esbuild and completes in seconds. The simplicity of independent jobs (each job installs, builds, and runs its task) outweighs the minor efficiency gain of artifact sharing. Artifact sharing adds upload/download steps, cache invalidation concerns, and cross-job failure coupling. Keeping builds independent is more reliable and easier to debug.
