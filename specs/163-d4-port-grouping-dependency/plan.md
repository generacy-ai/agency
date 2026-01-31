# Implementation Plan: D4: Port grouping/dependency logic from speckit

**Feature**: Port the task grouping and dependency resolution logic from speckit for use in tasks-to-issues.
**Branch**: `163-d4-port-grouping-dependency`
**Status**: Complete

## Summary

This implementation ports the task grouping and dependency resolution utilities from the speckit plugin into the agency package. These utilities enable the `tasks-to-issues` tool to:
1. Group tasks using different strategies (per-task, per-story, per-phase)
2. Validate task dependencies (circular, self-reference, missing)
3. Perform topological sorting for correct issue creation order
4. Generate auto-dependencies between phases

## Technical Context

| Aspect | Details |
|--------|---------|
| Language | TypeScript 5.x |
| Runtime | Node.js 20+ |
| Package Manager | pnpm |
| Test Framework | Vitest |
| Build Tool | tsup |

## Project Structure

```
packages/agency/src/
├── utils/
│   ├── index.ts           # Re-exports (add grouping, dependency)
│   ├── git.ts             # Existing git utilities
│   ├── grouping.ts        # NEW: Task grouping strategies
│   └── dependency.ts      # NEW: Dependency validation & sorting
├── types/                 # Types (may need additions)
└── ...
```

## Key Technical Decisions

### Decision 1: Logger Utility

**Choice**: Omit debug logging (Option C from clarifications)

**Rationale**:
- The agency package does not have a logger utility
- Adding one would create additional complexity
- Debug logging is not critical for utility functions
- Code is cleaner without debug output dependencies

### Decision 2: DependencyGenerationOptions

**Choice**: Add DependencyGenerationOptions type and make auto-deps configurable (Option A)

**Rationale**:
- Provides flexibility for different use cases
- Maintains compatibility with speckit patterns
- Users can disable auto-deps if needed
- Default behavior matches speckit defaults

### Decision 3: Test Coverage

**Choice**: Comprehensive tests with edge cases (Option A)

**Rationale**:
- Dependency validation is critical for correctness
- Edge cases (circular deps, empty inputs) need coverage
- Unit tests enable confident refactoring
- Matches the testing patterns in the existing codebase

## Dependencies

### Internal Dependencies
- `src/utils/git.ts` - No direct dependency, but follows same utility patterns

### External Dependencies
- None required - pure TypeScript utilities

### Design Dependencies (from epic)
- F2 (Task types) - Need Task interface definition
- B5 (task-parser) - Tasks will be parsed before grouping

## Type Requirements

The implementation requires these types from speckit that need to be ported or adapted:

### From types/tasks.ts
- `Task` interface - core task structure
- `TaskGroup` interface - grouped tasks for issue creation
- `GroupingStrategy` type - 'per-task' | 'per-story' | 'per-phase'

### From types/dependency.ts
- `DependencyValidationResult` - validation results
- `DependencyValidationError` - error structure
- `DependencyGenerationOptions` - auto-dep config
- `DEFAULT_DEPENDENCY_OPTIONS` - sensible defaults

### From types/issues.ts
- `IssuePlan` - preview/dry-run issue structure

## API Design

### grouping.ts Exports

```typescript
// Types
export type GroupingStrategy = 'per-task' | 'per-story' | 'per-phase';
export interface TaskGroup { ... }
export interface IssuePlan { ... }

// Functions
export function groupTasks(tasks: Task[], strategy: GroupingStrategy, featureName: string): TaskGroup[];
export function groupByTask(tasks: Task[], featureName: string): TaskGroup[];
export function groupByStory(tasks: Task[], featureName: string): TaskGroup[];
export function groupByPhase(tasks: Task[], featureName: string): TaskGroup[];
export function buildIssueBody(group: TaskGroup, epicNumber?: number, featureName?: string, resolvedDeps?: Map<string, number>): string;
export function groupToIssuePlan(group: TaskGroup, epicNumber?: number, featureName?: string): IssuePlan;
export function topologicalSort(groups: TaskGroup[]): { sorted: TaskGroup[]; hasCycle: boolean; cycleInfo?: string };
export function applyAutoDependencies(groups: TaskGroup[], options?: DependencyGenerationOptions): TaskGroup[];
export function resolveDependenciesToIssues(dependencies: string[], groupToIssue: Map<string, number>, taskToGroup: Map<string, string>): number[];
```

### dependency.ts Exports

```typescript
// Types
export interface DependencyValidationResult { ... }
export interface DependencyValidationError { ... }
export interface DependencyGenerationOptions { ... }
export const DEFAULT_DEPENDENCY_OPTIONS: DependencyGenerationOptions;

// Functions
export function validateDependencies(tasks: Task[]): DependencyValidationResult;
export function detectCircularDependencies(tasks: Task[]): DependencyValidationError[];
export function isValidDAG(tasks: Task[]): boolean;
export function getTopologicalOrder(tasks: Task[]): Task[] | null;
export function buildDependencyGraphString(tasks: Task[]): string;
```

## Constitution Check

No constitution.md found at `.specify/memory/constitution.md`. Standard implementation patterns apply.

## Notes

- Remove all `logDebug` calls from ported code
- Maintain function signatures for compatibility
- Add JSDoc comments matching speckit style
- Use `.js` extensions in imports for ESM compatibility
