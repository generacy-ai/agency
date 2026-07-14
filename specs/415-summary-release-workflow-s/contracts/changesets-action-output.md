# Contract: `changesets/action@v1` outputs consumed by this feature

This feature consumes two outputs from the `changesets/action@v1` step (id: `changesets`) in `.github/workflows/release.yml`.

## `steps.changesets.outputs.published`

**Type**: string (`"true"` | `"false"`)

**Semantics**: `"true"` iff at least one package was published in this run.

**Used at**: `if:` conditions on the three new/rewritten steps introduced by this feature. Matches existing usage at `.github/workflows/release.yml:60`.

## `steps.changesets.outputs.publishedPackages`

**Type**: JSON-encoded string

**Decoded shape**:

```json
[
  { "name": "@generacy-ai/agency", "version": "0.1.0" },
  { "name": "@generacy-ai/claude-plugin-cockpit", "version": "0.1.0" }
]
```

**Guarantees relied on**:
- Every entry has non-empty `name` and semver-valid `version`.
- `version` is the exact version just published (not a range, not a dist-tag).
- The array is empty when `published === "false"`.

**Failure mode**: If the shape ever changes and JSON.parse fails or entries lack `name`/`version`, the retargeted step fails with a descriptive error message pointing at the changesets action version — this is the correct signal (changesets output regression, not a peer-dep problem).

**Reference**: [changesets/action README — Outputs](https://github.com/changesets/action#outputs)
