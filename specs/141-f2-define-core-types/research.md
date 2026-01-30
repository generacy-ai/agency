# Research: F2 Core Types

**Feature**: Define core types for spec-kit
**Branch**: `141-f2-define-core-types`

## Technology Decisions

### 1. TicketRef Provider Type: String with Constants

**Decision**: Use `string` type for `TicketProvider` with exported constants for known providers.

**Rationale** (from clarification Q1):
- Agency plugins need to register custom ticket providers
- Strict union types would require code changes to add providers
- String type with constants provides:
  - Type safety for known providers via constants
  - Extensibility for custom providers
  - Runtime flexibility for plugin registration

**Implementation**:
```typescript
// Known providers as constants
export const KNOWN_PROVIDERS = {
  GITHUB: 'github',
  JIRA: 'jira',
  SHORTCUT: 'shortcut',
  LINEAR: 'linear',
  LOCAL: 'local',
} as const;

// Type allows any string, but constants provide autocomplete
export type TicketProvider = string;

// Type guard for known providers
export function isKnownProvider(provider: string): provider is typeof KNOWN_PROVIDERS[keyof typeof KNOWN_PROVIDERS] {
  return Object.values(KNOWN_PROVIDERS).includes(provider as any);
}
```

**Alternatives Considered**:
| Option | Pros | Cons |
|--------|------|------|
| Strict union type | Compile-time safety, autocomplete | Requires code change for new providers |
| String with discriminated union | Balances safety and flexibility | Complex, still requires updates |
| **String with constants** | Extensible, runtime flexibility | Less compile-time safety (mitigated by type guards) |

### 2. Config Schema: Core + Extensible with Zod

**Decision**: Use Zod for schema validation with core options and an `extensions` field for plugins.

**Rationale** (from clarification Q2):
- Core options cover common use cases
- `extensions` field allows plugins to add custom configuration
- Zod provides:
  - Runtime validation
  - TypeScript inference
  - Default values
  - Parsing/transformation

**Implementation**:
```typescript
const SpecKitConfigSchema = z.object({
  specDirectory: z.string().default('specs'),
  templateDirectory: z.string().default('.spec-templates'),
  fileNames: FileNamesSchema.default({}),
  taskIdConfig: TaskIdConfigSchema.default({}),
  extensions: z.record(z.unknown()).default({}),  // Plugin extension point
});
```

**Extension Pattern for Plugins**:
```typescript
// Plugin can define its own schema
const MyPluginConfigSchema = z.object({
  customOption: z.string(),
});

// Access via extensions
const myConfig = MyPluginConfigSchema.parse(config.extensions['my-plugin']);
```

### 3. Types + Utilities: Combined Module

**Decision**: Include utility functions alongside type definitions in the same package.

**Rationale** (from clarification Q3):
- Utilities are tightly coupled to types (e.g., `buildTaskId` uses `TaskIdConfig`)
- Single import for related functionality
- Reduces dependency management
- Follows existing speckit pattern

**Included Utilities**:
| Function | Purpose |
|----------|---------|
| `buildTaskId()` | Generate task ID from number |
| `buildTaskGroupId()` | Generate group ID from number |
| `buildTaskIdPattern()` | Build regex for task IDs |
| `buildTaskGroupIdPattern()` | Build regex for group IDs |
| `buildTaskIdSearchPattern()` | Build non-anchored search pattern |
| `escapeRegex()` | Escape special regex characters |
| `createError()` | Factory for MCP errors |

## Implementation Patterns

### Type Re-exports

Use barrel exports for clean API:

```typescript
// src/types/index.ts
export type { Feature, FeaturePaths, BranchInfo } from './feature.js';
export type { TicketRef, TicketParams, TicketUpdates } from './ticket.js';
export type { Task, TaskGroup, TaskIdConfig } from './task.js';
// ...

// src/index.ts (package entry)
export * from './types/index.js';
export { SpecKitConfigSchema, type SpecKitConfig } from './config.js';
```

### Constants Organization

Group related constants:

```typescript
// src/types/feature.ts
export const FEATURE_NAME_PATTERN = /^\d{3}-[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const MAX_BRANCH_LENGTH = 244;

// src/types/task.ts
export const TASK_ID_PATTERN = /^T\d{3}$/;
export const DEFAULT_TASK_ID_CONFIG: TaskIdConfig = { ... };
```

### JSDoc Documentation

All types should have comprehensive JSDoc:

```typescript
/**
 * A numbered development unit with associated specification artifacts
 *
 * @example
 * ```typescript
 * const feature: Feature = {
 *   name: '042-user-auth',
 *   number: '042',
 *   shortName: 'user-auth',
 *   directory: '/repo/specs/042-user-auth',
 *   hasGit: true,
 * };
 * ```
 */
export interface Feature {
  /** Branch/directory name following ###-short-name pattern */
  name: string;
  // ...
}
```

## Source References

### Existing speckit types
Location: `/workspaces/claude-plugins/plugins/speckit/mcp-server/src/types/`

Files to port:
- `feature.ts` - Feature, FeaturePaths, PrerequisiteResult
- `tasks.ts` - Task, TaskGroup, GroupingStrategy, TaskIdConfig, utilities
- `clarifications.ts` - ClarificationQuestion, ClarificationBatch
- `issues.ts` - IssuePlan, CreatedIssue, TasksToIssuesResult
- `dependency.ts` - TaskDependency, DependencyGraph
- `errors.ts` - ErrorCode, McpError

### Existing agency-plugin-spec-kit
Location: `/workspaces/agency/packages/agency-plugin-spec-kit/`

Existing structure to extend:
- `src/types/index.ts` - Currently minimal, will be expanded
- `src/config.ts` - Has basic config, will be enhanced with Zod

## Migration Notes

### Breaking Changes
None - this is new package functionality.

### Backwards Compatibility
The existing `SpecKitPluginConfig` interface will be replaced with Zod schema-derived type. The shape remains compatible:

```typescript
// Before (interface)
interface SpecKitPluginConfig {
  specDirectory: string;
  templateDirectory: string;
}

// After (Zod-derived with extensions)
const SpecKitConfigSchema = z.object({
  specDirectory: z.string().default('specs'),
  templateDirectory: z.string().default('.spec-templates'),
  fileNames: FileNamesSchema.default({}),
  taskIdConfig: TaskIdConfigSchema.default({}),
  extensions: z.record(z.unknown()).default({}),
});
```

Existing code using `specDirectory` and `templateDirectory` will continue to work.
