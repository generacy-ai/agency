# Quickstart: Bootstrap Infrastructure

## Overview

This feature establishes the foundational AI-assisted development infrastructure for the agency repository.

## Created Artifacts

After implementation, the repository will have:

```text
agency/
├── CLAUDE.md              # AI agent context (project docs)
├── .mcp.json              # MCP server configuration
└── .specify/
    └── templates/
        ├── spec-template.md
        ├── plan-template.md
        ├── tasks-template.md
        ├── checklist-template.md
        └── agent-file-template.md
```

## Usage

### Creating a New Feature

Run the speckit specify command:
```bash
# In Claude Code or compatible AI agent
/speckit:specify
```

This will:
1. Create a new branch with issue number prefix
2. Initialize `specs/<number>-<feature-name>/` directory
3. Generate `spec.md` from the template

### Workflow Commands

| Command | Description |
|---------|-------------|
| `/speckit:specify` | Create new feature from description |
| `/speckit:clarify` | Identify and resolve spec ambiguities |
| `/speckit:plan` | Generate implementation plan |
| `/speckit:tasks` | Generate task list from plan |
| `/speckit:implement` | Execute tasks with progress tracking |

### MCP Servers

The `.mcp.json` configures:

| Server | Command | Use |
|--------|---------|-----|
| Context7 | `npx -y @upstash/context7-mcp@latest` | Documentation lookup |
| Playwright | `npx -y @playwright/mcp@latest --headless` | Browser automation |

## Validation

To verify the setup works:

1. **Test speckit specify**:
   - Create a test feature: `/speckit:specify "Test feature for validation"`
   - Verify `specs/<number>-test-feature/spec.md` is created
   - Delete the test feature directory

2. **Verify MCP servers**:
   - Check Context7 resolves documentation queries
   - Check Playwright can perform browser actions

## Troubleshooting

### speckit:specify fails

- Ensure `.specify/templates/spec-template.md` exists
- Check that git is initialized in the repository
- Verify branch naming follows `###-feature-name` pattern

### MCP servers not available

- Ensure npx is available in PATH
- Check network connectivity for npm package downloads
- Verify Node.js 20+ is installed
