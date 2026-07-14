# Research: Release Workflow Peer-Dep Consistency Fix

**Feature**: 415-summary-release-workflow-s
**Date**: 2026-07-14

## Decisions

### D1: Retarget the check at the published tag (not `@latest`)

**Decision**: Rewrite the `Validate latest peer-dep consistency` step to validate the tag actually being published (currently `stable`, per `pnpm changeset publish --tag stable --provenance` in `.github/workflows/release.yml:52`).

**Rationale**:
- Root cause of the red job is that `@latest` for the agency family points at mutually inconsistent Feb–Mar 2026 preview builds; the check was catching drift unrelated to the release that just ran (spec §Root cause).
- The runtime consumers of stable releases install `@stable`; validating that tag family is what actually protects them (spec FR-002).
- Preserves the original intent — genuinely broken publishes still fail (spec FR-006).

**Alternatives considered**:
- **A: Retarget only, no `@latest` advancement, no advisory** (clarify Q1 option A). Rejected: drift keeps re-accumulating; residual `@latest` divergence stays invisible.
- **B: Downgrade the entire check to advisory** (Q1 option D). Rejected: loses the ability to detect real regressions (FR-006).
- **C: Move the check pre-publish and gate the release on it** (Q4 option A). Rejected: `changeset version` does materialise target versions into `package.json` before publish, so it's *feasible*, but it is materially more workflow logic than this bugfix needs. Reclassified this step as post-publish *verification* rather than a gate (FR-005), which is compatible with the governing "gates run pre-publish" rule.

### D2: Advance `@latest` alongside `@stable` on stable publishes only

**Decision**: After a successful publish, when the publish channel is `stable`, run `npm dist-tag add <name>@<version> latest` for each entry in `steps.changesets.outputs.publishedPackages`. Preview publishes must **not** touch `@latest`.

**Rationale**:
- Mirrors `generacy/release.yml`, which is the reference pattern the agency workflow was intended to follow (spec §Root cause references FR-004 as matching generacy's `release.yml`).
- Advancing `@latest` on preview is exactly what created the current drift; excluding preview from `@latest` advancement is the whole point of the fix (clarify Q2=A).
- Consumers who `npm install @generacy-ai/agency-plugin-*` without a tag qualifier get a coherent stable set (US2).

**Alternatives considered**:
- **Advance `@latest` on every publish including preview** (Q2 option B). Rejected: reintroduces the exact failure mode.
- **Do not advance `@latest` at all in this workflow** (Q2 option C). Rejected: leaves drift to re-accumulate as new stable releases ship.

### D3: Emit residual drift as a non-failing GitHub Actions warning

**Decision**: After the retargeted check succeeds, compare each published package's `@latest` dist-tag to its `@stable` dist-tag; emit `::warning::` GitHub Actions annotations for each divergence. Do not fail the job.

**Rationale**:
- Keeps residual drift visible to maintainers without turning green publishes red (US3, FR-003).
- Post-`@latest`-advancement (D2) drift should be rare for packages *published* in the run, but non-published family members may still show divergence — the advisory surfaces that.
- Uses `::warning::` because GitHub renders it in the job annotations and run summary, which is exactly the "visibility without blocking" outcome the acceptance criterion asks for.

**Alternatives considered**:
- **Silent no-op on residual drift** (Q1 option B). Rejected: loses observability of the reconciliation problem.
- **Fail on residual drift after a grace window**. Rejected: overengineered for a one-time cleanup problem that FR-004 will converge naturally (spec Out of Scope, Q3=B).

### D4: Discover participants from `changesets` `publishedPackages` output

**Decision**: Read `steps.changesets.outputs.publishedPackages` (JSON array of `{name, version}`) to enumerate the packages participating in the check. For each published package, resolve peer ranges against (a) other packages published in this run at their new versions and (b) any non-published peers at the published tag (`@stable`).

**Rationale**:
- Auto-includes new packages: the current hardcoded `PACKAGES` list at `.github/workflows/release.yml:66–75` already omits `@generacy-ai/claude-plugin-cockpit`, which is a maintenance bug this fix eliminates (FR-007, Q5=C).
- Scopes the check to *what this release did*, which matches how a post-publish verification should reason.
- Aligns with the changesets action documented output surface — [changesets/action README](https://github.com/changesets/action#outputs) exposes `publishedPackages` as a JSON string of `{name, version}[]`.

**Alternatives considered**:
- **Keep the hardcoded list** (Q5 option A). Rejected: guaranteed to drift as packages are added.
- **Discover from monorepo workspace globs** (Q5 option B). Rejected: broader than needed — a check scoped to "what this release published" is a tighter invariant.

### D5: Keep the implementation inline in `release.yml` (no new script file)

**Decision**: All new logic (participant discovery, peer-dep validation, `@latest` advancement, advisory annotation) lives in inline shell/Node blocks within `.github/workflows/release.yml`, matching the existing style at `.github/workflows/release.yml:59–118`.

**Rationale**:
- The change is small enough (~3 additive step edits) that a new script file would obscure rather than clarify.
- Keeps the entire release logic reviewable in one place.
- Matches project convention — the existing check is already inline Node.

**Alternatives considered**:
- **Extract to `scripts/validate-release-family.mjs`**. Rejected as premature abstraction. If the workflow later needs unit tests over this logic, extracting is cheap and can be done then.

## Implementation Patterns

### P1: Reading `publishedPackages` in Bash

`steps.changesets.outputs.publishedPackages` is a JSON-encoded string. Pattern (matches existing style):

```yaml
- name: Validate published tag family peer-dep consistency
  if: steps.changesets.outputs.published == 'true'
  env:
    PUBLISHED_PACKAGES: ${{ steps.changesets.outputs.publishedPackages }}
    PUBLISH_TAG: stable
  run: |
    node - <<'EOF'
    const published = JSON.parse(process.env.PUBLISHED_PACKAGES);
    const publishTag = process.env.PUBLISH_TAG;
    // ...
    EOF
```

Passing via `env:` avoids YAML/shell quoting bugs when the JSON contains characters like `@` or `"`.

### P2: `semver` availability on the runner

`semver` is already used by the existing step (`.github/workflows/release.yml:64`) via a lockfile-installed `pnpm install --frozen-lockfile` at step `.github/workflows/release.yml:36`. It resolves via `node_modules`; no separate install is needed.

### P3: `npm dist-tag add` with `NPM_TOKEN`

The existing publish step sets `NPM_TOKEN` (`.github/workflows/release.yml:57`). `npm dist-tag add <name>@<version> latest` uses the same auth surface. Pattern:

```yaml
- name: Advance @latest for stable publishes
  if: steps.changesets.outputs.published == 'true' && env.PUBLISH_TAG == 'stable'
  env:
    NPM_TOKEN: ${{ secrets.NPM_TOKEN }}
    PUBLISHED_PACKAGES: ${{ steps.changesets.outputs.publishedPackages }}
    PUBLISH_TAG: stable
  run: |
    echo "//registry.npmjs.org/:_authToken=${NPM_TOKEN}" > ~/.npmrc
    node -e "$(cat <<'JS'
    const pkgs = JSON.parse(process.env.PUBLISHED_PACKAGES);
    const { execSync } = require('child_process');
    for (const { name, version } of pkgs) {
      execSync(`npm dist-tag add ${name}@${version} latest`, { stdio: 'inherit' });
    }
    JS
    )"
```

The `changesets/action` step already writes `.npmrc` under the runner; verifying its lifecycle is a task item.

### P4: GitHub Actions warning annotation

Use `::warning::` on a single line per divergence — GitHub surfaces this in run annotations and the run summary. Example:

```
::warning::Residual @latest drift: @generacy-ai/agency-plugin-git@latest is 0.0.0-preview-... but @stable is 0.1.0
```

## Key Sources

- Existing workflow: `.github/workflows/release.yml`
- Failing run cited in spec: [Release run 29271067312](https://github.com/generacy-ai/agency/actions/runs/29271067312)
- Reference workflow behaviour: `generacy/release.yml` (advancing `@latest` alongside `@stable`) — spec §Root cause
- Changesets action outputs: [`changesets/action` README, Outputs](https://github.com/changesets/action#outputs)
- Clarifications: [clarifications.md](./clarifications.md) Q1–Q5
