# Implementation Plan: D5 Implement tasks_to_issues Tool

**Feature**: Implement MCP tool to convert tasks.md into GitHub issues
**Branch**: `164-d5-implement-tasks-issues`
**Status**: Complete

## Summary

Implement the `spec_kit.tasks_to_issues` MCP tool that parses tasks.md files and converts them into GitHub issues. The tool supports:
- Two task formats: individual tasks (T###) and task groups (TG-XXX)
- Three grouping strategies: per-task, per-story, per-phase
- Dependency validation with circular dependency detection
- Dry-run mode for previewing issue creation
- Duplicate detection via GitHub search
- Automatic update of tasks.md with created issue links

Based on clarifications:
- Use direct GitHub integration via gh CLI (not BacklogProvider abstraction)
- Embed task parsing logic directly (self-contained, refactorable later)
- Support both T### and TG-XXX formats for full feature parity

## Technical Context

### Language & Framework
- **Language**: TypeScript (ES2022 target)
- **Runtime**: Node.js 20+
- **Package Manager**: pnpm
- **Build**: tsup (ESM output)
- **Testing**: Vitest

### Dependencies
- `@generacy-ai/agency` - Core agency types (AgencyTool, ToolResult)
- `node:child_process` - Execute gh CLI commands
- `node:fs/promises` - File system operations
- `node:path` - Path manipulation

### Existing Patterns
Following patterns from `packages/agency-plugin-spec-kit/src/tools/`:
- Tool factory pattern: `createXxxTool(config, ...deps): AgencyTool`
- Return structure: `{ content: [{ type: 'text', text: JSON.stringify(result) }] }`
- Error handling: Use `isError: true` for error responses
- Types: Leverage existing types from `types/` directory

## Project Structure

```
packages/agency-plugin-spec-kit/
├── src/
│   ├── tools/
│   │   ├── tasks-to-issues.ts     # NEW: Main tool implementation
│   │   └── index.ts               # MODIFY: Export new tool
│   ├── utils/
│   │   ├── task-parser.ts         # NEW: Task parsing utilities
│   │   ├── grouping.ts            # NEW: Task grouping strategies
│   │   ├── dependency.ts          # NEW: Dependency validation
│   │   └── github-cli.ts          # NEW: GitHub CLI wrapper
│   └── types/
│       └── issue.ts               # EXISTING: Contains issue types
├── tests/
│   └── tools/
│       └── tasks-to-issues.test.ts # NEW: Tool tests
```

## Key Components

### 1. Task Parser (`utils/task-parser.ts`)
Parses tasks.md content into structured task data:
- `parseTasksContent(content: string)`: Parse individual tasks (T###)
- `parseTaskGroups(content: string)`: Parse task groups (TG-XXX)
- `detectTaskFormat(content: string)`: Auto-detect format
- `filterEligibleTasks(tasks)`: Filter incomplete tasks without existing issues
- `updateTasksWithIssueLinks(content, map)`: Update tasks.md with issue links

### 2. Grouping Logic (`utils/grouping.ts`)
Groups tasks for issue creation:
- `groupTasks(tasks, strategy, featureName)`: Main grouping function
- `groupByTask()`: One issue per task
- `groupByStory()`: Group by user story (US#)
- `groupByPhase()`: Group by phase header
- `topologicalSort(groups)`: Sort by dependencies (Kahn's algorithm)
- `buildIssueBody(group, epicNum, featureName)`: Generate issue markdown

### 3. Dependency Validation (`utils/dependency.ts`)
Validates task dependencies:
- `validateDependencies(tasks)`: Main validation
- `detectCircularDependencies(tasks)`: Detect cycles
- `isValidDAG(tasks)`: Check if dependencies form valid DAG

### 4. GitHub CLI Wrapper (`utils/github-cli.ts`)
Wraps gh CLI commands with retry support:
- `checkGhCli(cwd)`: Verify gh is installed and authenticated
- `createIssue(title, body, labels, cwd)`: Create GitHub issue
- `searchIssues(query, maxResults, cwd)`: Search for duplicates
- `getIssueLabels(issueNumber, cwd)`: Get labels for grouping detection

### 5. Main Tool (`tools/tasks-to-issues.ts`)
The MCP tool implementation:
- Parameters: `grouping`, `dry_run`, `epic_number`, `feature_dir`, `cwd`
- Workflow: Parse → Validate → Group → Sort → Create/Preview
- Returns: `TasksToIssuesResult` with created/planned issues

## Data Flow

```
Input: tasks.md file
    ↓
[1] Detect format (T### or TG-XXX)
    ↓
[2] Parse tasks/groups
    ↓
[3] Filter eligible (incomplete, no existing issue)
    ↓
[4] Validate dependencies (fail on circular)
    ↓
[5] Detect grouping strategy (from labels or parameter)
    ↓
[6] Group tasks → TaskGroup[]
    ↓
[7] Topological sort (respect dependencies)
    ↓
[8] Check for duplicates (GitHub search)
    ↓
[9a] dry_run=true → Return IssuePlan[]
[9b] dry_run=false → Create issues via gh CLI
    ↓
[10] Update tasks.md with issue links
    ↓
Output: TasksToIssuesResult
```

## Implementation Notes

### Error Handling
- Return structured errors with `isError: true`
- Include error codes for programmatic handling
- Provide helpful messages for common issues (gh not installed, not authenticated, circular deps)

### Review Gate Integration
- Check for `type:epic` label → require tasks-review approval
- Check for `needs:tasks-review` / `completed:tasks-review` labels
- Block execution if review gate is active without approval

### Retry Logic
- Implement exponential backoff for transient GitHub errors
- Retry on: rate limits, network errors, 5xx status codes
- Max 3 retries with configurable options

## Files to Create

| File | Purpose |
|------|---------|
| `src/tools/tasks-to-issues.ts` | Main tool implementation |
| `src/utils/task-parser.ts` | Task/group parsing utilities |
| `src/utils/grouping.ts` | Grouping and sorting logic |
| `src/utils/dependency.ts` | Dependency validation |
| `src/utils/github-cli.ts` | GitHub CLI wrapper |
| `tests/tools/tasks-to-issues.test.ts` | Comprehensive tests |

## Files to Modify

| File | Changes |
|------|---------|
| `src/tools/index.ts` | Export and register new tool |

## Testing Strategy

1. **Unit Tests**
   - Task parser: various task formats, edge cases
   - Grouping: all three strategies
   - Dependencies: circular detection, validation
   - Issue body generation

2. **Integration Tests**
   - Mock gh CLI responses
   - Full workflow dry-run
   - Error scenarios

3. **Manual Validation**
   - Test with real tasks.md files
   - Verify issue creation
   - Verify tasks.md updates

## Constitution Check

Verified against `.specify/memory/constitution.md`:
- ✓ Using existing agency types and patterns
- ✓ Following tool factory pattern
- ✓ Maintaining ESM module format
- ✓ Using pnpm for dependencies
- ✓ TypeScript strict mode compatible

---

*Generated by speckit*
