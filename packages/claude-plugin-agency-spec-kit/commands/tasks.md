---
description: Generate task list from plan.md with dependency ordering and parallelization markers
---

# Tasks Command

Generate an actionable, dependency-ordered task list from the implementation plan.

## Arguments

- `--epic`: Force epic-style task generation (coarse-grained task groups)
- `--no-epic`: Force standard task generation (fine-grained tasks), overrides auto-detection

## Instructions

### Step 0: Epic Context Detection

**Determine epic mode using this precedence: `--no-epic` > `--epic` > auto-detect**

1. **Parse command arguments**:
   - If `--no-epic` flag is present → `epic_mode = false` (skip auto-detection)
   - If `--epic` flag is present → `epic_mode = true` (skip auto-detection)
   - If neither flag → proceed to auto-detection

2. **Auto-detect epic context** (only if no flags):
   - Call `preflight_check` MCP tool with the current issue URL
   - Check the response for `epic_context.is_epic`
   - If `epic_context.is_epic == true` → `epic_mode = true`
   - Otherwise → `epic_mode = false`

3. **Report mode selection**:
   - If epic mode: "📦 Epic mode: Generating coarse-grained task groups (2-8 hours each)"
   - If standard mode: "📝 Standard mode: Generating fine-grained implementation tasks"

### Step 1: Check Prerequisites

1. **Check prerequisites** by calling the `check_prereqs` MCP tool:
   - Require: `spec.md`, `plan.md`
   - Get list of available optional documents (research.md, data-model.md, contracts/)

2. **Read all available design documents**:
   - `spec.md` - User stories and requirements
   - `plan.md` - Technical context and project structure
   - `research.md` (if available) - Technology decisions
   - `data-model.md` (if available) - Entity definitions
   - `contracts/` (if available) - API specifications

3. **Generate tasks.md** based on the determined mode:

   **IMPORTANT**: Include `**Status**: Complete` in the header section (after Prerequisites line)

   ### Standard Mode (fine-grained tasks)

   Use this format when `epic_mode = false`:

   ```markdown
   # Tasks: [Feature Name]

   **Input**: Design documents from `/specs/[feature]/`
   **Prerequisites**: plan.md (required), spec.md (required), [other available docs]
   **Status**: Complete

   ## Format: `[ID] [P?] [Story] Description`
   - **[P]**: Can run in parallel (different files, no dependencies)
   - **[Story]**: Which user story this task belongs to

   ## Phase 1: Setup
   - [ ] T001 Create project structure
   - [ ] T002 [P] Configure dependencies
   ...

   ## Phase 2: Core Implementation
   - [ ] T010 [US1] Implement [feature]
   ...

   ## Dependencies & Execution Order
   [Explain task dependencies and parallel opportunities]
   ```

   ### Epic Mode (coarse-grained task groups)

   Use this format when `epic_mode = true`:

   ```markdown
   # Tasks: [Feature Name]

   **Input**: Design documents from `/specs/[feature]/`
   **Prerequisites**: plan.md (required), spec.md (required), [other available docs]
   **Status**: Complete
   **Mode**: Epic (coarse-grained task groups)

   ## Format: `[ID] [P?] [Story] Description`
   - **[P]**: Task group can run in parallel with other `[P]` groups in the same phase
   - **[Story]**: Which user story this task group addresses

   ## Phase 1: [Phase Name]

   ### TG-001 [P] [US1] Task Group: [Group Title]
   **Scope**: [2-8 hours estimated]
   **Files**: [list of related files]
   **Tests**: [test files or test approach]

   - [ ] Subtask 1 description
   - [ ] Subtask 2 description
   - [ ] Subtask 3 description

   ---

   ### TG-002 [P] [US1] Task Group: [Group Title]
   **Scope**: [2-8 hours estimated]
   **Files**: [list of related files]
   **Tests**: [test files or test approach]

   - [ ] Subtask 1 description
   - [ ] Subtask 2 description

   ---

   ## Phase 2: [Phase Name]
   <!-- Phase boundary: Complete Phase 1 before starting Phase 2 -->

   ### TG-003 [US2] Task Group: [Group Title]
   ...

   ## Dependencies & Execution Order

   **Phase boundaries** (sequential):
   - Phase 1 → Phase 2 → Phase 3 (must complete in order)

   **Parallel opportunities within phases**:
   - TG-001 and TG-002 can run in parallel (marked with [P])
   - TG-003 must wait for Phase 1 completion
   ```

   ### Epic Mode Guidelines

   When generating epic tasks, follow these rules:

   1. **Task Group Scope (2-8 hours each)**:
      - Each task group should represent a coherent unit of work
      - Can be assigned to a single agent or developer
      - Should be independently testable and deployable

   2. **Grouping Strategy**:
      - Combine related work: A feature's model, service, and basic tests together
      - Combine trivial tasks: Config files, simple utilities, boilerplate together
      - Keep complex work separate: Complex algorithms or logic in their own groups
      - Minimum 2-3 task groups per phase (avoid single massive groups)

   3. **What NOT to do in Epic Mode**:
      - DON'T create single-file tasks (unless the file is complex, >500 lines)
      - DON'T create trivial standalone tasks (like "create config file")
      - DON'T create tasks that take <30 minutes in isolation

   4. **Parallel Markers `[P]`**:
      - Mark task groups that can run concurrently with `[P]`
      - Groups are parallel if they don't share files or have data dependencies
      - Phase boundaries are always sequential (never parallel across phases)

   5. **Phase Boundaries**:
      - Add HTML comment at phase start: `<!-- Phase boundary: Complete Phase N before starting -->`
      - Phases represent sequential dependencies (e.g., core before integration)
      - Tasks within a phase may be parallel, but phases themselves are sequential

4. **Task organization rules**:

   **For Standard Mode**:
   - Group by phase: Setup, Tests, Core, Integration, Polish
   - Order by dependencies (setup before core, tests before implementation if TDD)
   - Mark parallelizable tasks with `[P]`
   - Include file paths in task descriptions
   - Link tasks to user stories with `[US#]` markers

   **For Epic Mode**:
   - Group by user story or logical capability
   - Create task groups (TG-XXX) instead of individual tasks
   - Each group should be assignable to a child issue
   - Include scope estimate, files, and test approach in group metadata
   - Mark parallel-eligible groups with `[P]`

   **Playbook coupling — mandatory verification task**:

   Before finalizing the task list, check whether `spec.md` (or `plan.md`, or the issue body if fetched) names any file path matching the glob `packages/claude-plugin-cockpit/commands/*.md`. Detect by simple substring / regex match against the literal prefix `packages/claude-plugin-cockpit/commands/` followed by any `.md` filename. Bias permissive — a false positive costs one no-op task; a false negative reintroduces a whole class of validate failures.

   If one or more matches are found, `tasks.md` MUST include a mandatory verification task that:

   - Names `packages/claude-plugin-cockpit/tests/playbook-verification.test.ts` as the file to re-pin.
   - Lists every matched `commands/*.md` path under a "Files edited by this issue" line.
   - Enumerates the pin sites in `playbook-verification.test.ts` that read the edited file(s). Compute this at `/tasks` time by grepping the test file for calls to:
     - `extractSubheadingBlock(...)` — exact-heading pins.
     - `extractInstructionsSteps(...)` — contract-rule pins (loop shape, step content).
     - `readFileSync(AUTO_MD_PATH)` and `readFileSync(resolve(COMMANDS_DIR, "<name>"))` — direct named reads.
     - `readdirSync(COMMANDS_DIR)` — sweep site (currently around `:515`) that covers **every** `commands/*.md` playbook for invocation-vs-`--help` drift.
   - Filters those sites to ones whose read intersects the edited file(s). Trace `extractSubheadingBlock` / `extractInstructionsSteps` back one line to the `readFileSync` that fed them, and match the resolved filename. Always include the `readdirSync(COMMANDS_DIR)` sweep — it pins every playbook regardless of which one you edited.
   - States that re-pinning means **updating the assertion to the NEW contract** established by the playbook edit.
   - Contains the sentence: **"Do NOT weaken or delete an assertion to make the test pass"** — the pin is a drift audit; weakening it deletes its value.

   Canonical task shape to emit:

   ```markdown
   - [ ] T### [Story] Re-pin `packages/claude-plugin-cockpit/tests/playbook-verification.test.ts`
     for every heading and contract rule this edit changes.
     Files edited by this issue: <list of commands/*.md paths from spec.md>
     Pin sites that read the edited file(s):
       - :<line>: <test description> (<extractSubheadingBlock | extractInstructionsSteps | readFileSync | readdirSync sweep>)
       - ...
     Re-pinning means updating the assertion to the NEW contract.
     Do NOT weaken or delete an assertion to make the test pass — the pin is a drift audit;
     weakening it deletes its value.
   ```

   Placement: the re-pin task belongs in the "Verification" phase (or, in Epic Mode, the verification task group) — after all playbook edit tasks and before or alongside any final smoke-check task. The implementer must land the playbook edit before knowing what heading/contract shape to pin to.

   Emit exactly **one** re-pin task listing all matched files (not one per file). If zero pin sites intersect the edited files after filtering, emit the task anyway with a "verify manually before shipping" note — fail open, matching the permissive bias above.

5. **Granularity validation** (Epic Mode only):

   If `epic_mode = true`, check the generated tasks for appropriate granularity:

   - Count total task groups (TG-XXX entries)
   - Count task groups that appear to be single-file tasks
   - Calculate percentage: `single_file_percentage = single_file_count / total_count * 100`

   **If `single_file_percentage > 50%`**:
   ```
   ⚠️ Granularity Warning: {single_file_percentage}% of task groups appear to be single-file tasks.

   For epic-scoped work, consider:
   - Combining related single-file tasks into logical groups
   - Grouping config/utility files with their primary feature
   - Each task group should represent 2-8 hours of work

   Current distribution:
   - Single-file groups: {single_file_count}
   - Multi-file groups: {multi_file_count}
   - Total groups: {total_count}
   ```

   A task group is "single-file" if its **Files** metadata lists only one file and the group has fewer than 3 subtasks.

6. **Report completion** with:
   - Total task count (or task group count for epic mode)
   - Phase breakdown
   - Parallel opportunities identified
   - Mode used (standard or epic)
   - Suggested next step: `/speckit:implement` to begin execution

   **Note**: After reporting, check your todo list for any remaining parent workflow steps.

## Grouping Strategy for Issue Creation

When tasks are converted to GitHub issues using `/speckit:taskstoissues`, the following grouping strategies are available:

| Strategy | Label | Description |
|----------|-------|-------------|
| **per-story** | `epic-grouping:per-story` | Groups tasks by user story (default) |
| **per-task** | `epic-grouping:per-task` | Creates one issue per task |
| **per-phase** | `epic-grouping:per-phase` | Groups tasks by phase |

**Default Strategy**: `per-story` is the default when no `epic-grouping:*` label is present. This provides a balanced granularity for most workflows, grouping related tasks while maintaining manageable issue sizes.

To change the grouping strategy:
1. Add the appropriate `epic-grouping:*` label to the issue
2. Run `/speckit:taskstoissues` - it will respect the label

## Constraints

- Maximum 3 MCP tool calls
- Tasks must be specific and actionable
- Include exact file paths where applicable
- Tasks should be completable in a single session

## Post-Command Check

**IMPORTANT**: If this command was invoked as part of a larger workflow (e.g., `/speckit:start` or `/speckit:continue`):
1. This command's completion is NOT the end of the workflow
2. Check your todo list - there WILL be remaining tasks
3. You MUST immediately proceed to the next task in your todo list
4. Do NOT output a final response or wait for user input

Continue NOW with the parent workflow.
