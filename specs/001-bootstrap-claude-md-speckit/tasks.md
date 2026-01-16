# Tasks: Bootstrap: CLAUDE.md, .speckit templates, .mcp.json

**Input**: Design documents from `/specs/001-bootstrap-claude-md-speckit/`
**Prerequisites**: plan.md (required), spec.md (required), research.md (available)
**Status**: Complete

## Format: `[ID] [P?] [Story] Description`
- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to

## Phase 1: Directory Setup

- [ ] T001 [US1] Create `.specify/templates/` directory structure

## Phase 2: Template Files

- [ ] T002 [P] [US1] Copy `spec-template.md` from `/workspaces/claude-plugins/.specify/templates/spec-template.md` to `.specify/templates/`
- [ ] T003 [P] [US1] Copy `plan-template.md` from `/workspaces/claude-plugins/.specify/templates/plan-template.md` to `.specify/templates/`
- [ ] T004 [P] [US1] Copy `tasks-template.md` from `/workspaces/claude-plugins/.specify/templates/tasks-template.md` to `.specify/templates/`
- [ ] T005 [P] [US1] Copy `checklist-template.md` from `/workspaces/claude-plugins/.specify/templates/checklist-template.md` to `.specify/templates/`
- [ ] T006 [P] [US1] Copy `agent-file-template.md` from `/workspaces/claude-plugins/.specify/templates/agent-file-template.md` to `.specify/templates/`

## Phase 3: Configuration Files

- [ ] T007 [P] [US1] [US2] Create `CLAUDE.md` at repository root with Generacy/Agency documentation
  - Project overview: Agency - agent-optimized IDE and MCP tools
  - Technologies: TypeScript 5.x, Node.js 20+, pnpm, turborepo
  - Monorepo structure with packages/ layout
  - Build/test commands (pnpm build, pnpm test)
  - Code style guidelines

- [ ] T008 [P] [US1] Create `.mcp.json` at repository root with MCP server configuration
  - Context7 server: `npx -y @upstash/context7-mcp@latest`
  - Playwright server: `npx -y @playwright/mcp@latest --headless`

## Phase 4: Validation

- [ ] T009 [US1] Run `/speckit:specify` with a test feature to validate templates work correctly
- [ ] T010 [US2] Verify CLAUDE.md is readable and accurate for human developers

## Dependencies & Execution Order

**Phase boundaries** (sequential):
- Phase 1 (Setup) → Phase 2 (Templates) → Phase 3 (Config) → Phase 4 (Validation)

**Parallel opportunities**:
- **Phase 2**: All template copies (T002-T006) can run in parallel - they're independent files
- **Phase 3**: CLAUDE.md (T007) and .mcp.json (T008) can be created in parallel - no dependencies

**Critical path**:
1. T001 must complete before T002-T006 (directory must exist)
2. T002-T006 must complete before T009 (templates needed for validation)
3. T007 must complete before T010 (CLAUDE.md needed for review)

**Estimated total**: 8 independent tasks + 2 validation tasks = 10 tasks
