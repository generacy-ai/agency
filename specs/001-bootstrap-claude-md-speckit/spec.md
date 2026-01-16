# Feature Specification: Bootstrap: CLAUDE.md, .speckit templates, .mcp.json

**Branch**: `001-bootstrap-claude-md-speckit` | **Date**: 2026-01-16 | **Status**: Draft

## Summary

Set up the foundational development infrastructure for AI-assisted development in the `agency` repository, which is part of the Generacy platform - an open-source ecosystem for agent-driven development.

## Project Context

**Generacy** is a platform built on the philosophy that agents are the primary workers, with humans serving as specialist consultants pulled in for decisions requiring human judgment.

The `agency` repository is one of three core public monorepos:
- **agency** (this repo): Agency core + official plugins - agent-optimized MCP tooling
- **humancy**: VS Code extension + plugins - human portal into agent workflows
- **generacy**: Orchestration services + plugins - workflow engine connecting Agency and Humancy

This repo will use **pnpm + turborepo** for monorepo management with the structure:
```
agency/
├── packages/
│   ├── agency/                     # @generacy-ai/agency (core)
│   ├── agency-plugin-git/          # @generacy-ai/agency-plugin-git
│   ├── agency-plugin-docker/       # @generacy-ai/agency-plugin-docker
│   ├── agency-plugin-firebase/     # @generacy-ai/agency-plugin-firebase
│   ├── agency-plugin-npm/          # @generacy-ai/agency-plugin-npm
│   └── agency-plugin-humancy/      # @generacy-ai/agency-plugin-humancy
├── package.json                    # workspace root
├── pnpm-workspace.yaml
├── turbo.json
└── README.md
```

## Tasks

### 1. Create CLAUDE.md

Create a `CLAUDE.md` file at the repository root with:
- Project overview (Agency: agent-optimized IDE and MCP tools)
- Active technologies: TypeScript 5.x, Node.js 20+, pnpm, turborepo
- Monorepo structure documentation
- Build/test commands (pnpm build, pnpm test, etc.)
- Code style guidelines (TypeScript conventions, terse output pattern)
- Manual additions section for repo-specific guidance

**Template source**: `/workspaces/claude-plugins/CLAUDE.md`

### 2. Set up .speckit templates

Create `.specify/templates/` directory with templates copied from `/workspaces/claude-plugins/.specify/templates/`:
- `spec-template.md` - Feature specification template
- `plan-template.md` - Implementation plan template
- `tasks-template.md` - Task list template
- `checklist-template.md` - Quality checklist template
- `agent-file-template.md` - CLAUDE.md generation template

### 3. Configure .mcp.json

Create `.mcp.json` at the repository root with the following configuration:

```json
{
  "mcpServers": {
    "context7": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@upstash/context7-mcp@latest"]
    },
    "playwright": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@playwright/mcp@latest", "--headless"]
    }
  }
}
```

## Acceptance Criteria

- [ ] `CLAUDE.md` exists and documents the repo accurately with Generacy context
- [ ] `.specify/templates/` contains all 5 template files
- [ ] `.mcp.json` configures Context7 and Playwright MCP servers
- [ ] Agent can successfully run `/speckit:specify` to create new features

## Context

This is part of bootstrapping all generacy-ai repos for spec-driven development using the orchestrator/worker infrastructure.

## User Stories

### US1: AI Agent Development Setup

**As a** development agent,
**I want** standardized tooling and templates in the agency repo,
**So that** I can follow spec-driven development workflows consistently.

**Acceptance Criteria**:
- [ ] CLAUDE.md provides accurate project context
- [ ] Templates are available for all speckit commands
- [ ] MCP servers are configured and functional

### US2: Human Developer Onboarding

**As a** human developer,
**I want** clear documentation of the project structure and conventions,
**So that** I can understand and contribute to the codebase effectively.

**Acceptance Criteria**:
- [ ] CLAUDE.md explains the monorepo structure
- [ ] Build and test commands are documented
- [ ] Code style guidelines are clear

## Functional Requirements

| ID | Requirement | Priority | Notes |
|----|-------------|----------|-------|
| FR-001 | CLAUDE.md documents Generacy/Agency purpose | P1 | Reference brand vision docs |
| FR-002 | Templates support speckit workflow | P1 | Copy from claude-plugins |
| FR-003 | MCP servers configured for Context7 | P1 | Documentation lookup |
| FR-004 | MCP servers configured for Playwright | P2 | Browser testing |

## Success Criteria

| ID | Metric | Target | Measurement |
|----|--------|--------|-------------|
| SC-001 | `/speckit:specify` runs successfully | 100% | Create test feature |
| SC-002 | CLAUDE.md accuracy | Complete | All sections populated |

## Assumptions

- The `/workspaces/claude-plugins` repo is available locally
- The `/workspaces/triad-development/docs` are the authoritative source for Generacy vision
- pnpm and turborepo will be used for monorepo management

## Out of Scope

- Implementing actual Agency packages (this is just bootstrap infrastructure)
- Setting up CI/CD pipelines
- Creating the packages/ directory structure (future issue)

---

*Generated by speckit*
