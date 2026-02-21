# Research: Technical Decisions

**Feature**: 244-problem-every-repository-using

## R1: `workflows/` Directory Placement

### Context
The canonical YAML files need to be bundled with the published npm package. Two approaches were considered:

1. **Inside `src/`** (e.g., `src/workflows/`) — would require either copying them to `dist/` during build or treating them as assets
2. **Alongside `src/`** (e.g., `workflows/`) — ships as-is via the `files` array in package.json

### Decision: Alongside `src/`

**Rationale:**
- `tsconfig.json` has `"rootDir": "./src"` — adding non-TS files inside `src/` would either be ignored by `tsc` (confusing) or require build pipeline changes
- The `files` array in package.json can include multiple directories: `["dist", "workflows"]`
- This pattern is common in the npm ecosystem for shipping non-compiled assets (e.g., `templates/`, `schemas/`)
- No build pipeline changes needed — `pnpm build` (`tsc`) continues to work as-is

**Path resolution from compiled code:**
```
Published package structure:
  dist/workflows.js      ← compiled module
  workflows/*.yaml       ← raw YAML files

Path: resolve(__dirname, '../workflows/speckit-feature.yaml')
  where __dirname = dirname(fileURLToPath(import.meta.url))
  which resolves to the dist/ directory at runtime
```

## R2: `import.meta.url` for Path Resolution

### Context
In ESM modules, `__dirname` is not available. The standard replacement is:
```typescript
const __dirname = dirname(fileURLToPath(import.meta.url));
```

### Decision: Use `import.meta.url`

**Rationale:**
- The project exclusively uses ESM (`"type": "module"` in package.json)
- `tsconfig.base.json` targets `"module": "Node16"` which fully supports `import.meta.url`
- No existing code in the spec-kit plugin uses `__dirname` or `import.meta.url` (all current path resolution is relative to config-provided directories), so this is the first usage — but it's the standard ESM approach
- `fileURLToPath` from `node:url` handles edge cases (spaces in paths, Windows drive letters)

### Alternative Considered
Using `node:path` with `process.cwd()` — rejected because the module's location is fixed relative to the package install, while `process.cwd()` varies.

## R3: Optional `registerWorkflow()` Call Strategy

### Context
`AgencyCoreAPI` interface (defined in `packages/agency/src/plugins/types.ts`) does **not** have a `registerWorkflow()` method. The companion generacy issue (#211) will add this. We need a future-proof call that is a no-op today.

### Decision: Cast + Optional Chaining

```typescript
(core as Record<string, unknown>).registerWorkflow?.(name, filePath, { priority: 'fallback' });
```

**Rationale:**
- TypeScript won't allow optional chaining on a method not in the interface
- Casting to `Record<string, unknown>` is the minimal escape hatch
- Optional chaining (`?.`) ensures the call is a no-op when the method doesn't exist
- When #211 lands and adds `registerWorkflow()` to the interface, the cast can be removed in a follow-up cleanup

**Alternatives Considered:**
1. **`'registerWorkflow' in core`** — more explicit but requires the same cast for TypeScript
2. **Check at runtime with `typeof`** — more verbose, same effect
3. **Don't call at all** — loses the future integration point; would require a separate spec-kit update when #211 lands

## R4: Error Handling During Workflow Registration

### Context
When `core.registerWorkflow()` exists but throws (e.g., duplicate registration, invalid path), how should the error be handled?

### Decision: Log via `recordEvent` and Continue

```typescript
try {
  (core as Record<string, unknown>).registerWorkflow?.(...);
} catch (error) {
  core.recordEvent({
    type: 'plugin.workflow.registration_failed',
    data: { workflow: name, error: String(error) },
  });
}
```

**Rationale:**
- The plugin's primary value is its 11 spec-kit tools
- Workflow registration is supplementary functionality
- Silent swallowing hides real issues (duplicate registrations, corrupt paths)
- Failing the entire `initialize()` would block all tools over a supplementary feature
- `recordEvent` is the established telemetry pattern in the plugin (used by `AgencyCoreAPI`)

## R5: `yaml` Package for Tests

### Context
Tests need to parse YAML to validate workflow file structure. The monorepo already has `yaml@^2.8.2` in the core agency package.

### Decision: Add `yaml` as devDependency to spec-kit plugin

```json
"devDependencies": {
  "yaml": "^2.8.2"
}
```

**Rationale:**
- Already in the pnpm lockfile (core agency depends on it as a runtime dep)
- Consistent API across the monorepo
- As a devDependency, it doesn't increase the published package size
- `js-yaml` would add a second YAML library with a different API

## R6: Test Validation Depth

### Context
How deeply should tests validate the workflow YAML structure?

### Decision: One Level Deep

Validate:
- Top-level: `name`, `version`, `inputs` (array), `phases` (array) exist
- Each phase: has `name` (string) and `steps` (array)
- Each step: has `name` (string) and `uses` (string)
- Each input: has `name` (string) and `description` (string)

Do NOT validate:
- `with` object shapes within steps (too coupled to specific actions)
- `output` field references (template expression validation)
- `timeout`, `continueOnError` (optional fields that vary)

**Rationale:**
- Top-level only would miss common structural errors (phase missing steps, step missing `uses`)
- Full schema validation tightly couples tests to every field, creating churn
- One level deep catches meaningful structural errors while remaining resilient to step-level changes

## R7: No Subpath Export

### Context
The spec initially proposed a `./workflows` subpath export for tree-shaking.

### Decision: Barrel export only

**Rationale:**
- No other plugin in the monorepo uses subpath exports beyond `./package.json`
- The `files` array pattern in every plugin package is `["dist"]` — we're extending it to `["dist", "workflows"]` but not adding export complexity
- The consumer base is small (internal monorepo packages)
- Tree-shaking benefit doesn't justify maintenance cost for a second entry point
- Can be added later without breaking consumers
