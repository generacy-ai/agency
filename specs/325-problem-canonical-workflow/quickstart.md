# Quickstart: Update canonical workflow templates to use build.validate

## What Changed

The verification phase in both `speckit-feature.yaml` and `speckit-bugfix.yaml` now uses `build.validate` instead of `pnpm run lint`. The test step is unchanged.

## Verifying the Change

### 1. Check the templates

```bash
# Confirm build.validate is present
grep -n "build.validate" packages/agency-plugin-spec-kit/workflows/*.yaml

# Confirm no hardcoded pnpm in verification phases
# (pnpm may still appear in test step — that's expected for now)
grep -n "pnpm run lint" packages/agency-plugin-spec-kit/workflows/*.yaml
# Expected: no output
```

### 2. Run a workflow

```bash
# Run the feature workflow on a test project
generacy run speckit-feature.yaml --input description="test feature"

# The verification phase should show:
# - run-tests: executes test via verification.check
# - run-validate: executes build.validate (discovers lint, format:check, typecheck)
```

### 3. Test with different project configurations

| Project has... | Expected behavior |
|---|---|
| Only `lint` script | `build.validate` runs lint |
| `lint` + `format:check` | `build.validate` runs both |
| `lint` + `format:check` + `typecheck` | `build.validate` runs all three |
| No quality scripts | `build.validate` completes with no scripts to run |
| `validate` script | `build.validate` runs only `validate` (dedicated override) |

## Troubleshooting

**`build.validate` tool not found**: Ensure `agency-plugin-npm` is loaded alongside `agency-plugin-spec-kit`. The workflow engine resolves tools across all loaded plugins.

**Tests not running**: Tests are intentionally separate from `build.validate`. Check that the `run-tests` step is present and uses `verification.check`.

**Lint not running**: Check that your project's `package.json` has a `lint` script. `build.validate` only runs scripts that exist.
