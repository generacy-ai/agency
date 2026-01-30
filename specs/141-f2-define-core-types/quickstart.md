# Quickstart: F2 Core Types

**Feature**: Define core types for spec-kit
**Package**: `@generacy-ai/agency-plugin-spec-kit`

## Installation

The types are part of the `@generacy-ai/agency-plugin-spec-kit` package:

```bash
# From the agency monorepo
pnpm install

# Build the package
pnpm --filter @generacy-ai/agency-plugin-spec-kit build
```

## Usage

### Importing Types

```typescript
import type {
  // Feature types
  Feature,
  FeaturePaths,
  BranchInfo,
  PrerequisiteResult,

  // Ticket types
  TicketRef,
  TicketParams,
  TicketUpdates,

  // Task types
  Task,
  TaskGroup,
  TaskGroupEntry,
  SubTask,
  GroupingStrategy,
  TaskIdConfig,

  // Clarification types
  ClarificationQuestion,
  ClarificationOption,
  ClarificationBatch,

  // Issue types
  IssuePlan,
  CreatedIssue,

  // Error types
  ErrorCode,
  McpError,
} from '@generacy-ai/agency-plugin-spec-kit';
```

### Importing Utilities

```typescript
import {
  // Task ID utilities
  buildTaskId,
  buildTaskGroupId,
  buildTaskIdPattern,
  buildTaskIdSearchPattern,

  // Constants
  FEATURE_NAME_PATTERN,
  MAX_BRANCH_LENGTH,
  TASK_ID_PATTERN,
  KNOWN_PROVIDERS,

  // Error factory
  createError,

  // Config schema
  SpecKitConfigSchema,
} from '@generacy-ai/agency-plugin-spec-kit';
```

## Examples

### Creating a Feature

```typescript
import type { Feature } from '@generacy-ai/agency-plugin-spec-kit';
import { FEATURE_NAME_PATTERN } from '@generacy-ai/agency-plugin-spec-kit';

const feature: Feature = {
  name: '042-user-auth',
  number: '042',
  shortName: 'user-auth',
  directory: '/workspaces/project/specs/042-user-auth',
  hasGit: true,
};

// Validate feature name
if (!FEATURE_NAME_PATTERN.test(feature.name)) {
  throw new Error('Invalid feature name');
}
```

### Working with Ticket References

```typescript
import type { TicketRef } from '@generacy-ai/agency-plugin-spec-kit';
import { KNOWN_PROVIDERS, isKnownProvider } from '@generacy-ai/agency-plugin-spec-kit';

// GitHub issue
const githubRef: TicketRef = {
  provider: KNOWN_PROVIDERS.GITHUB,
  id: '123',
  url: 'https://github.com/org/repo/issues/123',
  raw: '#123',
};

// Custom provider (extensible)
const customRef: TicketRef = {
  provider: 'custom-tracker',  // Any string allowed
  id: 'PROJ-456',
  raw: 'PROJ-456',
};

// Type guard for known providers
if (isKnownProvider(customRef.provider)) {
  console.log('Using known provider');
} else {
  console.log('Using custom provider:', customRef.provider);
}
```

### Building Task IDs

```typescript
import {
  buildTaskId,
  buildTaskGroupId,
  buildTaskIdPattern,
  DEFAULT_TASK_ID_CONFIG,
} from '@generacy-ai/agency-plugin-spec-kit';
import type { TaskIdConfig } from '@generacy-ai/agency-plugin-spec-kit';

// Default format: T001, T002, etc.
const taskId = buildTaskId(1);  // "T001"
const groupId = buildTaskGroupId(1);  // "TG-001"

// Custom format
const customConfig: TaskIdConfig = {
  idPrefix: 'TASK',
  idPadding: 4,
  idSeparator: '-',
  groupPrefix: 'GROUP',
  groupSeparator: '_',
  groupPadding: 2,
};

const customTaskId = buildTaskId(42, customConfig);  // "TASK-0042"
const customGroupId = buildTaskGroupId(5, customConfig);  // "GROUP_05"

// Build regex pattern for validation
const pattern = buildTaskIdPattern(customConfig);
console.log(pattern.test('TASK-0042'));  // true
```

### Parsing Configuration with Zod

```typescript
import { SpecKitConfigSchema } from '@generacy-ai/agency-plugin-spec-kit';

// Parse with defaults
const config = SpecKitConfigSchema.parse({});
console.log(config.specDirectory);  // "specs"
console.log(config.fileNames.spec);  // "spec.md"

// Parse with custom values
const customConfig = SpecKitConfigSchema.parse({
  specDirectory: 'features',
  fileNames: {
    spec: 'specification.md',
    plan: 'implementation-plan.md',
  },
  taskIdConfig: {
    idPrefix: 'TASK',
    idPadding: 4,
  },
  extensions: {
    'my-plugin': {
      customOption: 'value',
    },
  },
});
```

### Creating Structured Errors

```typescript
import { createError } from '@generacy-ai/agency-plugin-spec-kit';
import type { McpError } from '@generacy-ai/agency-plugin-spec-kit';

const error: McpError = createError(
  'SPEC_NOT_FOUND',
  'Specification file not found',
  { path: '/workspaces/project/specs/042-user-auth/spec.md' }
);

console.log(error);
// {
//   code: 'SPEC_NOT_FOUND',
//   message: 'Specification file not found',
//   context: { path: '/workspaces/project/specs/042-user-auth/spec.md' }
// }
```

## Type Reference

### Feature Types

| Type | Description |
|------|-------------|
| `Feature` | Development unit with spec artifacts |
| `FeaturePaths` | All file paths for a feature |
| `BranchInfo` | Git branch metadata |
| `PrerequisiteResult` | Command prerequisite check result |

### Ticket Types

| Type | Description |
|------|-------------|
| `TicketRef` | Provider-agnostic ticket reference |
| `TicketParams` | Ticket operation parameters |
| `TicketUpdates` | Changes to apply to a ticket |

### Task Types

| Type | Description |
|------|-------------|
| `Task` | Single task from tasks.md |
| `TaskGroup` | Group of tasks for issue creation |
| `TaskGroupEntry` | TG-XXX format task group |
| `SubTask` | Checkbox item within a group |
| `GroupingStrategy` | `'per-task' \| 'per-story' \| 'per-phase'` |
| `TaskIdConfig` | Task ID format configuration |

### Clarification Types

| Type | Description |
|------|-------------|
| `ClarificationQuestion` | Question with answer status |
| `ClarificationOption` | A/B/C option for questions |
| `ClarificationBatch` | Group of questions |

### Issue Types

| Type | Description |
|------|-------------|
| `IssuePlan` | Planned issue for preview |
| `CreatedIssue` | Created GitHub issue info |

### Error Types

| Type | Description |
|------|-------------|
| `ErrorCode` | String literal union of error codes |
| `McpError` | Structured error with code, message, context |

## Troubleshooting

### Import Errors

If you see `Cannot find module '@generacy-ai/agency-plugin-spec-kit'`:

1. Ensure the package is built: `pnpm --filter @generacy-ai/agency-plugin-spec-kit build`
2. Check your `tsconfig.json` includes proper path mappings
3. Verify the package is listed in your `package.json` dependencies

### Type Inference Issues

If TypeScript doesn't infer types correctly from Zod schemas:

```typescript
// Explicitly import the inferred type
import { SpecKitConfigSchema, type SpecKitConfig } from '@generacy-ai/agency-plugin-spec-kit';

// Or use z.infer
import { z } from 'zod';
type Config = z.infer<typeof SpecKitConfigSchema>;
```
