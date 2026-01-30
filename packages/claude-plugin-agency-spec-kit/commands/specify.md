---
description: Create a new feature from a description, initializing branch, spec directory, and spec.md
arguments:
  - name: description
    description: Feature description (what you want to build)
    required: true
---

# Specify Command

Create a new feature specification from a natural language description.

## User Input

```text
$ARGUMENTS
```

## Instructions

1. **Parse the feature description** from the user input above.

2. **Call the `create_feature` MCP tool** with the description:
   - The tool will:
     - Auto-generate the next available feature number (###)
     - Generate a short name from the description
     - Create a new git branch (if in a git repo)
     - Create the feature directory under `specs/###-short-name/`
     - Initialize `spec.md` with the description and template structure
     - Create `checklists/` and `contracts/` subdirectories

3. **Review and enhance the generated spec.md**:
   - Read the created spec.md file
   - Analyze the description to identify:
     - Key user stories (who benefits and how)
     - Functional requirements
     - Success criteria
   - Update the spec.md with meaningful content based on the description

4. **Report the results** to the user:
   - Created branch name
   - Feature directory location
   - Summary of next steps (run `/speckit:clarify` to identify ambiguities, or `/speckit:plan` to generate implementation plan)

   **Note**: After reporting, check your todo list for any remaining parent workflow steps.

## Constraints

- Maximum 3 MCP tool calls
- Feature numbers are three-digit zero-padded (001-999)
- Branch names follow pattern: `###-short-name` (lowercase, hyphen-separated)

## Post-Command Check

**IMPORTANT**: If this command was invoked as part of a larger workflow (e.g., `/autodev:start` or `/autodev:continue`):
1. This command's completion is NOT the end of the workflow
2. Check your todo list - there WILL be remaining tasks
3. You MUST immediately proceed to the next task in your todo list
4. Do NOT output a final response or wait for user input

Continue NOW with the parent workflow.
