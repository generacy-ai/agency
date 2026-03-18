# Research: build.validate Tool

## Technology Decisions

### Sequential vs Parallel Script Execution
**Decision**: Sequential execution
**Rationale**: Existing build tools (lint, format, compile) all run single commands sequentially. The validate tool is a meta-tool that runs multiple scripts, but sequential execution produces clearer output, avoids interleaved stderr/stdout, and matches the established patterns. Validation scripts are individually fast (typically <10s each), so parallelism offers minimal wall-clock benefit.

### Discovery Algorithm Design
**Decision**: Check package.json scripts with a prioritized candidate list
**Rationale**: The tool must work across diverse projects without configuration. Using `package.json` scripts as the source of truth is reliable — every npm-ecosystem project has one. The candidate list (`validate`, `lint`, `format:check`, `format`, `typecheck`) covers the most common validation patterns. The `validate` short-circuit allows projects to define their own single validation entry point.

**Discovery priority**:
1. `validate` script → run only this, skip all other discovery
2. `lint` → run as-is
3. `format:check` → run as-is; if absent, fall back to `format` with `--check`
4. `typecheck` → run as-is

### Reusing Existing Infrastructure
**Decision**: Leverage `getAvailableScripts()`, `validateScript()`, PM detection, `exec()`, and `buildCommand()`
**Rationale**: All required primitives already exist in the plugin. The validate tool is primarily an orchestration layer that chains these utilities. No new dependencies needed.

## Alternatives Considered

### 1. Parallel execution with output buffering
Rejected — adds complexity (output buffering, ordering) for minimal speed benefit. Can be added later if needed without breaking changes.

### 2. Configurable candidate list in config.ts
Rejected — the `scripts` tool parameter already provides runtime override. Adding config-level customization adds complexity without clear demand. Can be added later.

### 3. Separate tool per validation type
Rejected — the whole point is a unified meta-tool. Individual tools (lint, format) already exist for targeted use.

### 4. AST-based detection (detect eslint config, prettier config, tsconfig)
Rejected — over-engineered. Script names in package.json are the standard convention and already reliable. Config file detection would be fragile across diverse project setups.

## Implementation Patterns

### Output Format
The validate tool aggregates results from multiple scripts. Output format:

**All pass**:
```
Validation passed (3/3):
  ✓ lint
  ✓ format:check
  ✓ typecheck
```

**Mixed results**:
```
Validation failed (1/3 failed):
  ✓ lint
  ✗ format:check
  ✓ typecheck

--- format:check ---
[stderr/stdout from failed command]

Recovery: Fix the failing validations above, then re-run.
```

**No scripts found**:
```
No validation scripts discovered in package.json.
Searched for: validate, lint, format:check, format, typecheck
```

### Error Handling
Follows the three-tier error handling pattern established by existing tools:
1. **Invalid params** → Zod parse failure → TerseOutput.failure
2. **No package.json / PM detection failure** → TerseOutput.failure
3. **Script execution failures** → collected and aggregated, not thrown

## Key Sources

- Existing tool implementations: `lint.ts`, `format.ts`, `compile.ts`
- Script validation utilities: `scripts/validate.ts`
- PM detection: `pm/detect.ts`, `pm/commands.ts`
- Exec runner: `exec/runner.ts`
- Clarification answers: `clarifications.md` (Q1-Q3 answered, Q4-Q5 pending)
