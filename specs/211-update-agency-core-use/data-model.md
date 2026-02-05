# Data Model: Latency Facet Integration

## Core Entities

### Extended PluginManifest

The existing `PluginManifest` is extended with facet declarations:

```typescript
import { FacetProvider, FacetRequirement } from '@generacy-ai/latency';

interface PluginManifest {
  // === Existing Fields ===
  id: string;                    // Plugin identifier (e.g., '@generacy-ai/agency-plugin-git')
  name: string;                  // Human-readable name
  version: string;               // Semver version
  main: string;                  // Entry point path
  dependencies: string[];        // Plugin IDs that must load first
  peerDependencies?: Record<string, string>;
  tools?: string[];              // Tool names provided
  modes?: string[];              // Mode affiliations
  channels?: string[];           // Channel names
  critical: boolean;             // If true, failure stops server

  // === New Facet Fields ===
  provides?: FacetProvider[];    // Facets this plugin implements
  requires?: FacetRequirement[]; // Facets this plugin needs
  uses?: FacetRequirement[];     // Optional facets this plugin can use
}
```

### FacetProvider (from Latency)

```typescript
interface FacetProvider {
  /** The facet interface being provided (e.g., 'SourceControl') */
  facet: string;

  /** Optional qualifier for the implementation (e.g., 'git', 'svn') */
  qualifier?: string;

  /** Priority for resolution (higher values preferred when multiple match) */
  priority?: number;
}
```

### FacetRequirement (from Latency)

```typescript
interface FacetRequirement {
  /** The facet interface being required */
  facet: string;

  /** Specific qualifier to request (undefined = any provider) */
  qualifier?: string;

  /** If true, missing facet doesn't fail startup */
  optional?: boolean;
}
```

## Extended AgencyCoreAPI

```typescript
interface AgencyCoreAPI {
  // === Existing Methods ===
  registerTool(tool: AgencyTool): void;
  unregisterTool(name: string): void;
  getCurrentMode(): string;
  registerMode(mode: string): void;
  onModeChange(callback: (mode: string) => void): () => void;
  registerChannel(channel: ChannelDefinition): void;
  sendMessage<T>(channel: string, message: MessageEnvelope<T>): void;
  onMessage<T>(channel: string, handler: (msg: MessageEnvelope<T>) => void): () => void;
  getConfig<T>(key: string): T | undefined;
  recordEvent(event: TelemetryEvent): void;
  getPluginId(): string;

  // === New Facet Methods ===
  /**
   * Register a facet implementation.
   * @param facet - Facet interface name
   * @param implementation - The implementation object
   * @param qualifier - Optional qualifier (e.g., 'git')
   */
  provide<T>(facet: string, implementation: T, qualifier?: string): void;

  /**
   * Request a required facet.
   * @throws FacetNotFoundError if not available
   */
  require<T>(facet: string, qualifier?: string): T;

  /**
   * Request an optional facet.
   * @returns undefined if not available
   */
  optional<T>(facet: string, qualifier?: string): T | undefined;
}
```

## FacetRegistry

Internal registry for tracking facet providers:

```typescript
interface FacetRegistration<T = unknown> {
  facet: string;
  qualifier?: string;
  priority: number;
  implementation: T;
  pluginId: string;        // Which plugin registered this
  metadata?: Record<string, unknown>;
}

interface FacetRegistry {
  /** Register a facet provider */
  register<T>(
    facet: string,
    implementation: T,
    options?: {
      qualifier?: string;
      priority?: number;
      pluginId?: string;
      metadata?: Record<string, unknown>;
    }
  ): void;

  /** Resolve a facet to its provider */
  resolve<T>(facet: string, qualifier?: string): T | undefined;

  /** List all registrations for a facet */
  list(facet: string): FacetRegistration[];

  /** Check if a facet has any providers */
  has(facet: string, qualifier?: string): boolean;

  /** Unregister a provider */
  unregister(facet: string, qualifier?: string): boolean;

  /** Unregister all facets from a plugin (for cleanup) */
  unregisterByPlugin(pluginId: string): void;
}
```

## Error Types

```typescript
class FacetNotFoundError extends Error {
  constructor(
    public facet: string,
    public qualifier?: string
  ) {
    super(`Facet '${facet}'${qualifier ? ` (qualifier: ${qualifier})` : ''} not found`);
  }
}

class AmbiguousFacetError extends Error {
  constructor(
    public facet: string,
    public qualifiers: string[]
  ) {
    super(`Multiple providers for facet '${facet}': ${qualifiers.join(', ')}`);
  }
}
```

## Validation Rules

### Manifest Validation (Zod Schema)

```typescript
import { z } from 'zod';

const FacetProviderSchema = z.object({
  facet: z.string().min(1),
  qualifier: z.string().optional(),
  priority: z.number().int().optional(),
});

const FacetRequirementSchema = z.object({
  facet: z.string().min(1),
  qualifier: z.string().optional(),
  optional: z.boolean().optional(),
});

const PluginManifestSchema = z.object({
  // ... existing fields
  provides: z.array(FacetProviderSchema).optional(),
  requires: z.array(FacetRequirementSchema).optional(),
  uses: z.array(FacetRequirementSchema).optional(),
});
```

### Startup Validation

After all plugins initialize:

1. **Requirement satisfaction**: For each plugin's `requires` array, verify a provider exists:
   ```typescript
   for (const plugin of loadedPlugins) {
     for (const req of plugin.manifest.requires ?? []) {
       if (!registry.has(req.facet, req.qualifier)) {
         throw new FacetNotFoundError(req.facet, req.qualifier);
       }
     }
   }
   ```

2. **Provides registration**: Verify plugins actually registered their declared facets:
   ```typescript
   for (const plugin of loadedPlugins) {
     for (const prov of plugin.manifest.provides ?? []) {
       if (!registry.has(prov.facet, prov.qualifier)) {
         logger.warn(`Plugin ${plugin.manifest.id} declares ${prov.facet} but didn't register it`);
       }
     }
   }
   ```

## Entity Relationships

```
┌─────────────────────┐
│   AgencyServer      │
│                     │
│  - plugins[]        │──────┐
│  - facetRegistry    │      │
└─────────────────────┘      │
         │                   │
         │ contains          │ manages
         ▼                   ▼
┌─────────────────────┐    ┌─────────────────────┐
│   AgencyPlugin      │    │   FacetRegistry     │
│                     │    │                     │
│  - manifest         │    │  - registrations[]  │
│  - core (CoreAPI)   │    │                     │
└─────────────────────┘    └─────────────────────┘
         │                           │
         │ has                       │ stores
         ▼                           ▼
┌─────────────────────┐    ┌─────────────────────┐
│   PluginManifest    │    │ FacetRegistration   │
│                     │    │                     │
│  - provides[]       │◀───│  - facet            │
│  - requires[]       │    │  - qualifier        │
│  - uses[]           │    │  - implementation   │
└─────────────────────┘    │  - pluginId         │
                           └─────────────────────┘
```

## Plugin Facet Declarations

### agency-plugin-git

```typescript
manifest: {
  provides: [
    { facet: 'SourceControl', qualifier: 'git', priority: 10 }
  ],
  requires: [],
  uses: [],
}
```

### agency-plugin-docker

```typescript
manifest: {
  provides: [
    { facet: 'ContainerRuntime', qualifier: 'docker', priority: 10 }
  ],
  requires: [],
  uses: [],
}
```

### agency-plugin-humancy

```typescript
manifest: {
  provides: [],
  requires: [
    { facet: 'DecisionHandler' }
  ],
  uses: [],
}
```

### agency-plugin-firebase

```typescript
manifest: {
  provides: [
    { facet: 'SecretStore', qualifier: 'firebase', priority: 10 },
    { facet: 'StateStore', qualifier: 'firebase', priority: 10 },
  ],
  requires: [],
  uses: [],
}
```

### agency-plugin-spec-kit

```typescript
manifest: {
  provides: [],
  requires: [
    { facet: 'IssueTracker' },
    { facet: 'SourceControl' },
  ],
  uses: [],
}
```

### agency-plugin-npm

```typescript
manifest: {
  provides: [],
  requires: [],
  uses: [],
}
```
