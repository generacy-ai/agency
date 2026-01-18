# Research: Plugin Loader and Lifecycle Management

## Technology Decisions

### 1. Plugin Discovery Strategy

**Decision**: File system scanning with manifest lookup

**Rationale**:
- Node.js doesn't have a built-in plugin discovery mechanism
- Scanning `node_modules` for `@generacy-ai/agency-plugin-*` is reliable
- Reading `package.json` for manifest location avoids assumptions

**Alternatives Considered**:
- Dynamic `import()` only: Requires knowing exact paths upfront
- npm programmatic API: Adds dependency, overkill for our use case
- require.resolve chains: Less reliable across module systems

### 2. Dependency Resolution Algorithm

**Decision**: Kahn's algorithm for topological sorting

**Rationale**:
- Well-understood algorithm for DAG ordering
- O(V + E) time complexity
- Naturally detects cycles
- Stable output for consistent load order

**Alternatives Considered**:
- DFS-based topological sort: Harder to detect cycles cleanly
- Load-on-demand (lazy): Complicates dependency tracking
- No ordering: Would cause initialization failures

**Implementation Pattern**:
```typescript
// Kahn's algorithm pseudocode
function topologicalSort(plugins: PluginManifest[]): PluginManifest[] {
  // Build adjacency list and in-degree count
  const inDegree = new Map<string, number>();
  const dependents = new Map<string, string[]>();

  // Initialize
  for (const p of plugins) {
    inDegree.set(p.id, 0);
    dependents.set(p.id, []);
  }

  // Count in-degrees
  for (const p of plugins) {
    for (const dep of p.dependencies ?? []) {
      dependents.get(dep)?.push(p.id);
      inDegree.set(p.id, (inDegree.get(p.id) ?? 0) + 1);
    }
  }

  // Process nodes with zero in-degree
  const queue = [...plugins].filter(p => inDegree.get(p.id) === 0);
  const result: PluginManifest[] = [];

  while (queue.length > 0) {
    const current = queue.shift()!;
    result.push(current);

    for (const dep of dependents.get(current.id) ?? []) {
      const newDegree = (inDegree.get(dep) ?? 1) - 1;
      inDegree.set(dep, newDegree);
      if (newDegree === 0) {
        queue.push(plugins.find(p => p.id === dep)!);
      }
    }
  }

  // Cycle detection
  if (result.length !== plugins.length) {
    throw new Error('Circular dependency detected');
  }

  return result;
}
```

### 3. Channel Communication Pattern

**Decision**: Event emitter with topic-based routing

**Rationale**:
- Familiar pattern in Node.js ecosystem
- Decouples sender from receivers
- Simple to implement and test
- TypeScript generics for type-safe messages

**Alternatives Considered**:
- Direct function calls: Tight coupling between plugins
- Message queues: Overkill for in-process communication
- Shared state: Hard to track mutations

**Implementation Pattern**:
```typescript
interface ChannelManager {
  registerChannel(channel: ChannelDefinition): void;
  send<T>(channel: string, message: MessageEnvelope<T>): void;
  subscribe<T>(channel: string, handler: (msg: MessageEnvelope<T>) => void): () => void;
}
```

### 4. Failure Isolation Strategy

**Decision**: Configurable per-plugin with try-catch wrappers

**Rationale**:
- Default isolation prevents cascade failures
- Critical plugins (like humancy) can opt-in to propagation
- Matches the clarified requirements

**Implementation Pattern**:
```typescript
async function safeInitialize(plugin: AgencyPlugin, core: AgencyCoreAPI): Promise<void> {
  try {
    await plugin.initialize(core);
  } catch (error) {
    if (plugin.manifest.critical) {
      throw new AgencyError(
        ErrorCodes.CRITICAL_PLUGIN_FAILED,
        `Critical plugin failed: ${plugin.manifest.id}`,
        { originalError: error }
      );
    }
    // Log and disable non-critical plugin
    console.error(`Plugin ${plugin.manifest.id} failed to initialize, disabling`);
  }
}
```

### 5. Manifest Schema Design

**Decision**: Zod schema with forward-compatible structure

**Rationale**:
- Zod provides runtime validation + TypeScript inference
- Already used in the project
- Schema designed to match future @generacy-ai/contracts

**Schema Structure**:
```typescript
const PluginManifestSchema = z.object({
  id: z.string().regex(/^@[\w-]+\/[\w-]+$/),
  name: z.string().min(1),
  version: z.string().regex(/^\d+\.\d+\.\d+/),
  description: z.string().optional(),

  // Entry points
  main: z.string().default('./dist/index.js'),
  types: z.string().optional(),

  // Dependencies
  dependencies: z.array(z.string()).default([]),
  peerDependencies: z.record(z.string()).optional(),

  // Capabilities
  tools: z.array(z.string()).optional(),
  modes: z.array(z.string()).optional(),
  channels: z.array(z.string()).optional(),

  // Behavior
  critical: z.boolean().default(false),
});
```

### 6. Mode Registration

**Decision**: Extend ModeManager with dynamic mode registration

**Rationale**:
- Core modes (research, coding, review, debug) are predefined
- Plugins can register additional modes at initialization
- Mode changes broadcast to all plugins via hooks

**Implementation Pattern**:
```typescript
class ModeManager {
  private readonly callbacks: Set<(mode: string) => void> = new Set();

  registerMode(mode: string): void {
    this.availableModes.add(mode);
  }

  onModeChange(callback: (mode: string) => void): () => void {
    this.callbacks.add(callback);
    return () => this.callbacks.delete(callback);
  }

  setMode(mode: string): void {
    // ... validation ...
    this.currentMode = mode;
    for (const cb of this.callbacks) {
      cb(mode);
    }
  }
}
```

## Implementation Patterns

### Plugin Lifecycle States

```
DISCOVERED → VALIDATED → RESOLVED → INITIALIZING → ACTIVE → SHUTTING_DOWN → UNLOADED
     ↓           ↓           ↓            ↓                       ↓
   INVALID   INVALID    CYCLE_ERROR   INIT_FAILED            SHUTDOWN_FAILED
```

### Error Codes

```typescript
// New error codes for plugin system
const PluginErrorCodes = {
  MANIFEST_INVALID: 'MANIFEST_INVALID',
  DEPENDENCY_MISSING: 'DEPENDENCY_MISSING',
  DEPENDENCY_CYCLE: 'DEPENDENCY_CYCLE',
  CRITICAL_PLUGIN_FAILED: 'CRITICAL_PLUGIN_FAILED',
  CHANNEL_NOT_FOUND: 'CHANNEL_NOT_FOUND',
  MODE_ALREADY_REGISTERED: 'MODE_ALREADY_REGISTERED',
};
```

## Key Sources and References

- MCP SDK source code for protocol patterns
- Node.js module resolution algorithm documentation
- Kahn's algorithm for topological sorting
- Existing Agency codebase patterns (telemetry, tools, config)

## Open Questions Resolved

All clarification questions were answered in the spec clarification phase:
- Q1: Configurable failure isolation ✓
- Q2: No hot-reload ✓
- Q3: Plugin-extensible modes ✓
- Q4: Open channel access ✓
- Q5: Local manifest schema ✓
