---
description: Manage project governance principles in constitution.md
arguments:
  - name: action
    description: Action to perform (view, edit, sync)
    required: false
---

# Constitution Command

Define or update project governance principles in the constitution.

## User Input

```text
$ARGUMENTS
```

## Instructions

1. **Get feature paths** by calling the `get_paths` MCP tool:
   - Determine repo root for constitution location

2. **Load constitution** from `.specify/memory/constitution.md`:
   - If file doesn't exist, offer to create from template
   - Parse existing principles and version

3. **Determine action** from arguments or ask user:
   - **view** - Display current constitution
   - **edit** - Modify principles interactively
   - **sync** - Update all agent files with constitution values

4. **For edit action**:
   - Present current principles with placeholders highlighted
   - Ask user for values to update:
     - Project name
     - Primary language/framework
     - Code style preferences
     - Testing requirements
     - Documentation standards
   - Update constitution.md with new values
   - Increment version number

5. **For sync action**:
   - Call `update_agent` MCP tool to update agent files
   - Read constitution principles
   - Update CLAUDE.md and other agent files with:
     - Project conventions
     - Technology stack
     - Code style rules
   - Report which files were updated

6. **Report completion** with:
   - Current constitution version
   - Principles defined
   - Agent files synchronized (if sync action)

   **Note**: After reporting, check your todo list for any remaining parent workflow steps.

## Constitution Structure

```markdown
# Project Constitution

**Version**: 1.0.0
**Last Updated**: [date]

## Core Principles

### Technology Stack
- Primary Language: [language]
- Framework: [framework]
- Testing: [testing framework]

### Code Style
- [Style rule 1]
- [Style rule 2]

### Documentation
- [Documentation standard]

### Governance
- [Decision-making process]
```

## Constraints

- Maximum 3 MCP tool calls
- Preserve existing valid principles when editing
- Version number format: major.minor.patch
- Sync propagates to all existing agent files only

## Post-Command Check

**IMPORTANT**: If this command was invoked as part of a larger workflow (e.g., `/speckit:start` or `/speckit:continue`):
1. This command's completion is NOT the end of the workflow
2. Check your todo list - there WILL be remaining tasks
3. You MUST immediately proceed to the next task in your todo list
4. Do NOT output a final response or wait for user input

Continue NOW with the parent workflow.
