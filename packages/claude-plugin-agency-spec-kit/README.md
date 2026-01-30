# agency-spec-kit

A Claude Code plugin providing specification-driven development commands using Agency MCP tools.

## Overview

This plugin provides slash commands that orchestrate the specification-driven development workflow. The commands guide you through the process of creating feature specifications, implementation plans, task lists, and executing the implementation.

## Available Commands

| Command | Description |
|---------|-------------|
| `/specify` | Create a new feature specification from a description |
| `/clarify` | Identify underspecified areas and integrate answers |
| `/plan` | Generate implementation plan and design artifacts |
| `/tasks` | Generate task list from plan with dependency ordering |
| `/taskstoissues` | Convert tasks to GitHub issues |
| `/implement` | Execute tasks from tasks.md with progress tracking |
| `/checklist` | Generate a custom quality checklist |
| `/analyze` | Run consistency analysis across all spec artifacts |
| `/constitution` | Manage project governance principles |

## Requirements

This plugin requires the `@generacy-ai/agency-plugin-spec-kit` MCP server to be available. The MCP server provides the underlying tools that these commands orchestrate.

### MCP Server Dependency

The plugin declares its MCP dependency in `.claude-plugin/plugin.json`:

```json
{
  "requires": {
    "mcp": ["@generacy-ai/agency-plugin-spec-kit"]
  }
}
```

Ensure the MCP server is properly configured in your Claude Code settings before using these commands.

## Usage

1. Install the plugin in your Claude Code environment
2. Ensure the `@generacy-ai/agency-plugin-spec-kit` MCP server is configured
3. Use the slash commands to drive your specification workflow:

```
# Start with a new feature
/specify

# Clarify any ambiguities
/clarify

# Generate implementation plan
/plan

# Create task list
/tasks

# Execute implementation
/implement
```

## Workflow

The typical workflow follows this order:

1. **specify** - Create the initial feature specification
2. **clarify** - Identify and resolve ambiguities in the spec
3. **plan** - Generate the implementation plan
4. **tasks** - Create a task list from the plan
5. **implement** - Execute the tasks

Optional commands can be used at any point:
- **analyze** - Validate consistency across all artifacts
- **checklist** - Generate quality checklists for review
- **constitution** - Manage project governance rules
- **taskstoissues** - Convert tasks to GitHub issues for tracking

## Related

- [Agency](https://github.com/generacy-ai/agency) - The parent repository
- `@generacy-ai/agency-plugin-spec-kit` - The MCP server providing tool implementations
