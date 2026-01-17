# Agency Development Guidelines

Auto-generated from all feature plans. Last updated: 2026-01-17

## Project Overview

**Agency** is part of the **Generacy** platform - an open-source ecosystem for agent-driven development where agents are the primary workers and humans serve as specialist consultants for decisions requiring human judgment.

The `agency` repository contains agent-optimized MCP tooling:
- **@generacy-ai/agency** (core): Core agent infrastructure
- **@generacy-ai/agency-plugin-***: Official plugins for agent capabilities

## Active Technologies







- TypeScript 5.x (Node.js 20+)
- pnpm workspaces
- turborepo for monorepo management
- @modelcontextprotocol/sdk for MCP servers
- zod for runtime validation

## Project Structure

```text
agency/
├── CLAUDE.md                           # This file - AI agent context
├── .mcp.json                           # MCP server configuration
├── .specify/
│   └── templates/
│       ├── spec-template.md            # Feature specification template
│       ├── plan-template.md            # Implementation plan template
│       ├── tasks-template.md           # Task list template
│       ├── checklist-template.md       # Quality checklist template
│       └── agent-file-template.md      # CLAUDE.md generation template
├── packages/                           # Monorepo packages (future)
│   ├── agency/                         # @generacy-ai/agency (core)
│   └── agency-plugin-*/                # Plugin packages
├── specs/                              # Feature specifications
│   └── ###-feature-name/
│       ├── spec.md                     # Feature specification
│       ├── plan.md                     # Implementation plan
│       ├── tasks.md                    # Task list
│       └── ...                         # Other spec artifacts
├── package.json                        # Workspace root
├── pnpm-workspace.yaml                 # pnpm workspace config
├── turbo.json                          # turborepo config
└── README.md                           # Repository readme
```

## Commands

```bash
# Install dependencies
pnpm install

# Build all packages
pnpm build

# Run all tests
pnpm test

# Lint code
pnpm lint

# Type check
pnpm typecheck
```

## Code Style

### TypeScript Conventions

- ES2022 target with Node16 module resolution
- Strict mode enabled
- Use zod for runtime validation
- Prefer explicit types over inference for public APIs
- Use async/await over raw promises

### Output Pattern

- Terse, machine-readable output for automation
- Use structured logging where appropriate
- Avoid verbose human-friendly messages in library code

### File Organization

- One class/interface per file for major types
- Group related utilities in single files
- Tests adjacent to source (`*.test.ts`)

## Speckit Workflow

This repository uses spec-driven development:

1. `/speckit:specify` - Create feature specification from description
2. `/speckit:clarify` - Identify and resolve ambiguities
3. `/speckit:plan` - Generate implementation plan
4. `/speckit:tasks` - Generate task list from plan
5. `/speckit:implement` - Execute tasks with progress tracking

## Related Repositories

- **humancy**: VS Code extension + plugins - human portal into agent workflows
- **generacy**: Orchestration services + plugins - workflow engine

## Recent Changes

- 011-terse-output-pattern-utilities: Added configuration

- 005-file-telemetry-storage-provider: Added configuration

- 004-memory-telemetry-storage-provider: Added configuration

- 010-tool-registry-naming-convention: Added configuration

- 007-mcp-server-foundation: Added configuration

- 003-core-telemetry-capture: Added configuration

- 020-bootstrap-monorepo-structure-turbo: Added configuration

- 001-bootstrap-claude-md-speckit: Bootstrap development infrastructure

<!-- MANUAL ADDITIONS START -->
<!-- MANUAL ADDITIONS END -->
