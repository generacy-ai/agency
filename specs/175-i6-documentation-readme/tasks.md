# Tasks: Documentation and README

**Input**: Design documents from `/specs/175-i6-documentation-readme/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, quickstart.md
**Status**: Complete

## Format: `[ID] [P?] [Story] Description`
- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to

## Phase 1: Setup

- [X] T001 Create `packages/agency-plugin-spec-kit/docs/` directory

## Phase 2: Core Documentation

- [X] T010 [P] Create `packages/agency-plugin-spec-kit/README.md` with installation, overview, and tool list
- [X] T011 [P] Create `packages/agency-plugin-spec-kit/docs/configuration.md` with all config options from data-model.md
- [X] T012 [P] Create `packages/agency-plugin-spec-kit/docs/providers.md` with GitHub, Jira, Shortcut, and Local provider guides

## Phase 3: Claude Plugin Documentation

- [X] T020 Update `packages/claude-plugin-agency-spec-kit/README.md` with detailed command reference, workflow examples, and troubleshooting

## Phase 4: Review and Polish

- [X] T030 Verify all file paths and code examples are accurate
- [X] T031 [P] Ensure consistent formatting and style across all documentation files

## Dependencies & Execution Order

1. **T001** must complete first (creates the docs directory)
2. **T010, T011, T012** can run in parallel (different files in agency-plugin-spec-kit)
3. **T020** can run after T010 is complete (may reference the plugin README)
4. **T030, T031** run after all documentation is created for final review

**Parallel opportunities**:
- Phase 2 tasks (T010, T011, T012) are all independent and can execute concurrently
- Phase 4 review tasks (T030, T031) can also run in parallel

**Total tasks**: 7
**Parallelizable tasks**: 5
