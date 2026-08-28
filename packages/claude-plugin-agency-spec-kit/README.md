# agency-spec-kit

A Claude Code plugin providing specification-driven development commands using Agency MCP tools.

## Overview

This plugin provides slash commands that orchestrate the specification-driven development workflow. The commands guide you through the process of creating feature specifications, implementation plans, task lists, and executing the implementation.

## Installation

1. Ensure the `@generacy-ai/agency-plugin-spec-kit` MCP server is configured in your Claude Code settings
2. Install this plugin in your Claude Code environment
3. The slash commands will be available with the `speckit:` prefix

## Prerequisites

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

## Available Commands

| Command | Description |
|---------|-------------|
| `/speckit:specify` | Create a new feature specification from a description |
| `/speckit:clarify` | Identify underspecified areas and integrate answers |
| `/speckit:plan` | Generate implementation plan and design artifacts |
| `/speckit:tasks` | Generate task list from plan with dependency ordering |
| `/speckit:taskstoissues` | Convert tasks to GitHub issues |
| `/speckit:implement` | Execute tasks from tasks.md with progress tracking |
| `/speckit:checklist` | Generate a custom quality checklist |
| `/speckit:analyze` | Run consistency analysis across all spec artifacts |
| `/speckit:constitution` | Manage project governance principles |

## Command Reference

### /speckit:specify

Create a new feature specification from a natural language description.

**Usage:**
```bash
/speckit:specify Add user authentication with OAuth2 support
```

**What it does:**
1. Auto-generates the next available feature number
2. Creates a new git branch (e.g., `042-add-user-authentication`)
3. Creates the feature directory under `specs/042-add-user-authentication/`
4. Initializes `spec.md` with the description and template structure
5. Creates `checklists/` and `contracts/` subdirectories

**Output:** Branch name, feature directory location, and next steps.

---

### /speckit:clarify

Identify ambiguous or underspecified areas in the feature specification.

**Usage:**
```bash
/speckit:clarify
```

**What it does:**
1. Reads the existing `spec.md` and analyzes for ambiguities
2. Generates up to 5 targeted clarification questions
3. Persists questions to `clarifications.md`
4. Optionally posts questions to the linked GitHub issue
5. Collects answers and updates the spec

**Iterative:** Can run multiple times until the spec is sufficiently clear.

---

### /speckit:plan

Generate a comprehensive implementation plan from the feature specification.

**Usage:**
```bash
/speckit:plan
```

**What it does:**
1. Reads `spec.md` and analyzes requirements
2. Generates the following artifacts:
   - `plan.md` - Technical context, project structure, constitution check
   - `research.md` - Technology decisions with rationale
   - `data-model.md` - Core entities, interfaces, validation rules
   - `contracts/` - API schemas (OpenAPI, JSON Schema) if applicable
   - `quickstart.md` - Installation, usage examples, troubleshooting
3. Writes the tech stack summary to `specs/<feature>/stack.md` (never touches repo-root agent-context files)

**Prerequisites:** Requires `spec.md` to exist.

---

### /speckit:tasks

Generate an actionable, dependency-ordered task list from the implementation plan.

**Usage:**
```bash
# Standard mode (fine-grained tasks)
/speckit:tasks

# Epic mode (coarse-grained task groups for larger features)
/speckit:tasks --epic

# Force standard mode even for epic issues
/speckit:tasks --no-epic
```

**What it does:**
1. Reads `plan.md` and all design documents
2. Generates `tasks.md` with:
   - Task phases (Setup, Tests, Core, Integration, Polish)
   - Dependency ordering
   - Parallel markers `[P]` for concurrent execution
   - User story references `[US#]`

**Epic Mode:**
- Generates coarse-grained task groups (2-8 hours each)
- Suitable for larger features that will be split into child issues
- Task groups can be assigned to individual agents or developers

**Prerequisites:** Requires `spec.md` and `plan.md`.

---

### /speckit:taskstoissues

Convert tasks from tasks.md into GitHub issues for project tracking.

**Usage:**
```bash
# Preview mode (dry run)
/speckit:taskstoissues --dry-run

# Create issues
/speckit:taskstoissues
```

**Grouping strategies:**

| Strategy | Label | Description |
|----------|-------|-------------|
| per-story | `epic-grouping:per-story` | Groups tasks by user story (default) |
| per-task | `epic-grouping:per-task` | Creates one issue per task |
| per-phase | `epic-grouping:per-phase` | Groups tasks by phase |

**Review gate:** Epic issues require `completed:tasks-review` label before issues are created.

**Prerequisites:** Requires `tasks.md` and GitHub repository.

---

### /speckit:implement

Execute the implementation plan by processing tasks defined in tasks.md.

**Usage:**
```bash
/speckit:implement
```

**What it does:**
1. Validates checklists (if any exist)
2. Loads all implementation context (tasks, plan, data model, contracts)
3. Executes tasks phase by phase:
   - Sequential tasks run one at a time
   - Parallel tasks `[P]` run concurrently (max 4 per batch)
4. Updates `tasks.md` with completion status
5. Handles errors and provides recovery options

**Parallel execution:**
- Tasks marked with `[P]` are executed in parallel batches
- Maximum 4 concurrent tasks per batch
- 5-minute timeout per task (configurable)

**Prerequisites:** Requires `spec.md`, `plan.md`, and `tasks.md`.

---

### /speckit:checklist

Generate a custom quality checklist for the feature.

**Usage:**
```bash
# Generate a security checklist
/speckit:checklist security

# Generate a UX checklist
/speckit:checklist ux

# Generate an accessibility checklist
/speckit:checklist accessibility
```

**What it does:**
1. Analyzes the feature specification
2. Generates a checklist specific to the requested category
3. Creates the checklist in `checklists/<category>.md`

**Available categories:** security, ux, accessibility, performance, testing

---

### /speckit:analyze

Run consistency analysis across all spec artifacts.

**Usage:**
```bash
/speckit:analyze
```

**What it does:**
1. Reads all spec artifacts (spec.md, plan.md, tasks.md, etc.)
2. Checks for inconsistencies between documents
3. Validates references and dependencies
4. Reports any issues found

**Read-only:** Does not modify any files.

---

### /speckit:constitution

Manage project governance principles in constitution.md.

**Usage:**
```bash
/speckit:constitution
```

**What it does:**
1. Creates or updates `.specify/memory/constitution.md`
2. Defines project-wide governance rules
3. Rules are checked during planning phase

## Workflow

The typical workflow follows this order:

```
1. specify  →  Create the initial feature specification
      ↓
2. clarify  →  Identify and resolve ambiguities
      ↓
3. plan     →  Generate the implementation plan
      ↓
4. tasks    →  Create a task list from the plan
      ↓
5. implement →  Execute the tasks
```

Optional commands can be used at any point:
- **analyze** - Validate consistency across all artifacts
- **checklist** - Generate quality checklists for review
- **constitution** - Manage project governance rules
- **taskstoissues** - Convert tasks to GitHub issues for tracking

## MCP Tools Used

Each command orchestrates one or more MCP tools from the `@generacy-ai/agency-plugin-spec-kit` server:

| Command | MCP Tools |
|---------|-----------|
| `/speckit:specify` | `create_feature` |
| `/speckit:clarify` | `check_prereqs`, `manage_clarifications` |
| `/speckit:plan` | `get_paths`, `check_prereqs` |
| `/speckit:tasks` | `check_prereqs`, `preflight_check` (speckit) |
| `/speckit:taskstoissues` | `check_prereqs`, `tasks_to_issues` |
| `/speckit:implement` | `check_prereqs`, `merge_from_base`, `update_phase_labels` (speckit) |
| `/speckit:checklist` | `get_paths`, `check_prereqs` |
| `/speckit:analyze` | `check_prereqs` |

## Configuration

The plugin uses configuration from the MCP server. See the [agency-plugin-spec-kit configuration guide](../agency-plugin-spec-kit/docs/configuration.md) for details.

Key configuration options:
- `paths.specs` - Directory for spec artifacts (default: `specs`)
- `paths.templates` - Directory for templates (default: `.specify/templates`)
- `branches.pattern` - Branch naming pattern (default: `{paddedNumber}-{slug}`)

## Troubleshooting

### MCP Server Not Found

```
Error: MCP server '@generacy-ai/agency-plugin-spec-kit' not available
```

**Solution:** Ensure the MCP server is properly configured in your Claude Code settings.

### Prerequisites Not Met

```
Error: Required file 'spec.md' not found
```

**Solution:** Run the prerequisite commands first. For example, run `/speckit:specify` before `/speckit:plan`.

### Branch Detection Fails

```
Error: Could not determine feature from current branch
```

**Solution:** Ensure you're on a feature branch created by `/speckit:specify` or manually checkout the correct branch.

### GitHub Authentication

```
Error: GitHub CLI not authenticated
```

**Solution:** Run `gh auth login` to authenticate with GitHub.

### Parallel Task Timeout

```
Warning: Task T005 timed out after 5 minutes
```

**Solution:** Complex tasks may need more time. Consider breaking them into smaller tasks or increasing the timeout.

## Related

- [Agency](https://github.com/generacy-ai/agency) - The parent repository
- [`@generacy-ai/agency-plugin-spec-kit`](../agency-plugin-spec-kit) - The MCP server providing tool implementations

## License

MIT
