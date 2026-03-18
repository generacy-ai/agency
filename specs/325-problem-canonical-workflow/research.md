# Research: Update canonical workflow templates to use build.validate

## Technology Decisions

### 1. Use `build.validate` with default discovery

**Decision**: Reference `build.validate` without an explicit `scripts` parameter, relying on its built-in discovery of `lint`, `format:check`, and `typecheck`.

**Rationale**: The default candidate list in `agency-plugin-npm` (`DEFAULT_CANDIDATES = ['lint', 'format:check', 'typecheck']`) covers exactly the static quality checks we want. Using default discovery means:
- New quality scripts added to a project are automatically picked up
- No coupling between workflow templates and specific script names
- Missing scripts are silently skipped (no errors for projects without `typecheck`)

**Alternatives considered**:
- Explicit `scripts: ['lint']` — too restrictive, defeats the purpose of discovery
- Explicit `scripts: ['lint', 'format:check', 'typecheck']` — redundant with defaults, creates maintenance burden
- Adding `test` to defaults — rejected in clarification Q1; tests have different semantics

### 2. Keep test step separate

**Decision**: Retain the existing `run-tests` step using `verification.check` rather than consolidating into `build.validate`.

**Rationale**: Tests are fundamentally different from static validation:
- **Duration**: Tests are typically longer-running
- **Environment**: Tests may require databases, emulators, network access
- **Failure semantics**: A lint failure is different from a test failure in triage
- **Parallelization**: Future workflows may want to run validation and tests concurrently

**Alternatives considered**:
- `build.validate` with `scripts: ['test', 'lint']` — conflates two different concerns
- `test.run-unit` tool — doesn't exist yet, adds unnecessary scope

### 3. Cross-plugin tool resolution

**Decision**: Reference `build.validate` directly in spec-kit workflow templates without any explicit dependency declaration on `agency-plugin-npm`.

**Rationale**: The workflow engine resolves tool names across all loaded plugins at runtime. The existing `verification.check` references work the same way — no plugin scoping. Both `agency-plugin-spec-kit` and `agency-plugin-npm` are loaded together in all standard environments.

## Implementation Patterns

### Workflow step pattern

The existing verification steps follow a consistent pattern:
```yaml
- name: step-name
  uses: namespace.tool
  with:
    key: value
  continueOnError: true
```

For `build.validate`, the `with` block is omitted entirely since we want default discovery (no parameters needed). The `continueOnError: true` flag is preserved so that validation failures don't block the workflow from reporting results.

### Tool reference format

Tools are referenced as `namespace.tool`:
- `verification.check` — generic command runner
- `speckit.specify` — spec generation
- `build.validate` — discovery-based validation (from npm plugin)
- `pr.create` — PR creation

No plugin prefix is needed; the engine handles resolution.

## Key Sources

- `build.validate` implementation: `packages/agency-plugin-npm/src/tools/build/validate.ts`
- Workflow templates: `packages/agency-plugin-spec-kit/workflows/`
- Workflow resolution: `packages/agency-plugin-spec-kit/src/workflows.ts`
- Issue #323: `build.validate` tool introduction
