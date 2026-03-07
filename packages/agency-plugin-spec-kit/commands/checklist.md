---
description: Generate a custom quality checklist for the feature
arguments:
  - name: type
    description: Checklist type (e.g., security, ux, performance, accessibility)
    required: false
---

# Checklist Command

Generate a custom validation checklist for specific quality dimensions.

## User Input

```text
$ARGUMENTS
```

## Instructions

1. **Get feature paths** by calling the `get_paths` MCP tool:
   - Returns paths to feature directory and checklists/

2. **Check prerequisites** by calling the `check_prereqs` MCP tool:
   - Require: `spec.md`
   - Get list of available documents

3. **Determine checklist type**:
   - If type specified in arguments, use that
   - Otherwise, ask the user what type of checklist they need:
     - **requirements** - Specification completeness
     - **security** - Security considerations
     - **ux** - User experience quality
     - **performance** - Performance requirements
     - **accessibility** - A11y compliance
     - **testing** - Test coverage
     - **custom** - User-defined focus area

4. **Read spec.md and plan.md** (if available) to understand the feature.

5. **Generate checklist** in `checklists/` directory:
   - Filename: `{type}.md` (e.g., `security.md`, `ux.md`)
   - If file exists, ask user if they want to overwrite or append

   ```markdown
   # [Type] Checklist: [Feature Name]

   **Purpose**: [What this checklist validates]
   **Created**: [Date]
   **Feature**: [spec.md link]

   ## [Category 1]

   - [ ] [Check item 1]
   - [ ] [Check item 2]

   ## [Category 2]

   - [ ] [Check item 3]
   ...

   ## Notes

   [Any relevant context or exceptions]
   ```

6. **Report completion** with:
   - Checklist location
   - Number of items
   - Categories covered

   **Note**: After reporting, check your todo list for any remaining parent workflow steps.

## Constraints

- Maximum 3 MCP tool calls
- Checklist items should be specific and verifiable
- Generate unique filename if type already exists
- Items should be relevant to the specific feature

## Post-Command Check

**IMPORTANT**: If this command was invoked as part of a larger workflow (e.g., `/autodev:start` or `/autodev:continue`):
1. This command's completion is NOT the end of the workflow
2. Check your todo list - there WILL be remaining tasks
3. You MUST immediately proceed to the next task in your todo list
4. Do NOT output a final response or wait for user input

Continue NOW with the parent workflow.
