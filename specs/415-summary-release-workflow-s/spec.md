# Feature Specification: Fix Release Workflow Peer-Dep Consistency Check

**Branch**: `415-summary-release-workflow-s` | **Date**: 2026-07-14 | **Status**: Clarified

## Summary

The `Release` workflow's **"Validate latest peer-dep consistency"** step can fail **after a successful publish**, turning the release job red even though packages were published correctly. It tripped during the cockpit → stable rollout on 2026-07-13. This change retargets the check at the tag actually being published, advances `@latest` alongside `@stable` on stable publishes so drift stops re-accumulating, and emits a non-failing advisory when residual `@latest` drift is still observed.

## Evidence

Release run [29271067312](https://github.com/generacy-ai/agency/actions/runs/29271067312) (triggered by merging #414 → `main`):

- `Create Release PR or Publish` — **success** (published `@generacy-ai/claude-plugin-cockpit@0.1.0` with `--tag stable`; confirmed via `npm view @generacy-ai/claude-plugin-cockpit@stable version` → `0.1.0`).
- `Validate latest peer-dep consistency` — **failure**, exit 1:

```
Peer dep conflict: @generacy-ai/agency-plugin-spec-kit@0.0.0-preview-20260302182740
  requires @generacy-ai/agency@0.0.0-preview-20260302182740 but @latest is 0.0.0-preview-20260228204303
(…same for agency-plugin-humancy / docker / firebase / git / npm)
```

## Root cause

The check ([`.github/workflows/release.yml` lines ~59–118](.github/workflows/release.yml)) compares the **`@latest`** dist-tags across the agency package family. Those `@latest` tags are stale Feb–Mar 2026 preview builds that are mutually inconsistent — `agency-plugin-*@latest` pin `agency@0.0.0-preview-20260302…` as a peer, but `agency@latest` is the older `0.0.0-preview-20260228…`.

Two compounding problems:

1. **The check is post-publish** — it runs `if: steps.changesets.outputs.published == 'true'`, so it can only fail *after* the publish already succeeded. The red job is therefore misleading: it does not mean the release failed.
2. **It validates `@latest`, not the tag being published.** This release published to `--tag stable`; the cluster runtime installs `@stable`. The `@latest` drift it flags affects neither the release that just ran nor stable-channel consumers.

## Impact

- Misleading red release runs on every stable publish until the `@latest` tags are reconciled.
- Real failures in this step would be indistinguishable from this pre-existing noise.
- No functional impact on the cockpit rollout — `claude-plugin-cockpit@0.1.0` is on `@stable` and installs cleanly (no deps/peerDeps).

## User Stories

### US1: Reliable release signal for maintainers

**As a** maintainer merging a release PR,
**I want** the `Release` workflow job to be green when the publish actually succeeded and the published tag family is internally consistent,
**So that** a red job is a reliable signal of a real problem and does not have to be routinely explained away.

**Acceptance Criteria**:
- [ ] A successful stable publish with no peer-dep conflict within the `@stable` family produces a green release job.
- [ ] A publish that produces a genuine peer-dep conflict within the just-published tag family still reddens the job.
- [ ] Pre-existing `@latest` drift alone never reddens the job.

### US2: Non-accumulating `@latest` drift

**As a** consumer installing agency packages without a tag qualifier,
**I want** `@latest` to point at the current stable release after each stable publish,
**So that** `npm install @generacy-ai/agency-plugin-*` resolves to a coherent set of stable versions.

**Acceptance Criteria**:
- [ ] After a stable publish, every package published in that run has its `@latest` dist-tag advanced to the newly-published stable version.
- [ ] Preview publishes never touch `@latest`.

### US3: Visibility into residual drift

**As a** maintainer,
**I want** the workflow to surface residual `@latest` drift as an advisory (not a failure) when the family's `@latest` tags are still inconsistent,
**So that** we know when a manual reconciliation is warranted without reddening green publishes.

**Acceptance Criteria**:
- [ ] When residual `@latest` drift is detected on a run whose `@stable` (or published-tag) check passed, the workflow emits a non-failing annotation/warning describing the drift.

## Functional Requirements

| ID     | Requirement                                                                                                                                                                              | Priority | Notes |
|--------|------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|----------|-------|
| FR-001 | The peer-dep consistency check MUST NOT fail on `@latest` drift alone when the just-published tag family is internally consistent.                                                       | P1       | Root fix for the misleading red job. |
| FR-002 | The check MUST validate the tag actually being published (e.g. `stable`), not `@latest`.                                                                                                 | P1       | Retargets the check at the release channel that matters. |
| FR-003 | When the check passes but residual `@latest` drift is still present in the family, the workflow MUST emit a non-failing advisory (warning/annotation) describing the drift.              | P2       | Keeps drift visible without blocking. |
| FR-004 | On a successful stable publish, the workflow MUST advance the `@latest` dist-tag of each published package to the newly-published stable version. Preview publishes MUST NOT touch `@latest`. | P1   | Matches generacy's `release.yml`; stops drift re-accumulating. |
| FR-005 | Any check that must *gate* a release MUST run pre-publish. The peer-dep consistency check is reclassified as a post-publish *verification* of the published tag family and remains post-publish. | P2 | Explicit reclassification; keeps FR-005 as the governing principle without forcing pre-publish gating for this check. |
| FR-006 | The check MUST still fail when the just-published tag family is genuinely inconsistent (real peer-dep conflict), so real regressions are detectable.                                     | P1       | Preserves the check's original intent. |
| FR-007 | The set of packages participating in the check MUST be derived from the changesets `publishedPackages` output for the run, not from a hardcoded list.                                    | P1       | Auto-includes new packages (current hardcoded `PACKAGES` list already omits `@generacy-ai/claude-plugin-cockpit`). For each published package, peer-dep ranges are resolved against (a) other packages published in this run at their new versions and (b) any non-published peers at the published tag. |

## Success Criteria

| ID     | Metric                                                                        | Target                                                                          | Measurement                                                    |
|--------|--------------------------------------------------------------------------------|---------------------------------------------------------------------------------|----------------------------------------------------------------|
| SC-001 | Green release job for a successful stable publish with no real conflict        | 100% green over the next 3 stable publishes                                     | GitHub Actions run history for the `Release` workflow.         |
| SC-002 | `@latest` matches `@stable` for each family package after a stable publish     | `npm view @generacy-ai/<pkg>@latest version` == `npm view … @stable version` for every published package, within the run | Post-publish assertion in workflow logs (or manual check). |
| SC-003 | Advisory annotation is emitted when residual drift is present                  | For any release run where `@latest` drift persists after publish, exactly one non-failing annotation describing it appears in the run | Workflow logs / job annotations. |
| SC-004 | Real peer-dep regressions still fail the job                                   | Synthetic test (or first real occurrence) demonstrates a genuine conflict reddens the job | Manual verification during rollout / retro on next incident. |

## Assumptions

- `changesets` publish output exposes a `publishedPackages` field enumerating `{name, version}` pairs for what was just published (used by FR-007).
- The workflow can read the just-published tag from the changesets step (or determine it from `--tag` in the publish config) to decide which dist-tag to validate.
- Every current family package has a coherent `@stable` version, so advancing `@latest` to `@stable` on a stable publish will not itself introduce new inconsistencies.
- `npm dist-tag add` is available in the release job's environment with credentials sufficient to advance `@latest` for all family packages.

## Out of Scope

- **One-time historical retag of existing stale `@latest` tags.** Reconciling pre-existing `@latest` drift is not part of this PR (Q3=B). The workflow fix converges drift over time as each package next publishes stable. A separate operational step (e.g. `npm dist-tag add @generacy-ai/<pkg>@<stable> latest` across the family) may be executed independently if we want `@latest` clean immediately.
- **Pre-publish gating.** Moving the check to run before `changesets publish` (Q4=A) is not part of this change; the check remains post-publish and is reclassified as verification (FR-005).
- **Backfilling historical peer-dep pins** in already-published preview versions.
- **Consumer migration** away from `@latest`.
- **Changes to preview-channel behaviour** beyond the explicit "preview publishes must not touch `@latest`" rule in FR-004.

---

*Generated by speckit*
