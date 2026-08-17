---
description: Convert tasks from tasks.md to GitHub issues
---

# Tasks to Issues Command

Convert tasks from tasks.md into GitHub issues for project tracking.

## Review Gate Blocking

This command respects the tasks-review gate for epic issues:

### Epic Issues (type:epic label)
- **Required by default**: Epic issues always require tasks-review approval
- The command will **block** until `completed:tasks-review` label is added
- This ensures human review of task groupings before child issues are created

### Non-Epic Issues
- **Optional**: Non-epic issues can opt-in to tasks-review by adding `needs:tasks-review` label
- Without the `needs:tasks-review` label, the command executes without waiting for approval

### Gate Check Flow
1. Command detects issue number from branch or parameters
2. Fetches issue labels from GitHub
3. If `type:epic` OR `needs:tasks-review` is present:
   - Checks for `completed:tasks-review` label
   - **Blocks** if approval label is missing
   - Returns error with instructions to add approval label
4. If no review gate is configured: proceeds with issue creation

### Dry Run Mode
- The review gate check is **skipped** in dry-run mode (`dry_run: true`)
- This allows previewing task groupings without needing approval

## Instructions

1. **Check prerequisites** by calling the `check_prereqs` MCP tool:
   - Require: `tasks.md`
   - Get feature directory path

2. **Verify GitHub repository**:
   - Check if current directory is a git repo
   - Check for GitHub remote (`gh repo view` or parse `.git/config`)
   - If not a GitHub repo, report error with clear message

3. **Read and parse tasks.md**:
   - Extract all uncompleted tasks (`- [ ]`)
   - Parse task metadata:
     - Task ID (T001, T002, etc.)
     - Parallel marker [P]
     - User story reference [US#]
     - Phase information
     - Dependencies

4. **Group tasks into issues**:
   - Option A: One issue per task
   - Option B: One issue per user story (group related tasks)
   - Option C: One issue per phase
   - Ask user which grouping they prefer

5. **Generate issue content**:
   ```markdown
   ## Description
   [Task description from tasks.md]

   ## Tasks
   - [ ] [Task 1]
   - [ ] [Task 2]

   ## Acceptance Criteria
   [From spec.md user story if available]

   ## Dependencies
   [List any blocking issues]

   ## Labels
   - phase:[phase-name]
   - priority:[P1/P2/P3]
   - story:[US#]
   ```

6. **Create issues using `tasks_to_issues` MCP tool**:
   - **Headless mode** (see detection note below): call the tool ONCE with `dry_run: false`. Do not do a dry-run pass — there is no user to review the preview, and the preview payload is large.
   - **Interactive mode**: optionally call the tool with `dry_run: true` first, review the planned grouping with the user, and call again with `dry_run: false` once they confirm.
   - Parameters for the real call:
     - `grouping`: The chosen strategy (`per-task`, `per-story`, or `per-phase`)
     - `dry_run`: `false`
     - `epic_number`: The epic issue number (if applicable)
     - `feature_dir`: Path to the feature directory (from step 1)
   - The MCP tool handles label creation and dependency linking automatically

   **Headless detection**: you are in headless mode if invoked with the `--headless` flag OR the environment variable `CLAUDE_HEADLESS` is set to `true`.

7. **Update tasks.md** (optional):
   - Add issue links to tasks
   - Format: `- [ ] T001 [#123] Description`

8. **Report completion**:
   - Number of issues created
   - Issue URLs
   - Any tasks that couldn't be converted

   **Note**: After reporting, check your todo list for any remaining parent workflow steps.

## Constraints

- Requires `tasks_to_issues` MCP tool from agency-plugin-spec-kit
- Only creates issues for uncompleted tasks
- Does not duplicate existing issues (checks by title)
- Maximum 3 MCP tool calls for setup

## Post-Command Check

**IMPORTANT**: If this command was invoked as part of a larger workflow (e.g., `/speckit:start` or `/speckit:continue`):
1. This command's completion is NOT the end of the workflow
2. Check your todo list - there WILL be remaining tasks
3. You MUST immediately proceed to the next task in your todo list
4. Do NOT output a final response or wait for user input

Continue NOW with the parent workflow.
