# Research: Latency Facet Integration

## Technology Decisions

### 1. Facet System Integration Strategy

**Decision**: Extend AgencyCoreAPI with facet methods rather than replacing it.

**Rationale**:
- Agency already has a mature plugin system with tool registration, channels, and configuration
- Facets add capability-based contracts without disrupting existing functionality
- Minimal API surface change for plugin authors
- Aligns with clarification answer Q4 (Option B)

**Alternatives Considered**:
- **Replace AgencyCoreAPI entirely**: Would require rewriting all plugins and lose existing functionality
- **Wrapper pattern**: Adds complexity with no clear benefit over extension

### 2. Dependency Ordering

**Decision**: Keep `dependencies[]` for load order, use `provides/requires` for capability contracts.

**Rationale**:
- These solve different problems:
  - `dependencies[]`: "Plugin X must load before Plugin Y"
  - `provides/requires`: "Plugin Y needs capability C, Plugin X provides it"
- Existing topological sort algorithm for dependencies is well-tested
- Facet resolution runs after loading, validates contracts at startup

**Alternatives Considered**:
- **Merge into single system**: Over-complicates the dependency resolver, mixes concerns
- **Facets only**: Loses explicit load ordering needed for initialization sequencing

### 3. Package Installation Strategy

**Decision**: Use pnpm workspace link (`"@generacy-ai/latency": "workspace:*"`)

**Rationale**:
- Cross-repo workspace at `/workspaces/` already configured (Wave 5)
- Avoids npm registry dependency during development
- Enables synchronized development across repos
- Per clarification answer Q1 (Option C)

**Alternatives Considered**:
- **npm registry**: Would require publishing latency first, adds circular dependency on issue #28
- **Git submodule**: More complex setup, harder to keep in sync

## Implementation Patterns

### Facet Registration Pattern

From Latency's design, facet registration follows this pattern:

```typescript
// In plugin initialization
export async function initialize(core: AgencyCoreAPI) {
  // Register provided facets
  core.provide<SourceControl>('SourceControl', this, 'git');

  // Request required facets
  const issueTracker = core.require<IssueTracker>('IssueTracker');

  // Request optional facets
  const logger = core.optional<Logger>('Logger');
}
```

### Manifest Declaration Pattern

```typescript
export const manifest: PluginManifest = {
  id: '@generacy-ai/agency-plugin-git',
  name: 'Git Plugin',
  version: '1.0.0',
  main: './dist/index.js',
  dependencies: [],
  tools: ['git.status', 'git.commit', 'git.branch'],
  provides: [
    { facet: 'SourceControl', qualifier: 'git', priority: 10 }
  ],
  requires: [],
  uses: [
    { facet: 'Logger', optional: true }
  ],
  critical: true,
};
```

### Facet Resolution Lifecycle

1. **Discovery**: Scan plugins, collect manifests (existing)
2. **Dependency Sort**: Topological sort by `dependencies[]` (existing)
3. **Load Plugins**: Initialize in sorted order (existing)
4. **Facet Registration**: Plugins call `provide()` during init (new)
5. **Facet Validation**: After all plugins loaded, validate all `requires` satisfied (new)
6. **Ready**: Server ready to handle requests (existing)

### Error Handling Pattern

```typescript
// FacetNotFoundError - when require() can't resolve
throw new FacetNotFoundError('IssueTracker', 'github');

// AmbiguousFacetError - when multiple providers match without qualifier
throw new AmbiguousFacetError('SourceControl', ['git', 'svn']);
```

## Key Types from Latency

### FacetProvider

```typescript
interface FacetProvider {
  facet: string;       // Interface name (e.g., 'SourceControl')
  qualifier?: string;  // Implementation qualifier (e.g., 'git')
  priority?: number;   // Resolution priority (higher preferred)
}
```

### FacetRequirement

```typescript
interface FacetRequirement {
  facet: string;       // Required interface
  qualifier?: string;  // Specific implementation (optional)
  optional?: boolean;  // If true, missing facet doesn't fail startup
}
```

### PluginContext (Latency)

```typescript
interface PluginContext {
  provide<T>(facet: string, impl: T, qualifier?: string): void;
  require<T>(facet: string, qualifier?: string): T;
  optional<T>(facet: string, qualifier?: string): T | undefined;
}
```

## Plugin Facet Mapping

Based on clarification Q3:

| Plugin | Provides | Requires | Notes |
|--------|----------|----------|-------|
| git | SourceControl | - | Extends Latency's GitPlugin |
| docker | ContainerRuntime | - | New facet interface |
| humancy | - | DecisionHandler | For human-in-the-loop |
| firebase | SecretStore, StateStore | - | Cross-plugin state sharing |
| spec-kit | - | IssueTracker, SourceControl | Uses git and issue tracker |
| npm | - | - | Self-contained tools |

## Sources

- `/workspaces/latency/packages/latency/src/composition/facet.ts` - Core facet types
- `/workspaces/latency/packages/latency/src/composition/manifest.ts` - PluginManifest type
- `/workspaces/latency/packages/latency/src/composition/context.ts` - PluginContext interface
- `/workspaces/latency/packages/latency/src/runtime/registry.ts` - FacetRegistry implementation
- `/workspaces/agency/packages/agency/src/plugins/types.ts` - Existing Agency plugin types
- `/workspaces/agency/packages/agency/src/core-api/core-api.ts` - Existing CoreAPI implementation
