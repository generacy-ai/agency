# Quickstart: build.validate Tool

## Installation

No additional installation required — the tool is part of `@generacy-ai/agency-plugin-npm`.

```bash
cd /workspaces/agency
pnpm install
pnpm build
```

## Usage

### Basic — Auto-Discovery

Call `build.validate` with just a working directory. The tool discovers and runs all available validation scripts:

```json
{
  "tool": "build.validate",
  "params": {
    "cwd": "/path/to/project"
  }
}
```

The tool checks `package.json` for: `validate`, `lint`, `format:check` (or `format`), `typecheck`.

### With Script Override

Specify exactly which scripts to run:

```json
{
  "tool": "build.validate",
  "params": {
    "cwd": "/path/to/project",
    "scripts": ["lint", "typecheck"]
  }
}
```

### In a Monorepo Workspace

```json
{
  "tool": "build.validate",
  "params": {
    "cwd": "/path/to/monorepo",
    "workspace": "my-package"
  }
}
```

## Discovery Logic

1. If `scripts` param is provided → run exactly those scripts
2. If `validate` script exists in `package.json` → run only that (single entry point)
3. Otherwise → auto-discover from candidates:
   - `lint` — run as-is
   - `format:check` — run as-is (if missing, fall back to `format --check`)
   - `typecheck` — run as-is
4. Scripts not found in `package.json` are silently skipped

## Example Output

**Success**:
```
Validation passed (3/3):
  ✓ lint
  ✓ format:check
  ✓ typecheck
```

**Failure**:
```
Validation failed (1/3 failed):
  ✓ lint
  ✗ format:check
  ✓ typecheck

--- format:check ---
src/index.ts: formatting differs...

Recovery: Fix the failing validations above, then re-run.
```

## Mode Affiliations

The tool is available in:
- `coding` mode — run validations during development
- `review` mode — run validations during code review

`build.format` is also now available in `review` mode.

## Configuration

In plugin config, the short-circuit script name can be customized:

```typescript
{
  packageManager: 'auto',
  scripts: {
    validate: 'validate',  // default — the short-circuit script name
  }
}
```

## Troubleshooting

| Issue | Cause | Fix |
|-------|-------|-----|
| "No validation scripts discovered" | No matching scripts in package.json | Add `lint`, `format:check`, or `typecheck` scripts |
| Format check fails unexpectedly | `format` script runs without `--check` | Add a `format:check` script to package.json |
| Wrong package manager detected | Multiple lockfiles present | Set `packageManager` in plugin config |
| Script runs but shouldn't | Auto-discovery found it | Use `scripts` param to control exactly what runs |
