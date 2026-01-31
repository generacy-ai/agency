# Research: Task Grouping and Dependency Logic

## Technology Context

### Source Implementation
The speckit plugin (`/workspaces/claude-plugins/plugins/speckit/mcp-server/src/utils/`) provides production-tested implementations for:
- `grouping.ts` - Task grouping strategies and issue body building
- `dependency.ts` - Dependency validation using Kahn's algorithm

### Target Environment
- Package: `packages/agency` in the agency monorepo
- Existing utils: `src/utils/git.ts` (git operations)
- Build: tsup with ESM output
- Tests: Vitest

## Key Algorithms

### Kahn's Algorithm (Topological Sort)
Used for both dependency validation and group ordering:
1. Build in-degree map (count of incoming dependencies)
2. Queue all nodes with in-degree = 0
3. Process queue: add to sorted list, decrement dependents' in-degree
4. If sorted list length != total nodes, cycle exists

**Time Complexity**: O(V + E) where V = tasks, E = dependency edges

### Cycle Detection (DFS)
When cycle detected via Kahn's algorithm, DFS is used to find the specific cycle path for better error messages:
1. Start from any node with remaining in-degree > 0
2. Follow dependencies, tracking path
3. When node repeats in path, extract cycle portion

## Design Decisions

### No Logger Dependency
The speckit implementation uses `logDebug()` for debug output. The ported code will:
- Remove all `logDebug` calls
- Not add any logging infrastructure
- Keep the code pure and dependency-free

### Type Definitions Location
Options considered:
1. Define types inline in grouping.ts/dependency.ts - **Chosen**
2. Create separate types/ directory in utils
3. Add to existing package types

**Rationale**: Keep types close to their usage, minimize file count. Types can be extracted later if needed by other modules.

### Export Strategy
All public types and functions exported from:
- `src/utils/grouping.ts`
- `src/utils/dependency.ts`
- Re-exported via `src/utils/index.ts`

## Implementation Patterns

### Speckit Pattern: External Dependency Collection
When grouping by story/phase, tasks within a group may depend on tasks outside the group:
```typescript
const internalTaskIds = new Set(groupTasks.map(t => t.id));
const externalDeps = new Set<string>();

for (const task of groupTasks) {
  for (const dep of task.dependencies) {
    if (!internalTaskIds.has(dep)) {
      externalDeps.add(dep);
    }
  }
}
```

### Speckit Pattern: Auto-Dependency Generation
Two types of auto-generated dependencies:
1. **Cross-phase**: All tasks in Phase N depend on all tasks in Phase N-1
2. **Intra-phase sequential**: Within a phase, each task depends on the previous

These are controlled via `DependencyGenerationOptions`:
```typescript
interface DependencyGenerationOptions {
  intraPhaseSequential: boolean;
  crossPhaseDependencies: boolean;
  includeExplicit: boolean;
}
```

### Speckit Pattern: Issue Body Format
Standard issue body structure with HTML comments for machine parsing:
```markdown
## Description
[Task/Group description]

## Tasks
- [ ] T001: Task description
- [ ] T002: Another task

## Source
<!-- epic-parent: 123 -->
<!-- source-feature: feature-name -->

## Dependencies
<!-- depends-on: #42, #43 -->
Depends on: #42, #43
```

## Alternatives Considered

### Alternative 1: Use External Graph Library
Libraries like `graphlib` provide graph algorithms.

**Rejected because**:
- Simple use case doesn't justify dependency
- Kahn's algorithm is ~50 lines of code
- No need for advanced graph features

### Alternative 2: Lazy Dependency Resolution
Only resolve dependencies when creating issues.

**Rejected because**:
- Cycle detection should happen before any issue creation
- Topological sort needed for correct creation order
- Early validation provides better error messages

### Alternative 3: Per-File Type Definitions
Create `src/types/grouping.ts` and `src/types/dependency.ts`.

**Rejected because**:
- Types are tightly coupled to utility functions
- Increases cognitive overhead
- Can be refactored later if needed

## References

- Speckit grouping: `/workspaces/claude-plugins/plugins/speckit/mcp-server/src/utils/grouping.ts`
- Speckit dependency: `/workspaces/claude-plugins/plugins/speckit/mcp-server/src/utils/dependency.ts`
- Speckit types/tasks: `/workspaces/claude-plugins/plugins/speckit/mcp-server/src/types/tasks.ts`
- Speckit types/dependency: `/workspaces/claude-plugins/plugins/speckit/mcp-server/src/types/dependency.ts`
- Speckit types/issues: `/workspaces/claude-plugins/plugins/speckit/mcp-server/src/types/issues.ts`
- Kahn's Algorithm: https://en.wikipedia.org/wiki/Topological_sorting#Kahn's_algorithm
