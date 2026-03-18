# Clarifications: Add discovery-based build.validate tool to npm plugin

## Batch 1 — 2026-03-18

### Q1: Script Execution Order
**Context**: The `build.validate` tool runs multiple discovered validation scripts (lint, format:check, typecheck). The spec says "all discovered scripts run regardless of individual failures" but doesn't specify whether they execute sequentially or in parallel. Sequential execution is simpler with clearer, non-interleaved output; parallel execution is faster but may produce interleaved output that's harder to parse.
**Question**: Should the discovered validation scripts execute sequentially (one at a time, in discovery order) or in parallel (all at once)?
**Options**:
- A: Sequential — simpler, clearer output, matches existing tool patterns
- B: Parallel — faster, but requires output buffering to avoid interleaving

**Answer**: *Pending*

### Q2: Scripts Override vs Validate Short-Circuit Precedence
**Context**: FR-004 says if a `validate` script exists in package.json, use it as the sole entry point and skip individual discovery. FR-006 says accept an optional `scripts` parameter to override which scripts to run. If a user provides `scripts: ['lint', 'typecheck']` AND the package.json has a `validate` script, the expected behavior is undefined — should the explicit override be honored, or should the `validate` short-circuit still take precedence?
**Question**: When the user provides a `scripts` override parameter, should the `validate` script short-circuit (FR-004) still apply, or should the explicit `scripts` override take precedence?
**Options**:
- A: `scripts` override takes precedence — explicit user intent overrides auto-discovery
- B: `validate` short-circuit always wins — the project has declared a canonical validation entry point

**Answer**: *Pending*

### Q3: Config Entry Structure for Validate
**Context**: The existing `config.ts` maps tool operations to script names with simple key-value pairs (e.g., `lint: 'lint'`, `format: 'format'`). The spec says to "add validate script config entry" but the validate tool is fundamentally different — it's a meta-tool that discovers multiple scripts. A simple `validate: 'validate'` entry would only configure the short-circuit script name, but the discovery candidate list (`lint`, `format:check`, `format`, `typecheck`) would remain hardcoded.
**Question**: Should the config entry for validate be just the short-circuit script name (e.g., `validate: 'validate'`), or should it also allow customizing the default discovery candidate list?
**Options**:
- A: Simple entry — `validate: 'validate'` (just the short-circuit script name; candidates stay hardcoded as sensible defaults)
- B: Extended entry — include configurable candidate list (e.g., `validate: { script: 'validate', candidates: ['lint', 'format:check', ...] }`)

**Answer**: *Pending*
