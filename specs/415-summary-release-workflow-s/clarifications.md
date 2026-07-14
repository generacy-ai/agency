# Clarifications

Questions and answers to clarify the feature specification.

## Batch 1 - 2026-07-14 01:14

### Q1: Primary fix strategy
**Context**: The spec lists three proposed fix approaches (reconcile @latest tags, advance @latest alongside @stable, and retarget the check at the published dist-tag), and functional requirements bundle multiple. Implementation direction depends on which is the essential fix vs optional bundled improvements.
**Question**: Which combination of fixes should ship as part of this change?
**Options**:
- A: Only retarget the check at the tag being published (FR-002) + keep it failing on genuine mismatches (FR-006). Leave @latest drift entirely alone.
- B: Retarget the check AND add @latest advancement alongside @stable (FR-002 + FR-004) so future drift stops accumulating.
- C: Retarget the check, add @latest advancement, AND emit an advisory annotation when @latest drift is detected but not failing (FR-002 + FR-003 + FR-004).
- D: Minimal fix: make the existing check non-blocking (warn only) without changing what it validates.

**Answer**: C — Ship the retargeted check (FR-002) + advance `@latest` alongside `@stable` (FR-004) + a non-failing advisory when residual `@latest` drift is detected (FR-003). Three small, additive workflow edits that together fix the red job and stop drift re-accumulating. A historical retag is intentionally excluded here (see Q3).

### Q2: @latest advancement scope
**Context**: FR-004 proposes advancing @latest alongside @stable, matching generacy's release.yml. The agency release flow also produces preview publishes. Whether preview releases should also touch @latest determines the branching/tag logic in the workflow.
**Question**: When should the release workflow advance the @latest dist-tag?
**Options**:
- A: Only when publishing to @stable — preview publishes never touch @latest.
- B: For every publish (preview and stable) so @latest tracks the newest published version regardless of channel.
- C: Do not advance @latest at all in this workflow — leave that policy for a separate change.

**Answer**: A — Advance `@latest` only when publishing to `@stable`; preview publishes must never touch `@latest`. `@latest` mirrors the stable release (matching generacy's `release.yml`). Advancing `@latest` on preview is exactly what produced the current drift (`@latest` pointing at old preview builds).

### Q3: Existing drift reconciliation
**Context**: The current @latest tags point at stale Feb–Mar 2026 preview builds that are mutually inconsistent. Even after fixing the workflow, those tags remain stale until something bumps them. Whether a one-time reconciliation is part of this change affects both scope and whether consumers on @latest see any improvement immediately.
**Question**: Should this change include a one-time reconciliation of the existing stale @latest tags?
**Options**:
- A: Yes — run a one-time coordinated re-tagging (e.g. point @latest at current @stable versions) as part of this fix so drift is resolved on day one.
- B: No — only fix the workflow going forward. Existing @latest tags stay as-is; they will naturally reconcile on the next stable publish once FR-004 lands.
- C: No — reconciliation is explicitly out of scope; the spec's Out of Scope section already excludes historical peer-dep pins, and existing @latest is treated the same way.

**Answer**: B — Keep this change workflow-only; do not bundle a one-time historical retag into the PR. Once the check is retargeted (Q4), the existing `@latest` drift is harmless, and FR-004 converges `@latest`→stable as each package next publishes. A one-time `npm dist-tag add @generacy-ai/<pkg>@<stable> latest` across the family remains feasible as a separate operational step if we later want `@latest` clean immediately; it is not part of this bugfix PR. The spec's Out of Scope excludes backfilling historical peer-dep *pins* and migrating consumers — not re-pointing `@latest` — so this is a deliberate scope choice, not a hard exclusion.

### Q4: Check ordering
**Context**: FR-005 says any check that must gate a release MUST run pre-publish. The current peer-dep check is post-publish and cannot gate anything. Moving it pre-publish requires computing the versions-to-be-published before changesets runs, which is non-trivial.
**Question**: Where should the peer-dep consistency check run after this fix?
**Options**:
- A: Pre-publish — compute planned versions from changesets output before publishing and gate the publish on inconsistencies.
- B: Post-publish but advisory — keep the check where it is, but downgrade to warning/annotation so it never reddens the job.
- C: Post-publish and blocking, but only for the tag actually published — job goes red only when the just-published tag family is genuinely inconsistent (matches FR-006).

**Answer**: C — Post-publish, but fail only on a genuine peer-dep conflict within the tag actually published (FR-002 + FR-006); never on unrelated `@latest` drift (FR-001). This reclassifies the step from a non-functional "gate" to a post-publish *verification*, which is what makes it acceptable under FR-005 for the step to remain post-publish (FR-005 governs checks that must *gate*, and this one verifies rather than gates). Pre-publish gating (option A) is feasible because `changeset version` has already materialized target versions into `package.json` before publish, but that is more workflow logic than this bug requires.

### Q5: Agency package family
**Context**: The check compares peer-dep pins across the 'agency package family' (spec-kit, humancy, docker, firebase, git, npm, and now cockpit per the 2026-07-13 rollout). Whether this list is hardcoded in the workflow or discovered dynamically affects maintenance and how new packages are onboarded.
**Question**: How should the workflow determine which packages participate in the peer-dep consistency check?
**Options**:
- A: Hardcoded list in release.yml — explicit, reviewable, but must be updated when new agency packages are added.
- B: Dynamically discovered from the monorepo (e.g. workspace globs or the changesets publish output) so new packages are picked up automatically.
- C: Only validate the packages that were actually published in this run (from changesets output) — no cross-family check for packages not touched.

**Answer**: C — Determine participating packages from the changesets `publishedPackages` output, so the check scopes to what this release actually published and auto-includes new packages (the current hardcoded `PACKAGES` list already omits `@generacy-ai/claude-plugin-cockpit`). For each published package, resolve its peer-dependency ranges against (a) the other packages published in this run at their new versions and (b) any non-published peers at the published tag (`@stable`).

