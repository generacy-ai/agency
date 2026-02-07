# Quickstart: agency-spec-kit Plugin Commands

## Installation

The agency-spec-kit plugin is installed as part of the agency package:

```bash
cd /workspaces/agency
pnpm install
pnpm build
```

## Available Commands

### Core Workflow Commands

| Command | Purpose | Prerequisites |
|---------|---------|---------------|
| `/agency-spec-kit:specify` | Create feature spec | None |
| `/agency-spec-kit:clarify` | Resolve ambiguities | spec.md |
| `/agency-spec-kit:plan` | Generate implementation plan | spec.md, clarifications resolved |
| `/agency-spec-kit:tasks` | Generate task list | plan.md |
| `/agency-spec-kit:implement` | Execute tasks | tasks.md |

### Utility Commands

| Command | Purpose | Prerequisites |
|---------|---------|---------------|
| `/agency-spec-kit:analyze` | Cross-artifact analysis | spec.md |
| `/agency-spec-kit:checklist` | Generate quality checklist | spec.md or plan.md |
| `/agency-spec-kit:taskstoissues` | Convert tasks to GitHub issues | tasks.md |
| `/agency-spec-kit:constitution` | Manage project principles | None |

## Usage Examples

### Generate Implementation Plan

```
/agency-spec-kit:plan
```

This will:
1. Read spec.md from the current feature directory
2. Generate plan.md with technical context and structure
3. Create research.md with technology decisions
4. Create data-model.md with entity definitions
5. Create quickstart.md with usage guide
6. Update CLAUDE.md with new technology info

### Generate Task List

```
/agency-spec-kit:tasks
```

Options:
- `--epic` - Force epic-style coarse-grained tasks
- `--no-epic` - Force standard fine-grained tasks

### Run Consistency Analysis

```
/agency-spec-kit:analyze
```

This performs a read-only analysis checking:
- Cross-references between artifacts
- Quality of requirements
- Completeness of coverage

### Convert Tasks to Issues

```
/agency-spec-kit:taskstoissues
```

Grouping options (detected from labels or specified):
- `per-task` - One issue per task
- `per-story` - Group by user story (default)
- `per-phase` - Group by implementation phase

## Workflow Integration

These commands integrate with the autodev workflow:

```
/autodev:start <issue-url>
  → /agency-spec-kit:specify
  → /agency-spec-kit:clarify
  → /agency-spec-kit:plan
  → /agency-spec-kit:tasks
  → /agency-spec-kit:implement
```

Each command automatically continues to the next workflow step.

## Troubleshooting

### "spec.md not found"
Ensure you're on a feature branch with a spec directory:
```
specs/<number>-<feature-name>/spec.md
```

### "MCP tool not available"
Verify the MCP server is configured:
```json
// .claude/settings.json
{
  "mcp": {
    "servers": {
      "speckit": { ... }
    }
  }
}
```

### "Prerequisite check failed"
Run the prerequisite command first:
- For plan: run specify and clarify
- For tasks: run plan
- For implement: run tasks

## Related Documentation

- [MCP Server Tools](../../../plugins/speckit/mcp-server/README.md)
- [Plugin Configuration](../.claude-plugin/plugin.json)
- [Command File Reference](../commands/)
