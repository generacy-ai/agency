# Tasks: F5: Scaffold claude-plugin-agency-spec-kit structure

**Input**: Design documents from `/specs/144-f5-scaffold-claude-plugin/`
**Prerequisites**: plan.md (required), spec.md (required), research.md
**Status**: Complete

## Format: `[ID] [P?] Description`
- **[P]**: Can run in parallel (different files, no dependencies)
- Include exact file paths in descriptions

## Phase 1: Setup - Directory Structure

**Purpose**: Create the plugin directory structure

- [X] T001 Create plugin directory `packages/claude-plugin-agency-spec-kit/`
- [X] T002 [P] Create `.claude-plugin/` subdirectory
- [X] T003 [P] Create `commands/` subdirectory

---

## Phase 2: Configuration - Plugin Metadata

**Purpose**: Set up plugin configuration file

- [X] T004 Create `packages/claude-plugin-agency-spec-kit/.claude-plugin/plugin.json` with:
  - name: "agency-spec-kit"
  - version: "0.0.1"
  - description: "Specification-driven development commands using Agency MCP tools"
  - requires.mcp: ["@generacy-ai/agency-plugin-spec-kit"]

---

## Phase 3: Commands - Copy from Source Plugin

**Purpose**: Copy all command markdown files from existing speckit plugin

Source: `/workspaces/claude-plugins/plugins/speckit/commands/`
Destination: `packages/claude-plugin-agency-spec-kit/commands/`

- [X] T005 [P] Copy `specify.md` command file
- [X] T006 [P] Copy `clarify.md` command file
- [X] T007 [P] Copy `plan.md` command file
- [X] T008 [P] Copy `tasks.md` command file
- [X] T009 [P] Copy `taskstoissues.md` command file
- [X] T010 [P] Copy `implement.md` command file
- [X] T011 [P] Copy `checklist.md` command file
- [X] T012 [P] Copy `analyze.md` command file
- [X] T013 [P] Copy `constitution.md` command file

---

## Phase 4: Documentation

**Purpose**: Document the plugin's purpose and relationship to MCP server

- [X] T014 Create `packages/claude-plugin-agency-spec-kit/README.md` documenting:
  - Plugin purpose and overview
  - Available slash commands
  - Relationship with @generacy-ai/agency-plugin-spec-kit MCP server
  - Usage instructions

---

## Dependencies & Execution Order

### Phase Dependencies
- **Phase 1 (Setup)**: No dependencies - start immediately
- **Phase 2 (Configuration)**: Depends on T001, T002 (directory must exist)
- **Phase 3 (Commands)**: Depends on T001, T003 (commands/ directory must exist)
- **Phase 4 (Documentation)**: Depends on T001 (package directory must exist)

### Parallel Opportunities
- T002 and T003 can run in parallel (both create subdirectories)
- All T005-T013 can run in parallel (different files, no dependencies)
- T004 and T014 can run in parallel after directory structure exists

### Execution Order
1. T001 (create package directory) - BLOCKING
2. T002, T003 in parallel (create subdirectories)
3. T004, T005-T013, T014 can all run in parallel

---

## Notes

- All commands are copied verbatim from source (per clarification)
- Source plugin location: `/workspaces/claude-plugins/plugins/speckit/`
- 9 command files total to copy
- No code compilation required - all markdown files
