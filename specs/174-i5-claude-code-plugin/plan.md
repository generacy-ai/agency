# Implementation Plan: I5: Claude Code plugin - remaining commands

**Feature**: Implement and verify remaining slash commands for the Claude Code plugin
**Branch**: `174-i5-claude-code-plugin`
**Status**: Complete

## Summary

This issue ensures that all 6 remaining slash commands for the Claude Code plugin properly orchestrate the MCP tools from the `@generacy-ai/agency-plugin-spec-kit` MCP server. The commands already exist as markdown instruction files; the work involves verifying completeness, ensuring proper MCP tool orchestration, and adding any missing functionality.

## Current State Analysis

### Commands Already Implemented

All 6 commands exist in `/workspaces/agency/packages/claude-plugin-agency-spec-kit/commands/`:

| Command | File | Status | MCP Tools Used |
|---------|------|--------|----------------|
| `/agency-spec-kit:plan` | plan.md | ✅ Exists | `get_paths`, `check_prereqs`, `update_agent` |
| `/agency-spec-kit:tasks` | tasks.md | ✅ Exists | `check_prereqs` |
| `/agency-spec-kit:taskstoissues` | taskstoissues.md | ✅ Exists | `check_prereqs`, `tasks_to_issues` |
| `/agency-spec-kit:implement` | implement.md | ✅ Exists | `check_prereqs`, `merge_from_base` |
| `/agency-spec-kit:checklist` | checklist.md | ✅ Exists | `get_paths`, `check_prereqs` |
| `/agency-spec-kit:analyze` | analyze.md | ✅ Exists | `check_prereqs` |

### Available MCP Tools

From `@generacy-ai/agency-plugin-spec-kit`:
- `git_ops` - Git operations (create_branch, checkout, fetch, status, current_branch)
- `create_feature` - Create feature branch and initialize spec directory
- `get_paths` - Get all feature paths for current branch
- `check_prereqs` - Validate required files and list available docs
- `copy_template` - Copy templates to feature directory
- `update_agent` - Update AI agent context files from plan.md
- `manage_clarifications` - Read/append/update clarifications.md
- `tasks_to_issues` - Convert tasks.md to GitHub issues

## Technical Context

- **Language**: Markdown (Claude Code plugin instruction format)
- **Framework**: Claude Code plugin system with YAML frontmatter
- **Dependencies**: MCP server `@generacy-ai/agency-plugin-spec-kit`
- **Pattern**: Each command file contains detailed step-by-step instructions for Claude to follow

## Project Structure

```
packages/claude-plugin-agency-spec-kit/
├── .claude-plugin/
│   └── plugin.json          # Plugin metadata (requires MCP server)
├── commands/
│   ├── analyze.md           # Consistency analysis command
│   ├── checklist.md         # Quality checklist generator
│   ├── clarify.md           # (Already implemented - E5)
│   ├── constitution.md      # Project governance
│   ├── implement.md         # Task execution command
│   ├── plan.md              # Implementation plan generator
│   ├── specify.md           # (Already implemented - E4)
│   ├── tasks.md             # Task list generator
│   └── taskstoissues.md     # Convert tasks to GitHub issues
└── README.md                # Plugin documentation
```

## Verification Checklist

Each command must be verified to:
1. ✅ Use proper YAML frontmatter with description
2. ✅ Reference correct MCP tools by name
3. ✅ Include clear step-by-step instructions
4. ✅ Handle prerequisites properly
5. ✅ Include post-command workflow continuation
6. ✅ Follow the established command file pattern

## Implementation Approach

Since all command files already exist and follow the established pattern, the implementation work involves:

1. **Audit existing commands** - Verify each command properly references MCP tools
2. **Update command instructions** - Ensure MCP tool names match the server's tool registry
3. **Add missing tool references** - Any commands that should use MCP tools but use manual processes
4. **Verify consistency** - Ensure all commands follow the same patterns

## Changes Required

### 1. taskstoissues.md Updates
- Currently references `gh` CLI directly
- Should use `tasks_to_issues` MCP tool for issue creation
- Add dry-run mode documentation

### 2. implement.md Updates
- Add reference to `merge_from_base` MCP tool for phase boundaries
- Verify parallel execution instructions are complete

### 3. analyze.md Updates
- Add structured output format matching MCP patterns
- Consider adding MCP tool for cross-reference validation

### 4. All Commands
- Verify `check_prereqs` tool parameters match MCP schema
- Ensure error handling follows MCP patterns

## Out of Scope

- Creating new MCP tools (tools already exist)
- Modifying MCP server code (separate package)
- Adding new commands beyond the 6 specified
