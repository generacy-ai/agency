# Feature Specification: Release workflow peer-dep check reddens jobs after successful publish

**Branch**: `415-summary-release-workflow-s` | **Date**: 2026-07-14 | **Status**: Draft
**Source**: [Issue #415](https://github.com/generacy-ai/agency/issues/415)

## Summary

The `Release` workflow's **"Validate latest peer-dep consistency"** step can fail **after a successful publish**, turning the release job red even though packages were published correctly. It tripped during the cockpit→stable rollout on 2026-07-13.

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

## Proposed fix (pick/combine)

- **Reconcile the agency-family `@latest` tags** in one coordinated bump so the peers resolve, OR
- **Advance `@latest` alongside `@stable`** in the agency release flow (generacy's `release.yml` already does this — "Advance @latest dist-tag for all published packages"), so `@latest` stops pointing at ancient previews, OR
- **Make the check validate the tag actually being published** (`stable`) rather than `@latest`, and/or make it non-blocking (warn) since it runs after publish and cannot gate it.

## User Stories

### US1: Release engineer sees green jobs for successful publishes

**As a** release engineer merging a release PR to `main`,
**I want** the Release workflow to finish green when packages were published successfully,
**So that** I can trust job status as a signal and notice real failures immediately.

**Acceptance Criteria**:
- [ ] A successful stable publish results in a fully green Release workflow run.
- [ ] The peer-dep validation step no longer marks the job red for stale `@latest` drift that is unrelated to the release that just ran.
- [ ] If a genuine peer-dep inconsistency exists in the tag being published, it is surfaced clearly (either as a failed check or a prominent advisory).

### US2: Cluster/consumer of stable channel gets consistent peers

**As a** consumer installing agency packages from the `@stable` dist-tag,
**I want** peer dependencies across the agency package family to resolve consistently for the tag I install,
**So that** installs succeed without peer conflicts.

**Acceptance Criteria**:
- [ ] Peer-dep consistency is validated against the dist-tag actually being published (e.g. `stable`), not an unrelated tag.
- [ ] Consumers installing `@stable` do not encounter peer conflicts caused by drift on `@latest`.

### US3: On-call responder can distinguish real failures from stale noise

**As an** engineer investigating a red Release run,
**I want** red status to indicate a real problem with the release,
**So that** I don't have to reverse-engineer whether the redness is pre-existing noise.

**Acceptance Criteria**:
- [ ] Post-publish checks that cannot gate the publish are either fixed to gate pre-publish, made advisory (warn without failing), or reworked so they only fail on issues attributable to the current release.

## Functional Requirements

| ID | Requirement | Priority | Notes |
|----|-------------|----------|-------|
| FR-001 | Successful stable publishes MUST NOT cause the Release job to end red due to unrelated `@latest` drift. | P1 | Core acceptance criterion. |
| FR-002 | The peer-dep consistency check MUST validate the dist-tag being published (e.g. `stable`), not a hardcoded `@latest`. | P1 | Or the check must be made advisory. |
| FR-003 | If drift on `@latest` exists but the published tag is consistent, the workflow SHOULD emit a warning/advisory annotation without failing the job. | P2 | Preserves visibility of underlying drift. |
| FR-004 | The Release flow SHOULD advance the `@latest` dist-tag alongside `@stable` for all published packages, matching generacy's `release.yml`. | P2 | Prevents drift accumulating on `@latest`. |
| FR-005 | Any check that must gate a release MUST run pre-publish, not post-publish, so its failure has meaning. | P2 | Structural fix for the ordering flaw. |
| FR-006 | Genuine peer-dep inconsistencies within the tag being published MUST still fail the workflow. | P1 | Do not silence the check entirely. |

## Success Criteria

| ID | Metric | Target | Measurement |
|----|--------|--------|-------------|
| SC-001 | Green Release runs on successful stable publishes | 100% of successful publishes end green | GitHub Actions run status on the next stable release after this fix ships. |
| SC-002 | Peer-dep check validates the published tag | Check reads dist-tag from the release, not hardcoded `@latest` | Code review of `.github/workflows/release.yml`. |
| SC-003 | No false-positive redness on stable publishes | 0 red Release runs attributable to `@latest` drift | Review of Release runs in the 30 days following the fix. |
| SC-004 | Real peer-dep issues still detected | Deliberately induced peer-dep conflict on the published tag fails the workflow | Manual test or dry-run in a fork/branch. |

## Assumptions

- The agency release flow uses changesets and publishes with `--tag stable` for stable-channel releases.
- The cluster runtime installs from `@stable`, and `@latest` is a legacy/preview channel that has drifted.
- Modifying `.github/workflows/release.yml` is the primary vehicle for the fix; underlying package `package.json` peer-dep declarations are not necessarily changing.
- Advancing `@latest` alongside `@stable` (per generacy's flow) is an acceptable policy — no consumer relies on `@latest` pointing at old previews.

## Out of Scope

- Rewriting the changesets pipeline or moving off changesets.
- Backfilling correct peer-dep pins into historical preview releases already published to npm.
- Migrating existing consumers pinned to old `@latest` versions.
- Broader changes to release cadence, versioning strategy, or the meaning of the `preview` / `stable` / `latest` channels beyond what is needed to fix the misleading red job.

---

*Generated by speckit*
