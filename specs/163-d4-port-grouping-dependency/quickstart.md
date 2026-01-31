# Quickstart: Task Grouping and Dependency Utilities

## Installation

These utilities are part of the `@generacy/agency` package:

```bash
pnpm add @generacy/agency
```

## Basic Usage

### Grouping Tasks

```typescript
import { groupTasks, type Task, type GroupingStrategy } from '@generacy/agency/utils';

// Sample tasks
const tasks: Task[] = [
  { id: 'T001', description: 'Setup project', dependencies: [], phase: 'Phase 1', ... },
  { id: 'T002', description: 'Add API', dependencies: ['T001'], phase: 'Phase 1', ... },
  { id: 'T003', description: 'Add tests', dependencies: ['T002'], phase: 'Phase 2', ... },
];

// Group by different strategies
const perTask = groupTasks(tasks, 'per-task', '163-feature-name');
const perPhase = groupTasks(tasks, 'per-phase', '163-feature-name');
const perStory = groupTasks(tasks, 'per-story', '163-feature-name');

console.log(perTask.length);   // 3 (one group per task)
console.log(perPhase.length);  // 2 (Phase 1 and Phase 2)
```

### Validating Dependencies

```typescript
import { validateDependencies, type Task } from '@generacy/agency/utils';

const tasks: Task[] = [
  { id: 'T001', dependencies: ['T002'], ... },
  { id: 'T002', dependencies: ['T001'], ... },  // Circular!
];

const result = validateDependencies(tasks);
// result.valid = false
// result.errors[0].type = 'circular'
// result.errors[0].message = 'Circular dependency detected: T001 → T002 → T001'
```

### Topological Sorting

```typescript
import { getTopologicalOrder, type Task } from '@generacy/agency/utils';

const tasks: Task[] = [
  { id: 'T003', dependencies: ['T002'], ... },
  { id: 'T001', dependencies: [], ... },
  { id: 'T002', dependencies: ['T001'], ... },
];

const sorted = getTopologicalOrder(tasks);
// sorted = [T001, T002, T003] - in dependency order
// Returns null if cycle exists
```

### Applying Auto-Dependencies

```typescript
import {
  groupTasks,
  applyAutoDependencies,
  DEFAULT_DEPENDENCY_OPTIONS
} from '@generacy/agency/utils';

const groups = groupTasks(tasks, 'per-task', 'feature-name');

// Apply cross-phase and sequential dependencies
const withAutoDeps = applyAutoDependencies(groups, DEFAULT_DEPENDENCY_OPTIONS);

// Or customize options
const customDeps = applyAutoDependencies(groups, {
  crossPhaseDependencies: true,
  intraPhaseSequential: false,  // Don't chain within phases
  includeExplicit: true,
});
```

### Building Issue Bodies

```typescript
import { buildIssueBody, type TaskGroup } from '@generacy/agency/utils';

const group: TaskGroup = {
  id: 'T001',
  groupType: 'task',
  tasks: [{ id: 'T001', description: 'Implement feature', ... }],
  title: '[T001] Implement feature (#163)',
  body: '',
  labels: ['epic-child'],
  dependencies: ['T000'],
};

const body = buildIssueBody(
  group,
  163,                    // Epic number
  '163-feature-name',     // Feature name
  new Map([['T000', 42]]) // Resolved deps: T000 → Issue #42
);

// Returns formatted markdown with:
// - ## Description
// - ## Tasks (checkboxes)
// - ## Source (epic-parent comment)
// - ## Dependencies (depends-on comment)
```

## API Reference

### Grouping Functions

| Function | Description |
|----------|-------------|
| `groupTasks(tasks, strategy, featureName)` | Group tasks using specified strategy |
| `groupByTask(tasks, featureName)` | One group per task |
| `groupByStory(tasks, featureName)` | Group by user story |
| `groupByPhase(tasks, featureName)` | Group by phase |
| `topologicalSort(groups)` | Sort groups by dependencies |
| `applyAutoDependencies(groups, options?)` | Add auto-generated dependencies |

### Dependency Functions

| Function | Description |
|----------|-------------|
| `validateDependencies(tasks)` | Check for circular deps, self-refs |
| `detectCircularDependencies(tasks)` | Find circular dependency errors |
| `isValidDAG(tasks)` | Quick check if deps form valid DAG |
| `getTopologicalOrder(tasks)` | Sort tasks by dependencies |
| `buildDependencyGraphString(tasks)` | Debug visualization string |

### Issue Functions

| Function | Description |
|----------|-------------|
| `buildIssueBody(group, epic?, feature?, deps?)` | Build markdown issue body |
| `groupToIssuePlan(group, epic?, feature?)` | Convert to preview format |
| `resolveDependenciesToIssues(deps, map, taskMap)` | Map task deps to issue numbers |

## Troubleshooting

### "Circular dependency detected"

Your tasks have a dependency cycle. Use `buildDependencyGraphString()` to visualize:

```typescript
import { buildDependencyGraphString } from '@generacy/agency/utils';
console.log(buildDependencyGraphString(tasks));
// T001 ← T002
// T002 ← T001  // Cycle visible here
```

### Tasks not sorted correctly

Ensure all dependencies are within the task set. External dependencies are warned but allowed:

```typescript
const result = validateDependencies(tasks);
if (result.warnings.length > 0) {
  console.log('Missing deps:', result.warnings);
}
```

### Groups missing dependencies

When grouping, only external dependencies are preserved. Internal task deps are absorbed into the group.
