---
description: Run consistency analysis across all spec artifacts (read-only)
---

# Analyze Command

Perform a non-destructive cross-artifact consistency and quality analysis.

## Instructions

1. **Check prerequisites** by calling the `check_prereqs` MCP tool:
   - Require: `spec.md`
   - Get list of available optional documents

2. **Read all available artifacts**:
   - `spec.md` - Requirements and user stories
   - `plan.md` (if exists) - Technical plan
   - `tasks.md` (if exists) - Task list
   - `research.md` (if exists) - Technical decisions
   - `data-model.md` (if exists) - Entity definitions
   - `contracts/` (if exists) - API schemas

3. **Analyze for consistency issues**:

   ### Cross-Reference Checks
   - User stories in spec.md referenced in tasks.md
   - Entities in data-model.md used in contracts/
   - Technologies in plan.md match research.md decisions
   - File paths in plan.md exist in task descriptions

   ### Quality Checks
   - All requirements have acceptance criteria
   - Success criteria are measurable
   - No orphaned tasks (tasks without matching requirements)
   - No missing tasks (requirements without tasks)

   ### Completeness Checks
   - All user stories have tasks assigned
   - All P1 requirements covered
   - Edge cases identified in spec have corresponding tasks

4. **Generate analysis report**:

   ```markdown
   # Consistency Analysis Report

   **Feature**: [name]
   **Date**: [date]
   **Artifacts Analyzed**: [list]

   ## Summary
   - Issues Found: [count]
   - Warnings: [count]
   - Passed Checks: [count]

   ## Issues
   [List of problems that must be fixed]

   ## Warnings
   [List of potential concerns]

   ## Recommendations
   [Suggested improvements]
   ```

5. **Report findings** without modifying any files.

   **Note**: After reporting, check your todo list for any remaining parent workflow steps.

## Constraints

- READ-ONLY operation - do not modify any files
- Maximum 3 MCP tool calls
- Report all findings, even minor ones
- Categorize issues by severity

## Post-Command Check

**IMPORTANT**: If this command was invoked as part of a larger workflow (e.g., `/autodev:start` or `/autodev:continue`):
1. This command's completion is NOT the end of the workflow
2. Check your todo list - there WILL be remaining tasks
3. You MUST immediately proceed to the next task in your todo list
4. Do NOT output a final response or wait for user input

Continue NOW with the parent workflow.
