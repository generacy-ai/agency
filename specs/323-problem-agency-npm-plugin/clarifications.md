# Clarifications: Add discovery-based build.validate tool to npm plugin

## Batch 1 — 2026-03-18

### Q1: Script Execution Order
**Context**: The `build.validate` tool runs multiple discovered validation scripts (lint, format:check, typecheck). The spec says "all discovered scripts run regardless of individual failures" but doesn't specify whether they execute sequentially or in parallel. Sequential execution is simpler with clearer, non-interleaved output; parallel execution is faster but may produce interleaved output that's harder to parse.
**Question**: Should the discovered validation scripts execute sequentially (one at a time, in discovery order) or in parallel (all at once)?
**Options**:
- A: Sequential — simpler, clearer output, matches existing tool patterns
- B: Parallel — faster, but requires output buffering to avoid interleaving

**Answer**: A — Sequential. Matches existing tool patterns, clearer output. Validation scripts are fast individually; the simplicity/clarity tradeoff isn't worth parallelizing.

### Q2: Scripts Override vs Validate Short-Circuit Precedence
**Context**: FR-004 says if a `validate` script exists in package.json, use it as the sole entry point and skip individual discovery. FR-006 says accept an optional `scripts` parameter to override which scripts to run. If a user provides `scripts: ['lint', 'typecheck']` AND the package.json has a `validate` script, the expected behavior is undefined — should the explicit override be honored, or should the `validate` short-circuit still take precedence?
**Question**: When the user provides a `scripts` override parameter, should the `validate` script short-circuit (FR-004) still apply, or should the explicit `scripts` override take precedence?
**Options**:
- A: `scripts` override takes precedence — explicit user intent overrides auto-discovery
- B: `validate` short-circuit always wins — the project has declared a canonical validation entry point

**Answer**: A — Explicit `scripts` override takes precedence. The `validate` short-circuit is for the default auto-discovery case. If someone explicitly passes `scripts: ['lint', 'typecheck']`, they clearly want those specific checks.

### Q3: Config Entry Structure for Validate
**Context**: The existing `config.ts` maps tool operations to script names with simple key-value pairs (e.g., `lint: 'lint'`, `format: 'format'`). The spec says to "add validate script config entry" but the validate tool is fundamentally different — it's a meta-tool that discovers multiple scripts. A simple `validate: 'validate'` entry would only configure the short-circuit script name, but the discovery candidate list (`lint`, `format:check`, `format`, `typecheck`) would remain hardcoded.
**Question**: Should the config entry for validate be just the short-circuit script name (e.g., `validate: 'validate'`), or should it also allow customizing the default discovery candidate list?
**Options**:
- A: Simple entry — `validate: 'validate'` (just the short-circuit script name; candidates stay hardcoded as sensible defaults)
- B: Extended entry — include configurable candidate list (e.g., `validate: { script: 'validate', candidates: ['lint', 'format:check', ...] }`)

**Answer**: A — Simple entry. The `scripts` parameter on the tool call already provides the escape hatch for non-standard setups. Keep it simple; expand later if there's demand.

## Batch 2 — 2026-03-18

### Q4: Format --check Flag with Explicit Scripts Override
**Context**: The spec says during auto-discovery, if `format:check` doesn't exist, fall back to `format` with `--check` appended. However, if a user explicitly provides `scripts: ['format']` in the override parameter, the behavior is ambiguous. Running `format` without `--check` would actually modify files, which contradicts the validate tool's read-only/check-only purpose. But auto-appending `--check` to an explicitly requested script alters the user's intent.
**Question**: When the user explicitly includes `format` in the `scripts` override, should `--check` be auto-appended (ensuring read-only behavior consistent with the validate tool's purpose), or should it run as-is (respecting the literal script name)?
**Options**:
- A: Always append `--check` for `format` — the validate tool is inherently read-only; mutating files is never correct
- B: Run as-is — the user explicitly requested `format`, respect the literal name; they should use `format:check` if they want check mode

**Answer**: *Pending*

### Q5: Empty Discovery Result
**Context**: If auto-discovery finds no validation scripts in package.json (no `validate`, `lint`, `format:check`, `format`, or `typecheck` scripts exist), the expected behavior is unclear. This could happen for projects with non-standard script names or minimal configurations.
**Question**: When discovery finds no matching validation scripts, should the tool return success (nothing to validate = all passed) or return an error/warning?
**Options**:
- A: Return success with a message listing what was checked for — no scripts means nothing to fail
- B: Return error/warning — a project with no discoverable validations likely indicates misconfiguration

**Answer**: *Pending*
