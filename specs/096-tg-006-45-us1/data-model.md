# Data Model: ConfigService

## Core Entities

### AgencyConfig

The root configuration object for the Agency extension.

```typescript
interface AgencyConfig {
  version: string;              // Semantic version (e.g., "1.0.0")
  plugins: PluginConfig[];      // Array of plugin configurations
  modes: ModeConfig[];          // Array of mode configurations
  containers: ContainerConfig[]; // Array of container configurations
}
```

**Validation**:
- `version` must be a valid semantic version string
- Arrays are validated with Zod schemas
- Parsed via `parseAgencyConfig()` function

**Storage**:
- File: `.agency/agency.config.json`
- Format: JSON with 2-space indentation
- Location: Workspace root

### PluginConfig

Configuration for a single plugin.

```typescript
interface PluginConfig {
  id: string;                   // Unique plugin identifier
  enabled: boolean;             // Whether plugin is active
  settings: Record<string, unknown>; // Plugin-specific settings
}
```

**Validation**:
- `id` must be unique within the plugins array
- `settings` can be any JSON-serializable object
- Shape defined by individual plugin schemas

**Operations**:
- Add: `savePluginConfig(plugin)` with new id
- Update: `savePluginConfig(plugin)` with existing id
- Remove: `removePlugin(id)`
- Query: `getPlugin(id)` or `getPlugins()`

### ModeConfig

Configuration for an execution mode.

```typescript
interface ModeConfig {
  id: string;                   // Unique mode identifier
  name: string;                 // Display name
  tools: string[];              // Array of enabled tool IDs
  inherits?: string;            // Optional parent mode ID
}
```

**Validation**:
- `id` must be unique within the modes array
- `id: 'default'` is reserved and cannot be removed
- `inherits` must reference an existing mode ID (if specified)
- `tools` array validated against available tools

**Mode Inheritance**:
- Child mode inherits tools from parent
- Tools array is merged (union)
- Inheritance can be multi-level

**Operations**:
- Add: `saveModeConfig(mode)` with new id
- Update: `saveModeConfig(mode)` with existing id
- Remove: `removeMode(id)` (except 'default')
- Query: `getMode(id)` or `getModes()`

### ContainerConfig

Configuration for a development container.

```typescript
interface ContainerConfig {
  id: string;                   // Unique container identifier
  name: string;                 // Display name
  workspacePath: string;        // Path to workspace in container
  // Additional fields may be added by container plugins
}
```

**Validation**:
- `id` must be unique within the containers array
- `workspacePath` must be an absolute path
- Extended fields validated by container-specific schemas

**Operations**:
- Add: `saveContainerConfig(container)` with new id
- Update: `saveContainerConfig(container)` with existing id
- Remove: `removeContainer(id)`
- Query: `getContainer(id)` or `getContainers()`

## Internal Types

### ConfigMigration

Defines a single config version migration.

```typescript
interface ConfigMigration {
  fromVersion: string;          // Source version
  toVersion: string;            // Target version
  migrate(config: Record<string, unknown>): Record<string, unknown>;
}
```

**Usage**:
- Registered in `MIGRATIONS` array
- Applied sequentially during version migration
- Must be idempotent (safe to run multiple times)

**Example**:
```typescript
{
  fromVersion: '1.0.0',
  toVersion: '1.1.0',
  migrate(config) {
    return { ...config, newField: 'default' };
  }
}
```

### EventEmitter<T>

Internal event emitter for config change notifications.

```typescript
class EventEmitter<T> {
  get event(): (listener: (value: T) => void) => vscode.Disposable;
  fire(value: T): void;
  dispose(): void;
}
```

**Behavior**:
- VS Code-compatible disposable pattern
- Error handling in listener execution
- Supports multiple simultaneous listeners

## Relationships

```
AgencyConfig (1)
    ├── plugins (0..*)  → PluginConfig
    ├── modes (1..*)    → ModeConfig
    │       └── inherits (0..1) → ModeConfig (parent)
    └── containers (0..*) → ContainerConfig
```

### Cardinality Rules

- **AgencyConfig**: Exactly 1 per workspace
- **PluginConfig**: 0 or more plugins
- **ModeConfig**: At least 1 (default mode required)
- **ContainerConfig**: 0 or more containers

### Referential Integrity

- Mode inheritance: `ModeConfig.inherits` must reference existing mode
- Default mode: Cannot be removed (enforced by `removeMode()`)
- IDs: Must be unique within their collection

## Defaults

### DEFAULT_CONFIG_VERSION
```typescript
const DEFAULT_CONFIG_VERSION = '1.0.0';
```

### DEFAULT_CONFIG_PATH
```typescript
const DEFAULT_CONFIG_PATH = '.agency/agency.config.json';
```

### Default Configuration
```json
{
  "version": "1.0.0",
  "plugins": [],
  "modes": [
    {
      "id": "default",
      "name": "Default",
      "tools": []
    }
  ],
  "containers": []
}
```

## Version Compatibility

**Current Version**: 1.0.0

**Compatibility Check**:
```typescript
function isCompatibleVersion(version: string): boolean {
  // Major version must match
  const [currentMajor] = DEFAULT_CONFIG_VERSION.split('.');
  const [configMajor] = version.split('.');
  return currentMajor === configMajor;
}
```

**Migration Flow**:
1. Load config from file
2. Check `isCompatibleVersion(config.version)`
3. If incompatible, apply migrations sequentially
4. Update version to `DEFAULT_CONFIG_VERSION`
5. Write migrated config back to file

## Validation Rules

### Plugin Validation
- `id`: Non-empty string
- `enabled`: Boolean
- `settings`: Valid JSON object

### Mode Validation
- `id`: Non-empty string, unique
- `name`: Non-empty string
- `tools`: Array of strings
- `inherits`: Optional string referencing existing mode

### Container Validation
- `id`: Non-empty string, unique
- `name`: Non-empty string
- `workspacePath`: Absolute path string

### Config Version Validation
- Must be semantic version format: `MAJOR.MINOR.PATCH`
- Major version must match current major version

## Error Handling

### Initialization Errors
- Missing config file → Create default config
- Invalid JSON → Create default config
- Failed validation → Create default config

### Migration Errors
- Invalid migration result → Fallback to minimal valid config
- Logged but non-fatal

### Save Errors
- File write failure → Propagate error to caller
- Validation failure → Propagate error to caller

### Runtime Errors
- Uninitialized service → Throw `Error('ConfigService not initialized')`
- Missing config → Return empty arrays or null

---

*Generated by speckit /plan command*
