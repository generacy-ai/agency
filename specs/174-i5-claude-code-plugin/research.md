# Research: Claude Code Plugin Architecture

## Claude Code Plugin System

### Plugin Structure
Claude Code plugins use a specific directory structure:
```
.claude-plugin/
├── plugin.json    # Plugin metadata and dependencies
commands/
├── command.md     # Slash command instructions
```

### plugin.json Format
```json
{
  "name": "plugin-name",
  "version": "0.0.1",
  "description": "Plugin description",
  "requires": {
    "mcp": ["@namespace/mcp-server-name"]
  }
}
```

The `requires.mcp` array lists MCP servers that must be available for the plugin to function.

### Command File Format
Each `.md` file in `commands/` becomes a slash command:
- Filename: `command-name.md` → `/plugin-name:command-name`
- YAML frontmatter for metadata
- Markdown body for instructions

```markdown
---
description: Brief command description (shown in help)
arguments:
  - name: arg-name
    description: Argument description
    required: true/false
---

# Command Name

Instructions for Claude to follow when executing this command.
```

## MCP Tool Integration

### Tool Naming Convention
MCP tools are accessed via the Claude tool system with prefixed names:
- `mcp__plugin_speckit_speckit__tool_name`

### Available Tools from agency-plugin-spec-kit

| Tool | Purpose | Key Parameters |
|------|---------|----------------|
| `git_ops` | Git operations | operation, branch_name |
| `create_feature` | Initialize feature | description, short_name, number |
| `get_paths` | Get feature paths | branch, cwd |
| `check_prereqs` | Validate files | require_spec, require_plan, require_tasks |
| `copy_template` | Copy templates | templates[], feature_dir |
| `update_agent` | Update agent files | agent_type, create_if_missing |
| `manage_clarifications` | Handle Q&A | operation, questions[], issue_number |
| `tasks_to_issues` | Create issues | grouping, dry_run, epic_number |

## Design Decisions

### 1. Command as Instructions vs Code
**Decision**: Commands are markdown instruction files, not executable code
**Rationale**:
- Claude interprets instructions at runtime
- More flexible and maintainable
- Can be updated without rebuilding
- Human-readable documentation

### 2. MCP Tool Orchestration
**Decision**: Commands orchestrate MCP tools via natural language instructions
**Rationale**:
- Claude maps instructions to tool calls
- Complex workflows described in plain English
- Error handling embedded in instructions

### 3. Post-Command Workflow Continuation
**Decision**: All commands include "Post-Command Check" section
**Rationale**:
- Commands often run as part of larger workflows
- Prevents premature completion
- Maintains workflow state via todo list

## Implementation Patterns

### Prerequisite Checking Pattern
```markdown
1. **Check prerequisites** by calling the `check_prereqs` MCP tool:
   - Require: `spec.md`, `plan.md`
   - Get list of available optional documents
```

### File Reading Pattern
```markdown
2. **Read all available artifacts**:
   - `spec.md` - Requirements and user stories
   - `plan.md` (if exists) - Technical plan
   - `tasks.md` (if exists) - Task list
```

### Completion Reporting Pattern
```markdown
N. **Report completion** with:
   - Summary of actions taken
   - Key metrics or counts
   - Suggested next step: `/speckit:next-command`

   **Note**: After reporting, check your todo list for any remaining parent workflow steps.
```

### Post-Command Check Pattern
```markdown
## Post-Command Check

**IMPORTANT**: If this command was invoked as part of a larger workflow:
1. This command's completion is NOT the end of the workflow
2. Check your todo list - there WILL be remaining tasks
3. You MUST immediately proceed to the next task in your todo list
4. Do NOT output a final response or wait for user input

Continue NOW with the parent workflow.
```

## References

- Claude Code Plugin Documentation
- MCP (Model Context Protocol) Specification
- Existing speckit command implementations at `/workspaces/claude-plugins/plugins/speckit/commands/`
