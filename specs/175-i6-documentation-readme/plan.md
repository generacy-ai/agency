# Implementation Plan: I6: Documentation and README

**Feature**: Documentation and README files for agency-plugin-spec-kit and claude-plugin-agency-spec-kit
**Branch**: `175-i6-documentation-readme`
**Status**: Complete

## Summary

Create comprehensive documentation for two related packages:
1. `@generacy-ai/agency-plugin-spec-kit` - The MCP server providing spec-kit tools
2. `claude-plugin-agency-spec-kit` - The Claude Code plugin providing slash commands

The documentation will enable developers to understand, configure, and use the spec-kit ecosystem for specification-driven development.

## Technical Context

- **Language**: Markdown with embedded code examples
- **Framework**: Documentation for TypeScript/Node.js packages
- **Dependencies**:
  - @octokit/rest (GitHub API)
  - simple-git (git operations)
  - zod (configuration validation)
- **Build**: pnpm workspaces monorepo

## Project Structure

```
packages/agency-plugin-spec-kit/
├── README.md                    # Main plugin documentation (CREATE)
├── docs/
│   ├── configuration.md         # Configuration reference (CREATE)
│   └── providers.md             # Provider setup guides (CREATE)
├── src/
│   ├── config.ts               # Configuration schema
│   ├── tools/                  # MCP tool implementations
│   └── providers/              # Backlog provider implementations

packages/claude-plugin-agency-spec-kit/
├── README.md                    # Already exists, needs update
├── commands/                    # Slash command definitions
└── .claude-plugin/plugin.json  # Plugin manifest
```

## Key Components

### 1. MCP Plugin Documentation (agency-plugin-spec-kit/README.md)

The README must cover:
- **Installation**: npm/pnpm install commands
- **Configuration**: How to set up the plugin in MCP settings
- **Available Tools**: All 11 MCP tools with descriptions
  - `get_paths` - Get feature directory paths
  - `get_ticket` - Fetch ticket details from backlog
  - `create_ticket` - Create new tickets
  - `update_ticket` - Update existing tickets
  - `check_prereqs` - Validate prerequisites
  - `manage_clarifications` - Handle clarification questions
  - `copy_template` - Copy template files
  - `git_ops` - Git operations
  - `update_agent` - Update agent context files
  - `create_feature` - Create feature branches
  - `tasks_to_issues` - Convert tasks to GitHub issues
- **Backlog Providers**: GitHub, Jira, Shortcut, Local
- **API Reference**: Key types and interfaces

### 2. Configuration Reference (docs/configuration.md)

Document all configuration options from `config.ts`:
- `paths.specs` - Spec directory (default: 'specs')
- `paths.templates` - Template directory (default: '.specify/templates')
- `branches.pattern` - Branch naming pattern
- `branches.numberPadding` - Issue number padding
- `branches.maxSlugWords` - Max words in slug
- `backlog.provider` - Provider type
- `backlog.github` - GitHub-specific config
- `backlog.jira` - Jira-specific config (baseUrl, projectKey, email, apiToken)
- `backlog.shortcut` - Shortcut-specific config (workspaceSlug)

### 3. Provider Setup Guides (docs/providers.md)

Provider-specific setup instructions:
- **GitHub**: gh CLI authentication (`gh auth login`)
- **Jira**: API token generation, environment variables (JIRA_EMAIL, JIRA_API_TOKEN)
- **Shortcut**: API token setup, workspace configuration
- **Local**: No external dependencies

### 4. Claude Plugin Documentation (claude-plugin-agency-spec-kit/README.md)

The existing README is good but needs:
- More detailed command reference
- Configuration examples
- Troubleshooting section
- Workflow examples with expected outputs

## Constitution Check

No `.specify/memory/constitution.md` found - no governance constraints to verify.

## Implementation Approach

1. Read existing source files to extract accurate details
2. Generate README.md for agency-plugin-spec-kit first
3. Create docs/configuration.md and docs/providers.md
4. Update claude-plugin-agency-spec-kit README with enhanced content
5. Ensure all examples are accurate and working

## Technical Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Documentation format | GitHub-flavored Markdown | Standard for npm packages |
| Configuration examples | YAML and JSON | Support both common formats |
| API documentation style | TSDoc-like | Consistent with codebase |

## Testing Approach

- Manual review of all documentation
- Verify code examples are syntactically correct
- Check all file paths exist in codebase

## Next Steps

Run `/speckit:tasks` to generate the task list for creating these documentation files.
