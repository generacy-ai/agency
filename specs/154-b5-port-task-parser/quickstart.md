# Quickstart: Task Parser Utility

## Installation

The task-parser is part of the `@triad/agency` package. No separate installation needed.

## Basic Usage

### Parsing Individual Tasks (T### format)

```typescript
import { parseTasksContent, validateDependencies } from '@triad/agency';

const content = `
## Phase 1: Setup

- [ ] T001 [US1] Initialize project structure
- [ ] T002 Configure TypeScript (deps: T001)
- [x] T003 Add linting (deps: T001)
`;

// Parse the content
const result = parseTasksContent(content);

console.log(result.tasks);
// [
//   { id: "T001", description: "Initialize project structure", ... },
//   { id: "T002", description: "Configure TypeScript", dependencies: ["T001"], ... },
//   { id: "T003", description: "Add linting", completed: true, ... }
// ]

console.log(result.phases);
// ["Phase 1: Setup"]

// Validate dependencies
const validation = validateDependencies(result.tasks);
if (!validation.valid) {
  console.error("Dependency errors:", validation.errors);
}
```

### Parsing Task Groups (TG-XXX format)

```typescript
import { detectTaskFormat, parseTaskGroups } from '@triad/agency';

const content = `
## Phase 1: Authentication

### TG-001 [US1] User Login
**Scope**: Frontend
**Files**: src/auth/login.ts

- [ ] Create login form
- [ ] Add validation
`;

// Check format first
const format = detectTaskFormat(content);
// "task-group"

// Parse task groups
const groups = parseTaskGroups(content);

console.log(groups.groups[0]);
// {
//   id: "TG-001",
//   title: "User Login",
//   userStory: "US1",
//   subtasks: [
//     { description: "Create login form", completed: false },
//     { description: "Add validation", completed: false }
//   ],
//   scope: "Frontend",
//   files: ["src/auth/login.ts"]
// }
```

### Auto-Detecting Format

```typescript
import { detectTaskFormat, parseTasksContent, parseTaskGroups } from '@triad/agency';

function parseAnyFormat(content: string) {
  const format = detectTaskFormat(content);

  if (format === 'task-group') {
    return parseTaskGroups(content);
  } else {
    return parseTasksContent(content);
  }
}
```

## Available Functions

| Function | Description |
|----------|-------------|
| `parseTasksContent(content)` | Parse individual task format (T###) |
| `parseTaskGroups(content)` | Parse task group format (TG-XXX) |
| `detectTaskFormat(content)` | Auto-detect format type |
| `validateDependencies(tasks)` | Validate dependency graph |
| `getTopologicalOrder(tasks)` | Get tasks in dependency order |
| `updateTasksWithIssueLinks(content, map)` | Add issue links to tasks |

## Task Format Reference

### Individual Tasks (T###)

```markdown
- [ ] T001 [#42] [P] [US1] Description (deps: T002, T003)
      │     │     │   │    │            │
      │     │     │   │    │            └── Dependencies (optional)
      │     │     │   │    └── Task description
      │     │     │   └── User story reference (optional)
      │     │     └── Parallel marker (optional)
      │     └── Existing issue number (optional)
      └── Checkbox [ ] or [x]
```

### Task Groups (TG-XXX)

```markdown
### TG-001 [US1] Title
**Scope**: Frontend/Backend/Full-stack
**Files**:
- src/file1.ts
- src/file2.ts
**Tests**: Unit tests required

- [ ] Subtask 1
- [x] Subtask 2 (completed)
```

## Error Handling

```typescript
const result = parseTasksContent(content);

// Check for parsing warnings
if (result.warnings.length > 0) {
  console.warn("Parse warnings:", result.warnings);
}

// Validate dependencies
const validation = validateDependencies(result.tasks);

// Handle errors
for (const error of validation.errors) {
  switch (error.type) {
    case 'circular':
      console.error(`Circular dependency: ${error.message}`);
      break;
    case 'self-reference':
      console.error(`Self-reference: ${error.message}`);
      break;
    case 'missing':
      console.error(`Missing dependency: ${error.message}`);
      break;
  }
}

// Handle warnings (non-fatal)
for (const warning of validation.warnings) {
  console.warn(warning);
}
```

## Troubleshooting

### Task Not Parsing

Ensure the format matches exactly:
- Checkbox must be `- [ ]` or `- [x]` (with space or x)
- Task ID must be `T` followed by exactly 3 digits
- Dependencies use `deps:` or `dep:` prefix

### Wrong Format Detected

Check for conflicting patterns:
- `T###` patterns → individual format
- `### TG-###` headers → task-group format

### Dependencies Not Found

Ensure referenced task IDs exist in the file and match exactly (case-sensitive).
