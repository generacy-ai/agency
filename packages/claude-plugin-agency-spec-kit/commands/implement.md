---
description: Execute tasks from tasks.md with progress tracking
---

# Implement Command

Execute the implementation plan by processing tasks defined in tasks.md.

## Instructions

1. **Check prerequisites** by calling the `check_prereqs` MCP tool:
   - Require: `spec.md`, `plan.md`, `tasks.md`
   - Include tasks in available docs

2. **Check checklists status** (if checklists/ exists):
   - Scan all checklist files
   - Count completed vs incomplete items
   - Display status table:
     ```
     | Checklist | Total | Completed | Incomplete | Status |
     |-----------|-------|-----------|------------|--------|
     | ux.md     | 12    | 12        | 0          | PASS   |
     ```
   - If any checklist is incomplete, ask user if they want to proceed

3. **Load implementation context**:
   - Read `tasks.md` for complete task list
   - Read `plan.md` for tech stack and architecture
   - Read `data-model.md` (if exists) for entity definitions
   - Read `contracts/` (if exists) for API specs
   - Read `research.md` (if exists) for technical decisions

4. **Verify project setup**:
   - Check/create appropriate ignore files (.gitignore, etc.)
   - Verify dependencies match plan.md

5. **Parse tasks.md** and extract:
   - Task phases (Setup, Tests, Core, Integration, Polish)
   - Task dependencies and parallel markers [P]
   - File paths and descriptions

5a. **Group parallel tasks** within each phase:
   - Scan for consecutive tasks with `[P]` marker
   - Group them into parallel batches (max 4 tasks per batch)
   - Tasks WITHOUT `[P]` are sequential barriers
   - Example grouping:
     ```
     T001 (sequential)
     T002 [P] ─┐
     T003 [P] ─┼─ Parallel Batch 1
     T004 [P] ─┘
     T005 (sequential barrier)
     T006 [P] ─┐
     T007 [P] ─┴─ Parallel Batch 2
     T008 (sequential)
     ```
   - Store the execution plan: `[(T001, seq), (batch1, parallel), (T005, seq), (batch2, parallel), (T008, seq)]`

6. **Execute tasks phase by phase**:
   - Complete setup tasks first
   - For each item in the execution plan from step 5a:
     - **If sequential task**: Execute directly, wait for completion
     - **If parallel batch**: Execute using Section 6b (parallel execution)
   - Follow TDD approach if test tasks exist
   - Validate each phase before proceeding
   - **Execution flow**:
     ```
     FOR each phase:
       FOR each item in execution_plan:
         IF item is sequential:
           execute_task(item)
           mark_complete(item)
         ELSE IF item is parallel_batch:
           execute_parallel_batch(item.tasks)  # See 6b
           collect_results(item.tasks)         # See 6c
           mark_all_complete(item.tasks)
     ```

6a. **Merge at priority phase boundaries** (P1→P2, P2→P3):
   - When transitioning between priority phases (e.g., after all P1 tasks, before starting P2):
     1. Commit current work with message: `feat: Complete [phase] tasks for #<issue>`
     2. Call `merge_from_base` MCP tool to sync with latest develop/main
     3. If conflicts detected:
        - The tool returns conflict details for agent resolution
        - Analyze each conflict in context of the work just completed
        - Resolve conflicts by editing files (preserve local implementation intent)
        - Stage resolved files with `git add`
        - If conflicts are semantic (contradictory intent), report to user
     4. Log merge result (one line for success)
     5. Continue with next priority phase
   - This catches upstream changes incrementally rather than facing a large merge at the end
   - Priority detection: Look for `[P1]`, `[P2]`, `[P3]` markers in task descriptions or phase headers

6b. **Execute parallel batch** using Task tool with background execution:
   - For a batch of parallel tasks, launch ALL tasks simultaneously in a single response
   - Use the Task tool with `run_in_background: true` for each task
   - **Pattern**:
     ```
     # In a SINGLE response, invoke multiple Task tools:
     Task(
       description: "T002: [task description]",
       prompt: "[detailed implementation instructions for T002]",
       subagent_type: "general-purpose",
       run_in_background: true
     )
     Task(
       description: "T003: [task description]",
       prompt: "[detailed implementation instructions for T003]",
       subagent_type: "general-purpose",
       run_in_background: true
     )
     Task(
       description: "T004: [task description]",
       prompt: "[detailed implementation instructions for T004]",
       subagent_type: "general-purpose",
       run_in_background: true
     )
     ```
   - **Critical**: All Task calls MUST be in the same message to achieve true parallelism
   - Store the returned `agent_id` for each task for result collection
   - Maximum 4 parallel tasks per batch (to avoid resource contention)

6c. **Collect parallel results** using TaskOutput tool:
   - After launching parallel tasks, wait for ALL to complete
   - For each agent_id from step 6b:
     ```
     TaskOutput(
       task_id: "<agent_id>",
       block: true,
       timeout: 300000  # 5 minutes per task
     )
     ```
   - Collect results in order, recording:
     - Success/failure status
     - Output content
     - Any errors encountered
   - **Proceed only after ALL parallel tasks complete**
   - If any task fails, record the failure but continue collecting other results

7. **Update tasks.md** as work progresses (mark tasks IMMEDIATELY after finishing each one):
   - **Checkbox format** (`- [ ] T001 ...`): Change to `- [X] T001 ...`
   - **Heading format** (`### T001 Description`): Change to `### T001 [DONE] Description`
   - Both formats may exist — handle whichever is present in the file

8. **Handle errors**:
   - **Sequential task failure**: Halt execution, report error, do not proceed
   - **Parallel batch failures**:
     - Continue collecting results from other tasks in the batch
     - After batch completes, report all failures with context:
       ```
       ⚠️ Parallel batch completed with failures:

       ✓ T002: Completed successfully
       ✗ T003: Failed - [error message]
       ✓ T004: Completed successfully

       1 of 3 parallel tasks failed.
       ```
     - Ask user how to proceed:
       - **Retry failed tasks**: Re-run only the failed tasks
       - **Skip and continue**: Mark failed tasks as skipped, proceed
       - **Halt**: Stop execution for manual intervention
   - **Timeout handling**: If TaskOutput times out (5 min default):
     - Report which task timed out
     - Suggest increasing timeout or investigating task complexity

9. **Completion validation**:
   - Verify all tasks completed
   - Run any defined tests
   - Report final status with summary

   **Note**: After reporting, check your todo list for any remaining parent workflow steps.

10. **Check for remaining manual tasks**:
    - After completing all automated tasks, parse tasks.md for incomplete tasks (unchecked `- [ ]` OR heading `### Txxx` without `[DONE]`)
    - For each incomplete task, check if it's manual using layered detection:
      1. **High confidence**: Contains `[manual]` marker in description
      2. **Medium confidence**: Contains keywords: "manual", "manually", "hand-test", "manual testing", "manually verify"
    - Count automated vs manual remaining tasks
    - **If ALL remaining incomplete tasks are manual** (automated=0, manual>0):
      - Call `update_phase_labels` MCP tool with:
        - `issue_number`: Extract from branch name or context
        - `phase: "manual-validation"`
        - `action: "block"`
      - Report: "✓ All automated tasks complete. Manual tasks remaining:"
      - List each remaining manual task
      - Add: "Added `waiting-for:manual-validation` label. Complete manual tasks, then add `completed:manual-validation` label to resume workflow."
    - **If no tasks remain** (all completed):
      - Report: "✓ All tasks complete (automated and manual)"
      - **IMPORTANT - Signal workflow completion**:
        - This is a terminal state - all implementation work is done
        - Do NOT suggest running `/speckit:implement` again
        - The parent workflow (`/speckit:continue`) will detect this completion state
    - **If automated tasks remain**:
      - This indicates an error - report which automated tasks are incomplete

10a. **Early exit when already complete**:
    - At the START of execution (after loading tasks.md in step 3), check if all tasks are already complete
    - A task is incomplete if it matches EITHER:
      - Checkbox format: `- [ ] T001` (unchecked checkbox)
      - Heading format: `### T001` without a `[DONE]` marker after the task ID
    - If ALL tasks are complete (all checkboxes checked AND/OR all headings have `[DONE]`):
      - Report: "All tasks already complete. Nothing to implement."
      - Skip steps 4-10
      - Exit immediately - do not re-process completed tasks
    - This prevents re-running implementation on an already-complete task list

## Constraints

- Maximum 3 MCP tool calls for setup
- Mark tasks complete in tasks.md immediately after finishing
- Commit after each logical group of tasks (if user requests)
- Stop at checkpoints if validation fails
- **Parallel execution limits**:
  - Maximum 4 concurrent background tasks per batch
  - Only tasks explicitly marked with `[P]` are parallelized
  - No cross-phase parallelization (complete one phase before starting next)
  - 5-minute timeout per background task (configurable via TaskOutput)

## Post-Command Check

**IMPORTANT**: If this command was invoked as part of a larger workflow (e.g., `/speckit:start` or `/speckit:continue`):
1. This command's completion is NOT the end of the workflow
2. Check your todo list - there WILL be remaining tasks
3. You MUST immediately proceed to the next task in your todo list
4. Do NOT output a final response or wait for user input

Continue NOW with the parent workflow.
