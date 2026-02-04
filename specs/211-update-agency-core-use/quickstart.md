# Quickstart: Agency with Latency Facets

## Installation

1. **Ensure workspace is configured**

   The `/workspaces/` directory should have all repos linked via pnpm:
   ```bash
   cd /workspaces
   pnpm install
   ```

2. **Build Agency packages**

   ```bash
   cd /workspaces/agency
   pnpm build
   ```

## Plugin Development with Facets

### Declaring Facets in Manifest

Add `provides`, `requires`, and `uses` to your plugin manifest:

```typescript
// packages/my-plugin/src/index.ts
import type { AgencyPlugin, PluginManifest } from '@generacy-ai/agency';

export const manifest: PluginManifest = {
  id: '@my-org/agency-plugin-example',
  name: 'Example Plugin',
  version: '1.0.0',
  main: './dist/index.js',
  dependencies: [],
  tools: ['example.hello'],
  critical: false,

  // Facet declarations
  provides: [
    { facet: 'Greeter', qualifier: 'english', priority: 10 }
  ],
  requires: [
    { facet: 'Logger' }  // Must be available at startup
  ],
  uses: [
    { facet: 'Metrics', optional: true }  // Nice to have, won't fail if missing
  ],
};
```

### Using Facets in Plugin Initialization

```typescript
import type { AgencyCoreAPI } from '@generacy-ai/agency';
import type { Logger, Metrics } from '@generacy-ai/latency';

export async function initialize(core: AgencyCoreAPI): Promise<void> {
  // Get required facet (throws if not available)
  const logger = core.require<Logger>('Logger');
  logger.info('Plugin initializing');

  // Get optional facet (returns undefined if not available)
  const metrics = core.optional<Metrics>('Metrics');
  metrics?.increment('plugin.init');

  // Provide our facet implementation
  const greeter: Greeter = {
    greet: (name: string) => `Hello, ${name}!`,
  };
  core.provide('Greeter', greeter, 'english');

  // Register tools as usual
  core.registerTool({
    name: 'example.hello',
    description: 'Say hello',
    inputSchema: { type: 'object', properties: { name: { type: 'string' } } },
    handler: async ({ name }) => greeter.greet(name),
  });
}
```

### Consuming Facets from Other Plugins

```typescript
// In another plugin that needs the Greeter facet
export async function initialize(core: AgencyCoreAPI): Promise<void> {
  // Request specific qualifier
  const englishGreeter = core.require<Greeter>('Greeter', 'english');

  // Or request any Greeter (resolved by priority)
  const anyGreeter = core.require<Greeter>('Greeter');
}
```

## Available Facet Interfaces

### From `@generacy-ai/latency`

| Facet | Description |
|-------|-------------|
| `SourceControl` | Git/VCS operations (branch, commit, diff) |
| `IssueTracker` | Issue/ticket management (create, update, list) |
| `DecisionHandler` | Human-in-the-loop decision requests |
| `Logger` | Scoped logging |
| `StateStore` | Key-value state storage |

### Agency-Specific Facets

| Facet | Provider Plugin |
|-------|-----------------|
| `SourceControl` (git) | agency-plugin-git |
| `ContainerRuntime` (docker) | agency-plugin-docker |
| `SecretStore` (firebase) | agency-plugin-firebase |
| `StateStore` (firebase) | agency-plugin-firebase |

## Error Handling

### FacetNotFoundError

Thrown when `require()` can't find a matching facet:

```typescript
try {
  const db = core.require<Database>('Database');
} catch (e) {
  if (e instanceof FacetNotFoundError) {
    console.error(`Missing facet: ${e.facet}`);
    // Handle gracefully or fail
  }
}
```

### AmbiguousFacetError

Thrown when multiple providers match and no qualifier specified:

```typescript
// If both 'git' and 'svn' provide SourceControl
try {
  const sc = core.require<SourceControl>('SourceControl');  // Ambiguous!
} catch (e) {
  if (e instanceof AmbiguousFacetError) {
    console.error(`Multiple providers: ${e.qualifiers.join(', ')}`);
    // Specify a qualifier: core.require('SourceControl', 'git')
  }
}
```

## Commands

### Build all packages

```bash
pnpm build
```

### Run tests

```bash
pnpm test
```

### Start Agency server

```bash
pnpm --filter @generacy-ai/agency start
```

### Check facet resolution

After startup, Agency logs facet resolution:

```
[INFO] Facet SourceControl registered by agency-plugin-git (qualifier: git)
[INFO] Facet ContainerRuntime registered by agency-plugin-docker (qualifier: docker)
[INFO] All required facets satisfied
```

## Troubleshooting

### "Facet 'X' not found"

1. Check if the providing plugin is installed and loaded
2. Verify the plugin's manifest declares `provides: [{ facet: 'X' }]`
3. Ensure the plugin actually calls `core.provide('X', impl)` in initialize

### "Workspace link not found"

```bash
cd /workspaces
pnpm install
```

Ensure `@generacy-ai/latency` is accessible in the workspace.

### "Multiple providers for facet"

Add a qualifier to disambiguate:

```typescript
// Instead of
core.require('SourceControl');

// Use
core.require('SourceControl', 'git');
```

## Migration from Non-Facet Plugins

1. Add facet fields to manifest (can start with empty arrays)
2. Replace direct imports with `core.require()` calls
3. Register implementations with `core.provide()`
4. Update tests to mock facet dependencies
