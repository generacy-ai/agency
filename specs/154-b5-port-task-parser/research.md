# Research: Task Parser Implementation

## Reference Implementation Analysis

The speckit reference at `/workspaces/claude-plugins/plugins/speckit/mcp-server/src/utils/task-parser.ts` provides a mature implementation with:

1. **Configurable Task ID Patterns** - Supports custom prefixes and separators
2. **Two Format Types** - Individual (T###) and Task Group (TG-XXX)
3. **Rich Metadata Parsing** - User stories, dependencies, phases, parallel markers
4. **Issue Link Management** - Bi-directional linking between tasks.md and GitHub issues

## Key Patterns from Reference

### Task Line Pattern
```typescript
// Format: - [ ] T### [#N]? [P]? [US#]? Description (deps: T###)?
const TASK_LINE_PATTERN = /^-\s*\[([ xX])\]\s*(T\d{3})(?:\s*\[#(\d+)\])?(?:\s*\[P\])?(?:\s*\[US(\d+)\])?\s+(.+?)(?:\s*\(deps?:\s*([^)]+)\))?$/;
```

Groups captured:
1. Checkbox state (`' '` or `x`)
2. Task ID (`T001`)
3. Existing issue number (optional)
4. User story number (optional)
5. Description
6. Dependencies (optional)

### Task Group Pattern
```typescript
// Format: ### TG-001 [US#]? Title
const TASK_GROUP_HEADER_PATTERN = /^###\s+(TG-\d{3})(?:\s*\[US(\d+)\])?\s+(.+)$/;
```

## Alternatives Considered

### 1. Parser Library (e.g., Chevrotain, PEG.js)
**Decision**: Not adopted
- Overkill for markdown task parsing
- Adds dependency weight
- Reference uses regex effectively

### 2. Markdown AST Parser (unified/remark)
**Decision**: Not adopted
- Too generic for task-specific needs
- Reference shows direct regex works well
- Better control over error messages

### 3. Direct Port vs. Adaptation
**Decision**: Adaptation
- Reuse existing `Task` interface from grouping.ts
- Leverage existing dependency validation from dependency.ts
- Avoid type duplication

## Integration Strategy

### Type Compatibility
The existing `Task` interface in `grouping.ts`:
```typescript
interface Task {
  id: string;
  lineNumber: number;
  completed: boolean;
  isParallel: boolean;
  userStory?: string;
  description: string;
  dependencies: string[];
  phase?: string;
  existingIssue?: number;
}
```

This matches the reference implementation's needs perfectly.

### Dependency Validation
The existing `dependency.ts` provides:
- `validateDependencies(tasks)` - Returns errors/warnings
- `getTopologicalOrder(tasks)` - Topological sort
- `detectCircularDependencies(tasks)` - Cycle detection

No need to re-implement these in task-parser.

## Error Handling Approach

### Graceful Degradation
From reference: When a line looks like a task but doesn't parse:
```typescript
if (line.includes("T") && /T\d{3}/.test(line)) {
  warnings.push(`Line ${lineNumber}: Task-like line could not be parsed`);
}
```

This produces warnings rather than errors, allowing partial parsing.

### Validation Separation
- **Parse Errors**: Malformed syntax (immediate feedback)
- **Validation Errors**: Circular deps, missing refs (post-parse)
- **Warnings**: Non-critical issues (informational)

## Sources

1. Speckit reference implementation: `/workspaces/claude-plugins/plugins/speckit/mcp-server/src/utils/task-parser.ts`
2. Existing agency utilities: `packages/agency/src/utils/`
3. Markdown checkbox spec: GitHub Flavored Markdown
