# Data Model: Mode System Implementation

## Core Entities

### ModeDefinition

User-facing mode definition as specified in config.

```typescript
interface ModeDefinition {
  /** Mode name (unique identifier) */
  name: string;

  /** Human-readable description */
  description?: string;

  /** Parent mode to inherit from */
  extends?: string;

  /** Tool patterns to include (glob syntax) */
  includes: string[];

  /** Tool patterns to exclude (always win over includes) */
  excludes?: string[];
}
```

### ResolvedMode

Internal representation with inheritance flattened.

```typescript
interface ResolvedMode {
  /** Mode name */
  name: string;

  /** Description (may be inherited) */
  description?: string;

  /** Flattened includes from self + all ancestors */
  includes: string[];

  /** Flattened excludes from self + all ancestors */
  excludes: string[];

  /** Inheritance chain for debugging: [self, parent, grandparent, ...] */
  inheritanceChain: string[];
}
```

### ModeConfig

Full configuration for the mode system.

```typescript
interface ModeConfig {
  /** Mode definitions keyed by name */
  modes: Record<string, ModeDefinition>;

  /** Default mode on startup (defaults to 'coding') */
  defaultMode?: string;
}
```

## Zod Schemas

### ModeDefinitionSchema

```typescript
const ModeDefinitionSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  extends: z.string().optional(),
  includes: z.array(z.string()).min(1),
  excludes: z.array(z.string()).optional().default([]),
});
```

### ModeConfigSchema

```typescript
const ModeConfigSchema = z.object({
  modes: z.record(ModeDefinitionSchema),
  defaultMode: z.string().optional().default('coding'),
});
```

## Type Relationships

```
ModeConfig (config file)
    │
    ├── modes: Record<string, ModeDefinition>
    │       │
    │       └── ModeDefinition
    │               ├── name: string
    │               ├── description?: string
    │               ├── extends?: string → references another ModeDefinition
    │               ├── includes: string[]
    │               └── excludes?: string[]
    │
    └── defaultMode: string → references a mode name

        ↓ resolveInheritance()

ResolvedMode (runtime)
    ├── name: string
    ├── description?: string
    ├── includes: string[] (flattened)
    ├── excludes: string[] (flattened)
    └── inheritanceChain: string[]

        ↓ matchesTool()

boolean (tool active or not)
```

## Validation Rules

### ModeDefinition Validation

1. `name` must be non-empty string
2. `includes` must have at least one pattern
3. `extends` (if present) must reference an existing mode
4. No circular inheritance chains
5. Pattern syntax must be valid minimatch patterns

### ModeConfig Validation

1. `modes` must contain at least one mode
2. `defaultMode` must reference an existing mode
3. All inheritance chains must be resolvable

## Example Data

### Config File (modes.yaml)

```yaml
defaultMode: coding

modes:
  research:
    description: "Information gathering and exploration"
    includes:
      - "humancy.*"
      - "source_control.status"
      - "source_control.log"

  coding:
    description: "Active development"
    extends: research
    includes:
      - "source_control.*"
      - "build.*"
      - "test.*"
    excludes:
      - "test.integration_*"

  review:
    description: "Code review and feedback"
    extends: research
    includes:
      - "source_control.diff"
      - "source_control.blame"

  debug:
    description: "Debugging and troubleshooting"
    extends: coding
    includes:
      - "run.*"
```

### Resolved Modes (Runtime)

```typescript
const resolvedModes: ResolvedMode[] = [
  {
    name: 'research',
    description: 'Information gathering and exploration',
    includes: ['humancy.*', 'source_control.status', 'source_control.log'],
    excludes: [],
    inheritanceChain: ['research'],
  },
  {
    name: 'coding',
    description: 'Active development',
    includes: [
      'humancy.*',
      'source_control.status',
      'source_control.log',
      'source_control.*',
      'build.*',
      'test.*',
    ],
    excludes: ['test.integration_*'],
    inheritanceChain: ['coding', 'research'],
  },
  {
    name: 'review',
    description: 'Code review and feedback',
    includes: [
      'humancy.*',
      'source_control.status',
      'source_control.log',
      'source_control.diff',
      'source_control.blame',
    ],
    excludes: [],
    inheritanceChain: ['review', 'research'],
  },
  {
    name: 'debug',
    description: 'Debugging and troubleshooting',
    includes: [
      'humancy.*',
      'source_control.status',
      'source_control.log',
      'source_control.*',
      'build.*',
      'test.*',
      'run.*',
    ],
    excludes: ['test.integration_*'],
    inheritanceChain: ['debug', 'coding', 'research'],
  },
];
```

## Error Types

```typescript
// Circular inheritance detected
{
  code: 'MODE_CIRCULAR_INHERITANCE',
  message: 'Circular inheritance detected: debug -> coding -> research -> debug',
  context: {
    cycle: ['debug', 'coding', 'research', 'debug'],
  },
}

// Invalid mode configuration
{
  code: 'MODE_CONFIG_INVALID',
  message: 'Mode configuration validation failed',
  context: {
    errors: [
      { path: 'modes.coding.extends', message: 'Referenced mode "base" not found' },
    ],
  },
}

// Mode not found (existing)
{
  code: 'MODE_NOT_FOUND',
  message: 'Mode not found: production',
  context: {
    mode: 'production',
    availableModes: ['research', 'coding', 'review', 'debug'],
  },
}
```
