# Implementation Plan: B5: Port task-parser utility

**Feature**: Port task-parser utility for parsing tasks.md files
**Branch**: `154-b5-port-task-parser`
**Status**: Complete

## Summary

Port the task-parser utility from the speckit reference implementation to parse tasks.md files. The implementation will leverage existing utilities in `packages/agency/src/utils/` (grouping.ts, dependency.ts) and add parsing functionality for individual tasks (T### format) and task groups (TG-XXX format).

## Technical Context

- **Language**: TypeScript
- **Framework**: Node.js (pure utility module, no framework)
- **Build Tool**: tsup (existing in package.json)
- **Testing**: Vitest (existing in package.json)
- **Dependencies**: None (self-contained parsing logic)

## Existing Infrastructure

The agency package already has related utilities:
- `src/utils/grouping.ts` - `Task` interface and grouping strategies (per-task, per-story, per-phase)
- `src/utils/dependency.ts` - `validateDependencies()`, `getTopologicalOrder()`, circular dependency detection

## Project Structure

```
packages/agency/src/
├── utils/
│   ├── index.ts              # (MODIFY) Add task-parser export
│   ├── grouping.ts           # Existing: Task interface, grouping utilities
│   ├── dependency.ts         # Existing: Dependency validation
│   └── task-parser.ts        # (CREATE) New parsing utility
│
└── utils/__tests__/          # (CREATE) Test directory
    └── task-parser.test.ts   # (CREATE) Unit tests
```

## Key Design Decisions

### 1. Reuse Existing Types
The `Task` interface in `grouping.ts` is compatible with parsing needs. No need for separate types file.

### 2. Integrate with Existing Dependency Logic
The `dependency.ts` module already implements:
- `validateDependencies()` - validation with error/warning separation
- `getTopologicalOrder()` - topological sorting with Kahn's algorithm
- `detectCircularDependencies()` - cycle detection

The task-parser will use these directly rather than re-implementing.

### 3. Parsing Functions
New functions to add:
- `parseTasksContent(content: string)` - Main entry point
- `parseTaskLine(line, lineNumber, phase?)` - Individual task parsing
- `detectTaskFormat(content)` - Format detection
- `parseTaskGroups(content)` - Task group parsing
- `updateTasksWithIssueLinks()` - Issue link injection

### 4. Pattern Compatibility
Support both formats:
- Individual: `- [ ] T001: Description (deps: T002, T003)`
- Task Groups: `### TG-001 [US1] Title` with subtasks

## Dependencies

| Dependency | Source | Status |
|------------|--------|--------|
| Task interface | `grouping.ts` | ✅ Available |
| Dependency validation | `dependency.ts` | ✅ Available |
| fs utilities | Node.js fs/promises | ✅ Available |

## Constitution Check

No constitution.md found - proceeding with standard patterns.

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `src/utils/task-parser.ts` | CREATE | Main parser implementation |
| `src/utils/task-parser.test.ts` | CREATE | Unit tests |
| `src/utils/index.ts` | MODIFY | Add task-parser export |

## Implementation Approach

### Phase 1: Core Parsing
1. Create `task-parser.ts` with regex patterns
2. Implement `parseTaskLine()` for individual tasks
3. Implement `parseTasksContent()` as main entry
4. Add format detection with `detectTaskFormat()`

### Phase 2: Task Groups
1. Add `parseTaskGroups()` for TG-XXX format
2. Parse metadata (scope, files, tests)
3. Parse subtasks within groups

### Phase 3: Issue Link Management
1. Add `updateTasksWithIssueLinks()` for post-issue creation
2. Maintain line number tracking for accurate updates

### Phase 4: Testing
1. Create comprehensive unit tests
2. Test both formats with edge cases
3. Test malformed input handling

## Regex Patterns

```typescript
// Individual task: - [ ] T001 [#123]? [P]? [US1]? Description (deps: T002)?
const TASK_LINE_PATTERN = /^-\s*\[([ xX])\]\s*(T\d{3})(?:\s*\[#(\d+)\])?(?:\s*\[P\])?(?:\s*\[US(\d+)\])?\s+(.+?)(?:\s*\(deps?:\s*([^)]+)\))?$/;

// Task group header: ### TG-001 [US1]? Title
const TASK_GROUP_HEADER = /^###\s+(TG-\d{3})(?:\s*\[US(\d+)\])?\s+(.+)$/;

// Phase header: ## Phase N: Name
const PHASE_HEADER = /^#{2,3}\s*(?:Phase\s*)?(\d+)?[:\s]*(.+)$/i;
```

## Success Criteria

1. ✅ Parse individual task format (T###) with all metadata
2. ✅ Parse task group format (TG-XXX) with subtasks
3. ✅ Auto-detect format from content
4. ✅ Extract dependencies, phases, user stories
5. ✅ Handle malformed input gracefully (partial parse)
6. ✅ Integrate with existing dependency validation
