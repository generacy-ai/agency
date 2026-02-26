# Clarification Questions

## Status: Pending

## Questions

### Q1: Latency Dependency Verification Missing from Implementation
**Context**: FR-007 specifies that the preview publish workflow should verify `@generacy-ai/latency` is available on npm before publishing, with a soft failure (warn and skip). The current `publish-preview.yml` implementation has no such check. This gap could cause preview publishes to succeed while their consumers fail at install time due to an unresolvable `@generacy-ai/latency` dependency.
**Question**: Should the latency verification step be added to the preview publish workflow? If so, should the check also apply to stable releases, or only preview?
**Options**:
- A) Preview only (soft failure): Add an `npm view @generacy-ai/latency` check to `publish-preview.yml` that warns and skips publish if unavailable. Stable releases assume latency is always published.
- B) Both preview and stable: Add verification to both workflows. Preview uses soft failure (skip); stable uses hard failure (block release).
- C) Neither — accept the gap: Rely on npm install failures downstream to surface missing latency. The `^0.1.0` range in `package.json` is sufficient documentation.
- D) Preview soft + stable soft: Add verification to both but make it a warning in both cases, never blocking.
**Answer**:

---

### Q2: Changeset Bot — Custom Script vs Official Action
**Context**: The spec (FR-011) says "Changeset bot comments on PRs" and references `changesets/bot@v1`, but the implementation uses a custom shell script that emits a GitHub Actions `::warning::` annotation instead of posting a PR comment. These provide different developer experiences: the official bot posts a visible PR comment with a checklist, while the annotation appears only in the Actions run log.
**Question**: Should the changeset bot workflow be updated to use the official `changesets/bot@v1` action for PR comments, or is the current `::warning::` annotation approach acceptable?
**Options**:
- A) Use official `changesets/bot@v1`: Provides visible PR comments, better developer experience, matches spec wording.
- B) Keep current custom script: The `::warning::` annotation is sufficient; avoids adding another third-party action.
- C) Update spec to match implementation: Document the custom approach as intentional and update FR-011 accordingly.
**Answer**:

---

### Q3: Stable Release Provenance Flag
**Context**: FR-009 requires all npm publishes to include the `--provenance` flag. The preview workflow explicitly passes `--provenance` in its publish command. However, the stable release workflow delegates publishing to `changesets/action@v1` with `publish: pnpm changeset publish` — this command does not include `--provenance`. Provenance requires `id-token: write` permissions (which is set) and the `--provenance` flag on the publish command itself.
**Question**: Should the stable release publish command be updated to include `--provenance`, or does changesets/action handle this differently?
**Options**:
- A) Add `--provenance` to stable publish: Change to `publish: pnpm changeset publish --provenance` in `release.yml` to match FR-009.
- B) Investigate changesets/action behavior: The action may handle provenance via environment variables or npm config. Verify before changing.
- C) Accept the gap: Provenance on preview is sufficient; stable releases don't need it.
**Answer**:

---

### Q4: Changeset Bot Node Version Inconsistency
**Context**: FR-004 requires all CI jobs to use Node 22. The `ci.yml`, `publish-preview.yml`, and `release.yml` workflows all use `node-version: 22`. However, `changeset-bot.yml` uses `node-version: 20`. While the bot workflow is non-critical (P2), this inconsistency could cause confusion and deviates from the stated requirement.
**Question**: Should the changeset bot workflow be updated to use Node 22 for consistency with FR-004, or is Node 20 acceptable for this non-critical workflow?
**Options**:
- A) Update to Node 22: Align all workflows with FR-004 for consistency.
- B) Keep Node 20: The bot workflow is non-critical and doesn't affect builds or publishes.
- C) Update spec to say "CI and publish workflows": Narrow FR-004's scope to exclude informational workflows.
**Answer**:

---

### Q5: Preview Publish Snapshot Version Format
**Context**: US2 acceptance criteria states snapshot versions should follow the format `0.1.0-preview.{timestamp}`. The implementation uses `pnpm changeset version --snapshot preview` which produces versions like `0.1.0-preview-{timestamp}` (hyphen, not dot, before timestamp). The exact format depends on the changesets library version and may not be controllable.
**Question**: Is the exact snapshot version format (`-preview.{timestamp}` vs `-preview-{timestamp}`) important, or is any changesets-generated snapshot format acceptable?
**Options**:
- A) Accept changesets default format: Whatever `changeset version --snapshot` produces is fine. Update spec to match actual output.
- B) Enforce dot-separated format: Investigate if changesets can be configured for the exact `0.1.0-preview.{timestamp}` format.
**Answer**:

---

### Q6: CI Caching Strategy
**Context**: The spec does not address caching beyond `pnpm` dependency caching (via `actions/setup-node` with `cache: pnpm`). Turborepo supports remote caching that could significantly reduce CI times for the typecheck, build, and lint jobs. The success criteria SC-002 targets "< 5 minutes for full pipeline" but the spec doesn't prescribe how to achieve this.
**Question**: Should Turborepo remote caching be configured in CI to improve build times, or is the current pnpm-only caching sufficient?
**Options**:
- A) Add Turborepo remote caching: Configure `TURBO_TOKEN` and `TURBO_TEAM` secrets for Vercel remote cache. Could significantly reduce CI time.
- B) Keep pnpm caching only: Current approach is simpler, avoids additional service dependency (Vercel). Revisit if SC-002 is not met.
- C) Out of scope: Defer caching optimization to a separate issue.
**Answer**:

---

### Q7: Stable Release — CI Gate Before Publish
**Context**: The preview publish workflow uses `workflow_run` to trigger only after CI passes. However, the stable release workflow (`release.yml`) triggers directly on `push to main` without waiting for CI to pass. It relies on branch protection rules to ensure CI passed before merge, but if branch protection is misconfigured or bypassed (e.g., admin merge), a broken build could be published.
**Question**: Should the stable release workflow also use `workflow_run` to explicitly gate on CI success, or is branch protection sufficient?
**Options**:
- A) Add `workflow_run` gate: Make `release.yml` trigger on CI completion (like preview) for defense-in-depth.
- B) Rely on branch protection: Branch protection on `main` is sufficient. Adding `workflow_run` adds complexity and delays.
- C) Add CI steps inline: Run lint/typecheck/test in `release.yml` before the publish step (duplicates CI but ensures safety).
**Answer**:

---

### Q8: Handling of Failed Preview Publishes
**Context**: The spec defines SC-005 ("Zero failed publishes from cancellation") and uses queued concurrency to prevent partial publishes. However, it doesn't address what happens when a preview publish fails for other reasons (e.g., npm registry outage, auth token expiration, network error). There's no retry mechanism, notification system, or documented recovery procedure.
**Question**: What should happen when a preview publish fails for non-cancellation reasons?
**Options**:
- A) Add retry logic: Configure automatic retries (e.g., 2-3 attempts with backoff) for the publish step.
- B) Add failure notifications: Send Slack/email notification on publish failure so maintainers can investigate.
- C) Accept manual monitoring: Maintainers monitor GitHub Actions for failures. No automated retry or notification needed at this stage.
- D) Out of scope: Document as a future enhancement. Current focus is on getting the happy path working.
**Answer**:

---

### Q9: Branch Protection Configuration Documentation
**Context**: FR-014 requires `main` branch to require PR with passing `CI Summary` status check. The spec lists this as a functional requirement but the Assumptions section notes "Branch protection on `main` is configured manually in GitHub repo settings." There's no documentation of the exact branch protection settings needed, and misconfiguration could allow broken code to be published.
**Question**: Should the spec include explicit branch protection rule configuration details (required reviewers, status checks, admin bypass policy), or is a general reference sufficient?
**Options**:
- A) Add detailed configuration section: Document exact settings — required status checks (`CI Summary`), required reviewers count, dismiss stale reviews, admin enforcement, etc.
- B) Add a setup checklist: Include a one-time setup checklist in the spec with the minimum required branch protection settings.
- C) Keep general reference: The current assumption statement is sufficient. Branch protection is standard GitHub knowledge.
**Answer**:

---

### Q10: `develop` Branch Protection
**Context**: The spec explicitly requires branch protection on `main` (FR-014) but says nothing about `develop` branch protection. Since `develop` is the primary development branch and preview publishes trigger on merge to `develop`, an unprotected `develop` branch could allow direct pushes that bypass CI and trigger preview publishes of untested code.
**Question**: Should `develop` also have branch protection requiring CI to pass before merge?
**Options**:
- A) Yes, protect `develop`: Require `CI Summary` to pass before merging to `develop`. Prevents untested preview publishes.
- B) No, keep `develop` unprotected: `develop` is a working branch; protection would slow down development. Preview publishes are low-risk.
- C) Lighter protection: Require CI but not reviews on `develop`. Full protection only on `main`.
**Answer**:
