# Quickstart: Fix Release Workflow Peer-Dep Consistency Check

**Feature**: 415-summary-release-workflow-s
**Date**: 2026-07-14

## What this change does

`.github/workflows/release.yml`'s post-publish check gets three edits:

1. **Retargeted validation**: peer-dep consistency is checked against the **just-published tag family** (currently `stable`), not `@latest`.
2. **`@latest` advancement**: on stable publishes, each newly-published package's `@latest` dist-tag is advanced to the just-published version.
3. **Drift advisory**: if `@latest` and `@stable` diverge for any published package, a non-failing `::warning::` annotation is emitted.

Preview publishes never touch `@latest`.

## Files touched

- `.github/workflows/release.yml` — sole file modified

## Reviewing the PR

Look for these three concrete deltas in `.github/workflows/release.yml`:

1. The step named `Validate latest peer-dep consistency` is **renamed** to `Validate published tag family peer-dep consistency`. Its inline Node should:
   - No longer contain a hardcoded `PACKAGES = [...]` list.
   - Read `steps.changesets.outputs.publishedPackages` via an `env:` variable.
   - Fetch each published package's manifest at its just-published `<version>` (not `@latest`).
   - Look up any non-published peers at `@stable` (or the configured publish tag).
   - Fail iff a peer-dep range within the published family is violated.

2. A **new** step (e.g. `Advance @latest for stable publishes`) that runs `npm dist-tag add <name>@<version> latest` for each entry in `publishedPackages`. Gated on `if: steps.changesets.outputs.published == 'true' && env.PUBLISH_TAG == 'stable'`.

3. A **new** step (e.g. `Emit @latest drift advisory`) that compares `npm view <name>@latest version` to `npm view <name>@stable version` for each published package and emits `::warning::` lines. Never fails the step.

## Verifying on the next real stable publish

After the PR lands and the next stable publish runs, check the [Actions run](https://github.com/generacy-ai/agency/actions/workflows/release.yml):

- The **Release** job should be green if the publish succeeded.
- The `Validate published tag family peer-dep consistency` step's logs should show it validating `@stable` (or the current publish tag) rather than `@latest`.
- The `Advance @latest for stable publishes` step's logs should show one `npm dist-tag add ... latest` per published package. Verify with:
  ```bash
  for pkg in @generacy-ai/agency @generacy-ai/agency-plugin-{spec-kit,humancy,docker,firebase,git,npm} @generacy-ai/claude-plugin-cockpit; do
    echo "$pkg  latest=$(npm view "$pkg@latest" version)  stable=$(npm view "$pkg@stable" version)"
  done
  ```
- The `Emit @latest drift advisory` step may emit `::warning::` lines for family members that were **not** published in this run and still diverge — this is expected and not a failure.

## Verifying the negative path

To confirm the check still fails on a genuine conflict (FR-006), the safest rehearsal is a synthetic offline test — do **not** intentionally publish a broken changeset to prove the check works:

```bash
node - <<'EOF'
const { execSync } = require('child_process');
const semver = require('semver');

// Simulate a published family with a genuine conflict
const family = {
  '@generacy-ai/agency-plugin-spec-kit': {
    name: '@generacy-ai/agency-plugin-spec-kit',
    version: '0.1.0',
    source: 'published',
    peerDependencies: { '@generacy-ai/agency': '^0.1.0' },
  },
  '@generacy-ai/agency': {
    name: '@generacy-ai/agency',
    version: '0.0.9', // deliberately out of range
    source: 'published',
    peerDependencies: {},
  },
};

const conflicts = [];
for (const [name, entry] of Object.entries(family)) {
  if (entry.source !== 'published' || !entry.peerDependencies) continue;
  for (const [peer, range] of Object.entries(entry.peerDependencies)) {
    if (!family[peer]) continue;
    if (!semver.validRange(range)) continue;
    if (!semver.satisfies(family[peer].version, range)) {
      conflicts.push({ package: name, peer, range, actual: family[peer].version });
    }
  }
}
console.log(conflicts.length ? 'FAILED (expected):' : 'PASSED');
console.log(JSON.stringify(conflicts, null, 2));
process.exit(conflicts.length ? 1 : 0);
EOF
```

This exercises the same predicate the workflow uses; the real workflow adds only the `publishedPackages` → `family` bridge and the npm I/O.

## Troubleshooting

- **Release job red, but `Create Release PR or Publish` was green**: check the `Validate published tag family peer-dep consistency` step's log for a `Peer dep conflict:` line. That names the offending package + peer + expected range vs. actual. Follow the existing fix pattern in `.github/workflows/release.yml:112–114` (re-run after bumping affected packages in a single changeset).
- **`Advance @latest` step fails with 403/404**: `NPM_TOKEN` lacks write access, or the published version's registry propagation hasn't completed. First case is a token rotation problem; second is transient — re-run the job.
- **Advisory warnings for packages that were not in `publishedPackages`**: expected. The advisory reads all `@generacy-ai/*` family members the check touched. To reconcile immediately, run `npm dist-tag add @generacy-ai/<pkg>@<stable-version> latest` for each divergent package (this is the operational path spec §Out of Scope leaves open).

## Rollback

Revert the PR. The workflow reverts to the previous behaviour: post-publish check against `@latest` with a hardcoded package list. Red jobs on stable publishes will resume, but no functional impact on published packages.
