# Contract: npm CLI surface used by this feature

The workflow uses three `npm` subcommands. All are stable, documented public interfaces.

## `npm info <name>@<tag> --json`

**Purpose**: Fetch the manifest of a specific version or dist-tag for peer-dep resolution.

**Consumed fields**:
- `.version` (string, semver)
- `.peerDependencies` (object of `<peer-name>: <range>`, optional)

**Failure modes**:
- Non-zero exit + non-JSON stderr when the package/tag does not exist. The workflow treats this as "not on npm" and skips the peer (matches existing behaviour at `.github/workflows/release.yml:79–82`).
- Network flake retryability: not currently retried; a single failure fails the step. If flakiness proves an issue in practice, add a `--registry-retries` shim in a follow-up.

## `npm dist-tag add <name>@<version> latest`

**Purpose**: Advance the `@latest` dist-tag to a specific published version.

**Preconditions**:
- `<name>@<version>` must already be published (guaranteed because `publishedPackages` only lists just-published versions).
- The `NPM_TOKEN` in the environment must have write access to `<name>` on the registry (same token used by `changesets/action` publish).

**Exit contract**: Non-zero exit fails the step. This is intentional: a failure here means real auth/network/registry problems, not the advisory-drift the spec is trying to make non-blocking.

**Idempotence**: Re-running with the same `<version>` is a no-op on the registry side.

## `npm view <name>@<tag> version`

**Purpose**: Read the current version pointed to by a dist-tag, for the advisory comparison.

**Output**: Single line, `<semver>` on stdout. Empty stdout / non-zero exit when the tag does not exist. The workflow treats missing as `latestVersion: null` / `stableVersion: null` and reports it as `reason: "latest-missing"` or `"stable-missing"` in the advisory (see [data-model.md](../data-model.md) `DriftAdvisory`).
