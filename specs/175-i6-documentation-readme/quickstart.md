# Quickstart: Documentation and README

This quickstart is for contributors working on the documentation feature.

## Prerequisites

- Node.js 20+
- pnpm installed (`npm install -g pnpm`)
- Access to the agency repository

## Installation

```bash
# Clone and install dependencies
git clone https://github.com/generacy-ai/agency.git
cd agency
pnpm install
```

## Build

```bash
# Build all packages
pnpm build
```

## Development

### View Existing Documentation

```bash
# View claude-plugin README
cat packages/claude-plugin-agency-spec-kit/README.md

# View plugin source structure
ls -la packages/agency-plugin-spec-kit/src/
```

### Key Files to Reference

| Purpose | File |
|---------|------|
| Configuration schema | `packages/agency-plugin-spec-kit/src/config.ts` |
| Tool exports | `packages/agency-plugin-spec-kit/src/tools/index.ts` |
| Provider interface | `packages/agency-plugin-spec-kit/src/providers/types.ts` |
| Command definitions | `packages/claude-plugin-agency-spec-kit/commands/*.md` |

### Files to Create/Modify

| Action | File |
|--------|------|
| CREATE | `packages/agency-plugin-spec-kit/README.md` |
| CREATE | `packages/agency-plugin-spec-kit/docs/configuration.md` |
| CREATE | `packages/agency-plugin-spec-kit/docs/providers.md` |
| UPDATE | `packages/claude-plugin-agency-spec-kit/README.md` |

## Available Commands

### Spec-kit MCP Tools

The documentation should cover these 11 MCP tools:

1. `get_paths` - Get feature directory paths
2. `get_ticket` - Fetch ticket from backlog
3. `create_ticket` - Create new ticket
4. `update_ticket` - Update existing ticket
5. `check_prereqs` - Validate prerequisites
6. `manage_clarifications` - Handle clarification Q&A
7. `copy_template` - Copy template files
8. `git_ops` - Git operations (branch, checkout, fetch, status)
9. `update_agent` - Update agent context files
10. `create_feature` - Create feature branches
11. `tasks_to_issues` - Convert tasks to GitHub issues

### Claude Plugin Commands

The documentation should cover these slash commands:

| Command | Description |
|---------|-------------|
| `/speckit:specify` | Create feature specification |
| `/speckit:clarify` | Identify and resolve ambiguities |
| `/speckit:plan` | Generate implementation plan |
| `/speckit:tasks` | Generate task list |
| `/speckit:taskstoissues` | Convert tasks to GitHub issues |
| `/speckit:implement` | Execute tasks |
| `/speckit:checklist` | Generate quality checklists |
| `/speckit:analyze` | Run consistency analysis |
| `/speckit:constitution` | Manage governance rules |

## Troubleshooting

### Build Errors

```bash
# Clean and rebuild
pnpm clean
pnpm install
pnpm build
```

### Missing Types

If TypeScript shows missing types:

```bash
# Ensure all dependencies are installed
pnpm install

# Rebuild to generate type definitions
pnpm build
```

## Next Steps

1. Run `/speckit:tasks` to generate the implementation task list
2. Execute tasks to create the documentation files
3. Review and test all examples
